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
- Body text minimum 15px
- Benefit pills/chips: display:block, stack vertically — never a horizontal row
- Buttons: minimum 44px tall, full-width or auto — never squished

BUTTONS:
- Always pill shape: border-radius:100px
- Always 1.5px solid border — color matches brand button_border
- Padding: minimum 16px vertical, 32px horizontal
- Text: short enough to fit one line on 375px mobile

HEADLINES:
- All multi-line headlines use hard <br> line breaks
- Never rely on auto-wrapping — email clients reflow unpredictably

IMAGES:
- All images must use: style="width:100%; height:auto; display:block;"
- CONSISTENCY: Every image must have the same padding treatment. Either ALL images are full-bleed (edge-to-edge) OR ALL images have equal padding on both sides. NEVER mix full-bleed and padded images in the same email.
- If an image has excessive negative space that would look awkward, use ImageKit smart cropping by appending transformation parameters to the URL, or skip the image entirely. Do NOT overlay text on images.

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
      const croppedUrl = applyImageKitTransform(baseUrl, { width: 600, focus: "auto", crop: "maintain_ratio" });
      return `[${entry.category}] ${baseUrl}\n  → smart-cropped: ${croppedUrl}`;
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

    userContent.push({
      type: "text",
      text: `From analyzing these campaigns, here are the specific rules to follow precisely:\n${profile.system_prompt}`,
    });

    let part3 = `Generate a ${goal} email campaign.\nBrief: ${brief}`;
    if (copy) part3 += `\nThe following copy must be used verbatim: ${copy}`;

    part3 += `\n\n=== IMAGE RULES ===
1. The reference campaign screenshots above are STYLE REFERENCES ONLY. NEVER embed them as <img> tags.
2. Never invent, guess, or use external stock image URLs (Unsplash, Pexels, etc).
3. You are the CREATIVE DIRECTOR. Choose ONLY the images that best serve this campaign's story. You do NOT need to use every available image — be selective.
4. If an image has excessive negative space, use the smart-cropped URL variant provided below instead of the base URL.
5. CONSISTENCY: Every image must have the same padding treatment — either ALL full-bleed or ALL with equal side padding. Never mix.`;

    if (hostedAssetEntries.length > 0) {
      part3 += `\n\nAVAILABLE BRAND ASSETS (use selectively — pick what serves the campaign):\n${assetCatalog}`;
    } else {
      part3 += `\n\nNo brand asset images available. Use solid color blocks, gradients, or text-only sections instead. Do NOT include <img> tags.`;
    }

    part3 += `\n\nThe output must look like it was made by the same designer who created the reference campaigns above. Return only the complete HTML.`;
    userContent.push({ type: "text", text: part3 });

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
