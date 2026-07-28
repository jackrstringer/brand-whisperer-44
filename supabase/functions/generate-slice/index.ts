// Phase 3: generates one image slice via GPT Image 2 through the Lovable AI
// Gateway, uploads the final PNG to storage, and writes it back to the slice row.
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

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function generateImageWithGateway(prompt: string, size: string): Promise<string> {
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
    throw new Error(`AI Gateway image failed [${res.status}]: ${errBody.slice(0, 600)}`);
  }
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`AI Gateway returned no image data: ${JSON.stringify(data).slice(0, 400)}`);
  return b64;
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

    const prompt = buildSlicePrompt({
      designSystem: campaign.design_system as DesignSystem,
      archetypeTemplate: archetype?.composition_template || "A clean, on-brand marketing image.",
      slice: planItem,
      brandName: brand?.name || "Brand",
      industry: brand?.industry || undefined,
      priorSliceUrls: priorUrls,
    });
    const size = aspectRatioToImageSize(planItem.aspect_ratio);

    const b64 = await generateImageWithGateway(prompt, size);
    const bytes = base64ToBytes(b64);

    const path = `campaigns/${campaignId}/slices/${slice.position}-${sliceId}.png`;
    const { error: upErr } = await supabase.storage
      .from("brand-assets")
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);

    await supabase.from("campaign_slices").update({
      image_url: urlData.publicUrl,
      prompt_used: prompt,
      generation_status: "complete",
    }).eq("id", sliceId);
  } catch (err: any) {
    console.error(`[generate-slice] ${sliceId} error:`, err);
    await supabase.from("campaign_slices").update({
      generation_status: "failed",
      last_error: (err?.message || String(err)).slice(0, 1500),
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