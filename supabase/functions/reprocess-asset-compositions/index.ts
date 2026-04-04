import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Optional: scope to a specific brand
    let brandId: string | undefined;
    try {
      const body = await req.json();
      brandId = body?.brandId;
    } catch {}

    let totalSucceeded = 0;
    let totalFailed = 0;

    while (true) {
      let query = supabase
        .from("brand_assets")
        .select("id, url")
        .is("composition_data", null)
        .limit(BATCH_SIZE);

      if (brandId) {
        query = query.eq("brand_id", brandId);
      }

      const { data: assets, error } = await query;
      if (error) throw error;
      if (!assets || assets.length === 0) break;

      const results = await Promise.allSettled(
        assets.map(async (asset) => {
          const resp = await fetch(`${supabaseUrl}/functions/v1/analyze-asset-composition`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ imageUrl: asset.url, assetId: asset.id }),
          });
          if (!resp.ok) {
            const err = await resp.text();
            throw new Error(`Asset ${asset.id}: ${resp.status} - ${err}`);
          }
          await resp.json();
          return asset.id;
        })
      );

      totalSucceeded += results.filter((r) => r.status === "fulfilled").length;
      totalFailed += results.filter((r) => r.status === "rejected").length;
    }

    return new Response(
      JSON.stringify({ processed: totalSucceeded, failed: totalFailed, remaining: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("reprocess-asset-compositions error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
