// Phase 3: generates one image slice via GPT Image 2 through the Lovable AI
// Gateway (or Nano Banana 2 when brand-asset grounding is required), uploads
// the final PNG to storage, and writes it back to the slice row. Includes a
// 2-attempt retry loop with a Claude-driven moderation-fallback brief rewrite,
// matching the Blocklab pipeline architecture.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildSlicePrompt, aspectRatioToImageSize, DesignSystem, SlicePlanItem } from "../_shared/imageEmailPrompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Text-only generation via OpenAI gpt-image-2 (used for pure-typography slices). */
async function generateImageOpenAI(prompt: string, size: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-image-2",
      prompt,
      size,
      quality: "high",
      n: 1,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    const isMod = /content_policy|moderation|safety/i.test(errBody);
    throw new Error(`${isMod ? "MODERATION_BLOCKED" : "GATEWAY_FAILED"}::AI Gateway image failed [${res.status}]: ${errBody.slice(0, 600)}`);
  }
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`AI Gateway returned no image data: ${JSON.stringify(data).slice(0, 400)}`);
  return b64;
}

/** Grounded generation via Gemini Nano Banana 2 — accepts image URL references
 *  natively via the chat-completions image shape so brand assets (logos, product
 *  shots, prior slices) are reproduced faithfully instead of hallucinated. */
async function generateImageGeminiGrounded(prompt: string, referenceUrls: string[]): Promise<string> {
  const content: any[] = [{ type: "text", text: prompt }];
  for (const url of referenceUrls.slice(0, 6)) {
    content.push({ type: "image_url", image_url: { url } });
  }
  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image",
      messages: [{ role: "user", content }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    const isMod = /content_policy|moderation|safety/i.test(errBody);
    throw new Error(`${isMod ? "MODERATION_BLOCKED" : "GATEWAY_FAILED"}::Gemini image failed [${res.status}]: ${errBody.slice(0, 600)}`);
  }
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`Gemini returned no image data: ${JSON.stringify(data).slice(0, 400)}`);
  return b64;
}

/** Ask Claude to fully rewrite a brief that hit moderation, stripping the
 *  scene/lifestyle description entirely and falling back to a pure product-cutout
 *  composition on the brand palette. */
async function rewriteBriefForFallback(originalBrief: string, headline: string, brandName: string): Promise<string> {
  if (!ANTHROPIC_KEY) return `Simple product-cutout composition of ${brandName}'s product on a solid brand-color background. Include the headline "${headline}" in the brand's typography. No people, no lifestyle scene, no complex environment.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `The following email-slice composition brief was rejected by an image model for content policy reasons (likely due to lifestyle/scene content or a real-person depiction). Rewrite it as a SAFE product-cutout composition: no people, no lifestyle scene, no environment — just the product on a solid brand-color background, with the headline and any provided copy laid out in the brand's typography.\n\nBRAND: ${brandName}\nHEADLINE (must appear): ${headline}\nORIGINAL BRIEF: ${originalBrief}\n\nReturn ONLY the rewritten brief, no preamble.`,
        }],
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const text = data?.content?.[0]?.text?.trim();
    return text || `Simple product-cutout of ${brandName}'s product on a solid brand-color background. Include the headline "${headline}" in the brand's typography.`;
  } catch (e) {
    console.error("[generate-slice] brief rewrite failed:", e);
    return `Simple product-cutout composition of ${brandName}'s product on a solid brand-color background. Include the headline "${headline}" in the brand's typography.`;
  }
}

