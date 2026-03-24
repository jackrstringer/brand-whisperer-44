import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { rehostHtmlImagesWithImageKit, applyImageKitTransform, getImageSliceUrls, estimateImageHeight } from "../_shared/imagekit.ts";

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
3. For EACH <img> tag: check if the image URL appears in the available asset catalog. If a tight-cropped variant exists and the original has excessive empty/negative space (>30%), REPLACE the src with the tight-cropped URL. If no cropped variant exists and the image looks bad, REMOVE the <img> tag entirely.
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

    const { brandId, campaignId, brief, goal, copy, speedMode } = await req.json();
    campaignIdForError = campaignId;

    // Model selection based on speed mode
    const GENERATION_MODEL = speedMode === "faster" ? "claude-3-5-haiku-20241022" : speedMode === "fast" ? "claude-sonnet-4-20250514" : "claude-opus-4-6";
    const QA_MODEL = speedMode === "faster" ? "claude-3-5-haiku-20241022" : "claude-sonnet-4-20250514";

    // Mark campaign as generating immediately
    await supabase.from("campaigns").update({ status: "generating" }).eq("id", campaignId);

    // Fetch brand profile
    const { data: profile, error: profileErr } = await supabase
      .from("brand_profiles")
      .select("*")
      .eq("brand_id", brandId)
      .single();

    if (profileErr || !profile) throw new Error("Brand profile not found");

    // Fetch brand instructions and QA checklist
    const brandInstructions = (profile as any).brand_instructions || "";
    const brandQaChecklist: string[] = Array.isArray((profile as any).qa_checklist) ? (profile as any).qa_checklist : [];

    // Fetch user preferences (global rules + QA)
    const { data: brand } = await supabase.from("brands").select("user_id").eq("id", brandId).single();
    let globalRules = "";
    let globalQaChecklist: string[] = [];
    if (brand?.user_id) {
      const { data: prefs } = await supabase.from("user_preferences").select("preferences").eq("user_id", brand.user_id).single();
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

    // Build image blocks with slicing for tall images
    let refImageIndex = 0;
    for (const url of hostedReferenceUrls) {
      try {
        // Estimate height to decide if slicing is needed
        const height = await estimateImageHeight(url);
        const isImageKitUrl = /^https:\/\/ik\.imagekit\.io\//i.test(url);

        if (height && height > 1400 && isImageKitUrl) {
          // Slice using ImageKit URL transforms
          const sliceUrls = getImageSliceUrls(url, height, 1300, 600);
          for (let si = 0; si < sliceUrls.length; si++) {
            const imgResp = await fetch(sliceUrls[si]);
            if (!imgResp.ok) continue;
            const contentType = imgResp.headers.get("content-type") || "image/jpeg";
            const mediaType = contentType.split(";")[0].trim();
            const buf = await imgResp.arrayBuffer();
            const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
            imageBlocks.push({
              type: "text",
              text: `Reference Campaign ${refImageIndex + 1} — Slice ${si + 1}/${sliceUrls.length} (top to bottom):`,
            });
            imageBlocks.push({
              type: "image",
              source: { type: "base64", media_type: mediaType, data: b64 },
            });
          }
        } else {
          // Single image (short enough or not on ImageKit)
          const imgResp = await fetch(url);
          if (!imgResp.ok) continue;
          const contentType = imgResp.headers.get("content-type") || "image/png";
          const mediaType = contentType.split(";")[0].trim();
          const buf = await imgResp.arrayBuffer();
          const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
          imageBlocks.push({
            type: "image",
            source: { type: "base64", media_type: mediaType, data: b64 },
          });
        }
        refImageIndex++;
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
      if (entry.category === "logo") {
        return `[logo — display at max-width 150px, centered, DO NOT stretch or crop] ${baseUrl}`;
      }
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

    // Inject brand-specific instructions
    if (brandInstructions) {
      brandValuesText += `\n\n=== BRAND-SPECIFIC INSTRUCTIONS ===\n${brandInstructions}`;
    }

    // Inject global generation rules
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
4. Before using any image, consider if it has excessive empty space. If so, you MUST use the tight-cropped URL variant. If even the cropped version would look bad, skip the image entirely.
5. For lifestyle/hero images, default to the tight-crop variant unless the full image is clearly well-composed with minimal negative space.
6. CONSISTENCY: Every image must have the same padding treatment — either ALL full-bleed or ALL with equal side padding. Never mix.`;

    if (hostedAssetEntries.length > 0) {
      part3 += `\n\nAVAILABLE BRAND ASSETS (use selectively — pick what serves the campaign):\n${assetCatalog}`;
    } else {
      part3 += `\n\nNo brand asset images available. Use solid color blocks, gradients, or text-only sections instead. Do NOT include <img> tags.`;
    }

    part3 += `\n\nThe output must MATCH the brand's design language (colors, fonts, spacing, tone) from the references above, but the LAYOUT and STRUCTURE must be original and tailored to this specific campaign goal. Return only the complete HTML.`;
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
        model: GENERATION_MODEL,
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

      // Build custom QA items from brand + global checklists
      const allQaItems = [...brandQaChecklist, ...globalQaChecklist];
      const customQaSection = allQaItems.length > 0
        ? `\n\n=== CUSTOM QA CHECKLIST ITEMS ===\n${allQaItems.map((item, i) => `${i + 1}. ${item}`).join("\n")}`
        : "";

      let qaText = `Brand design rules:\n${profile.system_prompt}\n\n=== SPECIFIC VALUES TO ENFORCE ===\ncard_radius: ${brandValues.card_radius}px\nbutton_radius: ${brandValues.button_radius}px\naccent_color: ${brandValues.accent_color}\ntext_color: ${brandValues.text_color}${customQaSection}`;

      if (assetCatalog) {
        qaText += `\n\n=== AVAILABLE IMAGE VARIANTS ===\nFor any image that has excessive negative space, replace the URL with the tight-cropped variant below:\n${assetCatalog}`;
      }

      qaText += `\n\n=== GENERATED HTML TO AUDIT ===\n${html}`;

      qaContent.push({ type: "text", text: qaText });

      const qaResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: QA_MODEL,
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
