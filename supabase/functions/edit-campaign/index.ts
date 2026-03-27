import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { rehostHtmlImagesWithImageKit } from "../_shared/imagekit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PERMANENT_HOSTS = ["ik.imagekit.io", ".supabase.co/storage"];

function isAlreadyHosted(url: string): boolean {
  return PERMANENT_HOSTS.some((host) => url.includes(host));
}

/** Chunked base64 encoding to avoid stack overflow on large images */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function enforceNoStackingLayout(html: string): string {
  if (!html) return html;

  let output = html;

  const collapseSelectorPattern = /\.(?:[a-z0-9_-]*?(?:grid|col|column|two-col|two_col|product|gift)[a-z0-9_-]*?(?:cell|col|column)?|(?:product-grid-cell|two-col-cell|gift-cell|column-cell|grid-cell))\s*\{[^}]*\}/gi;
  output = output.replace(collapseSelectorPattern, (rule) => {
    return rule
      .replace(/display\s*:\s*block\s*!important;?/gi, "")
      .replace(/width\s*:\s*100%\s*!important;?/gi, "")
      .replace(/float\s*:\s*none\s*!important;?/gi, "")
      .replace(/max-width\s*:\s*100%\s*!important;?/gi, "")
      .replace(/;\s*;/g, ";");
  });

  if (/<head[^>]*>/i.test(output)) {
    output = output.replace(
      /(<head[^>]*>)/i,
      `$1<style>.product-grid-cell,.two-col-cell,.gift-cell,.column-cell,.grid-cell{display:table-cell !important;vertical-align:top !important;}.product-grid-cell,.two-col-cell,.column-cell,.grid-cell{width:auto !important;}</style>`
    );
  }

  return output;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
    const IMAGEKIT_PRIVATE_KEY = Deno.env.get("IMAGEKIT_PRIVATE_KEY");
    if (!IMAGEKIT_PRIVATE_KEY) throw new Error("IMAGEKIT_PRIVATE_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { campaignId, message, currentHtml, attachedImageUrls, reference } = await req.json();

    // Fetch campaign first (need brand_id)
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();
    if (cErr || !campaign) throw new Error("Campaign not found");

    // Parallelize all reads that depend on brand_id + conversation history
    const [profileResult, brandAssetsResult, productAssetsResult, brandResult, historyResult] = await Promise.all([
      supabase.from("brand_profiles").select("*").eq("brand_id", campaign.brand_id).single(),
      supabase.from("brand_assets").select("url, category").eq("brand_id", campaign.brand_id),
      supabase.from("product_assets").select("url").eq("brand_id", campaign.brand_id),
      supabase.from("brands").select("user_id").eq("id", campaign.brand_id).single(),
      supabase.from("chat_messages").select("role, content").eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(10),
    ]);

    const profile = profileResult.data;
    if (profileResult.error || !profile) throw new Error("Brand profile not found");

    const brandInstructions = (profile as any).brand_instructions || "";

    // Build conversation history (reverse to chronological order)
    const chatHistory = (historyResult.data || []).reverse();

    // Chain user_preferences after brand (needs user_id)
    let globalRules = "";
    if (brandResult.data?.user_id) {
      const { data: prefs } = await supabase.from("user_preferences").select("preferences").eq("user_id", brandResult.data.user_id).single();
      if (prefs?.preferences) {
        globalRules = (prefs.preferences as any).generation_rules || "";
      }
    }

    // Reference images
    const imageBlocks: any[] = [];
    const referenceUrls = Array.isArray(profile.reference_image_urls)
      ? profile.reference_image_urls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
      : [];

    const userAttachedUrls = Array.isArray(attachedImageUrls)
      ? attachedImageUrls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
      : [];

    const hostedReferenceUrls = referenceUrls.slice(0, 3);
    const allImageUrls = [...userAttachedUrls.slice(0, 5), ...hostedReferenceUrls];

    for (const url of allImageUrls) {
      try {
        const imgResp = await fetch(url);
        const contentType = imgResp.headers.get("content-type") || "image/png";
        const mediaType = contentType.split(";")[0].trim();
        const buf = await imgResp.arrayBuffer();
        if (buf.byteLength > 3_800_000) {
          console.log(`[edit-campaign] Skipping oversized image (${(buf.byteLength / 1_000_000).toFixed(1)}MB)`);
          continue;
        }
        const b64 = arrayBufferToBase64(buf);
        imageBlocks.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: b64 },
        });
      } catch { /* skip */ }
    }

    // Build unified asset catalog (brand + product)
    const brandAssetUrls = (brandAssetsResult.data || [])
      .map((a: any) => a.url)
      .filter((url: string) => typeof url === "string" && url.trim().length > 0)
      .slice(0, 15);

    const productAssetUrls = (productAssetsResult.data || [])
      .map((a: any) => a.url)
      .filter((url: string) => typeof url === "string" && url.trim().length > 0);

    const embeddableUrls = [...brandAssetUrls, ...productAssetUrls];

    // Extract brand values for QA enforcement
    const rawExtraction = profile.raw_extraction as Record<string, any> | null;
    const brandValues = {
      card_radius: rawExtraction?.spacing?.card_radius ?? rawExtraction?.card_radius ?? rawExtraction?.border_radius ?? "12",
      button_radius: rawExtraction?.buttons?.border_radius ?? rawExtraction?.button_radius ?? "100",
      accent_color: rawExtraction?.colors?.accent ?? rawExtraction?.accent_color ?? rawExtraction?.primary_color ?? "",
      text_color: rawExtraction?.colors?.text_primary ?? rawExtraction?.text_color ?? rawExtraction?.body_color ?? "",
    };

    const systemMsg = `You are editing an existing HTML email. You work for the user — do exactly what they ask. Never refuse, push back, or suggest they shouldn't make a change. If they want to change brand colors, break conventions, or do something unusual — DO IT. You are a tool, not a brand guardian.

Apply the change described. Do not rewrite sections not mentioned.
Maintain all inline styles, table structure, and Gmail dark mode fixes.
The outermost wrapper table must use width="100%" with max-width:600px — never a fixed width:600px.

TECHNICAL DEFAULTS (apply silently unless the user overrides):
- Consistent image padding treatment
- Text alignment consistency within sections
- Button width: auto with 32-48px horizontal padding (not full-width)
- Logo max-width: 150px, centered
- Footer with unsubscribe link
- Card border-radius: ${brandValues.card_radius}px
- Button border-radius: ${brandValues.button_radius}px
${brandValues.accent_color ? `- Default accent color: ${brandValues.accent_color}` : ""}
${brandValues.text_color ? `- Default body text color: ${brandValues.text_color}` : ""}

These defaults are OVERRIDDEN by any explicit user request. The user's word is final.

RESPONSE FORMAT — you MUST use these exact XML tags:
<reply>
Brief conversational reply confirming what was changed (2-3 sentences max). Ask if anything else needs adjusting.
</reply>
<email_html>
The complete updated HTML here — no markdown fences, no commentary.
</email_html>`;

    // Build messages array with conversation history
    const anthropicMessages: any[] = [];

    // Add previous conversation (without full HTML to save tokens)
    for (const msg of chatHistory) {
      anthropicMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }

    // Build final user message
    const userContent: any[] = [];
    if (imageBlocks.length > 0) userContent.push(...imageBlocks);

    // Reference campaign images if provided
    if (reference && reference.image_urls && reference.image_urls.length > 0) {
      let refMode: "reference" | "dupe" = "reference";
      if (reference.mode === "reference" || reference.mode === "dupe") {
        refMode = reference.mode;
      } else {
        const s = reference.strength || 5;
        refMode = s >= 9 ? "dupe" : "reference";
      }

      const refLabel = refMode === "dupe" ? "DUPE — PIXEL-PERFECT LAYOUT CLONE" : "REFERENCE — STRONG STRUCTURAL MATCH";
      userContent.push({ type: "text", text: `[${refLabel}] The following campaign is provided as a ${refMode === "dupe" ? "layout blueprint to clone exactly" : "structural reference to follow closely"}. ${refMode === "dupe" ? "Your output MUST match its exact section count, section types, section order, image placements, image sizing, logo position, CTA positions, and spacing patterns. Only change colors, fonts, imagery, and copy to match the brand." : "Follow its layout, sizing and structure closely. Use the brand's own colors and fonts."}` });

      for (const url of reference.image_urls.slice(0, 5)) {
        try {
          const imgResp = await fetch(url);
          const contentType = imgResp.headers.get("content-type") || "image/jpeg";
          const mediaType = contentType.split(";")[0].trim();
          const buf = await imgResp.arrayBuffer();
          if (buf.byteLength > 3_800_000) continue;
          const b64 = arrayBufferToBase64(buf);
          userContent.push({ type: "image", source: { type: "base64", media_type: mediaType, data: b64 } });
        } catch {}
      }
    }

    const hasUserAttached = userAttachedUrls.length > 0;
    const imageRulesText = embeddableUrls.length > 0
      ? `Image URL rules:\n${hasUserAttached ? "- The first images above are USER-ATTACHED reference images for this specific edit request. Use them as visual reference for the requested change.\n" : ""}- Brand reference screenshots are for STYLE only — never embed them.\n- Never invent or use external stock URLs.\n- For <img src> values, use ONLY from these approved asset URLs:\n${embeddableUrls.join("\n")}${hasUserAttached ? "\n" + userAttachedUrls.join("\n") : ""}`
      : `Image URL rules:\n${hasUserAttached ? "- The images above are USER-ATTACHED reference images. You may use their URLs as <img src> values if appropriate.\n" + userAttachedUrls.join("\n") + "\n" : ""}- No other approved image URLs exist, so do not add new <img> tags.`;

    let extraRules = "";
    if (brandInstructions) extraRules += `\n\nBrand-specific instructions:\n${brandInstructions}`;
    if (globalRules) extraRules += `\n\nGlobal generation rules:\n${globalRules}`;

    userContent.push({
      type: "text",
      text: `Brand rules: ${profile.system_prompt}${extraRules}\n\n${imageRulesText}\n\nCurrent HTML:\n${currentHtml}\n\nChange requested: ${message}`,
    });

    // Add the final user message
    anthropicMessages.push({ role: "user", content: userContent });

    // Streaming Anthropic call
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240000);

    console.log(`[edit-campaign] Starting streaming call, ${anthropicMessages.length} messages`);

    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 16384,
        system: systemMsg,
        messages: anthropicMessages,
        stream: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      throw new Error(`Anthropic API error: ${anthropicResp.status} - ${errText}`);
    }

    // SSE response stream
    const stream = new ReadableStream({
      async start(ctrl) {
        const encoder = new TextEncoder();
        const emit = (event: string, data: any) => {
          ctrl.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        let fullText = "";

        try {
          const reader = anthropicResp.body!.getReader();
          const decoder = new TextDecoder();
          let sseBuffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            sseBuffer += decoder.decode(value, { stream: true });

            const lines = sseBuffer.split("\n");
            sseBuffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;

              try {
                const evt = JSON.parse(jsonStr);
                if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                  const text = evt.delta.text;
                  fullText += text;

                  // Stream text_delta for content inside <response> tags only
                  // We parse incrementally: if we're inside <response>, stream it
                  const responseMatch = fullText.match(/<reply>([\s\S]*?)(<\/reply>|$)/);
                  if (responseMatch) {
                    const beforeThis = fullText.slice(0, fullText.length - text.length);
                    const wasInResponse = beforeThis.includes("<reply>") && !beforeThis.includes("</reply>");
                      
                    if (wasInResponse) {
                      let cleanDelta = text;
                      if (cleanDelta.includes("</reply>")) {
                        cleanDelta = cleanDelta.split("</reply>")[0];
                      }
                      if (cleanDelta) {
                        emit("text_delta", { content: cleanDelta });
                      }
                    }
                  }
                }
              } catch { /* skip malformed SSE lines */ }
            }
          }

          // Parse the complete response
          const responseMatch = fullText.match(/<reply>([\s\S]*?)<\/reply>/);
          const htmlMatch = fullText.match(/<email_html>([\s\S]*?)<\/email_html>/);

          const responseText = responseMatch ? responseMatch[1].trim() : "Changes applied.";
          let html = htmlMatch ? htmlMatch[1].trim() : "";

          // Fallback: if no tags found, treat entire output as HTML (backward compat)
          if (!htmlMatch && !responseMatch) {
            html = fullText.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();
          }

          if (html) {
            // Rehost images
            html = await rehostHtmlImagesWithImageKit(html, {
              campaignId,
              imagekitPrivateKey: IMAGEKIT_PRIVATE_KEY,
              fallbackImageUrls: embeddableUrls,
            });

            html = enforceNoStackingLayout(html);

            // Save to DB
            const history = Array.isArray(campaign.html_history) ? campaign.html_history : [];
            history.push(campaign.html);

            await supabase.from("campaigns").update({
              html,
              html_history: history,
            }).eq("id", campaignId);

            emit("html_patch", { html });
          }

          // Save chat messages
          await supabase.from("chat_messages").insert([
            { campaign_id: campaignId, role: "user", content: message },
            { campaign_id: campaignId, role: "assistant", content: responseText },
          ]);

          emit("done", {});
        } catch (err) {
          emit("error", { message: err instanceof Error ? err.message : "Stream failed" });
        } finally {
          ctrl.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