async function runGenerateSlice(sliceId: string, campaignId: string) {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    await supabase.from("campaign_slices")
      .update({ generation_status: "generating", last_error: null })
      .eq("id", sliceId);

    const { data: slice, error: sErr } = await supabase
      .from("campaign_slices").select("*").eq("id", sliceId).single();
    if (sErr || !slice) throw new Error(`Slice not found: ${sErr?.message}`);

    const { data: campaign } = await supabase
      .from("campaigns").select("brand_id, design_system, slice_plan").eq("id", campaignId).single();
    if (!campaign?.design_system) throw new Error("Campaign missing design_system");

    const { data: brand } = await supabase
      .from("brands").select("name, industry").eq("id", campaign.brand_id).single();

    // Grab archetype composition template
    const { data: archetype } = await supabase
      .from("email_slice_archetypes")
      .select("composition_template")
      .eq("slug", slice.archetype_slug)
      .maybeSingle();

    // Grab prior completed slice URLs for visual continuity references
    const { data: priorSlices } = await supabase
      .from("campaign_slices")
      .select("image_url, position")
      .eq("campaign_id", campaignId)
      .lt("position", slice.position)
      .eq("generation_status", "complete")
      .order("position");
    const priorUrls = (priorSlices || [])
      .map((s: any) => s.image_url)
      .filter(Boolean) as string[];

    const planItem: SlicePlanItem = {
      position: slice.position,
      archetype_slug: slice.archetype_slug || "custom",
      aspect_ratio: slice.aspect_ratio || "4:5",
      headline_copy: slice.headline_copy || "",
      body_copy: slice.body_copy || "",
      cta_label: slice.cta_label || "",
      cta_url: slice.cta_url || "",
      composition_brief: slice.composition_brief || "",
      reference_asset_urls: Array.isArray(slice.reference_asset_urls) ? slice.reference_asset_urls : [],
    };

    const buildPrompt = (item: SlicePlanItem) => buildSlicePrompt({
      designSystem: campaign.design_system as DesignSystem,
      archetypeTemplate: archetype?.composition_template || "A clean, on-brand marketing image.",
      slice: item,
      brandName: brand?.name || "Brand",
      industry: brand?.industry || undefined,
      priorSliceUrls: priorUrls,
    });

    const size = aspectRatioToImageSize(planItem.aspect_ratio);
    const groundingUrls = [
      ...(planItem.reference_asset_urls || []),
      ...priorUrls,
    ].filter((u) => typeof u === "string" && u.startsWith("http"));

    // Retry loop: attempt 1 uses the original brief; attempt 2 on moderation
    // failure fully rewrites the brief via Claude to strip lifestyle content
    // and falls back to a product-cutout composition (Blocklab pattern).
    let b64: string | null = null;
    let usedPrompt = "";
    let lastErr: any = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const itemForAttempt = { ...planItem };
      if (attempt === 2 && lastErr && /MODERATION_BLOCKED/i.test(String(lastErr.message || lastErr))) {
        console.log(`[generate-slice] ${sliceId} attempt 2: rewriting brief after moderation block`);
        const rewritten = await rewriteBriefForFallback(planItem.composition_brief, planItem.headline_copy, brand?.name || "Brand");
        itemForAttempt.composition_brief = rewritten;
      }
      usedPrompt = buildPrompt(itemForAttempt);

      try {
        if (groundingUrls.length > 0) {
          b64 = await generateImageGeminiGrounded(usedPrompt, groundingUrls);
        } else {
          b64 = await generateImageOpenAI(usedPrompt, size);
        }
        break;
      } catch (err: any) {
        lastErr = err;
        console.warn(`[generate-slice] ${sliceId} attempt ${attempt} failed:`, err?.message?.slice(0, 300));
        // Only retry once; if attempt 2 also fails, throw.
        if (attempt === 2) throw err;
        // If the first attempt was OpenAI + non-moderation, try Gemini grounded as attempt 2 fallback.
        if (attempt === 1 && groundingUrls.length === 0 && !/MODERATION_BLOCKED/i.test(String(err.message || err))) {
          // No grounding available; second attempt is same path. Skip.
          throw err;
        }
      }
    }

    if (!b64) throw new Error("No image produced after retries");
    const bytes = base64ToBytes(b64);

    const path = `campaigns/${campaignId}/slices/${slice.position}-${sliceId}.png`;
    const { error: upErr } = await supabase.storage
      .from("brand-assets")
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);

    await supabase.from("campaign_slices").update({
      image_url: urlData.publicUrl,
      prompt_used: usedPrompt,
      generation_status: "complete",
    }).eq("id", sliceId);
  } catch (err: any) {
    console.error(`[generate-slice] ${sliceId} error:`, err);
    const msg = (err?.message || String(err)).replace(/^MODERATION_BLOCKED::/, "").replace(/^GATEWAY_FAILED::/, "");
    await supabase.from("campaign_slices").update({
      generation_status: "failed",
      last_error: msg.slice(0, 1500),
    }).eq("id", sliceId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sliceId, campaignId } = await req.json();
    if (!sliceId || !campaignId) {
      return new Response(JSON.stringify({ error: "sliceId and campaignId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(runGenerateSlice(sliceId, campaignId));
    } else {
      runGenerateSlice(sliceId, campaignId);
    }

    return new Response(JSON.stringify({ status: "generating", sliceId }), {
      status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[generate-slice] top-level:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});