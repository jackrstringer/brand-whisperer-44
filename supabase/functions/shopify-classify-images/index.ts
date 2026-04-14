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

function buildImageKitUrl(baseUrl: string, transforms: string[]): string {
  if (!baseUrl || transforms.length === 0) return baseUrl;
  const trString = transforms.join(",");
  return baseUrl.includes("?")
    ? `${baseUrl}&tr=${trString}`
    : `${baseUrl}?tr=${trString}`;
}

const CLASSIFICATION_PROMPT = `Analyze this product image for an email marketing asset library.

Your job is to determine:
1. What kind of image this is
2. Whether it's immediately usable as a clean product photo
3. If NOT immediately usable, whether the product could be rescued ONLY via background removal

CRITICAL RULES:
- Images with ANY text overlay, marketing copy, testimonial quotes, benefit callouts, comparison charts, icons, badges, infographics, or graphic design elements are NOT usable product photos.
- Only clean photographs of the product — with or without models, with or without backgrounds — qualify as usable product photos.
- The ONLY rescue method available is BACKGROUND REMOVAL, which isolates the product silhouette and discards everything else (background, surrounding text, icons around the product).
- Background removal CANNOT fix text or icons that are drawn DIRECTLY ON TOP of the product body itself. If text/icons are overlaid on the product surface, it is NOT salvageable.
- Background removal CAN fix: text/icons in the background area, text below/above/beside the product, busy backgrounds, marketing borders.

Return JSON:
{
  "image_type": "product_isolated" | "product_lifestyle" | "product_detail" | "group_shot" | "packaging" | "model_wearing" | "flat_lay" | "marketing_collateral" | "other",
  "background_type": "white" | "transparent" | "studio" | "lifestyle" | "other",
  "has_text_overlay": true/false,
  "has_icons_or_graphics": true/false,
  "is_marketing_collateral": true/false,
  "is_usable_product_photo": true/false (true ONLY if clean with zero text/icons/graphics),
  "has_salvageable_product": true/false (true ONLY if a real product is clearly visible AND text/icons are NOT on the product body itself — meaning bg removal would isolate a clean product),
  "text_position": "background" | "overlay" | "margins" | "none" ("overlay" = text is on the product body, "background"/"margins" = text is around/behind the product),
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
    let rescued = 0;
    let rejected = 0;
    const BATCH_SIZE = 10;
    const productIds = new Set<string>();

    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      const batch = images.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(batch.map(async (img) => {
        try {
          productIds.add(img.product_id);

          await supabase
            .from("shopify_product_images")
            .update({ processing_status: "processing" })
            .eq("id", img.id);

          const imageUrl = img.imagekit_url || img.original_url;
          const imgResp = await fetch(imageUrl);
          if (!imgResp.ok) throw new Error(`Failed to fetch image: ${imgResp.status}`);
          const imgBytes = await imgResp.arrayBuffer();
          const contentType = imgResp.headers.get("content-type") || "image/jpeg";
          const mediaType = contentType.split(";")[0].trim();
          const base64 = arrayBufferToBase64(imgBytes);

          const resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 1024,
              system: `You are classifying product images for an email marketing asset library.

STRICT RULES:
- If the image is a clean product photo with no text/icons/graphics → is_usable_product_photo = true
- If the image has text/icons but they are ONLY in the background/margins (not on the product body) AND a real product is clearly visible → has_salvageable_product = true (background removal will isolate the product)
- If text/icons are overlaid DIRECTLY ON the product body → has_salvageable_product = false (background removal cannot fix this)
- If the image is purely a chart, infographic, listicle, comparison table, or carousel ad with no real product photograph → has_salvageable_product = false
- NOTHING with text should ever be marked as is_usable_product_photo = true

Return ONLY valid JSON matching the schema exactly.`,
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
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON found in Claude response");

          const c = JSON.parse(jsonMatch[0]);
          const isUsable = c.is_usable_product_photo === true;
          
          // Only bg_remove is a valid rescue. Text on product body (overlay) = not salvageable.
          const isSalvageable = !isUsable 
            && c.has_salvageable_product === true 
            && c.text_position !== "overlay";

          let processedUrl: string | null = null;
          let rescueTransforms: string | null = null;

          if (img.imagekit_url) {
            if (isUsable && c.background_removal_recommended) {
              const transforms = ["e-bgremove"];
              processedUrl = buildImageKitUrl(img.imagekit_url, transforms);
              rescueTransforms = transforms.join(",");
            } else if (isSalvageable) {
              // Only strategy is bg_remove
              const transforms = ["e-bgremove"];
              processedUrl = buildImageKitUrl(img.imagekit_url, transforms);
              rescueTransforms = transforms.join(",");
            }
          }

          let processingStatus: string;
          if (isUsable) {
            processingStatus = "ready";
            classified++;
          } else if (isSalvageable) {
            processingStatus = "ready";
            rescued++;
          } else {
            processingStatus = "rejected";
            rejected++;
          }

          await supabase
            .from("shopify_product_images")
            .update({
              image_type: c.image_type,
              has_white_bg: c.background_type === "white",
              has_transparent_bg: c.background_type === "transparent",
              background_type: c.background_type,
              subject_description: c.subject_description,
              variant_shown: c.variant_shown || null,
              dominant_colors: c.dominant_colors || [],
              usable_as_hero: c.usable_as_hero,
              usable_as_product_shot: c.usable_as_product_shot,
              confidence: c.confidence,
              has_text_overlay: c.has_text_overlay || false,
              is_marketing_collateral: c.is_marketing_collateral || false,
              is_usable_product_photo: isUsable,
              has_salvageable_product: isSalvageable || isUsable,
              rescue_strategy: isSalvageable ? "bg_remove" : null,
              rescue_transforms: rescueTransforms,
              processed_url: processedUrl,
              processing_status: processingStatus,
              classified_at: new Date().toISOString(),
            })
            .eq("id", img.id);
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
        .select("id, image_type, has_transparent_bg, has_white_bg, usable_as_hero, imagekit_url, processed_url, is_usable_product_photo, rescue_strategy")
        .eq("product_id", productId)
        .eq("processing_status", "ready");

      if (!readyImages || readyImages.length === 0) {
        console.warn(`Product ${productId}: no usable images found`);
        continue;
      }

      // Prefer natively clean images over rescued ones
      const cleanImages = readyImages.filter((i) => i.is_usable_product_photo === true);
      const pool = cleanImages.length > 0 ? cleanImages : readyImages;

      const transparentIsolated = pool.find((i) => i.image_type === "product_isolated" && i.has_transparent_bg);
      const whiteIsolated = pool.find((i) => i.image_type === "product_isolated" && i.has_white_bg);
      const anyIsolated = pool.find((i) => i.image_type === "product_isolated");
      const heroImg = pool.find((i) => i.usable_as_hero);
      const best = transparentIsolated || whiteIsolated || anyIsolated || heroImg || pool[0];

      if (best && !best.has_transparent_bg && best.imagekit_url && !best.processed_url) {
        const processedUrl = buildImageKitUrl(best.imagekit_url, ["e-bgremove"]);
        await supabase
          .from("shopify_product_images")
          .update({ processed_url: processedUrl })
          .eq("id", best.id);
      }

      await supabase
        .from("shopify_products")
        .update({ best_hero_image_id: best.id })
        .eq("id", productId);
    }

    return new Response(JSON.stringify({ classified, rescued, rejected, total: images.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("shopify-classify-images error:", error);
    return new Response(JSON.stringify({ error: (error as any).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
