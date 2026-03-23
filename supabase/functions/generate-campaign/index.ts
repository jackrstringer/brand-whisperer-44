import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { rehostHtmlImagesWithImageKit, applyImageKitTransform } from "../_shared/imagekit.ts";

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

HEADLINES:
- All multi-line headlines use hard <br> line breaks
- Never rely on auto-wrapping — email clients reflow unpredictably

IMAGES:
- All images must use: style="width:100%; height:auto; display:block;"
- CONSISTENCY: Every image must have the same padding treatment. Either ALL images are full-bleed (edge-to-edge) OR ALL images have equal padding on both sides. NEVER mix full-bleed and padded images in the same email.
- If an image has excessive negative space that would look awkward, use ImageKit smart cropping by appending transformation parameters to the URL, or skip the image entirely. Do NOT overlay text on images.
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

FOOTER (required on every email):
- Must include: brand name, unsubscribe link placeholder, address placeholder
- Style: small text (11-12px), muted color, centered, generous top padding (40-60px)
- Unsubscribe link text: "Unsubscribe" — use href="#unsubscribe" as placeholder
- Address placeholder: "123 Street, City, State 00000"
- The footer is a SEPARATE section from the main content — never merge it with the last content block

Return only complete HTML. No commentary. No markdown fences.`;

const QA_SYSTEM_PROMPT = `You are a visual QA auditor for HTML emails.
You will receive:
1. Brand reference images (showing the correct design language)
2. The brand's design rules
3. Specific brand values (card radius, button radius, colors)
4. The generated HTML email to audit

Your job: compare the HTML against the references and rules, then fix ANY issues.

