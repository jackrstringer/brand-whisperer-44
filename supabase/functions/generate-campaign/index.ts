import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { rehostHtmlImagesWithImageKit } from "../_shared/imagekit.ts";

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
      // Retry on 529 (overloaded) or 503
      if ((resp.status === 529 || resp.status === 503) && attempt < maxRetries) {
        console.warn(`[callAnthropic] got ${resp.status}, retrying in ${(attempt + 1) * 5}s...`);
        await resp.text(); // consume body
        await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
        continue;
      }
      return resp;
    } catch (error) {
      const elapsed = Date.now() - startMs;
      if (error.name === "AbortError") throw new Error(`Anthropic API call timed out after ${Math.round(elapsed / 1000)}s`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("callAnthropic: exhausted retries");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

FIRST FOLD CTA (mandatory):
- Every email MUST have a CTA button visible within the first ~600px of vertical content (the "first fold")
- This means: hero section → headline → brief supporting text → CTA, all within the first screenful
- The first CTA should appear BEFORE any secondary content sections, product grids, or testimonials
- Additional CTAs can appear later in the email, but the first one must be above the fold

HEADLINES:
- All multi-line headlines use hard <br> line breaks
- Never rely on auto-wrapping — email clients reflow unpredictably

IMAGES:
- All images must use: style="width:100%; height:auto; display:block;"
- PADDING CONSISTENCY (critical): Every content image in the email must have the SAME padding treatment. Either ALL images sit inside table cells with equal left/right padding (e.g., 24-40px on each side) OR ALL images are full-bleed. NEVER mix padded and full-bleed images.
- When using padded images, the image's parent <td> must have explicit left and right padding. The image itself stays width:100% within that padded cell.
- Images should generally NOT span the full 600px edge-to-edge unless the brand's reference campaigns specifically use full-bleed imagery. Default to padded images with 24-40px side padding.
- If an image has excessive negative space that would look awkward, skip the image entirely. Do NOT overlay text on images. Do NOT modify or transform image URLs.
- LOGO HANDLING: Images categorized as 'logo' must be displayed at max-width:150px (or similar reasonable size), centered, with padding above and below. NEVER stretch a logo to full width. NEVER crop a logo. If a dark-mode-safe variant exists, use it.

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

Return ONLY the JSON object. No markdown fences, no explanation, no preamble.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let campaignIdForError: string | null = null;
  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
    const IMAGEKIT_PRIVATE_KEY = Deno.env.get("IMAGEKIT_PRIVATE_KEY");
    if (!IMAGEKIT_PRIVATE_KEY) throw new Error("IMAGEKIT_PRIVATE_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { brandId, campaignId, brief, goal, copy, speedMode, productIds, pinnedAssetUrls: pinnedUrls } = await req.json();
    campaignIdForError = campaignId;

    // Always use Opus 4.6
    const GENERATION_MODEL = "claude-opus-4-6";
    const QA_MODEL = "claude-sonnet-4-6";

    // Mark campaign as generating with start timestamp
    const genStartedAt = new Date().toISOString();
    await supabase.from("campaigns").update({ status: "generating", generation_started_at: genStartedAt, generation_duration_secs: null }).eq("id", campaignId);

    // FIX 2: Parallelize independent DB reads
    const [profileResult, brandResult] = await Promise.all([
      supabase.from("brand_profiles").select("*").eq("brand_id", brandId).single(),
      supabase.from("brands").select("user_id").eq("id", brandId).single(),
    ]);

    const profile = profileResult.data;
    if (profileResult.error || !profile) throw new Error("Brand profile not found");

    const brandInstructions = (profile as any).brand_instructions || "";
    const brandQaChecklist: string[] = Array.isArray((profile as any).qa_checklist) ? (profile as any).qa_checklist : [];

    // Chain user_preferences after brands (needs user_id)
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

    // Extract brand-specific design values from raw_extraction
    const rawExtraction = profile.raw_extraction as Record<string, any> | null;
    const brandValues = {
      card_radius: rawExtraction?.spacing?.card_radius ?? rawExtraction?.card_radius ?? rawExtraction?.border_radius ?? "12",
      button_radius: rawExtraction?.buttons?.border_radius ?? rawExtraction?.button_radius ?? "100",
      accent_color: rawExtraction?.colors?.accent ?? rawExtraction?.accent_color ?? rawExtraction?.primary_color ?? "",
      text_color: rawExtraction?.colors?.text_primary ?? rawExtraction?.text_color ?? rawExtraction?.body_color ?? "",
      background_color: rawExtraction?.colors?.canvas ?? rawExtraction?.background_color ?? "",
    };

    // Build reference image blocks for vision (style only — never embed)
    const imageBlocks: any[] = [];
    const referenceUrls = Array.isArray(profile.reference_image_urls)
      ? profile.reference_image_urls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
      : [];

    // Cap reference images at 5 for all modes
    const maxRefs = 5;
    const selectedReferenceUrls = referenceUrls.slice(0, maxRefs);

    // FIX 4: Fetch all reference images in PARALLEL with chunked base64
    const imagePromises = selectedReferenceUrls.map(async (url: string) => {
      try {
        const imgResp = await fetch(url);
        if (!imgResp.ok) return null;
        const contentType = imgResp.headers.get("content-type") || "image/png";
        const mediaType = contentType.split(";")[0].trim();
        const buf = await imgResp.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        return { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: b64 } };
      } catch { return null; }
    });

    const imageResults = await Promise.all(imagePromises);
    for (const result of imageResults) {
      if (result) imageBlocks.push(result);
    }

    // Fetch ALL brand assets with AI-generated descriptions
    const { data: brandAssets } = await supabase
      .from("brand_assets")
      .select("url, category, filename, description, dominant_colors, ai_category")
      .eq("brand_id", brandId);

    const hostedAssetEntries: { url: string; category: string; description?: string; dominant_colors?: string[]; ai_category?: string }[] = (brandAssets || [])
      .filter((a: any) => typeof a.url === "string" && a.url.trim().length > 0)
      .slice(0, 15);

    // Build rich asset catalog with descriptions for better AI selection
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
      return parts.join("\n");
    });

    // Fetch product assets early so we can build a unified catalog
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
        productRequirements = `\n\n=== FEATURED PRODUCTS (MUST USE — these products were specifically selected by the user) ===
You MUST feature these products prominently in the campaign. Use at least one image per product. If no specific images are pinned as [MUST USE], choose the best available images yourself — but you MUST include product imagery. The user selected these products because they want them in the email.`;
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

    // Unified asset catalog = brand assets + product assets
    const allCatalogEntries = [...assetCatalogEntries, ...productCatalogEntries];
    const assetCatalog = allCatalogEntries.join("\n\n");
    const embeddableUrls = [...hostedAssetEntries.map((e) => e.url), ...allProductAssetUrls];

    // Build the user content array
    const userContent: any[] = [];

    if (imageBlocks.length > 0) {
      userContent.push({
        type: "text",
        text: `Here are ${imageBlocks.length} past email campaigns from this brand. Study them carefully for STYLE and DESIGN PATTERNS ONLY. These are screenshots — NEVER embed them as <img> tags in your output. Your output must feel like it belongs in this exact same family.`,
      });
      userContent.push(...imageBlocks);
    }

    // Inject explicit brand values
    let brandValuesText = `\nFrom analyzing these campaigns, here are the specific rules to follow precisely:\n${profile.system_prompt}`;
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

    userContent.push({ type: "text", text: brandValuesText });

    // Goal-specific creative direction for structural variety
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

    const creativeDir = goalCreativeDirection[goal] || goalCreativeDirection[goal?.replace(/[-\s]/g, '_')] || 
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

    part3 += `\n\n=== IMAGE RULES ===
1. The reference campaign screenshots above are STYLE REFERENCES ONLY. NEVER embed them as <img> tags.
2. Never invent, guess, or use external stock image URLs (Unsplash, Pexels, etc).
3. You are the CREATIVE DIRECTOR. Choose ONLY the images that best serve this campaign's story. You do NOT need to use every available image — be selective.
4. Use the image URLs from the AVAILABLE BRAND ASSETS list exactly as provided. Do NOT modify, crop, or transform the URLs.
5. If an image doesn't fit the campaign's story, skip it entirely rather than forcing it in.
6. CONSISTENCY: Every image must have the same padding treatment — either ALL full-bleed or ALL with equal side padding. Never mix.`;

    if (hostedAssetEntries.length > 0) {
      part3 += `\n\nAVAILABLE BRAND ASSETS (use selectively — pick what serves the campaign):\n${assetCatalog}`;
    } else {
      part3 += `\n\nNo brand asset images available. Use solid color blocks, gradients, or text-only sections instead. Do NOT include <img> tags.`;
    }

    if (productRequirements) {
      part3 += productRequirements;
    }

    part3 += `\n\nThe output must MATCH the brand's design language (colors, fonts, spacing, tone) from the references above, but the LAYOUT and STRUCTURE must be original and tailored to this specific campaign goal. Return only the complete HTML.`;
    userContent.push({ type: "text", text: part3 });

    // === PASS 1: Generate (FIX 1: max_tokens 16384, FIX 6: callAnthropic with timeout) ===
    const response = await callAnthropic({
      model: GENERATION_MODEL,
      max_tokens: 16384,
      system: UNIVERSAL_EMAIL_RULES,
      messages: [{ role: "user", content: userContent }],
    }, ANTHROPIC_API_KEY);

    if (!response.ok) {
      const errText = await response.text();
      await supabase.from("campaigns").update({ status: "error" }).eq("id", campaignId);
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const pass1StopReason = result.stop_reason;
    let html = extractHtmlOnly(result.content?.[0]?.text || "");

    function isCompleteHtml(h: string): boolean {
      return h.length > 200 && /<\/html\s*>/i.test(h) && /<\/body\s*>/i.test(h) && /<table/i.test(h);
    }

    // If Pass 1 truncated, retry once with leaner instruction (FIX 1: 16384 tokens)
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

    // === PASS 2: QA Audit — JSON patch mode ===
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

        // FIX 1: QA max_tokens 4096 (JSON patch is small), FIX 6: timeout
        const qaResponse = await callAnthropic({
          model: QA_MODEL,
          max_tokens: 4096,
          system: QA_SYSTEM_PROMPT,
          messages: [{ role: "user", content: qaContent }],
        }, ANTHROPIC_API_KEY);

        if (qaResponse.ok) {
          const qaResult = await qaResponse.json();
          const qaRawText = (qaResult.content?.[0]?.text || "").trim();

          // FIX 7: Parse JSON patch response and apply fixes
          let qaData: { passes_qa: boolean; issues: { description: string; find: string; replace: string }[] };
          try {
            // Strip markdown fences if present
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

            // Validate patched HTML still passes completeness + product checks
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

    // Final guard: never persist incomplete HTML
    if (!isCompleteHtml(html)) {
      await supabase.from("campaigns").update({ status: "error" }).eq("id", campaignId);
      throw new Error("Generated HTML was incomplete. Please try again.");
    }

    // Derive a short campaign name from the brief
    const briefWords = brief.trim().split(/\s+/);
    const campaignName = briefWords.length <= 8
      ? brief.trim()
      : briefWords.slice(0, 8).join(" ") + "...";

    const durationSecs = Math.round((Date.now() - new Date(genStartedAt).getTime()) / 1000);

    await supabase.from("campaigns").update({
      html,
      status: "ready",
      brief,
      goal,
      name: campaignName,
      generation_duration_secs: durationSecs,
    }).eq("id", campaignId);

    await supabase.from("chat_messages").insert({
      campaign_id: campaignId,
      role: "system",
      content: "Campaign generated",
    });

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (campaignIdForError) {
      try {
        const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await sb.from("campaigns").update({ status: "error" }).eq("id", campaignIdForError);
      } catch {}
    }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
