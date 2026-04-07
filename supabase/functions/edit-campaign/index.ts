import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { finalizeCampaignHtml } from "../_shared/finalizeCampaignHtml.ts";

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

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

type NormalizedRange = { start: number; end: number };

function canonicalizeChar(char: string): string {
  switch (char) {
    case "\u2018":
    case "\u2019":
      return "'";
    case "\u201C":
    case "\u201D":
      return '"';
    case "\u00A0":
      return " ";
    default:
      return char;
  }
}

function decodeHtmlEntity(entity: string): string {
  const value = entity.slice(1, -1);
  if (!value) return entity;

  if (value.startsWith("#")) {
    const isHex = value[1]?.toLowerCase() === "x";
    const rawCodePoint = value.slice(isHex ? 2 : 1);
    const codePoint = Number.parseInt(rawCodePoint, isHex ? 16 : 10);
    if (Number.isFinite(codePoint)) {
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    }
    return entity;
  }

  return HTML_ENTITY_MAP[value.toLowerCase()] ?? entity;
}

function readNormalizedToken(source: string, start: number): { text: string; end: number } {
  const entityMatch = source.slice(start).match(/^&(?:#x?[0-9a-fA-F]+|[a-zA-Z]+);/);
  if (entityMatch) {
    const raw = entityMatch[0];
    return {
      text: decodeHtmlEntity(raw),
      end: start + raw.length,
    };
  }

  return {
    text: source[start],
    end: start + 1,
  };
}

function buildNormalizedIndex(source: string, caseInsensitive = false): { normalized: string; map: NormalizedRange[] } {
  let normalized = "";
  const map: NormalizedRange[] = [];
  let i = 0;

  while (i < source.length) {
    const tokenStart = i;
    const token = readNormalizedToken(source, i);
    i = token.end;

    const chars = [...token.text].map(canonicalizeChar);
    if (chars.length > 0 && chars.every((char) => /\s/.test(char))) {
      let whitespaceEnd = token.end;

      while (i < source.length) {
        const nextStart = i;
        const nextToken = readNormalizedToken(source, i);
        const nextChars = [...nextToken.text].map(canonicalizeChar);
        if (nextChars.length === 0 || !nextChars.every((char) => /\s/.test(char))) {
          i = nextStart;
          break;
        }
        whitespaceEnd = nextToken.end;
        i = nextToken.end;
      }

      if (!normalized.endsWith(" ")) {
        normalized += " ";
        map.push({ start: tokenStart, end: whitespaceEnd });
      } else if (map.length > 0) {
        map[map.length - 1].end = whitespaceEnd;
      }
      continue;
    }

    for (const rawChar of chars) {
      const normalizedChar = caseInsensitive ? rawChar.toLowerCase() : rawChar;
      normalized += normalizedChar;
      map.push({ start: tokenStart, end: token.end });
    }
  }

  let start = 0;
  while (start < normalized.length && normalized[start] === " ") start += 1;

  let end = normalized.length;
  while (end > start && normalized[end - 1] === " ") end -= 1;

  return {
    normalized: normalized.slice(start, end),
    map: map.slice(start, end),
  };
}

function replaceByNormalizedMatch(source: string, find: string, replace: string, caseInsensitive = false): string | null {
  const haystack = buildNormalizedIndex(source, caseInsensitive);
  const needle = buildNormalizedIndex(find, caseInsensitive).normalized;
  if (!needle) return null;

  const matchIndex = haystack.normalized.indexOf(needle);
  if (matchIndex === -1) return null;

  const start = haystack.map[matchIndex]?.start;
  const end = haystack.map[matchIndex + needle.length - 1]?.end;
  if (typeof start !== "number" || typeof end !== "number" || end <= start) return null;

  const next = `${source.slice(0, start)}${replace}${source.slice(end)}`;
  return next !== source ? next : null;
}

function applyWhitespaceFlexiblePatch(source: string, find: string, replace: string, flags = ""): string | null {
  const escapedFind = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wsFlexible = escapedFind.replace(/\s+/g, "\\s*");

  try {
    const regex = new RegExp(wsFlexible, flags);
    const next = source.replace(regex, replace);
    return next !== source ? next : null;
  } catch {
    return null;
  }
}

function applyPatches(html: string, patches: Array<{ find: string; replace: string }>): { html: string; applied: number; changed: boolean } {
  let result = html;
  let applied = 0;
  for (const patch of patches) {
    if (!patch.find || typeof patch.find !== "string") continue;
    let next: string | null = null;

    if (result.includes(patch.find)) {
      const replaced = result.replace(patch.find, patch.replace);
      next = replaced !== result ? replaced : null;
    }

    next ||= applyWhitespaceFlexiblePatch(result, patch.find, patch.replace);
    next ||= replaceByNormalizedMatch(result, patch.find, patch.replace);
    next ||= applyWhitespaceFlexiblePatch(result, patch.find, patch.replace, "i");
    next ||= replaceByNormalizedMatch(result, patch.find, patch.replace, true);

    if (next) {
      result = next;
      applied += 1;
    }
  }
  return { html: result, applied, changed: result !== html };
}

/**
 * Try to extract complete JSON objects from a partial JSON array string.
 * Returns an array of parsed objects and the remaining unparsed string.
 */
function extractCompleteVariants(jsonPartial: string): { variants: any[]; remaining: string } {
  const variants: any[] = [];
  let str = jsonPartial.trimStart();
  if (str.startsWith("[")) str = str.slice(1);

  while (str.length > 0) {
    str = str.trimStart();
    if (str.startsWith("]")) break;
    if (str.startsWith(",")) { str = str.slice(1); continue; }
    if (!str.startsWith("{")) break;

    // Find matching closing brace
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
    }

    if (end === -1) break; // incomplete object
    const objStr = str.slice(0, end + 1);
    try {
      variants.push(JSON.parse(objStr));
      str = str.slice(end + 1);
    } catch {
      break;
    }
  }
  return { variants, remaining: str };
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

    const { campaignId, message, currentHtml, attachedImageUrls, moreVariants, silent } = await req.json();

    const startMs = Date.now();

    const [campaignResult, historyResult] = await Promise.all([
      supabase.from("campaigns").select("*").eq("id", campaignId).single(),
      supabase.from("chat_messages").select("role, content").eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(10),
    ]);

    const campaign = campaignResult.data;
    if (campaignResult.error || !campaign) throw new Error("Campaign not found");

    const [profileResult, brandResult, productAssetsResult, brandAssetsResult] = await Promise.all([
      supabase.from("brand_profiles").select("system_prompt, brand_instructions, raw_extraction").eq("brand_id", campaign.brand_id).single(),
      supabase.from("brands").select("user_id").eq("id", campaign.brand_id).single(),
      // Fetch product assets for any products linked to this campaign
      Array.isArray(campaign.product_ids) && campaign.product_ids.length > 0
        ? supabase.from("product_assets").select("url, bucket, description, product_id").in("product_id", campaign.product_ids)
        : Promise.resolve({ data: [] }),
      // Fetch brand-level assets (lifestyle, hero shots, etc.)
      supabase.from("brand_assets").select("url, category, description").eq("brand_id", campaign.brand_id).limit(50),
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

    // Build available image catalog so AI uses brand images, NOT reference campaign images
    let assetCatalog = "";
    const productAssets = productAssetsResult?.data || [];
    const brandAssets = brandAssetsResult?.data || [];
    if (productAssets.length > 0 || brandAssets.length > 0) {
      assetCatalog = "\n\nAVAILABLE BRAND IMAGES (use ONLY these when adding/swapping images — NEVER invent URLs or use reference campaign screenshot URLs):";
      if (productAssets.length > 0) {
        assetCatalog += "\nProduct images:";
        for (const a of productAssets) {
          const bucket = (a.bucket || "").replace(/_/g, " ");
          assetCatalog += `\n  [${bucket}] ${a.url}${a.description ? ` — ${a.description}` : ""}`;
        }
      }
      if (brandAssets.length > 0) {
        assetCatalog += "\nBrand assets:";
        for (const a of brandAssets) {
          assetCatalog += `\n  [${a.category}] ${a.url}${a.description ? ` — ${a.description}` : ""}`;
        }
      }
    }

    // Determine variant count for "more" requests
    const variantCount = moreVariants ? 10 : undefined;

    const systemMsg = `You are a surgical HTML email editor. You return ONLY the minimal patches needed — never the full HTML.

Do exactly what the user asks. Never refuse or push back.

VARIANT MODE:
When the user asks for ideas, options, alternatives, or variations (e.g. "give me 3 headline options", "show me alternatives", "what are some ideas for the CTA"), do NOT edit the email directly. Instead return this exact format:

<response>
Brief intro text e.g. "Here are 3 headline options:"
</response>
<variants>
[
  {"label": "Short option title", "preview": "The actual copy the user will read", "find": "exact string currently in the HTML to replace", "replace": "new string to replace it with", "apply_all": true}
]
</variants>

CRITICAL VARIANT RULE — "apply_all" field:
- Set "apply_all": true when the change is SYSTEMIC — it should apply to ALL matching instances in the email. This includes: color changes, background colors, font changes, typography, button styling, border radius, padding patterns, or any visual/formatting property that repeats across multiple elements for consistency.
- Set "apply_all": false (or omit) when the change is LOCALIZED — it targets specific unique content like a single headline, a specific paragraph, or one particular section's text.
- Example: changing CTA button color → apply_all: true (all CTAs should match). Rewriting a headline → apply_all: false (only that one headline).
- When apply_all is true, the "find" should target the SPECIFIC style/attribute value that repeats (e.g. a background-color value with enough context), NOT the entire element.

${variantCount ? `IMPORTANT: Generate exactly ${variantCount} diverse variant options. Vary style, tone, length, and approach significantly across all options.` : ""}

EDIT MODE (for direct edit requests):

RULES:
- Identify the EXACT strings in the HTML that need changing.
- Return find/replace patches — the "find" must be a UNIQUE snippet from the current HTML (include enough surrounding context to be unique).
- Keep patches minimal — only the lines that change.
- Card radius: ${brandValues.card_radius}px. Button radius: ${brandValues.button_radius}px.
${brandValues.accent_color ? `- Default accent: ${brandValues.accent_color}` : ""}
${brandValues.text_color ? `- Default text color: ${brandValues.text_color}` : ""}
- User requests OVERRIDE all defaults.
${extraRules}
${assetCatalog}

IMAGE RULES:
- When adding or swapping images, ONLY use URLs from the AVAILABLE BRAND IMAGES list above.
- NEVER use image URLs from reference campaigns, screenshots, or any URL not in the brand image catalog.
- If no brand images are available and the user asks to add an image, tell them to upload images to their asset library first.

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
- Output valid JSON in the patches array.

Never mix the two formats in one response. Use VARIANT MODE only when the user asks for ideas/options/alternatives. Use EDIT MODE for everything else.`;

    const anthropicMessages: any[] = [];
    for (const msg of chatHistory) {
      anthropicMessages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      });
    }

    const isOptionsIntent = moreVariants || /\b(option|alternative|variation|variant|idea|choice|version)s?\b/i.test(message)
      || /\bgive me \d/i.test(message)
      || /\bshow me \d/i.test(message)
      || /\bsubject line options?\b/i.test(message)
      || /\bpreview text options?\b/i.test(message);

    const editPrefix = isOptionsIntent
      ? `[USER WANTS OPTIONS — use VARIANT MODE, not EDIT MODE]${moreVariants ? ` [Generate ${variantCount} MORE diverse options for the same request]` : ""}\n\nCurrent HTML:\n${currentHtml}\n\nRequest: ${message}`
      : `Current HTML:\n${currentHtml}\n\nEdit: ${message}`;

    const userContent: any[] = [];
    if (imageBlocks.length > 0) userContent.push(...imageBlocks);
    userContent.push({ type: "text", text: editPrefix });
    anthropicMessages.push({ role: "user", content: userContent });

    const prepMs = Date.now() - startMs;
    console.log(`[edit-campaign] Prep: ${prepMs}ms | ${anthropicMessages.length} msgs | ${imageBlocks.length} imgs | HTML: ${currentHtml.length} chars | moreVariants: ${!!moreVariants}`);

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
        max_tokens: moreVariants ? 8192 : 4096,
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
        let isClosed = false;
        const safeEmit = (event: string, data: any) => {
          if (isClosed) return;
          try {
            ctrl.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch (e) {
            console.error(`[edit-campaign] safeEmit failed for ${event}:`, e);
          }
        };
        const safeClose = () => {
          if (isClosed) return;
          isClosed = true;
          try { ctrl.close(); } catch {}
        };

        let fullText = "";

        try {
          const reader = anthropicResp.body!.getReader();
          const decoder = new TextDecoder();
          let sseBuffer = "";

          // Track whether we're in variant mode for streaming
          let inVariantsTag = false;
          let variantsBuffer = "";
          let emittedVariantCount = 0;
          let variantsIntroText = "";
          let isVariantResponse = false;

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
                  const chunk = evt.delta.text;
                  fullText += chunk;

                  // Check for <response> tag to capture intro text
                  const responseMatch = fullText.match(/<response>([\s\S]*?)<\/response>/);
                  if (responseMatch && !variantsIntroText) {
                    variantsIntroText = responseMatch[1].trim();
                  }

                  // Detect <variants> opening tag
                  if (!inVariantsTag && fullText.includes("<variants>")) {
                    inVariantsTag = true;
                    isVariantResponse = true;
                    const tagIdx = fullText.indexOf("<variants>") + "<variants>".length;
                    variantsBuffer = fullText.slice(tagIdx);
                    // Emit intro text
                    if (!variantsIntroText) variantsIntroText = "Here are some options:";
                    safeEmit("variants_start", { message: variantsIntroText });
                  } else if (inVariantsTag) {
                    variantsBuffer += chunk;
                  }

                  // Try to extract complete variant objects from the buffer
                  if (inVariantsTag) {
                    // Check if the tag is closed
                    const closeIdx = variantsBuffer.indexOf("</variants>");
                    const parseStr = closeIdx !== -1 ? variantsBuffer.slice(0, closeIdx) : variantsBuffer;
                    const { variants: parsedVariants } = extractCompleteVariants(parseStr);
                    
                    // Emit any new variants
                    for (let vi = emittedVariantCount; vi < parsedVariants.length; vi++) {
                      safeEmit("variant_item", { variant: parsedVariants[vi], index: vi });
                      emittedVariantCount++;
                    }
                  }
                }
              } catch { /* skip */ }
            }
          }

          const aiMs = Date.now() - aiStartMs;
          console.log(`[edit-campaign] AI stream: ${aiMs}ms | Output: ${fullText.length} chars`);

          // Parse response
          const replyMatch = fullText.match(/<reply>([\s\S]*?)<\/reply>/);
          const responseMatch = fullText.match(/<response>([\s\S]*?)<\/response>/);
          const patchesMatch = fullText.match(/<patches>([\s\S]*?)<\/patches>/);
          const variantsMatch = fullText.match(/<variants>([\s\S]*?)<\/variants>/);
          const htmlMatch = fullText.match(/<email_html>([\s\S]*?)<\/email_html>/);

          // Handle VARIANT MODE
          if (variantsMatch || isVariantResponse) {
            try {
              let allVariants: any[] = [];
              if (variantsMatch) {
                allVariants = JSON.parse(variantsMatch[1].trim());
              }
              const introText = variantsIntroText || responseMatch?.[1]?.trim() || replyMatch?.[1]?.trim() || "Here are some options:";
              
              if (Array.isArray(allVariants) && allVariants.length > 0) {
                console.log(`[edit-campaign] Variant mode: ${allVariants.length} variants (${emittedVariantCount} streamed)`);

                // Emit any variants we haven't streamed yet
                for (let vi = emittedVariantCount; vi < allVariants.length; vi++) {
                  safeEmit("variant_item", { variant: allVariants[vi], index: vi });
                }

                if (!silent) {
                  await supabase.from("chat_messages").insert([
                    { campaign_id: campaignId, role: "user", content: message },
                    { campaign_id: campaignId, role: "assistant", content: introText, tool_calls: { type: "variants", data: { message: introText, variants: allVariants, applied_index: null } } },
                  ]);
                }

                safeEmit("variants_done", { message: introText, variants: allVariants });
                safeEmit("done", { reply: introText, changed: false, patchesApplied: 0, isVariants: true });
                safeClose();
                return;
              }
            } catch (e) {
              console.error(`[edit-campaign] Failed to parse variants JSON:`, e);
            }
          }

          let responseText = replyMatch ? replyMatch[1].trim() : "Changes applied.";

          // Emit the full reply text at once
          if (responseText) {
            safeEmit("text_delta", { content: responseText });
          }

          let finalHtml = currentHtml;
          let patchCount = 0;

          if (patchesMatch) {
            try {
              const patches = JSON.parse(patchesMatch[1].trim());
              if (Array.isArray(patches) && patches.length > 0) {
                const result = applyPatches(finalHtml, patches);
                finalHtml = result.html;
                patchCount = result.applied;
                console.log(`[edit-campaign] Patches: ${patches.length} provided, ${patchCount} applied`);

                if (patchCount === 0) {
                  console.warn(`[edit-campaign] WARNING: 0 patches matched! Retrying with full-HTML mode...`);
                  safeEmit("text_delta", { content: "\n\n⚠️ Patches didn't match — retrying with full output..." });

                  try {
                    const retryResp = await fetch("https://api.anthropic.com/v1/messages", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "x-api-key": ANTHROPIC_API_KEY,
                        "anthropic-version": "2023-06-01",
                      },
                      body: JSON.stringify({
                        model: "claude-sonnet-4-6",
                        max_tokens: 16384,
                        system: `You are a surgical HTML email editor. Apply ONLY the user's specific requested edit and return the COMPLETE modified HTML wrapped in <email_html> tags. Also include a brief <reply> tag describing what you changed.

CRITICAL STRUCTURE RULES:
- DO NOT change the layout structure. If a section is stacked vertically (image on top, text below), keep it that way.
- DO NOT convert single-column layouts to multi-column or side-by-side layouts unless explicitly asked.
- DO NOT rearrange, reorder, or restructure sections.
- DO NOT add or remove sections unless explicitly asked.
- ONLY modify the specific thing the user requested (spacing, colors, text, etc.).
- The output HTML must be structurally identical to the input, with only the requested change applied.

Format:
<reply>What changed</reply>
<email_html>...full modified HTML...</email_html>`,
                        messages: anthropicMessages,
                      }),
                    });

                    if (retryResp.ok) {
                      const retryJson = await retryResp.json();
                      const retryText = retryJson?.content?.[0]?.text || "";
                      const retryHtmlMatch = retryText.match(/<email_html>([\s\S]*?)<\/email_html>/);
                      const retryReplyMatch = retryText.match(/<reply>([\s\S]*?)<\/reply>/);
                      if (retryHtmlMatch) {
                        const retryHtml = retryHtmlMatch[1].trim();
                        if (retryHtml.includes("<") && retryHtml.length > currentHtml.length * 0.3) {
                          finalHtml = retryHtml;
                          patchCount = 1;
                          if (retryReplyMatch) responseText = retryReplyMatch[1].trim();
                          console.log(`[edit-campaign] Full-HTML retry succeeded (${finalHtml.length} chars)`);
                        }
                      }
                    }
                  } catch (retryErr) {
                    console.error(`[edit-campaign] Full-HTML retry failed:`, retryErr);
                  }
                }
              }
            } catch (e) {
              console.error(`[edit-campaign] Failed to parse patches JSON:`, e);
            }
          } else if (htmlMatch) {
            const candidateHtml = htmlMatch[1].trim();
            if (candidateHtml.includes("<") && (candidateHtml.includes("</") || candidateHtml.includes("/>"))) {
              finalHtml = candidateHtml;
              console.log(`[edit-campaign] Fallback: full HTML mode (${finalHtml.length} chars)`);
            } else {
              console.warn(`[edit-campaign] email_html content doesn't look like HTML, skipping`);
            }
          }

          const looksLikeHtml = finalHtml.includes("<!DOCTYPE") || finalHtml.includes("<html") || finalHtml.includes("<table") || finalHtml.includes("<div");
          const tooSmall = finalHtml.length < currentHtml.length * 0.3;
          
          const htmlChanged = finalHtml !== currentHtml;

          if (finalHtml && htmlChanged && looksLikeHtml && !tooSmall) {
            finalHtml = finalizeCampaignHtml(finalHtml);

            const history = Array.isArray(campaign.html_history) ? campaign.html_history : [];
            history.push(campaign.html);

            await supabase.from("campaigns").update({
              html: finalHtml,
              html_history: history,
            }).eq("id", campaignId);

            safeEmit("html_patch", { html: finalHtml });
          } else if (htmlChanged && (!looksLikeHtml || tooSmall)) {
            console.error(`[edit-campaign] BLOCKED corrupted save! looksLikeHtml=${looksLikeHtml}, tooSmall=${tooSmall}, length=${finalHtml.length} vs original=${currentHtml.length}`);
            responseText = "The edit result was corrupted, so no change was saved. Your campaign is unchanged.";
            safeEmit("text_delta", { content: "\n\n⚠️ The edit produced corrupted output and was not saved. Your campaign is unchanged. Please try again with a simpler request." });
          } else if (!htmlChanged) {
            const reason = patchCount === 0
              ? "No matching HTML snippet was found for that request."
              : "The request completed but produced no actual HTML change.";
            responseText = `No change applied. ${reason}`;
            console.warn(`[edit-campaign] No HTML change was applied (patches applied=${patchCount})`);
            safeEmit("no_change", { message: reason });
          }

          if (!silent) {
            await supabase.from("chat_messages").insert([
              { campaign_id: campaignId, role: "user", content: message },
              { campaign_id: campaignId, role: "assistant", content: responseText },
            ]);
          }

          const totalMs = Date.now() - startMs;
          console.log(`[edit-campaign] TOTAL: ${totalMs}ms | Prep: ${prepMs}ms | AI: ${aiMs}ms | Patches: ${patchCount} | HtmlChanged: ${htmlChanged}`);

          safeEmit("done", { reply: responseText, changed: htmlChanged, patchesApplied: patchCount });
        } catch (err) {
          safeEmit("error", { message: err instanceof Error ? err.message : "Stream failed" });
        } finally {
          safeClose();
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
