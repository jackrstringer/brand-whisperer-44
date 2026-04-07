/**
 * Core campaign generation logic extracted from generate-campaign/index.ts.
 * Can be called directly (no HTTP hop) from generate-campaign-multi.
 */
import { rehostHtmlImagesWithImageKit } from "./imagekit.ts";
import { finalizeCampaignHtml } from "./finalizeCampaignHtml.ts";

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

function capImageDimensions(url: string, maxDim = 1800): string {
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
- Correct 2-column example:
  <tr>
    <td width="295" valign="top" style="padding:0 2px 0 0;">
      <img src="..." width="295" height="295" style="display:block;width:100%;height:295px;">
    </td>
    <td width="295" valign="top" style="padding:0 0 0 2px;">
      <img src="..." width="295" height="295" style="display:block;width:100%;height:295px;">
    </td>
  </tr>
- Never use: <table align="left" style="display:inline-block"> as a column technique. This stacks vertically at any viewport narrower than the combined column widths.
- Never add mobile-grid-col or any CSS class that sets display:block on grid columns. The email renders at 470px — mobile stacking rules will fire and destroy the layout.

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
- For icons (stars, checkmarks, arrows, social media icons, etc.), use inline SVG only
- Social media icons: use simple inline SVG paths for each platform (Facebook, Instagram, TikTok, YouTube, etc.)
- Star ratings: use inline SVG stars filled with the brand's accent color
- Checkmarks, arrows, and decorative icons: use inline SVG with appropriate brand colors
- Keep SVGs small and simple (single path elements) for email client compatibility

FOOTER (required on every email):
- Must include: brand name, unsubscribe link placeholder, address placeholder
- Style: small text (11-12px), muted color, centered, generous top padding (40-60px)
- Unsubscribe link text: "Unsubscribe" — use href="#unsubscribe" as placeholder
- Address placeholder: "123 Street, City, State 00000"
- The footer is a SEPARATE section from the main content — never merge it with the last content block
- Social media icons in footer: use inline SVG, never emoji or text characters

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
- Correct 2-column example:
  <tr>
    <td width="295" valign="top" style="padding:0 2px 0 0;">
      <img src="..." width="295" height="295" style="display:block;width:100%;height:295px;">
    </td>
    <td width="295" valign="top" style="padding:0 0 0 2px;">
      <img src="..." width="295" height="295" style="display:block;width:100%;height:295px;">
    </td>
  </tr>
- Never use: <table align="left" style="display:inline-block"> as a column technique.
- Never add mobile-grid-col or any CSS class that sets display:block on grid columns.

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

Return ONLY the JSON object. No markdown fences, no explanation, no preamble.`;

function isCompleteHtml(h: string): boolean {
  return h.length > 200 && /<\/html\s*>/i.test(h) && /<\/body\s*>/i.test(h) && /<table/i.test(h);
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
  _isSubGeneration?: boolean;
  _variantIndex?: number;
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
    shopifyProducts, reference, _isSubGeneration,
  } = params;

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

  const GENERATION_MODEL = "claude-opus-4-6";
  const QA_MODEL = "claude-sonnet-4-6";

  // Parallelize independent DB reads
  const [profileResult, brandResult, brandIntelResult] = await Promise.all([
    supabase.from("brand_profiles").select("*").eq("brand_id", brandId).single(),
    supabase.from("brands").select("user_id").eq("id", brandId).single(),
    supabase.from("brand_intelligence").select("compiled_context, research_status").eq("brand_id", brandId).single(),
  ]);

  const profile = profileResult.data;
  if (profileResult.error || !profile) throw new Error("Brand profile not found");

  const brandIntelBlock = brandIntelResult.data?.compiled_context
    ? `\n\nBRAND INTELLIGENCE:\n${brandIntelResult.data.compiled_context}`
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
  const maxRefs = sliceUrls.length > 0 ? 40 : 5;
  const selectedReferenceUrls = urlsToSend.slice(0, maxRefs);

  console.log(`[generateCampaignCore] Using ${sliceUrls.length > 0 ? 'slices' : 'full images'}: ${selectedReferenceUrls.length} reference images`);

  let totalPayloadBytes = 0;
  const MAX_TOTAL_PAYLOAD = 28_000_000;

  const imagePromises = selectedReferenceUrls.map(async (url: string) => {
    try {
      const imgResp = await fetch(capImageDimensions(url));
      if (!imgResp.ok) return null;
      const contentType = imgResp.headers.get("content-type") || "image/jpeg";
      const mediaType = contentType.split(";")[0].trim();
      const buf = await imgResp.arrayBuffer();
      if (buf.byteLength > 4_500_000) {
        console.log(`[generateCampaignCore] Skipping oversized image (${(buf.byteLength / 1_000_000).toFixed(1)}MB)`);
        return null;
      }
      const b64 = arrayBufferToBase64(buf);
      return { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: b64 }, _size: buf.byteLength };
    } catch { return null; }
  });

  const imageResults = await Promise.all(imagePromises);
  for (const result of imageResults) {
    if (!result) continue;
    const imgSize = (result as any)._size || 0;
    if (totalPayloadBytes + imgSize > MAX_TOTAL_PAYLOAD) {
      console.log(`[generateCampaignCore] Stopping at ${imageBlocks.length} images to stay under 28MB payload limit`);
      break;
    }
    totalPayloadBytes += imgSize;
    const { _size, ...block } = result as any;
    imageBlocks.push(block);
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
      try {
        const safeUrl = capImageDimensions(originalUrl);
        const imgResp = await fetch(safeUrl);
        if (!imgResp.ok) continue;
        const contentType = imgResp.headers.get("content-type") || "image/jpeg";
        const mediaType = contentType.split(";")[0].trim();
        const buf = await imgResp.arrayBuffer();
        if (buf.byteLength > 4_500_000) continue;
        referenceImageBlocks.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: arrayBufferToBase64(buf) },
        });
      } catch {}
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
- ONLY change: swap in the brand's colors, fonts, copy, and images. The skeleton stays identical.
Do NOT add sections that don't exist in the reference. Do NOT remove sections that do exist. Do NOT rearrange anything.`
        : `This is the reference layout. Strongly follow its structure, section count, column layout, image sizing, and proportions. Apply the brand's colors, fonts, and copy on top. You may adapt minor details but keep the overall skeleton very close.`;
      userContent.push({ type: "text", text: dupeLabel });
      userContent.push(...referenceImageBlocks);
    }

    let brandRulesText = `Brand design rules:\n${profile.system_prompt}`;
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

    brandValuesText = `\nFrom analyzing these campaigns, here are the specific rules to follow precisely:\n${profile.system_prompt}`;
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
2. CALCULATE pixel dimensions for a 470px-wide email viewport:
   - Full-width hero: w-470 (height varies by reference)
   - 2-column grid (with 10px gap): each slot ≈ w-220
   - 3-column grid: each slot ≈ w-145
   - Single centered product: w-300 to w-400
