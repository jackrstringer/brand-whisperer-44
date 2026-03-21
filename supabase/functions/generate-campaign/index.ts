import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { rehostHtmlImagesWithImageKit } from "../_shared/imagekit.ts";

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
- Wrapper table: width=600 style='max-width:600px; width:600px;'

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
- Full-bleed: Container: background-color:#fff; background-image:linear-gradient(#fff,#fff);
- Contained: style='width:80%;max-width:400px;height:auto;display:block;margin:0 auto;'

CONTRAST CARDS:
- Never full-width color blocks cutting the email in half
- Always: outer padding + inner card with border-radius
- White space visible on both sides of every contrast card

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

    const authHeader = req.headers.get("authorization");
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

    // Normalize and pre-host reference images to ImageKit so the model gets stable URLs
    const imageBlocks: any[] = [];
    const referenceUrls = Array.isArray(profile.reference_image_urls)
      ? profile.reference_image_urls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
      : [];

    let hostedReferenceUrls = referenceUrls.slice(0, 10);
    if (hostedReferenceUrls.length > 0) {
      const referencesHtml = hostedReferenceUrls
        .map((url, index) => `<img src="${url}" alt="reference-${index}" />`)
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
        const buf = await imgResp.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        imageBlocks.push({
          type: "image",
          source: { type: "base64", media_type: "image/png", data: b64 },
        });
      } catch { /* skip failed images */ }
    }

    const userContent: any[] = [];

    // Part 1: Reference images
    if (imageBlocks.length > 0) {
      userContent.push({
        type: "text",
        text: `Here are ${imageBlocks.length} past email campaigns from this brand. Study them carefully. Your output must feel like it belongs in this exact same family — same design instincts, same typographic choices, same copy voice, same structural patterns.`,
      });
      userContent.push(...imageBlocks);
    }

    // Part 2: Brand rules
    userContent.push({
      type: "text",
      text: `From analyzing these campaigns, here are the specific rules to follow precisely:\n${profile.system_prompt}`,
    });

    // Part 3: This campaign
    let part3 = `Generate a ${goal} email campaign.\nBrief: ${brief}`;
    if (copy) part3 += `\nThe following copy must be used verbatim: ${copy}`;
    if (hostedReferenceUrls.length > 0) {
      part3 += `\n\nMANDATORY IMAGE URL RULES:\n- Never invent, guess, or use external stock image URLs (Unsplash, Pexels, etc).\n- Use ONLY the exact URLs below for every <img src> in the HTML:\n${hostedReferenceUrls.join("\n")}`;
    } else {
      part3 += `\n\nMANDATORY IMAGE URL RULES:\n- No approved image URLs were provided, so do not include <img> tags.`;
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

    // Strip markdown fences if present
    html = html.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();

    // Re-host generated image URLs to ImageKit for reliable rendering
    html = await rehostHtmlImagesWithImageKit(html, {
      campaignId,
      imagekitPrivateKey: IMAGEKIT_PRIVATE_KEY,
      fallbackImageUrls: hostedReferenceUrls,
    });

    // Save to database
    await supabase.from("campaigns").update({
      html,
      status: "ready",
      brief,
      goal,
    }).eq("id", campaignId);

    // Save system message
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
