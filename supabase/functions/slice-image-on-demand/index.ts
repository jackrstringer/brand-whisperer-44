// supabase/functions/slice-image-on-demand/index.ts
// On-demand Slicer wrapper. Accepts imageUrl or imageBase64,
// runs the full intelligent slicing pipeline (Vision + edges + Claude + refinement).

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
    console.log("[slice-image-on-demand] Starting intelligent slice pipeline, mode:", imageUrl ? "url" : "base64");

    const slices: EmailSlice[] = await sliceEmailImage(
      { imageBase64, imageUrl, mimeType },
      Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY") ?? "",
      Deno.env.get("ANTHROPIC_API_KEY") ?? ""
    );

    // For base64 mode, resolve any CROP: or CROP_NEEDED: placeholders
    const resolvedSlices: EmailSlice[] = [];
    for (const slice of slices) {
      // Handle standalone CROP:y_start:y_end markers from sliceEmailImage base64 mode
      const cropMatch = slice.url.match(/^CROP:(\d+):(\d+)$/);
      // Also handle legacy CROP_NEEDED: inside data URIs
      const legacyMatch = !cropMatch && slice.url.startsWith("data:") && slice.url.match(/CROP_NEEDED:(\d+):(\d+)/);
      const match = cropMatch || legacyMatch;

      if (match && imageBase64) {
        const yStart = parseInt(match[1]);
        const yEnd = parseInt(match[2]);
        const h = yEnd - yStart;
        try {
          const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
          const binary = atob(imageBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const decoded = await Image.decode(bytes);
          const cropped = decoded.clone().crop(0, yStart, decoded.width, Math.min(h, decoded.height - yStart));
          const encoded = await cropped.encode(1);
          let b64 = "";
          const chunkSize = 8192;
          for (let j = 0; j < encoded.length; j += chunkSize) {
            b64 += String.fromCharCode(...encoded.subarray(j, j + chunkSize));
          }
          b64 = btoa(b64);
          resolvedSlices.push({
            ...slice,
            url: `data:image/png;base64,${b64}`,
          });
        } catch (cropErr) {
          console.warn(`[slice-image-on-demand] Crop failed for slice ${slice.index}:`, cropErr);
          resolvedSlices.push(slice);
        }
      } else {
        resolvedSlices.push(slice);
      }
    }

    console.log("[slice-image-on-demand] Produced", resolvedSlices.length, "slices");

    return new Response(JSON.stringify({ slices: resolvedSlices }), {
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