3. APPLY fo-auto smart crop: append ?tr=w-{W},h-{H},fo-auto to the ik.imagekit.io URL
4. SET matching width and height attributes on the <img> tag AND its container <td>

Common slot patterns to recognize in references:
- 2×2 square grid → each image: ?tr=w-220,h-220,fo-auto
- Full-width hero banner → ?tr=w-470,h-300,fo-auto (or taller if reference is tall)
- 2-column product cards → ?tr=w-220,h-280,fo-auto
- Single centered product → ?tr=w-300,h-400,fo-auto
- Wide lifestyle banner → ?tr=w-470,h-200,fo-auto

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

  // === PASS 1: Generate ===
  const response = await callAnthropic({
    model: GENERATION_MODEL,
    max_tokens: 16384,
    system: referenceMode ? REFERENCE_MODE_SYSTEM : UNIVERSAL_EMAIL_RULES,
    messages: [{ role: "user", content: userContent }],
  }, ANTHROPIC_API_KEY);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  const pass1StopReason = result.stop_reason;
  let html = extractHtmlOnly(result.content?.[0]?.text || "");

  // If Pass 1 truncated, retry once with leaner instruction
  if (!isCompleteHtml(html) || pass1StopReason === "max_tokens") {
    console.warn("Pass 1 truncated (stop_reason:", pass1StopReason, "), retrying with concise prompt...");
    const retryContent = [{
      type: "text",
      text: `${brandValuesText}\n\nGenerate a concise ${goal} email. Brief: ${brief}\nKeep it to 3-4 sections max. Use fewer images. ${productRequirements}\n\nAVAILABLE ASSETS:\n${assetCatalog}\n\nReturn only complete HTML.`,
    }];
    const retryResp = await callAnthropic({
      model: GENERATION_MODEL,
      max_tokens: 16384,
      system: UNIVERSAL_EMAIL_RULES,
      messages: [{ role: "user", content: retryContent }],
    }, ANTHROPIC_API_KEY);
    if (retryResp.ok) {
      const retryResult = await retryResp.json();
      const retryHtml = extractHtmlOnly(retryResult.content?.[0]?.text || "");
      if (isCompleteHtml(retryHtml)) html = retryHtml;
    }
  }

  // === PASS 2: QA Audit ===
  if (isCompleteHtml(html)) {
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
        max_tokens: 4096,
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
        console.warn("QA pass failed, using first-pass HTML:", qaResponse.status);
      }
    } catch (qaErr) {
      console.warn("QA pass error, using first-pass HTML:", qaErr);
    }
  }

  // Final guard: never return incomplete HTML
  if (!isCompleteHtml(html)) {
    throw new Error("Generated HTML was incomplete. Please try again.");
  }

  // Unified finalization
  html = finalizeCampaignHtml(html);

  return { html };
}
