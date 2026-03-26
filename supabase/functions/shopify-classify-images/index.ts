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

const CLASSIFICATION_PROMPT = `Classify this product image. Be STRICT about filtering out marketing collateral.

IMPORTANT RULES:
- Images with ANY text overlay, marketing copy, testimonial quotes, benefit callouts, comparison charts, infographics, icons, badges, or graphic design elements are NOT usable product photos. These are marketing collateral.
- Amazon A+ content panels, carousel ads, listicle graphics, before/after comparisons, and multi-panel layouts are marketing collateral.
- Only clean photographs of the product — with or without models, with or without backgrounds — qualify as usable product photos.
- A usable product photo should NEVER contain overlaid text, icons, or graphic elements.

Return JSON:
{
  "image_type": "product_isolated" | "product_lifestyle" | "product_detail" | "group_shot" | "packaging" | "model_wearing" | "flat_lay" | "marketing_collateral" | "other",
  "background_type": "white" | "transparent" | "studio" | "lifestyle" | "other",
  "has_clean_background": true/false,
  "has_text_overlay": true/false,
  "has_icons_or_graphics": true/false,
  "is_marketing_collateral": true/false,
  "is_usable_product_photo": true/false,
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
    let rejected = 0;
    const BATCH_SIZE = 10;
    const productIds = new Set<string>();

    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      const batch = images.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(batch.map(async (img) => {
        try {
          productIds.add(img.product_id);

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
              system: "You are classifying a product image for an email marketing asset library. Be STRICT: images with ANY text overlay, marketing copy, icons, badges, infographics, or graphic design elements are marketing collateral and NOT usable product photos. Only clean photographs qualify. Return ONLY valid JSON matching the schema exactly.",
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

          const isUsable = classification.is_usable_product_photo === true;

          // Determine processed_url with bg-remove if recommended and usable
          let processedUrl = null;
          if (isUsable && classification.background_removal_recommended && img.imagekit_url) {
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
              has_text_overlay: classification.has_text_overlay || false,
              is_marketing_collateral: classification.is_marketing_collateral || false,
              is_usable_product_photo: isUsable,
              processed_url: processedUrl,
              processing_status: isUsable ? "ready" : "rejected",
              classified_at: new Date().toISOString(),
            })
            .eq("id", img.id);

          if (isUsable) classified++;
          else rejected++;
        } catch (err) {
          console.error(`Classification failed for image ${img.id}:`, err);
          await supabase
            .from("shopify_product_images")
            .update({ processing_status: "failed" })
            .eq("id", img.id);
        }
      }));
    }

    // Post-classification curation: pick best hero per product
    for (const productId of productIds) {
      const { data: readyImages } = await supabase
        .from("shopify_product_images")
        .select("id, image_type, has_transparent_bg, has_white_bg, usable_as_hero, imagekit_url, processed_url")
        .eq("product_id", productId)
        .eq("is_usable_product_photo", true)
        .in("processing_status", ["ready"]);

      if (!readyImages || readyImages.length === 0) {
        console.warn(`Product ${productId}: no usable images found`);
        continue;
      }

      // Pick best hero: transparent isolated > white isolated > any isolated > hero lifestyle > first
      let bestId: string | null = null;
      const transparentIsolated = readyImages.find((i) => i.image_type === "product_isolated" && i.has_transparent_bg);
      const whiteIsolated = readyImages.find((i) => i.image_type === "product_isolated" && i.has_white_bg);
      const anyIsolated = readyImages.find((i) => i.image_type === "product_isolated");
      const heroLifestyle = readyImages.find((i) => i.usable_as_hero);

      const best = transparentIsolated || whiteIsolated || anyIsolated || heroLifestyle || readyImages[0];
      bestId = best.id;

      // If no transparent bg on best, auto-apply bg-remove
      if (best && !best.has_transparent_bg && best.imagekit_url && !best.processed_url) {
        const processedUrl = best.imagekit_url.includes("?")
          ? `${best.imagekit_url}&tr=bg-remove`
          : `${best.imagekit_url}?tr=bg-remove`;
        await supabase
          .from("shopify_product_images")
          .update({ processed_url: processedUrl })
          .eq("id", best.id);
      }

      // Update product with best hero
      await supabase
        .from("shopify_products")
        .update({ best_hero_image_id: bestId })
        .eq("id", productId);
    }

    return new Response(JSON.stringify({ classified, rejected, total: images.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("shopify-classify-images error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
