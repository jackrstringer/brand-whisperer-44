import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { campaignId, message, currentHtml, attachedImageUrls } = await req.json();

    const startMs = Date.now();

    // Fetch campaign + profile + history in parallel (skip brand assets/products/references for edits)
    const [campaignResult, historyResult] = await Promise.all([
      supabase.from("campaigns").select("*").eq("id", campaignId).single(),
      supabase.from("chat_messages").select("role, content").eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(10),
    ]);

    const campaign = campaignResult.data;
    if (campaignResult.error || !campaign) throw new Error("Campaign not found");

    // Fetch profile + brand info in parallel
    const [profileResult, brandResult] = await Promise.all([
      supabase.from("brand_profiles").select("system_prompt, brand_instructions, raw_extraction").eq("brand_id", campaign.brand_id).single(),
      supabase.from("brands").select("user_id").eq("id", campaign.brand_id).single(),
    ]);

    const profile = profileResult.data;
    if (!profile) throw new Error("Brand profile not found");

    // Fetch global rules if needed
    let globalRules = "";
    if (brandResult.data?.user_id) {
      const { data: prefs } = await supabase.from("user_preferences").select("preferences").eq("user_id", brandResult.data.user_id).single();
      if (prefs?.preferences) {
        globalRules = (prefs.preferences as any).generation_rules || "";
      }
    }

    const chatHistory = (historyResult.data || []).reverse();

    // Only process user-attached images (skip brand references — they're already baked into the HTML)
    const imageBlocks: any[] = [];
    const userAttachedUrls = Array.isArray(attachedImageUrls)
      ? attachedImageUrls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
      : [];

    for (const url of userAttachedUrls.slice(0, 3)) {
      try {
        const imgResp = await fetch(url);
        const contentType = imgResp.headers.get("content-type") || "image/png";
        const mediaType = contentType.split(";")[0].trim();
        const buf = await imgResp.arrayBuffer();
        if (buf.byteLength > 3_800_000) continue;
        imageBlocks.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: arrayBufferToBase64(buf) },
        });
      } catch { /* skip */ }
    }

    const rawExtraction = profile.raw_extraction as Record<string, any> | null;
    const brandValues = {
      card_radius: rawExtraction?.spacing?.card_radius ?? rawExtraction?.card_radius ?? rawExtraction?.border_radius ?? "12",
      button_radius: rawExtraction?.buttons?.border_radius ?? rawExtraction?.button_radius ?? "100",
      accent_color: rawExtraction?.colors?.accent ?? rawExtraction?.accent_color ?? rawExtraction?.primary_color ?? "",
      text_color: rawExtraction?.colors?.text_primary ?? rawExtraction?.text_color ?? rawExtraction?.body_color ?? "",
    };

    const brandInstructions = (profile as any).brand_instructions || "";
    let extraRules = "";
    if (brandInstructions) extraRules += `\nBrand instructions: ${brandInstructions}`;
    if (globalRules) extraRules += `\nGlobal rules: ${globalRules}`;

    const systemMsg = `You are a fast HTML email editor. Do exactly what the user asks. Never refuse or push back.

RULES:
- Edit ONLY what's requested. Do NOT rewrite unrelated sections.
- Keep all existing inline styles, table structure, and image URLs intact.
- Wrapper table: width="100%" max-width:600px.
- Card radius: ${brandValues.card_radius}px. Button radius: ${brandValues.button_radius}px.
${brandValues.accent_color ? `- Default accent: ${brandValues.accent_color}` : ""}
${brandValues.text_color ? `- Default text color: ${brandValues.text_color}` : ""}
- User requests OVERRIDE all defaults.
${extraRules}

OUTPUT FORMAT — use these EXACT tags:
<reply>
Confirm what you changed in 1-2 sentences.
</reply>
<email_html>
Complete updated HTML. No markdown. No commentary.
</email_html>`;

    // Build messages
    const anthropicMessages: any[] = [];
    for (const msg of chatHistory) {
      anthropicMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }

    const userContent: any[] = [];
    if (imageBlocks.length > 0) userContent.push(...imageBlocks);
    userContent.push({
      type: "text",
      text: `Current HTML:\n${currentHtml}\n\nEdit: ${message}`,
    });
    anthropicMessages.push({ role: "user", content: userContent });

    const prepMs = Date.now() - startMs;
    console.log(`[edit-campaign] Prep done in ${prepMs}ms, ${anthropicMessages.length} messages, ${imageBlocks.length} images`);

    // Streaming Anthropic call
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);

    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 12000,
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

                  // Stream reply text as it arrives
                  const beforeThis = fullText.slice(0, fullText.length - text.length);
                  const inReply = beforeThis.includes("<reply>") && !beforeThis.includes("</reply>");
                  if (inReply) {
                    let cleanDelta = text;
                    if (cleanDelta.includes("</reply>")) {
                      cleanDelta = cleanDelta.split("</reply>")[0];
                    }
                    if (cleanDelta) emit("text_delta", { content: cleanDelta });
                  }
                }
              } catch { /* skip */ }
            }
          }

          const totalMs = Date.now() - startMs;
          console.log(`[edit-campaign] Stream complete in ${totalMs}ms, ${fullText.length} chars`);

          // Parse response
          const replyMatch = fullText.match(/<reply>([\s\S]*?)<\/reply>/);
          const htmlMatch = fullText.match(/<email_html>([\s\S]*?)<\/email_html>/);

          const responseText = replyMatch ? replyMatch[1].trim() : "Changes applied.";
          let html = htmlMatch ? htmlMatch[1].trim() : "";

          // Fallback: no tags → treat as HTML
          if (!htmlMatch && !replyMatch) {
            html = fullText.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();
          }

          if (html) {
            html = enforceNoStackingLayout(html);

            const history = Array.isArray(campaign.html_history) ? campaign.html_history : [];
            history.push(campaign.html);

            await supabase.from("campaigns").update({
              html,
              html_history: history,
            }).eq("id", campaignId);

            emit("html_patch", { html });
          }

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
