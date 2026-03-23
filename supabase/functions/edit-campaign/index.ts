import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { rehostHtmlImagesWithImageKit } from "../_shared/imagekit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { campaignId, message, currentHtml } = await req.json();

    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();
    if (cErr || !campaign) throw new Error("Campaign not found");

    const { data: profile, error: pErr } = await supabase
      .from("brand_profiles")
      .select("*")
      .eq("brand_id", campaign.brand_id)
      .single();
    if (pErr || !profile) throw new Error("Brand profile not found");

    // Top 3 reference images for style context (vision only)
    const imageBlocks: any[] = [];
    const referenceUrls = Array.isArray(profile.reference_image_urls)
      ? profile.reference_image_urls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
      : [];

    let hostedReferenceUrls = referenceUrls.slice(0, 3);
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
      } catch { /* skip */ }
    }

    // Fetch brand assets for embeddable URLs
    const { data: brandAssets } = await supabase
      .from("brand_assets")
      .select("url, category")
      .eq("brand_id", campaign.brand_id);

    const embeddableUrls = (brandAssets || [])
      .map((a: any) => a.url)
      .filter((url: string) => typeof url === "string" && url.trim().length > 0)
      .slice(0, 15);

    // Extract brand values for QA enforcement
    const rawExtraction = profile.raw_extraction as Record<string, any> | null;
    const brandValues = {
      card_radius: rawExtraction?.spacing?.card_radius ?? rawExtraction?.card_radius ?? rawExtraction?.border_radius ?? "12",
      button_radius: rawExtraction?.buttons?.border_radius ?? rawExtraction?.button_radius ?? "100",
      accent_color: rawExtraction?.colors?.accent ?? rawExtraction?.accent_color ?? rawExtraction?.primary_color ?? "",
      text_color: rawExtraction?.colors?.text_primary ?? rawExtraction?.text_color ?? rawExtraction?.body_color ?? "",
    };

    const systemMsg = `You are editing an existing HTML email.
Apply only the change described. Do not rewrite sections not mentioned.
Maintain all inline styles, table structure, and Gmail dark mode fixes.
The email must continue to match the brand reference images.
The outermost wrapper table must use width="100%" with max-width:600px — never a fixed width:600px.
CONSISTENCY RULE: All images must have the same padding treatment — either all full-bleed or all with equal side padding. Never mix.
DESIGN COHESION: All text alignment within a section must be consistent. Never use raw gray body text. Bullet points in centered layouts must be centered (use pill/chip design).
BUTTONS: Use the brand's button border-radius value. Width must be auto with generous horizontal padding (32-48px). NEVER full-width. Minimum body text: 16px (recommended 16-18px).
LOGO: Logo images must be max-width:150px, centered, never stretched or cropped.
FOOTER: Every email must have a footer with brand name, unsubscribe link (#unsubscribe), and address placeholder. It must be a separate section from main content.

BRAND VALUES TO ENFORCE:
- Card/container border-radius: ${brandValues.card_radius}px everywhere
- Button border-radius: ${brandValues.button_radius}px
${brandValues.accent_color ? `- Accent color: ${brandValues.accent_color}` : ""}
${brandValues.text_color ? `- Body text color: ${brandValues.text_color} — never generic gray` : ""}

After making the requested change, also audit the ENTIRE email for:
- Consistent border-radius on all cards/containers
- No images with excessive negative space (remove or suggest cropping)
- Consistent image padding treatment
- Proper footer separation
- Buttons must NOT be full-width

Return only the complete updated HTML. No commentary. No markdown fences.`;

    const userContent: any[] = [];
    if (imageBlocks.length > 0) userContent.push(...imageBlocks);
    const imageRulesText = embeddableUrls.length > 0
      ? `Image URL rules:\n- Reference screenshots above are for STYLE only — never embed them.\n- Never invent or use external stock URLs.\n- For <img src> values, use ONLY from these brand asset URLs:\n${embeddableUrls.join("\n")}`
      : "Image URL rules:\n- No approved image URLs exist, so do not add new <img> tags.";

    userContent.push({
      type: "text",
      text: `Brand rules: ${profile.system_prompt}\n\n${imageRulesText}\n\nCurrent HTML:\n${currentHtml}\n\nChange requested: ${message}\n\nReturn only the updated HTML.`,
    });

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
        system: systemMsg,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    let html = result.content?.[0]?.text || "";
    html = html.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();

    html = await rehostHtmlImagesWithImageKit(html, {
      campaignId,
      imagekitPrivateKey: IMAGEKIT_PRIVATE_KEY,
      fallbackImageUrls: embeddableUrls,
    });

    const history = Array.isArray(campaign.html_history) ? campaign.html_history : [];
    history.push(campaign.html);

    await supabase.from("campaigns").update({
      html,
      html_history: history,
    }).eq("id", campaignId);

    await supabase.from("chat_messages").insert([
      { campaign_id: campaignId, role: "user", content: message },
      { campaign_id: campaignId, role: "assistant", content: "Changes applied." },
    ]);

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
