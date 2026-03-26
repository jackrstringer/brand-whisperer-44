import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

const CLASSIFICATION_PROMPT = `Classify this product image.
Return JSON:
{
  "image_type": "product_isolated" | "product_lifestyle" | "product_detail" | "group_shot" | "packaging" | "model_wearing" | "flat_lay" | "other",
  "background_type": "white" | "transparent" | "studio" | "lifestyle" | "other",
  "has_clean_background": true/false,
  "subject_description": "One sentence description of what is shown",
  "variant_shown": "string or null",
  "dominant_colors": ["#hex1", "#hex2"],
  "usable_as_hero": true/false,
  "usable_as_product_shot": true/false,
  "background_removal_recommended": true/false,
  "confidence": "high" | "medium" | "low"
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brandId, imageIds } = await req.json();
    if (!brandId) {
      return new Response(JSON.stringify({ error: "brandId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

    // Fetch pending images
    let query = supabase
      .from("shopify_product_images")
      .select("*")
      .eq("brand_id", brandId)
      .eq("processing_status", "pending");

    if (imageIds?.length) {
      query = query.in("id", imageIds);
    }

    const { data: images } = await query.limit(50);
    if (!images || images.length === 0) {
      return new Response(JSON.stringify({ classified: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let classified = 0;
    const BATCH_SIZE = 10;

    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      const batch = images.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(batch.map(async (img) => {
        try {
          // Mark as processing
          await supabase
            .from("shopify_product_images")
            .update({ processing_status: "processing" })
            .eq("id", img.id);

          // Fetch image for Claude
          const imageUrl = img.imagekit_url || img.original_url;
          const imgResp = await fetch(imageUrl);
          if (!imgResp.ok) throw new Error(`Failed to fetch image: ${imgResp.status}`);
          const imgBytes = await imgResp.arrayBuffer();
          const contentType = imgResp.headers.get("content-type") || "image/jpeg";
          const mediaType = contentType.split(";")[0].trim();
          const base64 = arrayBufferToBase64(imgBytes);

          // Call Claude vision
          const resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              max_tokens: 1024,
              system: "You are classifying a product image for an email marketing asset library. Analyze the image and return ONLY valid JSON matching the schema exactly.",
              messages: [{
                role: "user",
                content: [
                  { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
                  { type: "text", text: CLASSIFICATION_PROMPT },
                ],
              }],
            }),
          });

          if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`Claude API error: ${resp.status} - ${errText}`);
          }

          const result = await resp.json();
          const text = result.content?.[0]?.text || "";

          // Extract JSON from response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON found in Claude response");

          const classification = JSON.parse(jsonMatch[0]);

          // Determine processed_url with bg-remove if recommended
          let processedUrl = null;
          if (classification.background_removal_recommended && img.imagekit_url) {
            processedUrl = img.imagekit_url.includes("?")
              ? `${img.imagekit_url}&tr=bg-remove`
              : `${img.imagekit_url}?tr=bg-remove`;
          }

          // Update image record
          await supabase
            .from("shopify_product_images")
            .update({
              image_type: classification.image_type,
              has_white_bg: classification.background_type === "white",
              has_transparent_bg: classification.background_type === "transparent",
              background_type: classification.background_type,
              subject_description: classification.subject_description,
              variant_shown: classification.variant_shown || null,
              dominant_colors: classification.dominant_colors || [],
              usable_as_hero: classification.usable_as_hero,
              usable_as_product_shot: classification.usable_as_product_shot,
              confidence: classification.confidence,
              processed_url: processedUrl,
              processing_status: "ready",
              classified_at: new Date().toISOString(),
            })
            .eq("id", img.id);

          classified++;
        } catch (err) {
          console.error(`Classification failed for image ${img.id}:`, err);
          await supabase
            .from("shopify_product_images")
            .update({ processing_status: "failed" })
            .eq("id", img.id);
        }
      }));
    }

    return new Response(JSON.stringify({ classified, total: images.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("shopify-classify-images error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
