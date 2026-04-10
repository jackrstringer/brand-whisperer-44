import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IMAGEKIT_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";

async function uploadToImageKit(imageUrl: string, fileName: string, folder: string, imagekitPrivateKey: string): Promise<string | null> {
  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) return null;
    const bytes = await resp.arrayBuffer();
    const contentType = resp.headers.get("content-type") || "image/jpeg";

    const formData = new FormData();
    formData.append("file", new Blob([bytes], { type: contentType }));
    formData.append("fileName", fileName);
    formData.append("folder", folder);
    formData.append("useUniqueFileName", "true");

    const uploadResp = await fetch(IMAGEKIT_UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${imagekitPrivateKey}:`)}` },
      body: formData,
    });

    if (!uploadResp.ok) {
      console.warn(`ImageKit upload failed: ${await uploadResp.text()}`);
      return null;
    }
    const result = await uploadResp.json();
    return result?.url ?? null;
  } catch (err) {
    console.warn("ImageKit upload error:", err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brandId } = await req.json();
    if (!brandId) {
      return new Response(JSON.stringify({ error: "brandId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const IMAGEKIT_PRIVATE_KEY = Deno.env.get("IMAGEKIT_PRIVATE_KEY")!;

    // Fetch connection
    const { data: conn } = await supabase
      .from("shopify_connections")
      .select("*")
      .eq("brand_id", brandId)
      .single();

    if (!conn) {
      return new Response(JSON.stringify({ error: "No Shopify connection found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const shop = conn.shop_domain;
    const token = conn.access_token;

    // Paginate through all products
    let productsSynced = 0;
    let imagesQueued = 0;
    let nextUrl: string | null = `https://${shop}/admin/api/2024-01/products.json?limit=250`;

    while (nextUrl) {
      const resp: Response = await fetch(nextUrl, {
        headers: { "X-Shopify-Access-Token": token },
      });

      if (!resp.ok) {
        if (resp.status === 401) {
          // Token invalid — mark as disconnected
          await supabase.from("shopify_connections").delete().eq("brand_id", brandId);
          return new Response(JSON.stringify({ error: "Shopify token invalid — disconnected" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        throw new Error(`Shopify API error: ${resp.status}`);
      }

      const data = await resp.json();
      const products = data.products || [];

      for (const product of products) {
        // Upsert product
        const { data: upserted } = await supabase
          .from("shopify_products")
          .upsert({
            brand_id: brandId,
            shopify_product_id: String(product.id),
            title: product.title,
            handle: product.handle,
            product_type: product.product_type || null,
            tags: product.tags ? product.tags.split(", ").filter(Boolean) : [],
            variants: product.variants?.map((v: any) => ({
              id: String(v.id),
              title: v.title,
              price: v.price,
              sku: v.sku,
            })) || [],
            status: product.status || "active",
            shopify_updated_at: product.updated_at,
            synced_at: new Date().toISOString(),
          }, { onConflict: "brand_id,shopify_product_id" })
          .select("id")
          .single();

        if (!upserted) continue;
        productsSynced++;

        // Process images
        const images = product.images || [];
        for (const img of images) {
          const shopifyImageId = String(img.id);
          const originalUrl = img.src;

          // Rehost to ImageKit
          const fileName = `shopify-${product.id}-${img.id}.jpg`;
          const imagekitUrl = await uploadToImageKit(
            originalUrl,
            fileName,
            `/shopify/${brandId}`,
            IMAGEKIT_PRIVATE_KEY,
          );

          await supabase
            .from("shopify_product_images")
            .upsert({
              brand_id: brandId,
              product_id: upserted.id,
              shopify_image_id: shopifyImageId,
              original_url: originalUrl,
              imagekit_url: imagekitUrl || originalUrl,
              processing_status: "pending",
            }, { onConflict: "product_id,shopify_image_id" });

          imagesQueued++;
        }
      }

      // Follow pagination
      const linkHeader: string | null = resp.headers.get("Link");
      const nextMatch: RegExpMatchArray | null = linkHeader?.match(/<([^>]+)>;\s*rel="next"/) ?? null;
      nextUrl = nextMatch ? nextMatch[1] : null;
    }

    // Update last_synced_at
    await supabase
      .from("shopify_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("brand_id", brandId);

    // Trigger classification in background
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    fetch(`${SUPABASE_URL}/functions/v1/shopify-classify-images`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ brandId }),
    }).catch(err => console.error("Background classify trigger failed:", err));

    return new Response(JSON.stringify({ products_synced: productsSynced, images_queued: imagesQueued }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("shopify-sync-products error:", error);
    return new Response(JSON.stringify({ error: (error as any).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
