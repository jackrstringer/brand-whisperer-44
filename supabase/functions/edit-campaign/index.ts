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

/**
 * Apply find/replace patches to HTML.
 * Each patch: { find: string, replace: string }
 * Returns the patched HTML and count of patches applied.
 */
function applyPatches(html: string, patches: Array<{ find: string; replace: string }>): { html: string; applied: number; changed: boolean } {
  let result = html;
  let applied = 0;
  for (const patch of patches) {
    if (!patch.find || typeof patch.find !== "string") continue;
    // Try exact match first
    if (result.includes(patch.find)) {
      const before = result;
      result = result.replace(patch.find, patch.replace);
      if (result !== before) applied++;
    } else {
      // Try whitespace-normalized match
      const normalizedFind = patch.find.replace(/\s+/g, "\\s*");
      try {
        const regex = new RegExp(normalizedFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\s\*/g, '\\s*'), "g");
        const before = result;
        result = result.replace(regex, patch.replace);
        if (result !== before) applied++;
      } catch { /* skip bad regex */ }
    }
  }
  return { html: result, applied, changed: result !== html };
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

    // Fetch campaign + history in parallel
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

    let globalRules = "";
    if (brandResult.data?.user_id) {
      const { data: prefs } = await supabase.from("user_preferences").select("preferences").eq("user_id", brandResult.data.user_id).single();
      if (prefs?.preferences) {
        globalRules = (prefs.preferences as any).generation_rules || "";
      }
    }

    const chatHistory = (historyResult.data || []).reverse();

    // Only process user-attached images
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

    // PATCH-BASED system prompt — AI returns only surgical find/replace patches
    const systemMsg = `You are a surgical HTML email editor. You return ONLY the minimal patches needed — never the full HTML.

Do exactly what the user asks. Never refuse or push back.

RULES:
- Identify the EXACT strings in the HTML that need changing.
- Return find/replace patches — the "find" must be a UNIQUE snippet from the current HTML (include enough surrounding context to be unique).
- Keep patches minimal — only the lines that change.
- Card radius: ${brandValues.card_radius}px. Button radius: ${brandValues.button_radius}px.
${brandValues.accent_color ? `- Default accent: ${brandValues.accent_color}` : ""}
${brandValues.text_color ? `- Default text color: ${brandValues.text_color}` : ""}
- User requests OVERRIDE all defaults.
${extraRules}

OUTPUT FORMAT — use these EXACT tags:
<reply>
Confirm what you changed in 1-2 sentences.
</reply>
<patches>
[
  {"find": "exact string from current HTML", "replace": "replacement string"},
  {"find": "another exact string", "replace": "its replacement"}
]
</patches>

CRITICAL RULES FOR PATCHES:
- "find" must be an EXACT substring of the current HTML — copy it precisely, including whitespace.
- Include enough context in "find" to be unique (e.g., include the surrounding tag, not just a color value).
- For color changes, include the full style attribute or at minimum the property:value with surrounding context.
- Keep patches as small as possible — just the changed portion with enough context for uniqueness.
- If the change is structural (adding/removing sections), include the full section being added/removed.
- Output valid JSON in the patches array.`;

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
    console.log(`[edit-campaign] Prep: ${prepMs}ms | ${anthropicMessages.length} msgs | ${imageBlocks.length} imgs | HTML: ${currentHtml.length} chars`);

    // Streaming Anthropic call
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const aiStartMs = Date.now();
    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
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

                  // Stream reply text
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

          const aiMs = Date.now() - aiStartMs;
          console.log(`[edit-campaign] AI stream: ${aiMs}ms | Output: ${fullText.length} chars`);

          // Parse response
          const replyMatch = fullText.match(/<reply>([\s\S]*?)<\/reply>/);
          const patchesMatch = fullText.match(/<patches>([\s\S]*?)<\/patches>/);
          // Fallback: check for old full-HTML format
          const htmlMatch = fullText.match(/<email_html>([\s\S]*?)<\/email_html>/);

          let responseText = replyMatch ? replyMatch[1].trim() : "Changes applied.";

          let finalHtml = currentHtml;
          let patchCount = 0;

          if (patchesMatch) {
            // PATCH MODE — apply find/replace patches
            try {
              const patches = JSON.parse(patchesMatch[1].trim());
              if (Array.isArray(patches) && patches.length > 0) {
                const result = applyPatches(finalHtml, patches);
                finalHtml = result.html;
                patchCount = result.applied;
                console.log(`[edit-campaign] Patches: ${patches.length} provided, ${patchCount} applied`);

                if (patchCount === 0) {
                  // None matched — emit error but don't fail
                  console.warn(`[edit-campaign] WARNING: 0 patches matched! Patch find strings didn't match HTML.`);
                  emit("text_delta", { content: "\n\n⚠️ The patches couldn't be applied — retrying with full output..." });
                  // TODO: could retry with full-HTML mode here
                }
              }
            } catch (e) {
              console.error(`[edit-campaign] Failed to parse patches JSON:`, e);
            }
          } else if (htmlMatch) {
            // FALLBACK: full HTML mode (in case AI ignores patch format)
            const candidateHtml = htmlMatch[1].trim();
            // Validate it actually looks like HTML before accepting
            if (candidateHtml.includes("<") && (candidateHtml.includes("</") || candidateHtml.includes("/>"))) {
              finalHtml = candidateHtml;
              console.log(`[edit-campaign] Fallback: full HTML mode (${finalHtml.length} chars)`);
            } else {
              console.warn(`[edit-campaign] email_html content doesn't look like HTML, skipping`);
            }
          }
          // REMOVED: dangerous fallback that treated raw AI text as HTML
          // This was causing campaign destruction when patch tags were malformed

          // Safety: don't save if result looks corrupted
          const looksLikeHtml = finalHtml.includes("<!DOCTYPE") || finalHtml.includes("<html") || finalHtml.includes("<table") || finalHtml.includes("<div");
          const tooSmall = finalHtml.length < currentHtml.length * 0.3; // lost >70% of content = corrupted
          
          const htmlChanged = finalHtml !== currentHtml;

          if (finalHtml && htmlChanged && looksLikeHtml && !tooSmall) {
            finalHtml = enforceNoStackingLayout(finalHtml);

            const history = Array.isArray(campaign.html_history) ? campaign.html_history : [];
            history.push(campaign.html);

            await supabase.from("campaigns").update({
              html: finalHtml,
              html_history: history,
            }).eq("id", campaignId);

            emit("html_patch", { html: finalHtml });
          } else if (htmlChanged && (!looksLikeHtml || tooSmall)) {
            console.error(`[edit-campaign] BLOCKED corrupted save! looksLikeHtml=${looksLikeHtml}, tooSmall=${tooSmall}, length=${finalHtml.length} vs original=${currentHtml.length}`);
            responseText = "The edit result was corrupted, so no change was saved. Your campaign is unchanged.";
            emit("text_delta", { content: "\n\n⚠️ The edit produced corrupted output and was not saved. Your campaign is unchanged. Please try again with a simpler request." });
          } else if (!htmlChanged) {
            const reason = patchCount === 0
              ? "No matching HTML snippet was found for that request."
              : "The request completed but produced no actual HTML change.";
            responseText = `No change applied. ${reason}`;
            console.warn(`[edit-campaign] No HTML change was applied (patches applied=${patchCount})`);
            emit("no_change", { message: reason });
          }

          await supabase.from("chat_messages").insert([
            { campaign_id: campaignId, role: "user", content: message },
            { campaign_id: campaignId, role: "assistant", content: responseText },
          ]);

          const totalMs = Date.now() - startMs;
          console.log(`[edit-campaign] TOTAL: ${totalMs}ms | Prep: ${prepMs}ms | AI: ${aiMs}ms | Patches: ${patchCount} | HtmlChanged: ${htmlChanged}`);

          emit("done", { reply: responseText, changed: htmlChanged, patchesApplied: patchCount });
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
