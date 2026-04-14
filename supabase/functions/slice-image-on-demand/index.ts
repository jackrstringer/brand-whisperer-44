// supabase/functions/slice-image-on-demand/index.ts
// On-demand Slicer wrapper for the QA pipeline (Agent 1 → Agent 4 bridge).
// Accepts a raw base64 image, runs sliceEmailImage, and returns the slices.
// No DB read or write — purely stateless, on-demand.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sliceEmailImage, type EmailSlice } from "../_shared/sliceEmailImage.ts";

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

  let imageBase64: string | undefined;
  let imageUrl: string | undefined;
  let mimeType: string;

  try {
    const body = await req.json();
    imageBase64 = body.imageBase64;
    imageUrl = body.imageUrl;
    mimeType = body.mimeType ?? "image/png";

    if (!imageBase64 && !imageUrl) {
      throw new Error("imageBase64 or imageUrl is required");
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    console.log("[slice-image-on-demand] Starting on-demand slice, mimeType:", mimeType);

    const slices: EmailSlice[] = await sliceEmailImage(
      { imageBase64, mimeType },
      Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY") ?? "",
      Deno.env.get("ANTHROPIC_API_KEY") ?? ""
    );

    console.log("[slice-image-on-demand] Produced", slices.length, "slices");

    return new Response(JSON.stringify({ slices }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[slice-image-on-demand] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
