/**
 * Core campaign generation logic extracted from generate-campaign/index.ts.
 * Can be called directly (no HTTP hop) from generate-campaign-multi.
 */
import { rehostHtmlImagesWithImageKit } from "./imagekit.ts";
import { finalizeCampaignHtml } from "./finalizeCampaignHtml.ts";
import { KLAVIYO_BEST_PRACTICES, KLAVIYO_FLOW_LIQUID_REFERENCE } from "./klaviyoBestPractices.ts";
import { emailCopywriterPromptBlock } from "./emailCopywriterSkill.ts";

/** Lightweight structured event logger for generation pipeline steps.
 *  Uses upsert on (campaign_id, run_id, event_key) so a "started" row
 *  gets updated to "completed"/"failed" instead of creating a duplicate. */
export async function logGenEvent(
  supabase: any,
  campaignId: string,
  step: string,
  data: {
    status?: string; payload?: any; result?: any; error?: string;
    duration_ms?: number; run_id?: string; event_key?: string;
  }
) {
  try {
    const runId = data.run_id || undefined;
    const eventKey = data.event_key || `${step}_${Date.now()}`;
    const status = data.status || "completed";
    const isTerminal = status !== "started";

    const row: Record<string, any> = {
      campaign_id: campaignId,
      step,
      status,
      run_id: runId,
      event_key: eventKey,
      payload: data.payload || null,
      error: data.error || null,
    };

    if (isTerminal) {
      row.completed_at = new Date().toISOString();
      row.duration_ms = data.duration_ms || null;
      row.result = data.result || null;
    }

    if (runId && eventKey) {
      // Upsert: if this event_key already exists for this run, update it
      await supabase.from("generation_events").upsert(row, {
        onConflict: "campaign_id,run_id,event_key",
        ignoreDuplicates: false,
      });
    } else {
      await supabase.from("generation_events").insert(row);
    }
  } catch (e) {
    console.warn("[logGenEvent] Failed to log event:", e);
  }
}

/**
 * Extract a structured layout skeleton from reference screenshots using Gemini Flash.
 * Returns a JSON string describing section types, grid geometry, and image slot counts.
 */
async function extractReferenceSkeleton(referenceImageUrls: string[]): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || referenceImageUrls.length === 0) return null;

  const content: any[] = [
    {
      type: "text",
      text: `Analyze these reference email campaign screenshots and extract a precise structural skeleton. Return ONLY a JSON object with this exact format:

{
  "sections": [
    { "type": "header|hero|hero-text|text|grid|cta|footer|divider|testimonial|stats", "layout": "description of layout", "columns": N, "rows": N, "equal_sizing": true/false, "labels": "none|below|overlay" }
  ],
  "total_image_slots": N,
  "grid_patterns": ["NxM equal" or "NxM varied" for each grid found]
}

RULES:
- For grids: count EXACTLY how many columns and rows of images you see. A 2×2 grid has columns:2, rows:2.
- "equal_sizing": true means ALL images in the grid are the same size. false means they vary (mosaic/asymmetric).
- If images are arranged in a simple NxN grid with equal sizes, report it as "NxN equal" in grid_patterns.
- Count total_image_slots as the total number of distinct image placeholders in the entire email.
- Be precise about section ordering — list them top to bottom as they appear.

Return ONLY the JSON. No commentary.`,
    },
  ];

  for (const url of referenceImageUrls.slice(0, 10)) {
    content.push({ type: "image_url", image_url: { url } });
  }

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
      }),
    });

    if (!resp.ok) {
      console.warn(`[extractReferenceSkeleton] Gemini returned ${resp.status}, skipping skeleton`);
      return null;
    }

    const result = await resp.json();
    const raw = result.choices?.[0]?.message?.content || "";
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    // Validate it's parseable JSON
    JSON.parse(cleaned);
    console.log(`[extractReferenceSkeleton] Extracted skeleton: ${cleaned.substring(0, 200)}...`);
    return cleaned;
  } catch (err) {
    console.warn(`[extractReferenceSkeleton] Failed:`, err);
    return null;
  }
}

