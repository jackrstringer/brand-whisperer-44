// supabase/functions/slice-reference/index.ts
// Slices a reference campaign image at upload time.
// Calls the shared sliceEmailImage utility (Agent 1 — Slicer).
// Stores results in reference_campaigns.image_slice_urls.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sliceEmailImage } from "../_shared/sliceEmailImage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let referenceCampaignId: string;

  try {
    const body = await req.json();
    referenceCampaignId = body.referenceCampaignId;
    if (!referenceCampaignId) {
      throw new Error("referenceCampaignId is required");
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Load the reference campaign row
    const { data: campaign, error: fetchError } = await supabase
      .from("reference_campaigns")
      .select("id, thumbnail_url, image_urls")
      .eq("id", referenceCampaignId)
      .single();

    if (fetchError || !campaign) {
      throw new Error(`Could not load reference campaign: ${fetchError?.message}`);
    }

    const imageUrl: string =
      (campaign as any).image_urls?.[0] || (campaign as any).thumbnail_url;
    if (!imageUrl) {
      throw new Error("Reference campaign has no image URL");
    }

    // 2. Mark as processing
    await supabase
      .from("reference_campaigns")
      .update({ slicing_status: "processing" } as any)
      .eq("id", referenceCampaignId);

    console.log("[slice-reference] Starting sliceEmailImage for:", imageUrl);

    // 3. Run shared slicer utility — ImageKit URL path
    const slices = await sliceEmailImage(
      { imageUrl },
      Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY") ?? "",
      Deno.env.get("ANTHROPIC_API_KEY") ?? ""
    );

    console.log("[slice-reference] Got", slices.length, "slices");

    // 4. Persist to DB — same columns as before, no schema change
    const { error: updateError } = await supabase
      .from("reference_campaigns")
      .update({
        image_slice_urls: slices,
        slicing_status: "complete",
      } as any)
      .eq("id", referenceCampaignId);

    if (updateError) {
      throw new Error(`Failed to save slice records: ${updateError.message}`);
    }

    console.log("[slice-reference] Done. Saved", slices.length, "slices.");

    return new Response(JSON.stringify({ ok: true, sliceCount: slices.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[slice-reference] Pipeline error:", err);

    await supabase
      .from("reference_campaigns")
      .update({ slicing_status: "failed" } as any)
      .eq("id", referenceCampaignId);

    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
