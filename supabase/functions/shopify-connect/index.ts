import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifyHmac(params: URLSearchParams, secret: string): Promise<boolean> {
  const hmac = params.get("hmac");
  if (!hmac) return false;

  const entries = Array.from(params.entries())
    .filter(([key]) => key !== "hmac")
    .sort(([a], [b]) => a.localeCompare(b));

  const message = entries.map(([k, v]) => `${k}=${v}`).join("&");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const computed = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");

  return computed === hmac;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const params = url.searchParams;

    const shop = params.get("shop");
    const code = params.get("code");
    const state = params.get("state"); // brandId
    const SHOPIFY_API_KEY = Deno.env.get("SHOPIFY_API_KEY")!;
    const SHOPIFY_API_SECRET = Deno.env.get("SHOPIFY_API_SECRET")!;

    if (!shop || !code || !state) {
      return new Response("Missing required OAuth parameters", { status: 400, headers: corsHeaders });
    }

    // Verify HMAC
    const valid = await verifyHmac(params, SHOPIFY_API_SECRET);
    if (!valid) {
      return new Response("HMAC verification failed", { status: 401, headers: corsHeaders });
    }

    // Exchange code for access token
    const tokenResp = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    });

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      console.error("Token exchange failed:", errText);
      return new Response("Token exchange failed", { status: 500, headers: corsHeaders });
    }

    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;
    const scope = tokenData.scope;

    // Save to shopify_connections using service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Upsert — one connection per brand
    const { error: upsertError } = await supabase
      .from("shopify_connections")
      .upsert({
        brand_id: state,
        shop_domain: shop,
        access_token: accessToken,
        scope,
        connected_at: new Date().toISOString(),
      }, { onConflict: "brand_id" });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return new Response("Failed to save connection", { status: 500, headers: corsHeaders });
    }

    // Trigger initial sync in background
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    fetch(`${SUPABASE_URL}/functions/v1/shopify-sync-products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ brandId: state }),
    }).catch(err => console.error("Background sync trigger failed:", err));

    // Redirect back to brand settings
    const frontendUrl = Deno.env.get("SITE_URL") || SUPABASE_URL.replace(".supabase.co", ".lovable.app");
    const redirectUrl = `${frontendUrl}/brands/${state}/settings?tab=shopify&connected=true`;

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: redirectUrl },
    });
  } catch (error) {
    console.error("shopify-connect error:", error);
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