/** Strip any AI commentary and extract only the HTML document */
function extractHtmlOnly(text: string): string {
  let html = text.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();
  const doctypeIdx = html.search(/<!DOCTYPE\s/i);
  const htmlTagIdx = html.search(/<html[\s>]/i);
  const startIdx = doctypeIdx >= 0 ? doctypeIdx : htmlTagIdx >= 0 ? htmlTagIdx : -1;
  if (startIdx > 0) {
    html = html.substring(startIdx);
  }
  const endMatch = html.match(/<\/html\s*>/i);
  if (endMatch && endMatch.index !== undefined) {
    html = html.substring(0, endMatch.index + endMatch[0].length);
  }
  return html;
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

function capImageDimensions(url: string, maxDim = 1900): string {
  // ImageKit fast-path: rewrite the URL so the CDN serves a pre-resized image.
  // For non-ImageKit URLs we still fall back to host-agnostic resizing in
  // prepareImageForAnthropic() below, so this function is now only an
  // optimization, never a safeguard.
  if (!/^https:\/\/ik\.imagekit\.io\//i.test(url)) return url;

  const pathStyleMatch = url.match(/\/tr:([^/]+)\//i);
  if (pathStyleMatch) {
    const existing = pathStyleMatch[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !/^(w|h|c)-/i.test(part));
    const next = [...existing, `c-at_max`, `w-${maxDim}`, `h-${maxDim}`].join(',');
    return url.replace(/\/tr:[^/]+\//i, `/tr:${next}/`);
  }

  const queryStyleMatch = url.match(/([?&]tr=)([^&]+)/i);
  if (queryStyleMatch) {
    const existing = queryStyleMatch[2]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !/^(w|h|c)-/i.test(part));
    const next = [...existing, `c-at_max`, `w-${maxDim}`, `h-${maxDim}`].join(',');
    return url.replace(/([?&]tr=)[^&]+/i, `$1${next}`);
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}tr=c-at_max,w-${maxDim},h-${maxDim}`;
}

/** Decode JPEG/PNG/GIF/WebP dimensions from a byte buffer header. Returns null if undetectable. */
function readImageSize(bytes: Uint8Array): { width: number; height: number } | null {
  // PNG: \x89PNG\r\n\x1a\n then IHDR width(4)/height(4) at byte 16
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // GIF: GIF8 then width(2 LE), height(2 LE) at byte 6
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  }
  // WebP: RIFF....WEBP then VP8 / VP8L / VP8X
  if (bytes.length >= 30 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (fourcc === "VP8 ") {
      // Lossy: width/height at offset 26-29 (14 bits each)
      const w = dv.getUint16(26, true) & 0x3fff;
      const h = dv.getUint16(28, true) & 0x3fff;
      return { width: w, height: h };
    }
    if (fourcc === "VP8L") {
      // Lossless: bits packed starting at offset 21
      const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width, height };
    }
    if (fourcc === "VP8X") {
      // Extended: 24-bit width-1 / height-1 at offset 24/27 (LE)
      const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width: w, height: h };
    }
  }
  // JPEG: scan SOFx markers
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) { i++; continue; }
      // Skip filler 0xff bytes
      while (i < bytes.length && bytes[i] === 0xff) i++;
      const marker = bytes[i]; i++;
      if (marker === 0xd8 || marker === 0xd9) continue; // SOI / EOI - no length
      if (marker >= 0xd0 && marker <= 0xd7) continue; // restart markers
      const segLen = (bytes[i] << 8) | bytes[i + 1];
      // Start Of Frame markers (excluding DHT/JPG/DAC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = (bytes[i + 3] << 8) | bytes[i + 4];
        const width = (bytes[i + 5] << 8) | bytes[i + 6];
        return { width, height };
      }
      i += segLen;
    }
  }
  return null;
}

/**
 * Host-agnostic image preparation for Anthropic vision payloads.
 *
 * Anthropic rejects any image with a dimension > 2000px in many-image requests.
 * The previous capImageDimensions() only worked for ImageKit URLs, so brand
 * reference slices hosted elsewhere (e.g. Supabase storage) bypassed the cap
 * entirely and crashed generation immediately.
 *
 * This function:
 *  1. Tries the ImageKit URL rewrite as a fast-path (CDN-side resize).
 *  2. Fetches the (possibly already capped) image bytes.
 *  3. Decodes the actual width/height from the image header.
 *  4. If the image still exceeds the safe limit, re-fetches it via ImageKit's
 *     remote-URL proxy (`/tr:c-at_max,w-1900,h-1900/<original>`), which will
 *     return a properly resized JPEG regardless of the source host.
 *  5. Returns a base64 image block ready for Anthropic, plus diagnostics.
 *
 * Returns null when the image is unreachable / empty so the caller can skip it
 * loudly instead of corrupting the request.
 */
async function prepareImageForAnthropic(
  originalUrl: string,
  sourceTag: string,
  maxDim = 1900,
): Promise<{ block: any; size: number } | null> {
  const fastUrl = capImageDimensions(originalUrl, maxDim);
  let resp: Response;
  try {
    resp = await fetch(fastUrl);
  } catch (err) {
    console.warn(`[prepareImage:${sourceTag}] fetch failed for ${fastUrl}:`, (err as any)?.message || err);
    return null;
  }
  if (!resp.ok) {
    console.warn(`[prepareImage:${sourceTag}] HTTP ${resp.status} for ${fastUrl}`);
    return null;
  }

  let mediaType = (resp.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
  let buf = await resp.arrayBuffer();
  let bytes = new Uint8Array(buf);
  const original = readImageSize(bytes);
  const tooBigByte = buf.byteLength > 4_500_000;
  const tooBigDim = original ? (original.width > 2000 || original.height > 2000) : false;

  if (tooBigDim || tooBigByte) {
    // Step A: Try ImageKit proxy first (fast CDN-side)
    const proxyUrl =
      `https://ik.imagekit.io/lovable/tr:c-at_max,w-${maxDim},h-${maxDim},f-jpg,q-85/` +
      encodeURIComponent(originalUrl);
    let proxyOk = false;
    try {
      const r2 = await fetch(proxyUrl);
      if (r2.ok) {
        const ct = (r2.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
        const buf2 = await r2.arrayBuffer();
        const bytes2 = new Uint8Array(buf2);
        const after = readImageSize(bytes2);
        if (after && after.width <= 2000 && after.height <= 2000) {
          mediaType = ct;
          buf = buf2;
          bytes = bytes2;
          proxyOk = true;
          console.log(
            `[prepareImage:${sourceTag}] proxy resize: ${original?.width}x${original?.height} → ${after.width}x${after.height} (${(buf.byteLength / 1_000_000).toFixed(2)}MB) src=${originalUrl}`,
          );
        } else {
          console.warn(`[prepareImage:${sourceTag}] proxy returned untransformed ${after?.width ?? "?"}x${after?.height ?? "?"} — falling back to local resize`);
        }
      } else {
        console.warn(`[prepareImage:${sourceTag}] proxy HTTP ${r2.status} — falling back to local resize. src=${originalUrl}`);
      }
    } catch (err) {
      console.warn(`[prepareImage:${sourceTag}] proxy fetch failed:`, (err as any)?.message || err);
    }

    // Step B: GUARANTEED local downscale via ImageScript (works for any host)
    if (!proxyOk) {
      try {
        const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
        const decoded = await Image.decode(bytes);
        const w = decoded.width;
        const h = decoded.height;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const targetW = Math.max(1, Math.floor(w * scale));
        const targetH = Math.max(1, Math.floor(h * scale));
        const resized = scale < 1 ? decoded.resize(targetW, targetH) : decoded;
        const encoded = await resized.encodeJPEG(85);
        buf = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer;
        bytes = new Uint8Array(buf);
        mediaType = "image/jpeg";
        console.log(
          `[prepareImage:${sourceTag}] LOCAL resize: ${w}x${h} → ${targetW}x${targetH} (${(buf.byteLength / 1_000_000).toFixed(2)}MB) src=${originalUrl}`,
        );
      } catch (err) {
        console.error(`[prepareImage:${sourceTag}] LOCAL resize failed — skipping image to avoid Anthropic 400. src=${originalUrl}`, (err as any)?.message || err);
        return null;
      }
    }
  } else {
    console.log(
      `[prepareImage:${sourceTag}] ok ${original?.width ?? "?"}x${original?.height ?? "?"} ` +
      `(${(buf.byteLength / 1_000_000).toFixed(2)}MB) src=${originalUrl}`,
    );
  }

  // Final hard guard — refuse to send anything that would crash generation.
  if (buf.byteLength > 4_500_000) {
    console.warn(`[prepareImage:${sourceTag}] still >4.5MB after resize; skipping. src=${originalUrl}`);
    return null;
  }
  const finalSize = readImageSize(bytes);
  if (finalSize && (finalSize.width > 2000 || finalSize.height > 2000)) {
    console.warn(
      `[prepareImage:${sourceTag}] still ${finalSize.width}x${finalSize.height} after resize; skipping. src=${originalUrl}`,
    );
    return null;
  }

  const b64 = arrayBufferToBase64(buf);
  return {
    block: { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
    size: buf.byteLength,
  };
}

/** Anthropic API call with AbortController timeout */
async function callAnthropic(body: object, apiKey: string, timeoutMs = 240000): Promise<Response> {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startMs = Date.now();
    console.log(`[callAnthropic] attempt=${attempt} model=${(body as any).model} max_tokens=${(body as any).max_tokens} timeout=${timeoutMs}ms`);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const elapsed = Date.now() - startMs;
      console.log(`[callAnthropic] completed in ${elapsed}ms status=${resp.status}`);
      if ((resp.status === 529 || resp.status === 503) && attempt < maxRetries) {
        console.warn(`[callAnthropic] got ${resp.status}, retrying in ${(attempt + 1) * 5}s...`);
        await resp.text();
        await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
        continue;
      }
      return resp;
    } catch (error) {
      const elapsed = Date.now() - startMs;
      if ((error as any).name === "AbortError") throw new Error(`Anthropic API call timed out after ${Math.round(elapsed / 1000)}s`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("callAnthropic: exhausted retries");
}

const UNIVERSAL_EMAIL_RULES = `You are an expert HTML email developer.
Every email you build must follow these rules without exception.

STRUCTURE:
- All layout uses HTML tables — no divs for structure
- All layout-affecting styles are inline on every element
- <style> block in <head> for @media queries and Gmail fixes only
- Wrapper table: width="100%" style="max-width:600px; width:100%; margin:0 auto;"
- The outermost wrapper table must NEVER use a fixed width:600px. Always width:100% with max-width:600px.
- The outermost body/wrapper background MUST be pure white (#ffffff) or transparent. NEVER add a grey, off-white, or colored background wrapper around the email. No grey padding frames around the email content.

GMAIL DARK MODE (apply to every single white <td> and the wrapper table):
- Add background-image:linear-gradient(#ffffff,#ffffff) alongside background-color:#ffffff
- This prevents Gmail dark mode from inverting the white background
- Add <meta name='color-scheme' content='light only'> in <head>
- Add in <style>: u+.body .gmail-blend-screen{background:#000;mix-blend-mode:screen;}
                  u+.body .gmail-blend-difference{background:#000;mix-blend-mode:difference;}

MOBILE (@media only screen and (max-width:620px)):
- .email-wrapper { width:100% !important }
- Hero headline: scale down significantly (never let it wrap more than 2 lines)
- Body text minimum 16px, recommended 16-18px for optimal mobile readability
- Benefit pills/chips: display:block, stack vertically — never a horizontal row
- Buttons: minimum 44px tall, auto width with generous horizontal padding (32-48px). NEVER full-width — buttons should look the same in the preview as they do in real email clients.

BUTTONS:
- Use the brand's button border-radius value (from BRAND DESIGN VALUES). Do NOT hardcode border-radius:100px unless that is the brand value.
- Always 1.5px solid border — color matches brand button_border
- Padding: minimum 16px vertical, 32px horizontal
- Width: auto with horizontal padding. NEVER width:100%. Buttons must not stretch to fill the container.
- Text: short enough to fit one line on 375px mobile
- STRUCTURE (critical): The wrapper <table> around the CTA <td> MUST have style="margin:0 auto;" and NO width attribute. This prevents the table from stretching to 100%. Example:
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr><td style="background-color:...;border-radius:...;border:1.5px solid ...;">
      <a href="..." style="display:inline-block;padding:16px 40px;...">CTA text</a>
    </td></tr>
  </table>
- The <a> inside the button <td> MUST use display:inline-block. Never set width:100% on the <a> or the wrapper table.

FIRST FOLD CTA (mandatory):
- Every email MUST have a CTA button visible within the first ~600px of vertical content (the "first fold")
- This means: hero section → headline → brief supporting text → CTA, all within the first screenful
- The first CTA should appear BEFORE any secondary content sections, product grids, or testimonials
- Additional CTAs can appear later in the email, but the first one must be above the fold

HEADLINES:
- All multi-line headlines use hard <br> line breaks
- Never rely on auto-wrapping — email clients reflow unpredictably

IMAGES:
- Full-width single images (hero, full-bleed): style="display:block; width:100%; height:auto;"
- Logo images: display at a reasonable size that matches the reference. Use height:auto. Never stretch to full width.
- Grid images (2 or more images side by side): derive the correct slot dimensions from the reference campaign. Use fixed pixel width and height attributes that match what you observe. Use style="display:block; width:100%; height:{N}px; object-fit:cover;" and append ?tr=w-{W},h-{H},fo-auto to ImageKit URLs. Never use height:auto on grid images.
- Never output placeholder or arbitrary pixel values like width="38" height="100". Every dimension you write must reflect the actual layout geometry.
- Do not modify, transform, or fabricate image URLs. Use only the URLs provided in the asset catalog.
- PADDING CONSISTENCY (critical): Every content image in the email must have the SAME padding treatment. Either ALL images sit inside table cells with equal left/right padding (e.g., 24-40px on each side) OR ALL images are full-bleed. NEVER mix padded and full-bleed images.
- When using padded images, the image's parent <td> must have explicit left and right padding. The image itself stays width:100% within that padded cell.
- Images should generally NOT span the full 600px edge-to-edge unless the brand's reference campaigns specifically use full-bleed imagery. Default to padded images with 24-40px side padding.
- LOGO HANDLING: Images categorized as 'logo' must be displayed at max-width:150px (or similar reasonable size), centered, with padding above and below. NEVER stretch a logo to full width. NEVER crop a logo. If a dark-mode-safe variant exists, use it.

GRID LAYOUT — REQUIRED STRUCTURE:
- Multi-column image grids MUST use direct <td> siblings inside a single <tr>. Never use display:inline-block tables side by side.
- CRITICAL: ALL grid columns MUST have EQUAL width. For a 390px viewport with N columns: each td width = floor((390 - gutter) / N). A 2-column grid = 193px per cell. A 3-column grid = 128px per cell.
- NEVER create asymmetric grids (e.g., one column 70% and another 30%). ALL columns in a grid row must be the same width.
- Correct 2-column example (390px viewport, 4px gutter → 193px per cell):
  <tr>
    <td width="193" valign="top" style="padding:0 2px 0 0;">
      <img src="..." width="193" height="193" style="display:block;width:100%;height:193px;object-fit:cover;">
    </td>
    <td width="193" valign="top" style="padding:0 0 0 2px;">
      <img src="..." width="193" height="193" style="display:block;width:100%;height:193px;object-fit:cover;">
    </td>
  </tr>
- For "shop by category" or card grids with labels below images, wrap each cell's content in a small nested table but keep the outer <td> widths EQUAL:
  <tr>
    <td width="193" valign="top" style="padding:0 2px 0 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td><img src="..." width="193" height="193" style="display:block;width:100%;height:193px;object-fit:cover;border-radius:8px;"></td></tr>
        <tr><td style="padding:8px 0;text-align:center;font-size:14px;">Category Name</td></tr>
      </table>
    </td>
    <td width="193" valign="top" style="padding:0 0 0 2px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td><img src="..." width="193" height="193" style="display:block;width:100%;height:193px;object-fit:cover;border-radius:8px;"></td></tr>
        <tr><td style="padding:8px 0;text-align:center;font-size:14px;">Category Name</td></tr>
      </table>
    </td>
  </tr>
- Never use: <table align="left" style="display:inline-block"> as a column technique. This stacks vertically at any viewport narrower than the combined column widths.
- Never add mobile-grid-col or any CSS class that sets display:block on grid columns. The email renders at 390px — mobile stacking rules will fire and destroy the layout.
- NEVER use percentage widths on grid <td> elements. Always use explicit pixel values.
- NEVER add class="grid-cell" or class="category-cell" to grid <td> elements. These are mobile stacking classes and we do not stack grids on mobile. Grids must remain side-by-side at ALL viewport widths.
- NEVER include media query rules that set display:block or width:100% on grid cells. The only responsive adjustments allowed on grid cells are font-size changes and padding changes.
- Do not generate ANY CSS rules targeting .grid-cell or .category-cell. These classes must not exist anywhere in the output.

CONTRAST CARDS:
- Never full-width color blocks cutting the email in half
- Always: outer padding + inner card with border-radius
- White space visible on both sides of every contrast card

DESIGN COHESION:
- ALL text alignment within a section must be consistent — if a section is center-aligned, ALL elements in it (headlines, body text, bullets, sub-text) must be centered
- Never use raw gray (#999 or similar) body text — use the brand's text color or a slightly muted version of it
- Bullet points or benefit lists in a centered layout must themselves be centered (use centered pill/chip design, not left-aligned bullets)
- Every section must feel "designed" — no default-looking text dumps
- Maintain a clear visual hierarchy: headline → supporting text → CTA, with consistent spacing

NO EMOJIS — EVER:
- Never use emoji characters anywhere in the email — not in headlines, body text, CTAs, subject lines, or footer
- For icons (stars, checkmarks, arrows), use hosted PNG/GIF images OR Unicode text characters styled with CSS
- Social media icons: use small hosted PNG images (not SVG, not emoji)
- Star ratings: use Unicode ★ (&#9733;) and ☆ (&#9734;) characters with brand accent color
- Checkmarks: use Unicode ✓ (&#10003;) or ✔ (&#10004;) characters
- Arrows: use Unicode → (&#8594;) or › (&#8250;) characters

BANNED IN EMAIL HTML — DO NOT USE:
- Inline <svg> elements — most email clients (Gmail, Outlook, Yahoo) strip or ignore SVG entirely. Use hosted images or Unicode characters instead.
- Negative margins (margin-top: -Npx, margin-left: -Npx, etc.) — email clients handle these inconsistently. Elements will overlap or misalign. Build layouts with proper table cell spacing instead.
- CSS position:absolute or position:relative — not supported in email clients
- CSS flexbox or CSS grid — not supported in email clients
- CSS calc() — not supported in email clients
- class="grid-cell" and class="category-cell" on <td> elements — these trigger mobile stacking which we never want. Grids stay side-by-side at all widths.
- Media query rules that set display:block or width:100% on grid table cells — grids never stack.

CIRCLES AND CIRCULAR ELEMENTS (critical — this breaks constantly):
- A circle requires IDENTICAL width and height. If width ≠ height, border-radius:50% produces an oval, not a circle.
- ALWAYS set both width and height explicitly and equally: width:40px; height:40px; border-radius:50%
- NEVER use width:100% with border-radius:50% — the element will be as wide as the container and oval-shaped
- For circular icon containers in email, use a fixed-size <td> with exact equal dimensions:
  <td width="40" height="40" align="center" valign="middle"
      style="width:40px;height:40px;border-radius:50%;background-color:#000;">
    &#10003;
  </td>

PROGRESS/STEP INDICATORS (order tracker, delivery status, etc.):
- Build the ENTIRE tracker (circles + connecting lines) in a SINGLE <tr> row
- Structure: [spacer td] [circle td] [line td] [circle td] [line td] [circle td] [spacer td]
- Circle cells: fixed width/height <td> with border-radius:50% and centered text/Unicode
- Line cells: <td> with border-top or border-bottom, no content, connecting the circles horizontally
- The active/completed step circle gets a filled background + white text checkmark (&#10003;)
- Inactive step circles get a border only (border:1.5px solid #color) with empty or grey content
- Labels go in a SECOND <tr> row below, with <td> cells aligned to each circle
- The checkmark <td> MUST include line-height matching the cell height (e.g. line-height:32px for a 32px circle). Without this, the checkmark will float above center.
- NEVER use negative margins to reposition a connecting line after the fact
- NEVER put the line in a separate <tr> from the circles
- Example structure:
  <table role="presentation" width="340" style="margin:0 auto;">
    <tr>
      <td width="113" align="center" valign="middle">
        <table role="presentation"><tr>
          <td width="32" height="32" align="center" valign="middle"
              style="width:32px;height:32px;border-radius:50%;background-color:#000;color:#fff;font-size:13px;line-height:32px;">
            &#10003;
          </td>
        </tr></table>
      </td>
      <td style="border-top:2px solid #ccc;line-height:0;font-size:0;">&nbsp;</td>
      <td width="113" align="center" valign="middle">
        <table role="presentation"><tr>
          <td width="32" height="32" align="center" valign="middle"
              style="width:32px;height:32px;border-radius:50%;border:1.5px solid #ccc;">
          </td>
        </tr></table>
      </td>
      <td style="border-top:2px solid #ccc;line-height:0;font-size:0;">&nbsp;</td>
      <td width="113" align="center" valign="middle">
        <table role="presentation"><tr>
          <td width="32" height="32" align="center" valign="middle"
              style="width:32px;height:32px;border-radius:50%;border:1.5px solid #ccc;">
          </td>
        </tr></table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding-top:8px;font-size:10px;">STEP 1</td>
      <td></td>
      <td align="center" style="padding-top:8px;font-size:10px;">STEP 2</td>
      <td></td>
      <td align="center" style="padding-top:8px;font-size:10px;">STEP 3</td>
    </tr>
  </table>

FOOTER (required on every email):
- Must include: brand name, unsubscribe link placeholder, address placeholder
- Style: small text (11-12px), muted color, centered, generous top padding (40-60px)
- Unsubscribe link text: "Unsubscribe" — use href="#unsubscribe" as placeholder
- Address placeholder: "123 Street, City, State 00000"
- The footer is a SEPARATE section from the main content — never merge it with the last content block
- Social media icons in footer: use small hosted PNG images, never emoji or SVG

${emailCopywriterPromptBlock()}

Return only complete HTML. No commentary. No markdown fences.`;

const REFERENCE_MODE_SYSTEM = `You are an expert HTML email developer.
Technical requirements — apply these always:
- HTML tables for all layout, all styles inline
- Wrapper: width="100%" style="max-width:600px; width:100%; margin:0 auto;"
- Gmail dark mode: add background-image:linear-gradient(#ffffff,#ffffff) alongside background-color:#ffffff on every white <td> and the wrapper
- Add in <style>: u+.body .gmail-blend-screen{background:#000;mix-blend-mode:screen;}
                  u+.body .gmail-blend-difference{background:#000;mix-blend-mode:difference;}
- No emoji anywhere — use inline SVG for all icons
- Footer required: brand name, unsubscribe link (#unsubscribe), address

GRID LAYOUT — REQUIRED STRUCTURE:
- Multi-column image grids MUST use direct <td> siblings inside a single <tr>. Never use display:inline-block tables side by side.
- CRITICAL: ALL grid columns MUST have EQUAL width. For a 390px viewport with N columns: each td width = floor((390 - gutter) / N). A 2-column grid = 193px per cell. A 3-column grid = 128px per cell.
- NEVER create asymmetric grids (e.g., one column 70% and another 30%). ALL columns in a grid row must be the same width.
- Correct 2-column example (390px viewport, 4px gutter → 193px per cell):
  <tr>
    <td width="193" valign="top" style="padding:0 2px 0 0;">
      <img src="..." width="193" height="193" style="display:block;width:100%;height:193px;object-fit:cover;">
    </td>
    <td width="193" valign="top" style="padding:0 0 0 2px;">
      <img src="..." width="193" height="193" style="display:block;width:100%;height:193px;object-fit:cover;">
    </td>
  </tr>
- For card grids with labels below images, use nested tables inside equal-width <td> cells.
- Never use: <table align="left" style="display:inline-block"> as a column technique.
- Never add mobile-grid-col or any CSS class that sets display:block on grid columns.
- NEVER use percentage widths on grid <td> elements. Always use explicit pixel values.

GRID GEOMETRY REPLICATION (CRITICAL):
- When the reference (or skeleton) uses an NxM grid of equally-sized images, replicate that EXACT grid geometry.
- Do NOT convert equal grids into asymmetric mosaic/magazine layouts.
- Do NOT create "1 large + 2 small" or "L-shaped" arrangements unless the reference explicitly uses one.
- A 2×2 grid = 2 <tr> rows, each with 2 <td> cells of equal width+height. A 3-column row = 1 <tr> with 3 <td> cells.
- Count the images in each grid section of the reference. Your output must have the SAME count in the SAME arrangement.
- All images in a grid row MUST share identical width AND height attributes.

NAMING THE BLOCKS YOU FILL IN:
- Reference layout still controls structure. Within each section, when the section
  matches one of the named blocks in the EMAIL DESIGN ELEMENT LIBRARY below, mark
  it the same way: HTML comment <!-- block: <slug> --> immediately above, and
  data-block-type="<slug>" on the outer wrapping element. This makes the block
  editable later. Do not invent new slugs.
${emailCopywriterPromptBlock()}

- Return only complete HTML, no commentary, no markdown fences.`;

const QA_SYSTEM_PROMPT = `You are an email QA auditor. You will receive a generated HTML email and brand rules.
Audit the HTML against the rules and return ONLY a JSON response in this exact format:

{
  "passes_qa": true,
  "issues": []
}

OR if issues are found:

{
  "passes_qa": false,
  "issues": [
    {
      "description": "Brief description of the issue",
      "find": "exact string to find in the HTML",
      "replace": "corrected string to replace it with"
    }
  ]
}

Rules:
- If the HTML passes all checks, return {"passes_qa": true, "issues": []}
- Each "find" value must be an EXACT substring that appears in the provided HTML. Do not paraphrase or approximate.
- Each "replace" value must be the corrected version of that exact substring.
- Only flag actual violations of the brand rules provided. Do not make stylistic suggestions.
- Check these specific items against the brand values provided:
  1. border-radius values match the brand's card_radius and button_radius
  2. Colors match accent_color, text_color, and background_color
  3. All product images from the required list are present in the HTML
  4. Images use approved asset URLs from the catalog (no hallucinated URLs)
  5. No emoji characters appear in the HTML
  6. A CTA button appears in the first fold
  7. Footer is present
  8. The HTML is mobile-responsive (uses max-width, not fixed widths on outer tables)
  9. GRID IMAGE DIMENSIONS: For every multi-column image row, verify all images share identical width and height attributes, have a fixed pixel height in their inline style (never height:auto), and have matching ?tr=w-{W},h-{H},fo-auto on ImageKit URLs. Flag any height:auto on a grid image as critical.
  10. PLACEHOLDER DIMENSIONS: Flag any image with width under 100px or height under 100px that is not a logo or icon. These are placeholder values that will break the layout.
  11. GRID STRUCTURE: Flag any multi-column grid that uses display:inline-block tables instead of direct <td> siblings inside a single <tr>. Flag any CSS class (e.g. mobile-grid-col) that sets display:block on grid columns.
  12. GRID STACKING CLASSES: Check for class="grid-cell" or class="category-cell" on any <td> element. These are mobile stacking classes that cause grid width imbalance bugs. Flag as [critical] if found. Also check for media query rules containing .grid-cell or .category-cell with display:block or width:100%. Flag as [critical] if found.
  12. GRID GEOMETRY: If a structural skeleton was provided specifying a grid (e.g., "columns: 2, rows: 2, equal_sizing: true"), verify the HTML implements that exact geometry. A 2×2 equal grid must have exactly 2 <tr> rows each containing exactly 2 equal-width <td> cells. Flag any mosaic, asymmetric, or "1 large + 2 small" layout as critical when the skeleton specifies equal sizing.
  13. PRICING SANITY: Flag any compare-at/original price that is $0, $0.00, or less than the sale price as a CRITICAL error. A product cannot be "on sale" from $0. Also flag any pricing that wasn't present in the reference layout.
  14. SKIMMABILITY: Verify the email contains AT LEAST ONE named visual block from the
      design element library, marked with both an HTML comment (<!-- block: <slug> -->)
      AND a data-block-type="<slug>" attribute on its outer wrapper. Walls of text
      with only a hero image and a button FAIL skimmability. If no named block exists,
      add an issue describing which block to insert (pick one that fits the message:
      e.g. stat-strip, feature-checklist-matrix, review-card-single, numbered-callout-list,
      how-it-works-steps, press-logo-bar, founder-expert-quote-card) and provide a find/replace
      that injects it into a sensible location. Treat missing-block as a [skimmability] issue.
  15. BLOCK SLUG VALIDITY: If any data-block-type attribute exists, its value must be
      one of the documented slugs. Flag unknown slugs.

Additionally include a top-level "skimmability" object in the JSON output:
{
  "passes_qa": ...,
  "skimmability": { "pass": true|false, "reason": "...", "named_blocks_found": ["slug-1", ...] },
  "issues": [...]
}

Return ONLY the JSON object. No markdown fences, no explanation, no preamble.`;

function isCompleteHtml(h: string): boolean {
  return h.length > 200 && /<\/html\s*>/i.test(h) && /<\/body\s*>/i.test(h) && /<table/i.test(h);
}

// Bold HTML mode intentionally bans <table> layouts, so the standard completeness
// check would always fail. Use a table-agnostic check for that mode.
function isCompleteBoldHtml(h: string): boolean {
  return h.length > 200 && /<\/html\s*>/i.test(h) && /<\/body\s*>/i.test(h);
}

export interface GenerateCampaignParams {
  brandId: string;
  campaignId: string;
  brief?: string;
  goal?: string;
  copy?: string;
  speedMode?: string;
  productIds?: string[];
  pinnedAssetUrls?: string[];
  matchProductColors?: boolean;
  designNotes?: string;
  shopifyProducts?: any[];
  reference?: any;
  refreshCopy?: boolean;
  _isSubGeneration?: boolean;
  _variantIndex?: number;
  _runId?: string;
  campaignMode?: "campaign" | "flow";
  flowConfig?: any;
  flowNotes?: string;
  /** 1–3 slugs from emailCopywriterSkill — names the visual blocks the email should lead with. */
  featuredDesignElements?: string[];
  /** "html" (default), "image_slices" (GPT-Image-2 blocks), "html_to_image" (bold HTML rasterized to slices). */
  outputFormat?: "html" | "image_slices" | "block_export" | "html_to_image";
}

/**
 * Core generation logic. Returns { html } on success, throws on failure.
 * Does NOT update campaign status — caller is responsible for that.
 */
export async function generateCampaignCore(
  params: GenerateCampaignParams,
  supabase: any,
): Promise<{ html: string }> {
  const {
    brandId, campaignId, brief, goal, copy, productIds,
    pinnedAssetUrls: pinnedUrls, matchProductColors, designNotes,
    shopifyProducts, reference, refreshCopy, _isSubGeneration, _runId,
    campaignMode, flowConfig, flowNotes, featuredDesignElements,
  } = params;
  const outputFormat: string = (params as any).outputFormat || "html";
  const isBoldHtmlMode = outputFormat === "html_to_image";
  const variantIdx = params._variantIndex ?? 0;
  const runId = _runId;

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

  const GENERATION_MODEL = "claude-opus-4-7";
  const QA_MODEL = "claude-opus-4-7";

  // Parallelize independent DB reads
  const [profileResult, brandResult, brandIntelResult] = await Promise.all([
    supabase.from("brand_profiles").select("*").eq("brand_id", brandId).single(),
    supabase.from("brands").select("user_id").eq("id", brandId).single(),
    supabase.from("brand_intelligence").select("compiled_context, klaviyo_compiled, research_status").eq("brand_id", brandId).single(),
  ]);

  const profile = profileResult.data;
  if (profileResult.error || !profile) throw new Error("Brand profile not found");

  const brandIntelBlock = brandIntelResult.data?.compiled_context
    ? `\n\nBRAND INTELLIGENCE:\n${brandIntelResult.data.compiled_context}`
    : '';

  const klaviyoBlock = brandIntelResult.data?.klaviyo_compiled
    ? `\n\nKLAVIYO PERFORMANCE INTELLIGENCE:\n${brandIntelResult.data.klaviyo_compiled}`
    : '';

  const brandInstructions = (profile as any).brand_instructions || "";
  const brandQaChecklist: string[] = Array.isArray((profile as any).qa_checklist) ? (profile as any).qa_checklist : [];

  let globalRules = "";
  let globalQaChecklist: string[] = [];
  if (brandResult.data?.user_id) {
    const { data: prefs } = await supabase.from("user_preferences").select("preferences").eq("user_id", brandResult.data.user_id).single();
    if (prefs?.preferences) {
      const p = prefs.preferences as any;
      globalRules = p.generation_rules || "";
      globalQaChecklist = Array.isArray(p.qa_checklist) ? p.qa_checklist : [];
    }
  }

  const rawExtraction = profile.raw_extraction as Record<string, any> | null;
  const brandValues = {
    card_radius: rawExtraction?.spacing?.card_radius ?? rawExtraction?.card_radius ?? rawExtraction?.border_radius ?? "12",
    button_radius: rawExtraction?.buttons?.border_radius ?? rawExtraction?.button_radius ?? "100",
    accent_color: rawExtraction?.colors?.accent ?? rawExtraction?.accent_color ?? rawExtraction?.primary_color ?? "",
    text_color: rawExtraction?.colors?.text_primary ?? rawExtraction?.text_color ?? rawExtraction?.body_color ?? "",
    background_color: rawExtraction?.colors?.canvas ?? rawExtraction?.background_color ?? "",
  };

  // Build reference image blocks for vision
  const imageBlocks: any[] = [];
  const sliceUrls = Array.isArray((profile as any).reference_slice_urls)
    ? (profile as any).reference_slice_urls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
    : [];
  const referenceUrls = Array.isArray(profile.reference_image_urls)
    ? profile.reference_image_urls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
    : [];

  const urlsToSend = sliceUrls.length > 0 ? sliceUrls : referenceUrls;
  // Anthropic enforces a hard 20-image-per-request cap. Reserve headroom for the
  // selected reference + any later ad-hoc images, so brand refs cap at 12.
  const MAX_BRAND_REF_IMAGES = 12;
  const maxRefs = sliceUrls.length > 0 ? MAX_BRAND_REF_IMAGES : 5;
  const selectedReferenceUrls = urlsToSend.slice(0, maxRefs);

  console.log(`[generateCampaignCore] Using ${sliceUrls.length > 0 ? 'slices' : 'full images'}: ${selectedReferenceUrls.length} reference images (capped at ${maxRefs})`);

  let totalPayloadBytes = 0;
  const MAX_TOTAL_PAYLOAD = 28_000_000;

  const imagePromises = selectedReferenceUrls.map((url: string) =>
    prepareImageForAnthropic(url, "brand_reference", 1900),
  );

  const imageResults = await Promise.all(imagePromises);
  for (const result of imageResults) {
    if (!result) continue;
    if (totalPayloadBytes + result.size > MAX_TOTAL_PAYLOAD) {
      console.log(`[generateCampaignCore] Stopping at ${imageBlocks.length} images to stay under 28MB payload limit`);
      break;
    }
    totalPayloadBytes += result.size;
    imageBlocks.push(result.block);
  }
  console.log(`[generateCampaignCore] Total reference image payload: ${(totalPayloadBytes / 1_000_000).toFixed(1)}MB across ${imageBlocks.length} images`);

  // Fetch ALL brand assets
  const { data: brandAssets } = await supabase
    .from("brand_assets")
    .select("url, category, filename, description, dominant_colors, ai_category, composition_data")
    .eq("brand_id", brandId);

  const hostedAssetEntries: { url: string; category: string; description?: string; dominant_colors?: string[]; ai_category?: string; composition_data?: any }[] = (brandAssets || [])
    .filter((a: any) => typeof a.url === "string" && a.url.trim().length > 0)
    .slice(0, 15);

  const assetCatalogEntries = hostedAssetEntries.map((entry: any) => {
    const parts: string[] = [];
    const cat = entry.ai_category || entry.category;
    if (cat === "logo") {
      parts.push(`[logo — display at max-width 150px, centered, DO NOT stretch or crop]`);
    } else {
      parts.push(`[${cat}]`);
    }
    parts.push(entry.url);
    if (entry.description) parts.push(`  Description: ${entry.description}`);
    if (entry.dominant_colors?.length) parts.push(`  Colors: ${entry.dominant_colors.join(", ")}`);
    if (entry.composition_data) {
      const cd = entry.composition_data;
      if (cd.avoid_regions?.length > 0) {
        const regionDescs = cd.avoid_regions.map((r: any) => {
          const b = r.normalized_bbox;
          const posDesc = `${Math.round(b.left * 100)}%-${Math.round(b.right * 100)}% horizontal, ${Math.round(b.top * 100)}%-${Math.round(b.bottom * 100)}% vertical`;
          return `${r.label} (${posDesc}, confidence: ${r.confidence})`;
        });
        parts.push(`  ⚠ DO NOT place text over: ${regionDescs.join("; ")}`);
      }
      if (cd.safe_text_zones?.length > 0) {
        const zoneDescs = cd.safe_text_zones
          .sort((a: any, b: any) => (b.confidence || 0) - (a.confidence || 0))
          .slice(0, 3)
          .map((z: any) => `${z.region} (use ${z.text_color} text, confidence: ${z.confidence})`);
        parts.push(`  ✓ Safe text overlay zones: ${zoneDescs.join("; ")}`);
      }
      if (cd.has_safe_overlay_zone === false) {
        parts.push(`  ❌ NO safe overlay zone — put text in a SEPARATE ROW below this image, not on top`);
      }
    }
    return parts.join("\n");
  });

  // Fetch product assets
  let productCatalogEntries: string[] = [];
  let allProductAssetUrls: string[] = [];
  let productRequirements = "";

  if (Array.isArray(productIds) && productIds.length > 0) {
    const { data: productRows } = await supabase
      .from("products")
      .select("id, name, description")
      .in("id", productIds);

    const { data: productAssetRows } = await supabase
      .from("product_assets")
      .select("*")
      .in("product_id", productIds);

    if (productRows && productRows.length > 0) {
      const isSingleProduct = productRows.length === 1;
      productRequirements = `\n\n=== FEATURED PRODUCTS (MUST USE — these products were specifically selected by the user) ===
You MUST feature these products prominently in the campaign. Use at least one image per product. If no specific images are pinned as [MUST USE], choose the best available images yourself — but you MUST include product imagery. The user selected these products because they want them in the email.`;

      if (isSingleProduct) {
        productRequirements += `\n\nSINGLE PRODUCT FOCUS: Only one product is selected. This product's imagery must be PRIMARY throughout the entire campaign — use it as the hero image, and feature it prominently in every visual section. The product IS the campaign. Do NOT use generic lifestyle imagery as the hero; the product imagery should dominate.`;
      } else {
        productRequirements += `\n\nMULTIPLE PRODUCTS: ${productRows.length} products are selected. Disperse product imagery throughout the campaign in dedicated sections (e.g., product grid, alternating spotlights). For the hero section, use a lifestyle/brand image instead of a single product shot. Each product should get its own visual moment, but the hero can be broader.`;
      }

      if (matchProductColors) {
        productRequirements += `\n\nCOLOR THEME MATCHING: The user has requested that the email's color theme match the featured product imagery. Analyze the dominant colors from the product assets below and use them as accent colors, section backgrounds, and CTA colors throughout the email — while keeping the design on-brand.`;
      }
      for (const product of productRows) {
        productRequirements += `\n\nProduct: ${product.name}`;
        if (product.description) productRequirements += `\nDescription: ${product.description}`;

        const pAssets = (productAssetRows || []).filter((a: any) => a.product_id === product.id);
        if (pAssets.length > 0) {
          productRequirements += `\nAvailable images:`;
          for (const asset of pAssets) {
            const isPinned = Array.isArray(pinnedUrls) && pinnedUrls.includes(asset.url);
            const bucketLabel = (asset.bucket || "").replace(/_/g, " ");
            productRequirements += `\n  ${isPinned ? "[MUST USE] " : ""}[${bucketLabel}] ${asset.url}`;
            if (asset.description) productRequirements += `\n    Description: ${asset.description}`;
            if (asset.composition_notes) productRequirements += `\n    Notes: ${asset.composition_notes}`;
            if (asset.dominant_colors?.length) productRequirements += `\n    Colors: ${(asset.dominant_colors as string[]).join(", ")}`;

            allProductAssetUrls.push(asset.url);
            const catParts = [`[product: ${product.name} — ${bucketLabel}]`, asset.url];
            if (asset.description) catParts.push(`  Description: ${asset.description}`);
            productCatalogEntries.push(catParts.join("\n"));
          }
        }
      }
      productRequirements += `\n\nIMAGEKIT TRANSFORMS: If you need a transparent-background version of a product image but only have a non-transparent one, append "?tr=bg-remove" to the URL. Do NOT modify URLs in any other way.`;
    }
  }

  const allCatalogEntries = [...assetCatalogEntries, ...productCatalogEntries];
  const assetCatalog = allCatalogEntries.join("\n\n");

  // Build the user content array
  const userContent: any[] = [];

  // Determine reference mode
  let referenceMode: "reference" | "dupe" | null = null;
  const referenceImageBlocks: any[] = [];
  if (reference && reference.image_urls && reference.image_urls.length > 0) {
    if (reference.mode === "reference" || reference.mode === "dupe") {
      referenceMode = reference.mode;
    } else {
      const s = reference.strength || 5;
      referenceMode = s >= 9 ? "dupe" : "reference";
    }

    let sliceImageUrls: string[] = [];
    if (reference.id) {
      const { data: refCampaign } = await supabase
        .from("reference_campaigns")
        .select("slicing_status, image_slice_urls")
        .eq("id", reference.id)
        .single();

      if (
        refCampaign &&
        (refCampaign as any).slicing_status === "complete" &&
        Array.isArray((refCampaign as any).image_slice_urls) &&
        (refCampaign as any).image_slice_urls.length > 0
      ) {
        const slices = (refCampaign as any).image_slice_urls as Array<{ index: number; label: string; url: string }>;
        slices.sort((a, b) => a.index - b.index);
        sliceImageUrls = slices.map((s) => s.url);
        console.log(`[generateCampaignCore] Using ${sliceImageUrls.length} pre-computed slices for reference campaign ${reference.id}`);
      }
    }

    const urlsToFetch = sliceImageUrls.length > 0 ? sliceImageUrls : reference.image_urls.slice(0, 10);

    for (const originalUrl of urlsToFetch) {
      const prepared = await prepareImageForAnthropic(originalUrl, "ref_campaign", 1900);
      if (!prepared) continue;
      referenceImageBlocks.push(prepared.block);
    }

    if (sliceImageUrls.length > 1 && referenceImageBlocks.length > 1) {
      referenceImageBlocks.unshift({
        type: "text",
        text: "The following images are sequential horizontal slices of a reference email campaign, from top to bottom. Image 1 is a full overview for layout context. Images 2+ are full-resolution detail sections. Use all slices together to understand the complete reference email.",
      });
    }
  }

  // We need brandValuesText for the retry path even in reference mode
  let brandValuesText = "";

  if (referenceMode) {
    // ========== REFERENCE / DUPE MODE ==========

    // Extract structural skeleton from reference images using Gemini Flash
    const refUrlsForSkeleton = reference?.image_urls || [];
    const skeleton = await extractReferenceSkeleton(refUrlsForSkeleton);

    if (imageBlocks.length > 0) {
      userContent.push({
        type: "text",
        text: "These are past campaigns from this brand — study them for design language, colors, fonts, and spacing only.",
      });
      userContent.push(...imageBlocks);
    }

    if (referenceImageBlocks.length > 0) {
      const dupeLabel = referenceMode === "dupe"
        ? `DUPE MODE — EXACT STRUCTURAL CLONE REQUIRED.
This is the reference layout. You must produce an IDENTICAL structural replica:
- SAME number of sections, in the SAME order
- SAME column layouts (if it has a 2-column grid, yours has a 2-column grid)
- SAME image slot count and positions (if it has 4 images in a 2×2 grid, yours has 4 images in a 2×2 grid)
- SAME image aspect ratios and sizing (if images are square, yours are square)
- SAME section types (hero, text block, product grid, CTA, footer — match them 1:1)
- SAME visual rhythm (spacing proportions between sections)
${refreshCopy
  ? `- REFRESH COPY: Write new, original copy that conveys the same message and tone but with fresh wording. Keep the same structural placement.
- Swap in the brand's colors, fonts, images, and the refreshed copy. The skeleton stays identical.`
  : `- KEEP ALL COPY EXACTLY AS-IS: Replicate all text, headlines, CTAs, and body copy verbatim from the reference.
- ONLY change: swap in the brand's colors, fonts, and images. The skeleton and copy stay identical.`}
Do NOT add sections that don't exist in the reference. Do NOT remove sections that do exist. Do NOT rearrange anything.`
        : `This is the reference layout. Strongly follow its structure, section count, column layout, image sizing, and proportions. Apply the brand's colors, fonts, and copy on top. You may adapt minor details but keep the overall skeleton very close.`;
      userContent.push({ type: "text", text: dupeLabel });
      userContent.push(...referenceImageBlocks);
    }

    // Inject skeleton if extracted
    if (skeleton) {
      userContent.push({
        type: "text",
        text: `STRUCTURAL SKELETON (extracted from reference — you MUST replicate this EXACTLY):
${skeleton}

CRITICAL GRID RULES:
- If the skeleton specifies "columns: 2, rows: 2, equal_sizing: true", that means a 2×2 grid of equally-sized images = 2 <tr> rows, each with 2 <td> cells, ALL images identical width+height.
- Do NOT convert equal grids into asymmetric mosaics, L-shapes, or "1 large + 2 small" layouts.
- Match the exact column × row count from the skeleton.
- If "equal_sizing" is true, every image in that grid must have identical width and height attributes.`,
      });
    }

    let brandRulesText = `Brand design rules:\n${profile.system_prompt}`;
    if (brandIntelBlock) brandRulesText += brandIntelBlock;
    if (klaviyoBlock) brandRulesText += klaviyoBlock;
    if (brandInstructions) brandRulesText += `\n\nBrand-specific instructions:\n${brandInstructions}`;
    if (globalRules) brandRulesText += `\n\nGlobal rules:\n${globalRules}`;
    if (designNotes) brandRulesText += `\n\nDesign notes for this campaign:\n${designNotes}`;
    userContent.push({ type: "text", text: brandRulesText });

    let assetsText = "";
    if (hostedAssetEntries.length > 0) {
      assetsText += `Available image assets — use these URLs only, do not invent URLs:\n${assetCatalog}`;
    } else {
      assetsText += "No brand asset images available. Use solid color blocks, gradients, or text-only sections instead. Do NOT include <img> tags.";
    }
    if (productRequirements) assetsText += productRequirements;
    if (Array.isArray(shopifyProducts) && shopifyProducts.length > 0) {
      assetsText += `\n\n=== PRODUCT IMAGES TO FEATURE ===`;
      for (const sp of shopifyProducts) {
        assetsText += `\n- ${sp.title}: ${sp.image_url}`;
        if (sp.description) assetsText += `\n  Description: ${sp.description}`;
        if (sp.image_type) assetsText += `\n  Image type: ${sp.image_type}`;
        if (sp.variant) assetsText += `\n  Variant: ${sp.variant}`;
      }
      assetsText += `\nThese images MUST appear in the email. Apply ImageKit transforms (?tr=w-X,h-Y,fo-auto) to fit images into layout slots.`;
    }
    userContent.push({ type: "text", text: assetsText });

    let briefText = `Generate a ${goal} email. Brief: ${brief}`;
    if (copy) briefText += `\nThe following copy must be used verbatim: ${copy}`;
    if (featuredDesignElements?.length) {
      briefText += `\n\nFEATURED DESIGN BLOCKS (lead with these named blocks from the email design element library — use the EXACT slugs in data-block-type and an HTML comment <!-- block: <slug> -->): ${featuredDesignElements.join(", ")}`;
    }
    briefText += `\nReturn only complete HTML.`;
    userContent.push({ type: "text", text: briefText });

  } else {
    // ========== STANDARD MODE ==========
    if (imageBlocks.length > 0) {
      userContent.push({
        type: "text",
        text: `Here are ${imageBlocks.length} past email campaigns from this brand. Study them carefully for STYLE and DESIGN PATTERNS ONLY. These are screenshots — NEVER embed them as <img> tags in your output. Your output must feel like it belongs in this exact same family.`,
      });
      userContent.push(...imageBlocks);
    }

    brandValuesText += `\nFrom analyzing these campaigns, here are the specific rules to follow precisely:\n${profile.system_prompt}`;
    if (brandIntelBlock) brandValuesText += brandIntelBlock;
    if (klaviyoBlock) brandValuesText += klaviyoBlock;
    brandValuesText += `\n\n=== BRAND DESIGN VALUES (use these EXACTLY) ===`;
    brandValuesText += `\nCard/container border-radius: ${brandValues.card_radius}px — apply to ALL cards, contrast sections, and containers`;
    brandValuesText += `\nButton border-radius: ${brandValues.button_radius}px`;
    if (brandValues.accent_color) brandValuesText += `\nAccent/primary color: ${brandValues.accent_color}`;
    if (brandValues.text_color) brandValuesText += `\nBody text color: ${brandValues.text_color} — NEVER use generic gray (#999, #666, etc.)`;
    if (brandValues.background_color) brandValuesText += `\nBackground color: ${brandValues.background_color}`;

    if (brandInstructions) {
      brandValuesText += `\n\n=== BRAND-SPECIFIC INSTRUCTIONS ===\n${brandInstructions}`;
    }
    if (globalRules) {
      brandValuesText += `\n\n=== GLOBAL GENERATION RULES ===\n${globalRules}`;
    }
    if (designNotes) {
      brandValuesText += `\n\n=== USER DESIGN NOTES FOR THIS CAMPAIGN ===\n${designNotes}`;
    }

    userContent.push({ type: "text", text: brandValuesText });

    const goalCreativeDirection: Record<string, string> = {
      welcome: `CREATIVE DIRECTION: This is a Welcome email — the brand's first impression. Lead with warmth and personality. Consider: a bold hero moment with the brand's most striking visual, a personal tone, and a clear single CTA. Structure ideas: full-bleed hero image → warm welcome copy → 2-3 brand value props as styled cards → single CTA. Or: logo → headline → lifestyle image → copy → CTA. Keep it concise — don't overwhelm new subscribers.`,
      social_proof: `CREATIVE DIRECTION: This is a Social Proof campaign — build trust and credibility. Lead with real results or testimonials. Structure ideas: headline stat or quote as the hero → supporting testimonials in a grid or stacked layout → product image → CTA. Or: customer quote pullout → before/after or results metrics → lifestyle imagery → CTA. Use contrast cards for testimonial callouts. Make the social proof feel authentic, not corporate.`,
      highlight: `CREATIVE DIRECTION: This is a General Highlight — showcase the best of the brand. Be editorially creative. Structure ideas: magazine-style editorial layout with alternating image/text sections → feature callout cards → CTA. Or: hero lifestyle image → 3 product spotlights in a grid → brand story section → CTA. Think editorial, not catalog.`,
      promotional: `CREATIVE DIRECTION: This is a Promotional email — drive urgency and action. Lead with the offer. Structure ideas: bold headline with the offer front-and-center → hero product image → supporting details → urgency element → CTA. Or: animated-feel countdown section → product grid → offer details → CTA. Use the brand's accent color boldly for the offer elements.`,
      educational: `CREATIVE DIRECTION: This is an Educational email — teach and provide value. Structure ideas: compelling question as headline → step-by-step content with numbered sections → supporting imagery → resource CTA. Or: "Did you know?" hook → 3 insight cards with icons → deeper content section → CTA. Make it scannable with clear visual hierarchy.`,
      re_engagement: `CREATIVE DIRECTION: This is a Re-engagement email — win back attention. Be bold and personal. Structure ideas: "We miss you" or provocative headline → single compelling image → what's new/what they're missing → incentive if applicable → CTA. Keep it SHORT — 2-3 sections max. Less is more for re-engagement.`,
      seasonal: `CREATIVE DIRECTION: This is a Seasonal campaign — tap into the moment. Be festive or timely without being generic. Structure ideas: seasonal hero image → themed headline → curated product picks → CTA. Or: lifestyle imagery that captures the season → story-driven copy → product spotlight → CTA. Make it feel current and relevant.`,
      product_launch: `CREATIVE DIRECTION: This is a Product Launch — build excitement and showcase the new. Structure ideas: dramatic reveal hero → product detail shots with feature callouts → lifestyle context image → launch CTA. Or: teaser headline → full-bleed product hero → 3 key features as cards → social proof snippet → CTA. Make it feel like an event.`,
      abandoned_cart: `CREATIVE DIRECTION: This is an Abandoned Cart email — be helpful, not pushy. Structure ideas: "Still thinking it over?" headline → product image reminder → 1-2 supporting reasons (reviews, benefits) → CTA. Keep it minimal — 2 sections max. The product image does the heavy lifting.`,
      win_back: `CREATIVE DIRECTION: This is a Win-back email — reconnect with lapsed customers. Structure ideas: "It's been a while" headline → what's new since they left → single compelling offer or reason to return → CTA. Or: nostalgia angle → new products/features showcase → incentive → CTA. Be concise and genuine.`,
      newsletter: `CREATIVE DIRECTION: This is a Newsletter — curate and inform. Structure ideas: branded header → 3-4 content blocks with varied layouts (image-left/image-right alternating, or card grid) → each with its own mini-CTA → footer. Make each section visually distinct but cohesive. Think magazine layout.`,
      announcement: `CREATIVE DIRECTION: This is an Announcement — deliver news with impact. Structure ideas: bold headline announcement → supporting detail → single hero image → CTA. Or: "Big News" header → announcement details → what it means for the reader → CTA. Keep it focused — one message, one action.`,
    };

    const creativeDir = goalCreativeDirection[goal || ""] || goalCreativeDirection[goal?.replace(/[-\s]/g, '_') || ""] ||
      `CREATIVE DIRECTION: Be creative with the layout structure. Don't default to a generic template. Consider the campaign goal "${goal}" and design a unique layout that serves that purpose. Vary section types, image placements, and content flow. Think like an editorial designer.`;

    let part3 = `Generate a ${goal} email campaign.\nBrief: ${brief}`;
    if (copy) part3 += `\nThe following copy must be used verbatim: ${copy}`;
    if (featuredDesignElements?.length) {
      part3 += `\n\n=== FEATURED DESIGN BLOCKS ===\nThis campaign MUST lead with the following named visual blocks from the email design element library: ${featuredDesignElements.join(", ")}.\nUse the EXACT slugs in data-block-type and prepend each block with an HTML comment <!-- block: <slug> -->. Treat them as the skim-stoppers; surrounding copy is connective tissue.`;
    }

    part3 += `\n\n=== ${creativeDir}`;

    part3 += `\n\n=== STRUCTURAL VARIETY RULES ===
1. DO NOT use the same layout structure for every email. Each campaign should feel uniquely designed for its specific purpose.
2. Vary your section types: use hero images, split layouts, card grids, quote pullouts, metric callouts, editorial columns — mix it up based on what serves the content.
3. The reference campaigns show the BRAND STYLE (colors, fonts, spacing, tone) — NOT a template to copy verbatim. Extract the design language, then apply it to a FRESH layout.
4. Never start every email the same way. Vary your openings: sometimes a full-bleed hero, sometimes a headline-first approach, sometimes a personal greeting, sometimes a provocative question.
5. Section count should vary by campaign type — a welcome email might be 3-4 sections, a newsletter might be 6-8, an abandoned cart might be just 2.`;

    part3 += `\n\n=== IMAGE & GRID LAYOUT RULES ===
1. The reference campaign screenshots above are STYLE REFERENCES ONLY. NEVER embed them as <img> tags.
2. Never invent, guess, or use external stock image URLs (Unsplash, Pexels, etc).
3. You are the CREATIVE DIRECTOR. Choose ONLY the images that best serve this campaign's story. You do NOT need to use every available image — be selective.
4. If an image doesn't fit the campaign's story, skip it entirely rather than forcing it in.
5. CONSISTENCY: Every image must have the same padding treatment — either ALL full-bleed or ALL with equal side padding. Never mix.
6. CRITICAL NO-STACK RULE: Any side-by-side layout in the chosen reference (product grids, two-column image blocks, split text/image sections) MUST remain side-by-side at all viewport widths. Do NOT add media-query rules that convert these to single-column stacked blocks.

=== OBJECT-FIT RULE (CRITICAL — like Figma's "Fill" mode) ===
When placing ANY image into a layout slot, you MUST think like a designer using Figma's "Fill" mode:
1. DETERMINE the slot's aspect ratio from the reference (square = 1:1, wide banner ≈ 2.4:1, portrait ≈ 2:3, etc.)
2. CALCULATE pixel dimensions for a 390px-wide email viewport (Gmail mobile, iPhone 14/15):
   - Full-width hero: w-390 (height varies by reference)
   - 2-column grid (with 4px gutter): each slot = w-193
   - 3-column grid (with 4px gutters): each slot = w-128
   - Single centered product: w-260 to w-340
3. APPLY fo-auto smart crop: append ?tr=w-{W},h-{H},fo-auto to the ik.imagekit.io URL
4. SET matching width and height attributes on the <img> tag AND its container <td>

Common slot patterns to recognize in references:
- 2×2 square grid → each image: ?tr=w-193,h-193,fo-auto
- Full-width hero banner → ?tr=w-390,h-250,fo-auto (or taller if reference is tall)
- 2-column product cards → ?tr=w-193,h-240,fo-auto
- Single centered product → ?tr=w-260,h-350,fo-auto
- Wide lifestyle banner → ?tr=w-390,h-165,fo-auto

EVERY image in a grid MUST use IDENTICAL transform dimensions. No exceptions.
If you place 4 images in a 2×2 grid, ALL 4 must have the exact same ?tr= params.

=== IMAGEKIT TRANSFORM SYNTAX ===
All brand/product images hosted on ik.imagekit.io support URL-based transforms.
Append ?tr=<params> to any ik.imagekit.io URL:
- w-{N},h-{N},fo-auto  → PREFERRED: smart crop to exact dimensions (AI focal point)
- ar-{W}-{H},w-{N}     → crop to aspect ratio at given width (e.g. ar-1-1,w-300)
- w-{N},h-{N},c-at_max → scale down to fit without cropping
- e-bgremove            → remove background (transparent PNG)

RULES:
- ONLY modify ik.imagekit.io URLs. Leave all other URLs untouched.
- ALWAYS use fo-auto for grid images so the AI picks the best focal point.
- NEVER use c-force (causes distortion).
- For product grids, EVERY image MUST use the SAME ?tr= dimensions.`;

    if (hostedAssetEntries.length > 0) {
      part3 += `\n\nAVAILABLE BRAND ASSETS (use selectively — pick what serves the campaign):\n${assetCatalog}`;
    } else {
      part3 += `\n\nNo brand asset images available. Use solid color blocks, gradients, or text-only sections instead. Do NOT include <img> tags.`;
    }

    if (productRequirements) {
      part3 += productRequirements;
    }

    if (Array.isArray(shopifyProducts) && shopifyProducts.length > 0) {
      part3 += `\n\n=== PRODUCT IMAGES TO FEATURE ===`;
      for (const sp of shopifyProducts) {
        part3 += `\n- ${sp.title}: ${sp.image_url}`;
        if (sp.description) part3 += `\n  Description: ${sp.description}`;
        if (sp.image_type) part3 += `\n  Image type: ${sp.image_type}`;
        if (sp.variant) part3 += `\n  Variant: ${sp.variant}`;
      }
      part3 += `\n\nThese images MUST appear in the email. Use them as follows:
- product_isolated or product_lifestyle: use as hero or mid-email product feature
- Apply ImageKit transforms (?tr=w-X,h-Y,fo-auto) to fit images into layout slots. Only modify ik.imagekit.io URLs.
- Do not use any other product image URLs`;
    }

    part3 += `\n\nThe output must MATCH the brand's design language (colors, fonts, spacing, tone) from the references above, but the LAYOUT and STRUCTURE must be original and tailored to this specific campaign goal. Return only the complete HTML.`;
    userContent.push({ type: "text", text: part3 });
  }

  // === FLOW MODE: Override system prompt and user content ===
  let systemPrompt = referenceMode ? REFERENCE_MODE_SYSTEM : UNIVERSAL_EMAIL_RULES;

  // === BOLD HTML MODE (HTML → Image Slices export) ===
  // When outputFormat is "html_to_image", the final email is rasterized and
  // shipped as image blocks in Klaviyo, so we can drop the conservative email
  // constraints and design boldly. No client-rendering safety needed.
  if (isBoldHtmlMode && campaignMode !== "flow") {
    // REPLACE the conservative email ruleset entirely. In bold mode the output
    // is rasterized to PNG, so table-only / inline-only / no-flexbox rules
    // actively hurt the design. We give the model a landing-page brief instead.
    systemPrompt = `You are an award-winning art director and front-end designer building an editorial email as if it were a modern landing page. The final HTML will be RASTERIZED to PNG and shipped as image blocks in Klaviyo — email client compatibility DOES NOT MATTER. Forget everything about safe email HTML.

HARD BAN — never do these (they betray "safe email design"):
- Do NOT use <table> for layout. Use semantic <div>/<section> with flex/grid.
- Do NOT put every style inline. Use a real <style> block in <head>.
- Do NOT default to centered stacks of white cards with a button at the bottom.
- Do NOT use system fonts only. Always @import at least one real display face.
- Do NOT cap type at 32px. Hero display type should be 56–120px.
- Do NOT use plain #ffffff backgrounds for every section.
- Do NOT produce a 3-section "hero → benefits → CTA" template shape.

YOU MUST use, liberally:
- Custom Google Fonts via @import — pair a distinctive display face with a clean sans (e.g. Fraunces + Inter, Playfair + Space Grotesk, Editorial New + Söhne feel via Inter Tight, Migra/Canela feel via Fraunces).
- CSS gradients, mesh/radial backgrounds, duotone image treatments, grain, blur, mix-blend-mode, filter, backdrop-filter.
- Full-bleed hero imagery, edge-to-edge color fields, off-white/cream/ink/color-forward palettes drawn from the BRAND DESIGN VALUES — NOT default white.
- Text set OVER images with absolute positioning, z-index, and generous negative space.
- Oversized display type (72px+ desktop, 44px+ mobile), tight tracking on display, wide tracking on eyebrows, italic serif accents, mixed weights.
- CSS flexbox and grid for real multi-column layouts, asymmetric compositions, broken grids, offset cards, overlapping elements.
- SVG marks, decorative rules, numeric section markers ("01 / 04"), oversized quotation marks, ticker/marquee-style banners.
- Editorial section variety: magazine-style feature spreads, product close-ups with pull quotes, ingredient/spec grids, before/after diptychs, index-style tables of contents, footer as a designed object (not a link dump).

STRUCTURE:
- Wrapper is 600px max-width, mobile-first (assume a 390px viewport when composing) — but the content inside is landing-page quality.
- Aim for 6–10 visually distinct sections, each with its own background/typography treatment. No two adjacent sections should share the same background color.
- Every clickable region MUST be a real <a href="..."> with the actual URL — the slicer reads hrefs from the HTML and re-binds them to image blocks.
- For side-by-side content, use a flex/grid row of equal-width children. All columns in one row must be equal width. The slicer detects these and preserves them as Klaviyo columns.
- Use the real product photos from the brand asset library and real reference imagery — never hallucinate packaging or invent product renders.
- The brand logo goes at the very top.

REFERENCE BAR: Apple product pages, Aesop, Off-White lookbooks, Glossier, SSENSE, Kinfolk, Cereal magazine, Bottega Veneta, Jacquemus, Byredo, Sunday Riley editorial emails. If the draft could pass for a Mailchimp template, throw it out and start over.

DO NOT include: preheader hacks, MSO conditionals, VML, dark-mode media queries, Outlook fallbacks — none of it matters after rasterization.`;
  }

  if (campaignMode === "flow" && flowConfig) {
    systemPrompt = `You are an expert Klaviyo email developer building production-ready flow email templates. You generate complete HTML with correct Liquid templating syntax. Rules:
- Every dynamic value MUST use Liquid variables from the provided event JSON
- Every <a href="..."> and <img src="..."> is dynamic content too — if the event JSON contains a URL/image field that semantically matches (customer portal, tracking, product, checkout, cancel/skip, product image, order photo), bind that Liquid variable into the attribute. Never hardcode the brand homepage as a substitute for a real event URL.
- Every Liquid variable MUST have a |default: filter with a non-empty fallback (Klaviyo throws errors on empty string defaults)
- Read the real event JSON provided below to understand the exact data structure — use the actual key names from that JSON, do not assume or invent field names
- Include {{ organization.unsubscribe_link }} for marketing flows (browse abandonment, abandoned checkout). Omit for transactional flows (order confirmation, shipping confirmation).
- Klaviyo uses Django templates, not Shopify Liquid. Use {% elif %} not {% elsif %}. Use {% if not %} not {% unless %}.
- NO SPACES around pipes or after colons in filters. CORRECT: {{ var|default:'value' }}  WRONG: {{ var | default: 'value' }}
- Output complete HTML only

REFERENCE-FIRST DYNAMIC CONTENT RULE (THIS OVERRIDES ALL OTHER PERSONALIZATION GUIDANCE):
- Only include dynamic personalization (first name, pricing, product details, dynamic images) if: (a) the reference email visually contains that element, or (b) the user explicitly requests it in their brief.
- Do NOT add dynamic fields that aren't present in the reference layout. If the reference shows static text with no personalization, keep it static.
- This rule overrides any personalization guidance in the Liquid reference docs below. If the reference shows no first-name personalization, do NOT add it — even if the Liquid reference suggests using it. The reference layout is the single source of truth for what dynamic elements to include.
- Only include pricing if the reference email shows pricing. Never include CompareAtPrice/sale pricing unless the reference explicitly shows a compare-at price pattern.

FALLBACK GRAMMAR RULE:
- If you do include first-name personalization, the |default: fallback must produce a grammatically correct sentence.
- "Hi {{ person.first_name|default:'Friend' }}," is safe (standalone greeting).
- "Still interested, {{ person.first_name|default:'there' }}?" is NOT safe because "Still interested, there?" is broken English.
- For inline name usage (mid-sentence), use a conditional block: {% if person.first_name %}Still interested, {{ person.first_name }}?{% else %}Still interested?{% endif %}

SEMANTIC PRICE VALIDATION:
- If CompareAtPrice is $0, $0.00, or LESS than the regular Price, treat it as invalid/absent — do NOT render a compare-at/strikethrough price section.
- A product cannot be "on sale" from $0. If the only price available is $0.00, omit the price entirely.
- Never render a strikethrough price that is lower than or equal to the sale price.

${KLAVIYO_FLOW_LIQUID_REFERENCE}

${UNIVERSAL_EMAIL_RULES}`;

    // Fetch the trigger's sample_payload and liquid_variables from klaviyo_connections
    let eventSchema = flowConfig.event_schema || {};
    let liquidVars = flowConfig.liquid_variables || [];

    if (flowConfig.trigger_metric_id) {
      try {
        const { data: klavConn } = await supabase
          .from("klaviyo_connections")
          .select("cached_stats")
          .eq("brand_id", brandId)
          .single();
        if (klavConn?.cached_stats) {
          const stats = klavConn.cached_stats as any;
          const metrics = stats?.event_schemas?.metrics || [];
          const matchingMetric = metrics.find((m: any) => m.metric_id === flowConfig.trigger_metric_id);
          if (matchingMetric) {
            if (matchingMetric.sample_payload) eventSchema = matchingMetric.sample_payload;
            if (matchingMetric.liquid_variables) liquidVars = matchingMetric.liquid_variables;
          }
        }
      } catch (e) {
        console.warn("[generateCampaignCore] Failed to fetch Klaviyo event schema:", e);
      }
    }

    // Determine if this is a transactional trigger — transactional emails should NOT include
    // product feeds, cross-sells, or recommendation grids (legally and contextually inappropriate).
    const triggerNameLower = (flowConfig?.trigger_metric_name || "").toLowerCase();
    const isTransactional = [
      "placed order", "ordered product", "order confirmation",
      "fulfilled", "shipment", "shipping",
      "refund", "cancelled",
      "subscription", "recharge",
    ].some(kw => triggerNameLower.includes(kw));

    // Re-inject the design element library with transactional restrictions for flow mode.
    systemPrompt += `\n\n${emailCopywriterPromptBlock({ isTransactional })}`;

    // Fetch product data from persistent product store — only for non-transactional flows
    let productFeedsBlock = "";
    if (isTransactional) {
      console.log(`[generateCampaignCore] Transactional trigger "${flowConfig.trigger_metric_name}" — skipping product feeds`);
      productFeedsBlock = `
═══ PRODUCT CATALOG ═══
This is a TRANSACTIONAL email. Do NOT add product recommendation grids, cross-sells, or upsells.
Only display the items/data from the trigger event itself.
═══ END PRODUCT CATALOG ═══`;
    } else {
    try {
      const presetKey = flowConfig?.selected_product_preset || "best_sellers";

      // Query local product store — sorted by the preset's relevant count field
      const PRESET_SORT_MAP: Record<string, string> = {
        best_sellers: "order_count",
        trending: "view_count",
        most_viewed: "view_count",
        popular_checkouts: "checkout_count",
      };
      const sortField = PRESET_SORT_MAP[presetKey] || "order_count";

      let storeQuery = supabase
        .from("klaviyo_product_store")
        .select("product_id, product_name, image_url, product_url, price")
        .eq("brand_id", brandId)
        .eq("is_junk", false)
        .not("image_url", "is", null)
        .order(sortField, { ascending: false })
        .limit(8);

      if (presetKey === "trending") {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        storeQuery = storeQuery.gte("last_seen", cutoff.toISOString());
      }

      const { data: storeProducts, error: storeError } = await storeQuery;

      if (storeError) {
        console.warn("[generateCampaignCore] Product store query error:", storeError);
      }

      const catalogProducts = (storeProducts || []).map((p: any) => ({
        external_id: p.product_id,
        title: p.product_name,
        price: p.price,
        url: p.product_url || "#",
        image_url: p.image_url || "",
      }));
      console.log(`[generateCampaignCore] Loaded ${catalogProducts.length} products from store for preset "${presetKey}"`);

      if (catalogProducts.length > 0) {
        productFeedsBlock = `
═══ PRODUCT CATALOG DATA (from product store) ═══
Preset: ${presetKey}

Available products for recommendation grids:
${catalogProducts.map((p: any, i: number) => `${i + 1}. "${p.title}" — $${p.price ?? "N/A"} — Image: ${p.image_url} — URL: ${p.url}`).join("\n")}

IMPORTANT: For product recommendation grids in flow emails, use STATIC product data from the list above. 
Do NOT use Klaviyo product feed Liquid syntax ({%- for item in feeds.* -%}) — product feeds are a Klaviyo UI-only feature with no API access.
Instead, render product grids with real product data from the catalog above, using direct HTML with the actual image URLs, titles, prices, and links.
Each product card should link to the product URL and show the product image, title, and price.
The product grid data will be swapped dynamically by the app when the user changes presets.
Mark the product grid section with an HTML comment: <!-- PRODUCT_GRID:${presetKey} -->
═══ END PRODUCT CATALOG ═══`;
      } else {
        productFeedsBlock = `
═══ PRODUCT CATALOG DATA ═══
No products found in the product store for this account.

If the reference email contains a product recommendation grid, you MUST still include that grid section in the output. Render it with realistic-looking STATIC FILLER content that matches the brand's aesthetic:
- Use brand product images from the asset catalog provided below
- Use realistic product names and prices that match the brand
- Use # as the href for product links
- Structure it exactly like the reference layout (same number of columns, same card style)
- Mark the section with: <!-- PRODUCT_GRID:${presetKey} -->

NEVER replace a product grid with testimonials, reviews, or other non-product content.
═══ END PRODUCT CATALOG ═══`;
      }
    } catch (e) {
      console.warn("[generateCampaignCore] Failed to query product store:", e);
    }
    }

    // Run semantic reference analysis if a reference is selected
    let referenceAnalysisBlock = "";
    const refId = reference?.id || flowConfig?.referenceId;
    if (refId) {
      try {
        console.log("[generateCampaignCore] Running reference semantic analysis...");
        const analysisResp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/analyze-reference-for-flow`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              brand_id: brandId,
              reference_id: refId,
              trigger_metric_name: flowConfig.trigger_metric_name || flowConfig.triggerMetricName,
              flow_type: flowConfig.flow_type || flowConfig.flowType,
            }),
          },
        );

        if (analysisResp.ok) {
          const analysis = await analysisResp.json();
          if (!analysis.skipped && analysis.sections?.length > 0) {
            console.log(`[generateCampaignCore] Reference analysis: ${analysis.sections.length} sections identified`);
            
            // For transactional emails, reclassify any "product_feed" sections as "static" 
            // since cross-sells are inappropriate in transactional messages
            const sections = analysis.sections.map((s: any) => {
              if (isTransactional && s.data_source === "product_feed") {
                return { ...s, data_source: "static", notes: `${s.notes || ""} (Reclassified from product_feed — transactional emails should not include cross-sells)` };
              }
              return s;
            });
            
            const feedSections = sections.filter((s: any) => s.data_source === "product_feed");
            referenceAnalysisBlock = `
═══ REFERENCE EMAIL ARCHITECTURE ANALYSIS ═══
The reference email has been analyzed. Each section's data source is identified below.
This is your implementation blueprint — replicate the layout and design of each section
using the correct Klaviyo data pattern. Never hardcode data that should be dynamic.

${sections.map((s: any, i: number) => `SECTION ${i + 1}: ${s.label}
Visual: ${s.visual_description}
Data source: ${s.data_source}
${s.grid_columns > 1 ? `Grid: ${s.grid_columns} columns × ${s.grid_rows} rows` : ""}
Liquid pattern to use:
${s.liquid_pattern}
${s.recommended_feed ? `Use feed: "${s.recommended_feed}"` : ""}
Notes: ${s.notes}`).join("\n---\n")}

CRITICAL RULES FROM THIS ANALYSIS:
${isTransactional ? `- This is a TRANSACTIONAL email. Do NOT add product recommendation grids, cross-sells, or upsells.
- Only display data from the trigger event. Any product grid in the reference should show ORDER ITEMS from the event data, not recommendations.` : `- Any section marked "product_feed" MUST use {%- for item in feeds.FeedName|slice:N -%} syntax
- The number of products shown in the reference (${feedSections.map((s: any) => `${s.grid_columns * s.grid_rows} in ${s.label}`).join(", ") || "N/A"}) should match your implementation
- ABSOLUTE RULE: If ANY section in this analysis has data_source "product_feed", you MUST include a product recommendation grid at that position. NEVER replace a product_feed section with testimonials, reviews, social proof, quotes, or any non-product content.`}
- Any section marked "event_property" MUST use event.* variables — do not use catalog_lookup for these
- Any section marked "static" should use brand assets from the asset catalog below
- Never hardcode product images, names, prices, or URLs that belong in dynamic sections
- The reference structure is SACRED. Every section identified above must appear in your output in the same order with the same purpose.
═══ END REFERENCE ANALYSIS ═══`;
          }
        }
      } catch (err) {
        console.warn("[generateCampaignCore] Reference analysis failed, continuing without it:", err);
      }
    }

    // Build flow-specific user content
    const flowUserContent: any[] = [];

    // Include brand reference images for style
    if (imageBlocks.length > 0) {
      flowUserContent.push({
        type: "text",
        text: "These are past campaigns from this brand — study them for design language, colors, fonts, and spacing only.",
      });
      flowUserContent.push(...imageBlocks);
    }

    // Include selected reference campaign images for structural guidance
    if (referenceImageBlocks.length > 0) {
      flowUserContent.push({
        type: "text",
        text: `REFERENCE LAYOUT — EXACT STRUCTURAL CLONE REQUIRED.
Replicate this reference's structure EXACTLY:
- SAME number of sections, in the SAME order
- SAME column layouts and image slot positions
- SAME visual rhythm and spacing proportions
- ONLY adapt: swap in brand colors/fonts, replace static content slots with Liquid-templated transactional data (line items loop, order details, shipping info)
- Do NOT add or remove sections. Do NOT rearrange. The skeleton stays identical.
- If the reference has a hero image, keep a hero image. If it has a 2-column product grid, keep a 2-column product grid.
- Match padding, margins, and whitespace ratios as closely as possible.`,
      });
      flowUserContent.push(...referenceImageBlocks);
    }

    // Brand rules
    let flowBrandRules = `Brand design rules:\n${profile.system_prompt}`;
    if (brandIntelBlock) flowBrandRules += brandIntelBlock;
    if (klaviyoBlock) flowBrandRules += klaviyoBlock;
    if (brandInstructions) flowBrandRules += `\n\nBrand-specific instructions:\n${brandInstructions}`;
    if (globalRules) flowBrandRules += `\n\nGlobal rules:\n${globalRules}`;
    if (designNotes) flowBrandRules += `\n\nDesign notes:\n${designNotes}`;
    flowUserContent.push({ type: "text", text: flowBrandRules });

    const triggerName = (flowConfig.trigger_metric_name || "").toLowerCase();
    let triggerGuidance = "";

    if (triggerName.includes("viewed product") || triggerName.includes("browse")) {
      triggerGuidance = `TRIGGER TYPE: Viewed Product (Browse Abandonment)
This event contains exactly ONE product. There is NO items array — the product data lives at the TOP LEVEL of the event object (e.g. event.ProductName, event.ImageURL, event.URL, event.value).
Do NOT try to loop event.Items or event.extra.line_items — they do not exist for this trigger.
Any multi-product grid in the reference is a PRODUCT FEED, not trigger data. Use {% catalog event.item_id %}...{% endcatalog %} for the hero product.
This is a MARKETING email — include {{ organization.unsubscribe_link }}.`;
    } else if (triggerName.includes("started checkout") || triggerName.includes("checkout started") || triggerName.includes("abandoned checkout")) {
      triggerGuidance = `TRIGGER TYPE: Started Checkout (Abandoned Cart)
This event contains ONE OR MORE products in a cart. Find the items array in the real JSON below — it may be at event.Items[], event.extra.line_items[], or another path. Check which one actually exists and has sub-properties (images, prices) before using it.
The cart items loop = trigger data from this specific checkout.
Any ADDITIONAL product grid beyond the cart items = PRODUCT FEED (cross-sell/recommendations). Use feed syntax for those.
This is a MARKETING email — include {{ organization.unsubscribe_link }}.`;
    } else if (triggerName.includes("placed order") || triggerName.includes("ordered product") || triggerName.includes("order confirmation")) {
      triggerGuidance = `TRIGGER TYPE: Placed Order (Order Confirmation)
This event contains ordered products PLUS order metadata. Find the items array in the JSON (usually event.extra.line_items[]). Also extract: order number, totals, shipping address, billing address from the JSON.
Order items and metadata = trigger data. Any ADDITIONAL product grid beyond order items = PRODUCT FEED (cross-sell). Use feed syntax for those.
This is a TRANSACTIONAL email — do NOT include {{ organization.unsubscribe_link }}.`;
    } else if (triggerName.includes("fulfilled") || triggerName.includes("shipment") || triggerName.includes("shipping")) {
      triggerGuidance = `TRIGGER TYPE: Fulfilled Order (Shipping Confirmation)
This event contains fulfillment/tracking info. Look for event.extra.fulfillments[] array for tracking numbers and URLs. Also has line items and order metadata.
This is a TRANSACTIONAL email — do NOT include {{ organization.unsubscribe_link }}.`;
    } else if (triggerName.includes("subscription") || triggerName.includes("recharge") || triggerName.includes("skio") || triggerName.includes("stay ai")) {
      triggerGuidance = `TRIGGER TYPE: Subscription Event (Recharge / Skio / Stay AI / native)
This event contains SUBSCRIPTION-SPECIFIC data. Read the real JSON below carefully to find fields such as:
- Customer portal / manage-subscription URL (e.g. customer_portal_url, portal_url, manage_url, subscription.portal_url)
- Subscription ID / number (e.g. subscription_id, id, external_subscription_id)
- Next charge / next order date, cadence, product(s) in the subscription, price, discount code
- Cancel / skip / swap URLs if present
EVERY link in the email that logically maps to one of these URL fields MUST bind to that Liquid variable. Do NOT fall back to the homepage or a hardcoded URL when the event provides a portal/manage/cancel/skip URL.
This is a TRANSACTIONAL email — do NOT include {{ organization.unsubscribe_link }} or product cross-sells.`;
    } else {
      triggerGuidance = `TRIGGER TYPE: ${flowConfig.trigger_metric_name || "Unknown"}
Read the real event JSON below carefully. Identify what data fields are available and use them appropriately. Do not assume any specific structure — use only what exists in the JSON.`;
    }

    let flowDetails = `FLOW DETAILS:
Trigger: ${flowConfig.trigger_metric_name || "Unknown"}
Email type: ${flowConfig.flow_type || "flow"}

${triggerGuidance}`;
    if (flowNotes) flowDetails += `\n\n${flowNotes}`;

    // Auto-extract every URL-like and identifier-like leaf from the event schema
    // so the AI has an explicit inventory of dynamic links/values to bind against
    // href/src attributes. Prevents hardcoding homepage URLs when a customer
    // portal URL / tracking URL / product URL is available in the event.
    const eventFieldInventory: { path: string; sample: string; kind: string }[] = [];
    const walkEvent = (node: any, path: string) => {
      if (node === null || node === undefined) return;
      if (Array.isArray(node)) {
        // Sample the first array element only; the loop path is what matters
        if (node.length > 0) walkEvent(node[0], `${path}[0]`);
        return;
      }
      if (typeof node === "object") {
        for (const [k, v] of Object.entries(node)) {
          const cleanKey = k.startsWith("$") ? k.slice(1) : k;
          walkEvent(v, path ? `${path}.${cleanKey}` : cleanKey);
        }
        return;
      }
      const str = String(node);
      const lowerKey = path.toLowerCase();
      const looksUrl = /^https?:\/\//i.test(str) || /(_url|_link|href|portal|tracking|checkout|manage|cancel|skip|swap|redirect|permalink|shop_now)$/i.test(lowerKey);
      const looksImage = /(image|img|photo|thumbnail|picture|avatar)/i.test(lowerKey) || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(str);
      const looksId = /(_id$|^id$|number$|code$)/i.test(lowerKey);
      const looksDate = /(date|_at$|timestamp)/i.test(lowerKey);
      const looksPrice = /(price|total|amount|subtotal|value|cost)/i.test(lowerKey);
      let kind = "value";
      if (looksImage) kind = "image_url";
      else if (looksUrl) kind = "url";
      else if (looksPrice) kind = "price";
      else if (looksDate) kind = "date";
      else if (looksId) kind = "id";
      if (kind !== "value") {
        eventFieldInventory.push({ path, sample: str.slice(0, 120), kind });
      }
    };
    try { walkEvent(eventSchema, "event"); } catch (e) { console.warn("[generateCampaignCore] event walk failed", e); }

    const urlFields = eventFieldInventory.filter((f) => f.kind === "url");
    const imageFields = eventFieldInventory.filter((f) => f.kind === "image_url");
    const otherFields = eventFieldInventory.filter((f) => f.kind !== "url" && f.kind !== "image_url");

    const inventoryBlock = eventFieldInventory.length
      ? `\n\n═══ DYNAMIC FIELD INVENTORY (auto-extracted from event JSON) ═══
These are the ACTUAL dynamic values available for this trigger. Bind them into the email — do NOT hardcode static equivalents (homepage URLs, placeholder tracking links, dummy order numbers) when a matching field exists here.

URL FIELDS (use inside href="..." attributes):
${urlFields.length ? urlFields.map(f => `- ${f.path}   →   {{ ${f.path}|default:'#' }}   (sample: ${f.sample})`).join("\n") : "(none detected — only use # if the reference truly has a non-actionable link)"}

IMAGE FIELDS (use inside src="..." attributes):
${imageFields.length ? imageFields.map(f => `- ${f.path}   →   {{ ${f.path}|default:'' }}   (sample: ${f.sample})`).join("\n") : "(none detected)"}

OTHER DYNAMIC FIELDS (ids, prices, dates, codes — use inside visible text):
${otherFields.length ? otherFields.slice(0, 40).map(f => `- ${f.path}   [${f.kind}]   →   {{ ${f.path}|default:'—' }}   (sample: ${f.sample})`).join("\n") : "(none detected)"}
═══ END FIELD INVENTORY ═══

LINK BINDING RULE (HARD, NON-NEGOTIABLE):
- Every <a href="..."> in the email must be evaluated against the URL FIELDS list above.
- If ANY URL field semantically matches the link's purpose (e.g. "Manage Subscription" ↔ customer_portal_url, "Track order" ↔ tracking_url, "Return to cart" ↔ checkout_url, product CTA ↔ product/permalink URL), you MUST bind that Liquid variable into the href. Never substitute the brand homepage.
- If NO URL field matches, use the brand homepage as the fallback — but only then.
- Same rule for <img src="...">: prefer image fields from the event over static brand images when the reference shows dynamic per-order/per-product imagery.
- Visible identifiers (order number, subscription ID, tracking number) shown in the reference MUST be rendered from the matching event field, not a hardcoded placeholder.`
      : "";

    flowDetails += `\n\n═══ REAL EVENT DATA — use these exact paths in your Liquid template ═══
Note: Dollar-sign prefixed keys like $extra have been remapped to clean names (extra, value, event_id).
${JSON.stringify(eventSchema, null, 2)}

UNIVERSAL RULES FOR EVENT DATA:
- Use EXACTLY the property names from the JSON above — do not invent paths not shown
- Every Liquid variable MUST have |default: with a NON-EMPTY fallback (never |default:'')
- Do NOT use $-prefixed keys in Liquid (e.g. use event.extra NOT event.$extra)
- Top-level keys: {{ event.KeyName|default:'fallback' }}
- Nested keys: {{ event.extra.field_name|default:'fallback' }}
- NO SPACES around pipes or after colons in filters
- Read the JSON to find the ACTUAL path for items, images, prices, and URLs — do not guess
- href attributes and src attributes count as dynamic content — bind them to event fields when a matching field exists (see LINK BINDING RULE below)
═══ END EVENT DATA ═══${inventoryBlock}${productFeedsBlock}${referenceAnalysisBlock}`;
    flowUserContent.push({ type: "text", text: flowDetails });

    // Assets
    if (hostedAssetEntries.length > 0) {
      flowUserContent.push({ type: "text", text: `BRAND ASSETS:\n${assetCatalog}` });
    }
    if (productRequirements) {
      flowUserContent.push({ type: "text", text: productRequirements });
    }

    flowUserContent.push({
      type: "text",
      text: "Generate a complete Klaviyo-ready transactional email HTML template for the above flow. Match the brand visual identity. All dynamic data must use the Liquid variables provided. Return only complete HTML.",
    });

    // Replace userContent for the generation call
    userContent.length = 0;
    userContent.push(...flowUserContent);
  }

  // === PASS 1: Generate ===
  const pass1Start = Date.now();
  const genEventKey = `v${variantIdx}_claude_generate`;
  await logGenEvent(supabase, campaignId, "claude_generate", {
    status: "started", run_id: runId, event_key: genEventKey,
    payload: { model: GENERATION_MODEL, image_count: imageBlocks.length, reference_mode: referenceMode, campaign_mode: campaignMode },
  });

  const response = await callAnthropic({
    model: GENERATION_MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  }, ANTHROPIC_API_KEY);

  if (!response.ok) {
    const errText = await response.text();
    await logGenEvent(supabase, campaignId, "claude_generate", {
      status: "failed", run_id: runId, event_key: genEventKey,
      error: `${response.status} - ${errText}`, duration_ms: Date.now() - pass1Start,
    });
    throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  const pass1StopReason = result.stop_reason;
  const pass1Tokens = result.usage;
  let html = extractHtmlOnly(result.content?.[0]?.text || "");

  await logGenEvent(supabase, campaignId, "claude_generate", {
    status: "completed", run_id: runId, event_key: genEventKey,
    duration_ms: Date.now() - pass1Start,
    result: { html_length: html.length, stop_reason: pass1StopReason, input_tokens: pass1Tokens?.input_tokens, output_tokens: pass1Tokens?.output_tokens },
  });

  // If Pass 1 truncated, retry once with leaner instruction
  const completeCheck = (h: string) => isBoldHtmlMode ? isCompleteBoldHtml(h) : isCompleteHtml(h);
  if (!completeCheck(html) || pass1StopReason === "max_tokens") {
    console.warn("Pass 1 truncated (stop_reason:", pass1StopReason, "), retrying with concise prompt...");
    const retryContent = [{
      type: "text",
      text: `${brandValuesText}\n\nGenerate a concise ${goal} email. Brief: ${brief}\nKeep it to 3-4 sections max. Use fewer images. ${productRequirements}\n\nAVAILABLE ASSETS:\n${assetCatalog}\n\nReturn only complete HTML.`,
    }];
    const retryResp = await callAnthropic({
      model: GENERATION_MODEL,
      max_tokens: 32000,
      system: isBoldHtmlMode ? systemPrompt : UNIVERSAL_EMAIL_RULES,
      messages: [{ role: "user", content: retryContent }],
    }, ANTHROPIC_API_KEY);
    if (retryResp.ok) {
      const retryResult = await retryResp.json();
      const retryHtml = extractHtmlOnly(retryResult.content?.[0]?.text || "");
      if (completeCheck(retryHtml)) html = retryHtml;
    }
  }

  // === PASS 2: QA Audit ===
  // Skip QA + finalization in bold HTML mode — those enforce safe-email conventions
  // (table layouts, no stacking, brand card radius, etc.) that actively destroy the
  // editorial/landing-page look this mode is designed to produce.
  if (completeCheck(html) && !isBoldHtmlMode) {
    const qaStart = Date.now();
    try {
      const allQaItems = [...brandQaChecklist, ...globalQaChecklist];
      const customQaSection = allQaItems.length > 0
        ? `\n\n=== CUSTOM QA CHECKLIST ITEMS ===\n${allQaItems.map((item, i) => `${i + 1}. ${item}`).join("\n")}`
        : "";

      let qaText = `Brand design rules:\n${profile.system_prompt}\n\n=== SPECIFIC VALUES TO ENFORCE ===\ncard_radius: ${brandValues.card_radius}px\nbutton_radius: ${brandValues.button_radius}px\naccent_color: ${brandValues.accent_color}\ntext_color: ${brandValues.text_color}${customQaSection}`;

      if (assetCatalog) {
        qaText += `\n\n=== APPROVED ASSET CATALOG (brand + product assets — all are valid) ===\n${assetCatalog}`;
      }

      if (allProductAssetUrls.length > 0) {
        qaText += `\n\n=== PRODUCT IMAGE REQUIREMENT ===\nThe following product image URLs MUST remain in the HTML. Do NOT remove them:\n${allProductAssetUrls.join("\n")}`;
      }

      qaText += `\n\n=== GENERATED HTML TO AUDIT ===\n${html}`;

      const qaContent: any[] = [{ type: "text", text: qaText }];

      const qaResponse = await callAnthropic({
        model: QA_MODEL,
        max_tokens: 32000,
        thinking: { type: "adaptive" },
        system: QA_SYSTEM_PROMPT,
        messages: [{ role: "user", content: qaContent }],
      }, ANTHROPIC_API_KEY);

      if (qaResponse.ok) {
        const qaResult = await qaResponse.json();
        const qaRawText = (qaResult.content?.[0]?.text || "").trim();

        let qaData: { passes_qa: boolean; issues: { description: string; find: string; replace: string }[] };
        try {
          const cleaned = qaRawText.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
          qaData = JSON.parse(cleaned);
        } catch {
          console.warn("QA returned non-JSON, keeping Pass 1 HTML");
          qaData = { passes_qa: true, issues: [] };
        }

        await logGenEvent(supabase, campaignId, "claude_qa", {
          status: "completed", run_id: runId, event_key: `v${variantIdx}_claude_qa`,
          duration_ms: Date.now() - qaStart,
          result: { passes_qa: qaData.passes_qa, issue_count: qaData.issues?.length || 0, tokens: qaResult.usage },
        });

        if (!qaData.passes_qa && Array.isArray(qaData.issues) && qaData.issues.length > 0) {
          let patchedHtml = html;
          for (const issue of qaData.issues) {
            if (issue.find && issue.replace && patchedHtml.includes(issue.find)) {
              patchedHtml = patchedHtml.replace(issue.find, issue.replace);
            }
          }

          const patchComplete = isCompleteHtml(patchedHtml);
          const patchPreservesProducts = allProductAssetUrls.length === 0 ||
            allProductAssetUrls.some((url) => patchedHtml.includes(url));

          if (patchComplete && patchPreservesProducts) {
            html = patchedHtml;
          } else {
            console.warn("QA patches broke HTML (complete:", patchComplete, "preserves products:", patchPreservesProducts, ") — keeping Pass 1");
          }
        }
      } else {
        await logGenEvent(supabase, campaignId, "claude_qa", {
          status: "failed", run_id: runId, event_key: `v${variantIdx}_claude_qa`,
          error: `QA API returned ${qaResponse.status}`, duration_ms: Date.now() - qaStart,
        });
        console.warn("QA pass failed, using first-pass HTML:", qaResponse.status);
      }
    } catch (qaErr) {
      await logGenEvent(supabase, campaignId, "claude_qa", {
        status: "failed", run_id: runId, event_key: `v${variantIdx}_claude_qa`,
        error: String(qaErr), duration_ms: Date.now() - qaStart,
      });
      console.warn("QA pass error, using first-pass HTML:", qaErr);
    }
  }

  // Final guard: never return incomplete HTML
  if (!completeCheck(html)) {
    throw new Error("Generated HTML was incomplete. Please try again.");
  }

  // Unified finalization
  if (!isBoldHtmlMode) {
    const finalizeStart = Date.now();
    html = finalizeCampaignHtml(html);
    await logGenEvent(supabase, campaignId, "finalize_html", {
      status: "completed", run_id: runId, event_key: `v${variantIdx}_finalize`,
      duration_ms: Date.now() - finalizeStart, result: { html_length: html.length },
    });
  } else {
    console.log("[generateCampaignCore] Bold HTML mode — skipping QA + finalizeCampaignHtml to preserve editorial design.");
  }

  // === KLAVIYO TEMPLATE VALIDATION (flow emails only) ===
  if (campaignMode === "flow" && brandId) {
    let validationHtml = html;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const validationResp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/klaviyo-validate-template`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ brand_id: brandId, html: validationHtml }),
          },
        );

        const validation = await validationResp.json();

        if (validation.valid || validation.skipped) {
          html = validationHtml;
          console.log(`[klaviyo-validate] Template valid on attempt ${attempt + 1}`);
          break;
        }

        console.log(`[klaviyo-validate] Attempt ${attempt + 1} failed: ${validation.error}`);

        // If the error is an auth/scope issue, no amount of HTML fixing will help — bail immediately
        const scopeOrAuthError = /missing required scopes|unauthorized|forbidden|invalid api key|authentication/i.test(validation.error || "");
        if (scopeOrAuthError) {
          console.warn("[klaviyo-validate] Auth/scope error — skipping auto-fix, using current HTML");
          break;
        }

        if (attempt < 2) {
          // Ask Claude to fix the specific Klaviyo error
          const fixResp = await callAnthropic(
            {
              model: "claude-sonnet-4-6",
              max_tokens: 32000,
              system: `You are an expert Klaviyo email developer. Fix the Liquid template error below.
Return ONLY the corrected complete HTML — no explanation, no markdown fences.
CRITICAL: Klaviyo uses Django templates, not Shopify Liquid.
- Use {% elif %} not {% elsif %}
- Never use | default: '' (empty string)
- Never chain | default: after | date:
- Use {% if not %} not {% unless %}`,
              messages: [
                {
                  role: "user",
                  content: `Klaviyo rejected this template with error: "${validation.error}"\n\nFix the error and return the complete corrected HTML:\n\n${validationHtml}`,
                },
              ],
            },
            ANTHROPIC_API_KEY,
          );

          if (fixResp.ok) {
            const fixResult = await fixResp.json();
            let fixedHtml = fixResult.content?.[0]?.text || validationHtml;
            fixedHtml = fixedHtml
              .replace(/^```html?\s*\n?/i, "")
              .replace(/\n?```\s*$/i, "")
              .trim();
            fixedHtml = finalizeCampaignHtml(fixedHtml);
            validationHtml = fixedHtml;
          } else {
            console.warn("[klaviyo-validate] Claude fix call failed:", fixResp.status);
            break;
          }
        }
      } catch (valErr) {
        console.warn("[klaviyo-validate] Validation loop error, using current HTML:", valErr);
        break;
      }
    }
  }

  return { html };
}