CHECK EACH — fail ANY = must fix:
1. Card/container border-radius must match the brand's specified card_radius EVERYWHERE — no sharp corners if the brand uses rounded
2. Button border-radius and styling must match brand specs
3. Images with excessive empty/negative space (>30%) must use the smart-cropped URL variant (with tr: parameters). If no cropped variant is available, REMOVE the image
4. ALL images must have identical padding treatment — either ALL full-bleed OR ALL with equal side padding. NEVER mix
5. Footer MUST exist as a SEPARATE section with: brand name, "Unsubscribe" link (href="#unsubscribe"), address placeholder
6. Text alignment must be consistent within each section — no left-aligned bullets in a center-aligned section
7. Colors must match brand palette — no generic grays (#999, #666) for body text
8. No reference campaign screenshots embedded as <img> tags
9. The outermost wrapper must use width:100% with max-width:600px — never fixed width:600px
10. Every contrast card must have border-radius matching the brand

If ANY issues are found: return the CORRECTED complete HTML.
If all checks pass: return the HTML unchanged.
Return ONLY HTML. No commentary. No markdown fences.`;

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

    const { brandId, campaignId, brief, goal, copy } = await req.json();

    // Fetch brand profile
    const { data: profile, error: profileErr } = await supabase
      .from("brand_profiles")
      .select("*")
      .eq("brand_id", brandId)
      .single();

    if (profileErr || !profile) throw new Error("Brand profile not found");

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

    let hostedReferenceUrls = referenceUrls.slice(0, 10);
    if (hostedReferenceUrls.length > 0) {
      const referencesHtml = hostedReferenceUrls
        .map((url: string, index: number) => `<img src="${url}" alt="reference-${index}" />`)
        .join("\n");

      const rehostedReferencesHtml = await rehostHtmlImagesWithImageKit(referencesHtml, {
        campaignId,
        imagekitPrivateKey: IMAGEKIT_PRIVATE_KEY,
        folder: "/campaign-studio/references",
      });

      const extractedRehostedUrls = Array.from(
        rehostedReferencesHtml.matchAll(/<img\b[^>]*?\bsrc=(["'])(.*?)\1/gi),
      )
        .map((match) => match[2])
        .filter((url): url is string => Boolean(url));

      if (extractedRehostedUrls.length > 0) {
        hostedReferenceUrls = extractedRehostedUrls;
      }
    }

    for (const url of hostedReferenceUrls) {
      try {
        const imgResp = await fetch(url);
        const contentType = imgResp.headers.get("content-type") || "image/png";
        const mediaType = contentType.split(";")[0].trim();
        const buf = await imgResp.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        imageBlocks.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: b64 },
        });
      } catch { /* skip failed images */ }
    }

    // Fetch ALL brand assets — let AI decide which to use
    const { data: brandAssets } = await supabase
      .from("brand_assets")
      .select("url, category")
      .eq("brand_id", brandId);

    const allAssetEntries: { url: string; category: string }[] = (brandAssets || [])
      .filter((a: any) => typeof a.url === "string" && a.url.trim().length > 0)
      .slice(0, 15);

    // Re-host all asset URLs to ImageKit
    let hostedAssetEntries: { url: string; category: string }[] = [];
    if (allAssetEntries.length > 0) {
      const assetsHtml = allAssetEntries
        .map((entry, index) => `<img src="${entry.url}" alt="asset-${index}" />`)
        .join("\n");

      const rehostedAssetsHtml = await rehostHtmlImagesWithImageKit(assetsHtml, {
        campaignId,
        imagekitPrivateKey: IMAGEKIT_PRIVATE_KEY,
        folder: "/campaign-studio/brand-assets",
      });

      const extractedAssetUrls = Array.from(
        rehostedAssetsHtml.matchAll(/<img\b[^>]*?\bsrc=(["'])(.*?)\1/gi),
      )
        .map((match) => match[2])
        .filter((url): url is string => Boolean(url));

      if (extractedAssetUrls.length === allAssetEntries.length) {
        hostedAssetEntries = allAssetEntries.map((entry, i) => ({
          url: extractedAssetUrls[i],
          category: entry.category,
        }));
      } else {
        hostedAssetEntries = allAssetEntries.map((entry, i) => ({
          url: extractedAssetUrls[i] || entry.url,
          category: entry.category,
        }));
      }
    }

    // Build asset catalog with categories and ImageKit transform hints
    const assetCatalog = hostedAssetEntries.map((entry) => {
      const baseUrl = entry.url;
      const smartCrop = applyImageKitTransform(baseUrl, { width: 600, focus: "auto", crop: "maintain_ratio" });
      const tightCrop = applyImageKitTransform(baseUrl, { width: 600, height: 400, focus: "auto", crop: "at_max" });
      return `[${entry.category}] ${baseUrl}\n  → smart-cropped: ${smartCrop}\n  → tight-cropped: ${tightCrop}`;
    }).join("\n");

    const embeddableUrls = hostedAssetEntries.map((e) => e.url);

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

    userContent.push({ type: "text", text: brandValuesText });

    let part3 = `Generate a ${goal} email campaign.\nBrief: ${brief}`;
    if (copy) part3 += `\nThe following copy must be used verbatim: ${copy}`;

    part3 += `\n\n=== IMAGE RULES ===
1. The reference campaign screenshots above are STYLE REFERENCES ONLY. NEVER embed them as <img> tags.
2. Never invent, guess, or use external stock image URLs (Unsplash, Pexels, etc).
3. You are the CREATIVE DIRECTOR. Choose ONLY the images that best serve this campaign's story. You do NOT need to use every available image — be selective.
4. Before using any image, consider if it has excessive empty space. If so, you MUST use the tight-cropped URL variant. If even the cropped version would look bad, skip the image entirely.
5. For lifestyle/hero images, default to the tight-crop variant unless the full image is clearly well-composed with minimal negative space.
6. CONSISTENCY: Every image must have the same padding treatment — either ALL full-bleed or ALL with equal side padding. Never mix.`;

    if (hostedAssetEntries.length > 0) {
      part3 += `\n\nAVAILABLE BRAND ASSETS (use selectively — pick what serves the campaign):\n${assetCatalog}`;
    } else {
      part3 += `\n\nNo brand asset images available. Use solid color blocks, gradients, or text-only sections instead. Do NOT include <img> tags.`;
    }

    part3 += `\n\nThe output must look like it was made by the same designer who created the reference campaigns above. Return only the complete HTML.`;
    userContent.push({ type: "text", text: part3 });

    // === PASS 1: Generate ===
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 8192,
        system: UNIVERSAL_EMAIL_RULES,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      await supabase.from("campaigns").update({ status: "error" }).eq("id", campaignId);
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    let html = result.content?.[0]?.text || "";
    html = html.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();

    // Re-host any generated image URLs to ImageKit
    html = await rehostHtmlImagesWithImageKit(html, {
      campaignId,
      imagekitPrivateKey: IMAGEKIT_PRIVATE_KEY,
      fallbackImageUrls: embeddableUrls,
    });

    // === PASS 2: QA Audit ===
    try {
      const qaContent: any[] = [];

      if (imageBlocks.length > 0) {
        qaContent.push({
          type: "text",
          text: `Here are ${imageBlocks.length} brand reference campaign images. The generated email must match their design language exactly.`,
        });
        qaContent.push(...imageBlocks);
      }

      qaContent.push({
        type: "text",
        text: `Brand design rules:\n${profile.system_prompt}\n\n=== SPECIFIC VALUES TO ENFORCE ===\ncard_radius: ${brandValues.card_radius}px\nbutton_radius: ${brandValues.button_radius}px\naccent_color: ${brandValues.accent_color}\ntext_color: ${brandValues.text_color}\n\n=== GENERATED HTML TO AUDIT ===\n${html}`,
      });

      const qaResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          system: QA_SYSTEM_PROMPT,
          messages: [{ role: "user", content: qaContent }],
        }),
      });

      if (qaResponse.ok) {
        const qaResult = await qaResponse.json();
        let qaHtml = qaResult.content?.[0]?.text || "";
        qaHtml = qaHtml.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();
        if (qaHtml.length > 100 && qaHtml.includes("<table")) {
          html = qaHtml;
        }
      } else {
        console.warn("QA pass failed, using first-pass HTML:", qaResponse.status);
      }
    } catch (qaErr) {
      console.warn("QA pass error, using first-pass HTML:", qaErr);
    }

    await supabase.from("campaigns").update({
      html,
      status: "ready",
      brief,
      goal,
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
