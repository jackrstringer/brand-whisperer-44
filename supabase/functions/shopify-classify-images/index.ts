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

/**
 * Build an ImageKit transformation URL from an array of transform strings.
 * Each transform is like "e-bgremove", "w-600", "fo-auto", etc.
 * They get joined as: ?tr=e-bgremove:w-600:fo-auto
 */
function buildImageKitUrl(baseUrl: string, transforms: string[]): string {
  if (!baseUrl || transforms.length === 0) return baseUrl;
  // ImageKit chain transforms with commas in path-based or colons in query-based
  const trString = transforms.join(",");
  return baseUrl.includes("?")
    ? `${baseUrl}&tr=${trString}`
    : `${baseUrl}?tr=${trString}`;
}

const CLASSIFICATION_PROMPT = `Analyze this product image for an email marketing asset library.

Your job is to determine:
1. What kind of image this is
2. Whether it's immediately usable as a clean product photo
3. If NOT immediately usable, whether the product is still visible and could be RESCUED via image processing

CRITICAL: Do NOT just reject images. Many images with text overlays, icons, or marketing elements still contain a perfectly good product photograph underneath. Your job is to identify SALVAGEABLE images and prescribe how to fix them.

RESCUE STRATEGIES (when the image has issues but contains a visible product):
- "bg_remove" — Remove background to isolate the product (works when product is clearly visible but has a cluttered/busy background or text around it)
- "smart_crop" — Use AI smart cropping to focus on the product area, cutting away text/icons at edges (works when text/graphics are at the margins, not covering the product)
- "bg_remove_and_crop" — Remove background AND crop to product (best for images where product is visible but surrounded by marketing elements)
- "crop_top" — Crop away the top portion (text/headers at top, product at bottom)
- "crop_bottom" — Crop away the bottom portion (text/callouts at bottom, product at top)
- "none" — No rescue possible (product is completely obscured, or this is pure infographic/chart with no real product photo)

Return JSON:
{
  "image_type": "product_isolated" | "product_lifestyle" | "product_detail" | "group_shot" | "packaging" | "model_wearing" | "flat_lay" | "marketing_collateral" | "other",
  "background_type": "white" | "transparent" | "studio" | "lifestyle" | "other",
  "has_clean_background": true/false,
  "has_text_overlay": true/false,
  "has_icons_or_graphics": true/false,
  "is_marketing_collateral": true/false,
  "is_usable_product_photo": true/false (true ONLY if clean with zero text/icons/graphics),
  "has_salvageable_product": true/false (true if a real product is visible in the image even if it has overlays — most product images with text ARE salvageable),
  "rescue_strategy": "bg_remove" | "smart_crop" | "bg_remove_and_crop" | "crop_top" | "crop_bottom" | "none",
  "rescue_notes": "Brief explanation of what processing would recover a usable product shot",
  "product_position": "center" | "top" | "bottom" | "left" | "right" | "full" (where the actual product is in the frame),
  "text_position": "top" | "bottom" | "overlay" | "margins" | "none" (where text/graphics are located),
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
              model: "claude-sonnet-4-20250514",
              max_tokens: 1024,
              system: `You are classifying product images for an email marketing asset library. 

KEY PRINCIPLE: Your goal is to MAXIMIZE usable product images, not reject them. Many images with text overlays or marketing elements still contain excellent product photography that can be rescued via image processing (background removal, smart cropping, etc.).

- If the image is a clean product photo with no text/icons → mark as usable
- If the image has text/icons BUT the product is clearly visible → mark as salvageable and prescribe a rescue strategy
- Only mark as truly unsalvageable if the product is completely obscured or the image is purely a chart/infographic with no real product photograph

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
          const isSalvageable = !isUsable && c.has_salvageable_product === true && c.rescue_strategy !== "none";

          // Build processed_url with appropriate ImageKit transforms
          let processedUrl: string | null = null;
          let rescueTransforms: string | null = null;

          if (img.imagekit_url) {
            if (isUsable && c.background_removal_recommended) {
              // Clean photo but needs bg removal for hero use
              const transforms = ["e-bgremove"];
              processedUrl = buildImageKitUrl(img.imagekit_url, transforms);
              rescueTransforms = transforms.join(",");
            } else if (isSalvageable) {
              // Salvageable image — apply rescue transforms
              const transforms = buildRescueTransforms(c.rescue_strategy, c.product_position);
              processedUrl = buildImageKitUrl(img.imagekit_url, transforms);
              rescueTransforms = transforms.join(",");
            }
          }

          // Determine final status
          let processingStatus: string;
          if (isUsable) {
            processingStatus = "ready";
            classified++;
          } else if (isSalvageable) {
            processingStatus = "ready"; // Rescued images are usable via processed_url
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
              rescue_strategy: isSalvageable ? c.rescue_strategy : null,
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
        console.warn(`Product ${productId}: no usable or rescued images found`);
        continue;
      }

      // Prefer natively clean images over rescued ones
      const cleanImages = readyImages.filter((i) => i.is_usable_product_photo === true);
      const pool = cleanImages.length > 0 ? cleanImages : readyImages;

      // Pick best hero: transparent isolated > white isolated > any isolated > hero > first
      const transparentIsolated = pool.find((i) => i.image_type === "product_isolated" && i.has_transparent_bg);
      const whiteIsolated = pool.find((i) => i.image_type === "product_isolated" && i.has_white_bg);
      const anyIsolated = pool.find((i) => i.image_type === "product_isolated");
      const heroImg = pool.find((i) => i.usable_as_hero);
      const best = transparentIsolated || whiteIsolated || anyIsolated || heroImg || pool[0];

      // Ensure best hero has a processed_url with bg removal
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
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

/**
 * Build ImageKit transform array based on rescue strategy.
 * Uses ImageKit's AI capabilities:
 * - e-bgremove: AI background removal
 * - fo-auto: AI smart crop (focus on main subject)
 * - cm-extract with coordinates: extract a region
 */
function buildRescueTransforms(strategy: string, productPosition?: string): string[] {
  switch (strategy) {
    case "bg_remove":
      // Background removal isolates the product, effectively removing surrounding text/icons
      return ["e-bgremove"];

    case "smart_crop":
      // AI smart crop focuses on the product, cutting away text at margins
      return ["w-800", "h-800", "fo-auto", "c-maintain_ratio"];

    case "bg_remove_and_crop":
      // Best combo: remove bg first, then smart crop to tight product bounds
      return ["e-bgremove", "w-800", "h-800", "fo-auto", "c-maintain_ratio"];

    case "crop_top":
      // Product is at bottom, crop away top text/headers
      // Use smart crop focused on bottom portion
      return ["w-800", "h-600", "fo-auto", "c-maintain_ratio"];

    case "crop_bottom":
      // Product is at top, crop away bottom text/callouts
      return ["w-800", "h-600", "fo-auto", "c-maintain_ratio"];

    default:
      // Fallback: just try bg removal as it handles most cases
      return ["e-bgremove"];
  }
}
