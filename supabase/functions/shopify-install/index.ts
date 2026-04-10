import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brandId, shopDomain } = await req.json();
    if (!brandId || !shopDomain) {
      return new Response(JSON.stringify({ error: "brandId and shopDomain required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SHOPIFY_API_KEY = Deno.env.get("SHOPIFY_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    if (!SHOPIFY_API_KEY) throw new Error("SHOPIFY_API_KEY not configured");

    // Normalize shop domain
    let shop = shopDomain.trim().toLowerCase();
    shop = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!shop.includes(".")) shop = `${shop}.myshopify.com`;

    const redirectUri = `${SUPABASE_URL}/functions/v1/shopify-connect`;
    const scopes = "read_products,read_product_listings";
    const state = brandId; // Used to route back after OAuth

    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    return new Response(JSON.stringify({ installUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("shopify-install error:", error);
    return new Response(JSON.stringify({ error: (error as any).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
