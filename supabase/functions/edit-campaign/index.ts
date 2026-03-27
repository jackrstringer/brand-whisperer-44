import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { rehostHtmlImagesWithImageKit } from "../_shared/imagekit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PERMANENT_HOSTS = ["ik.imagekit.io", ".supabase.co/storage"];

function isAlreadyHosted(url: string): boolean {
  return PERMANENT_HOSTS.some((host) => url.includes(host));
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
      if ((resp.status === 529 || resp.status === 503) && attempt < maxRetries) {
        console.warn(`[callAnthropic] got ${resp.status}, retrying in ${(attempt + 1) * 5}s...`);
        await resp.text();
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

    const { campaignId, message, currentHtml, attachedImageUrls, reference } = await req.json();

    // FIX 2: Fetch campaign first (need brand_id), then parallelize the rest
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();
    if (cErr || !campaign) throw new Error("Campaign not found");

    // Parallelize all reads that depend on brand_id
    const [profileResult, brandAssetsResult, productAssetsResult, brandResult] = await Promise.all([
      supabase.from("brand_profiles").select("*").eq("brand_id", campaign.brand_id).single(),
      supabase.from("brand_assets").select("url, category").eq("brand_id", campaign.brand_id),
      supabase.from("product_assets").select("url").eq("brand_id", campaign.brand_id),
      supabase.from("brands").select("user_id").eq("id", campaign.brand_id).single(),
    ]);

    const profile = profileResult.data;
    if (profileResult.error || !profile) throw new Error("Brand profile not found");

    const brandInstructions = (profile as any).brand_instructions || "";

    // Chain user_preferences after brand (needs user_id)
    let globalRules = "";
    if (brandResult.data?.user_id) {
      const { data: prefs } = await supabase.from("user_preferences").select("preferences").eq("user_id", brandResult.data.user_id).single();
      if (prefs?.preferences) {
        globalRules = (prefs.preferences as any).generation_rules || "";
      }
    }

    // FIX 5: Reference images — skip rehost for already-hosted URLs, fetch once for base64 only
    const imageBlocks: any[] = [];
    const referenceUrls = Array.isArray(profile.reference_image_urls)
      ? profile.reference_image_urls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
      : [];

    // Also include user-attached images from chat
    const userAttachedUrls = Array.isArray(attachedImageUrls)
      ? attachedImageUrls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
      : [];

    const hostedReferenceUrls = referenceUrls.slice(0, 3);
    // Attached images go first so they're most prominent
    const allImageUrls = [...userAttachedUrls.slice(0, 5), ...hostedReferenceUrls];

    for (const url of allImageUrls) {
      try {
        const imgResp = await fetch(url);
        const contentType = imgResp.headers.get("content-type") || "image/png";
        const mediaType = contentType.split(";")[0].trim();
        const buf = await imgResp.arrayBuffer();
        if (buf.byteLength > 3_800_000) {
          console.log(`[edit-campaign] Skipping oversized image (${(buf.byteLength / 1_000_000).toFixed(1)}MB)`);
          continue;
        }
        const b64 = arrayBufferToBase64(buf);
        imageBlocks.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: b64 },
        });
      } catch { /* skip */ }
    }

    // Build unified asset catalog (brand + product)
    const brandAssetUrls = (brandAssetsResult.data || [])
      .map((a: any) => a.url)
      .filter((url: string) => typeof url === "string" && url.trim().length > 0)
      .slice(0, 15);

    const productAssetUrls = (productAssetsResult.data || [])
      .map((a: any) => a.url)
      .filter((url: string) => typeof url === "string" && url.trim().length > 0);

    const embeddableUrls = [...brandAssetUrls, ...productAssetUrls];

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

    // Reference campaign images if provided
    if (reference && reference.image_urls && reference.image_urls.length > 0) {
      const strength = reference.strength || 5;
      let refLabel = "TONAL REFERENCE";
      if (strength >= 4 && strength <= 6) refLabel = "STRUCTURAL REFERENCE";
      else if (strength >= 7 && strength <= 9) refLabel = "STRUCTURAL TEMPLATE";
      else if (strength >= 10) refLabel = "DIRECT TEMPLATE";

      userContent.push({ type: "text", text: `[${refLabel} — strength ${strength}/10] The following campaign is provided as a reference. ${strength >= 7 ? "Closely follow its layout and structure." : strength >= 4 ? "Borrow its general section flow." : "Use it for subtle tonal inspiration only."}` });

      for (const url of reference.image_urls.slice(0, 5)) {
        try {
          const imgResp = await fetch(url);
          const contentType = imgResp.headers.get("content-type") || "image/jpeg";
          const mediaType = contentType.split(";")[0].trim();
          const buf = await imgResp.arrayBuffer();
          if (buf.byteLength > 3_800_000) continue;
          const b64 = arrayBufferToBase64(buf);
          userContent.push({ type: "image", source: { type: "base64", media_type: mediaType, data: b64 } });
        } catch {}
      }
    }

    const hasUserAttached = userAttachedUrls.length > 0;
    const imageRulesText = embeddableUrls.length > 0
      ? `Image URL rules:\n${hasUserAttached ? "- The first images above are USER-ATTACHED reference images for this specific edit request. Use them as visual reference for the requested change.\n" : ""}- Brand reference screenshots are for STYLE only — never embed them.\n- Never invent or use external stock URLs.\n- For <img src> values, use ONLY from these approved asset URLs:\n${embeddableUrls.join("\n")}${hasUserAttached ? "\n" + userAttachedUrls.join("\n") : ""}`
      : `Image URL rules:\n${hasUserAttached ? "- The images above are USER-ATTACHED reference images. You may use their URLs as <img src> values if appropriate.\n" + userAttachedUrls.join("\n") + "\n" : ""}- No other approved image URLs exist, so do not add new <img> tags.`;

    let extraRules = "";
    if (brandInstructions) extraRules += `\n\nBrand-specific instructions:\n${brandInstructions}`;
    if (globalRules) extraRules += `\n\nGlobal generation rules:\n${globalRules}`;

    userContent.push({
      type: "text",
      text: `Brand rules: ${profile.system_prompt}${extraRules}\n\n${imageRulesText}\n\nCurrent HTML:\n${currentHtml}\n\nChange requested: ${message}\n\nReturn only the updated HTML.`,
    });

    // FIX 1: max_tokens 16384, FIX 6: callAnthropic with timeout
    const response = await callAnthropic({
      model: "claude-sonnet-4-6",
      max_tokens: 16384,
      system: systemMsg,
      messages: [{ role: "user", content: userContent }],
    }, ANTHROPIC_API_KEY);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    let html = result.content?.[0]?.text || "";
    html = html.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();

    // FIX 5: rehostHtmlImagesWithImageKit now skips already-hosted URLs
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
