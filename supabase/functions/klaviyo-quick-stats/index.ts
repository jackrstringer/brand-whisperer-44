import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const REVISION = "2024-02-15";

async function klaviyoGet(path: string, apiKey: string): Promise<any> {
  const url = path.startsWith("http") ? path : `${KLAVIYO_API_BASE}${path}`;
  let res = await fetch(url, {
    headers: {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "revision": REVISION,
      "Accept": "application/json",
    },
  });
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    res = await fetch(url, {
      headers: {
        "Authorization": `Klaviyo-API-Key ${apiKey}`,
        "revision": REVISION,
        "Accept": "application/json",
      },
    });
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Klaviyo ${res.status}: ${body}`);
  }
  return res.json();
}

async function klaviyoPost(path: string, apiKey: string, body: any): Promise<any> {
  const url = `${KLAVIYO_API_BASE}${path}`;
  let res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "revision": REVISION,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Klaviyo-API-Key ${apiKey}`,
        "revision": REVISION,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
    });
  }
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Klaviyo ${res.status}: ${errBody}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brandId, apiKey } = await req.json();
    if (!brandId || !apiKey) throw new Error("brandId and apiKey are required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] + "T00:00:00+00:00";

    // Run all 3 calls in parallel
    const [profilesResult, campaignsResult, revenueResult] = await Promise.allSettled([
      // Call 1: Active profiles count
      klaviyoGet(`/profiles/?page[size]=1`, apiKey)
        .then(data => data?.meta?.total ?? null),

      // Call 2: Campaigns sent in last 30 days
      klaviyoGet(
        `/campaigns/?filter=equals(messages.channel,'email'),equals(status,'sent'),greater-or-equal(updated_at,${thirtyDaysAgo})&page[size]=1`,
        apiKey
      ).then(data => data?.meta?.total ?? null),

      // Call 3: Revenue in last 30 days
      (async () => {
        // First get the Placed Order metric ID
        const metricsData = await klaviyoGet(`/metrics/?filter=contains(name,'Placed Order')`, apiKey);
        const metricId = metricsData?.data?.[0]?.id;
        if (!metricId) return null;

        // Then fetch aggregate revenue
        const aggData = await klaviyoPost(`/metric-aggregates/`, apiKey, {
          data: {
            type: "metric-aggregate",
            attributes: {
              metric_id: metricId,
              interval: "month",
              page_size: 1,
              measurements: ["sum_value"],
              filter: `greater-or-equal(datetime,${thirtyDaysAgo})`,
              timezone: "UTC",
            },
          },
        });

        // Sum all sum_value measurements
        const measurements = aggData?.data?.attributes?.data;
        if (!measurements || !Array.isArray(measurements)) return null;
        let total = 0;
        for (const m of measurements) {
          if (m.measurements?.sum_value) {
            for (const v of m.measurements.sum_value) {
              total += v || 0;
            }
          }
        }
        return total;
      })(),
    ]);

    const quickStats = {
      active_profiles: profilesResult.status === "fulfilled" ? profilesResult.value : null,
      campaigns_last_30d: campaignsResult.status === "fulfilled" ? campaignsResult.value : null,
      revenue_last_30d: revenueResult.status === "fulfilled" ? revenueResult.value : null,
      fetched_at: new Date().toISOString(),
    };

    // Log any failures
    if (profilesResult.status === "rejected") console.warn("[quick-stats] Profiles failed:", profilesResult.reason?.message);
    if (campaignsResult.status === "rejected") console.warn("[quick-stats] Campaigns failed:", campaignsResult.reason?.message);
    if (revenueResult.status === "rejected") console.warn("[quick-stats] Revenue failed:", revenueResult.reason?.message);

    // Save to klaviyo_connections
    await supabase
      .from("klaviyo_connections")
      .update({ quick_stats: quickStats })
      .eq("brand_id", brandId);

    console.log("[quick-stats] Stats saved for brand", brandId, quickStats);

    return new Response(JSON.stringify({ success: true, stats: quickStats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[quick-stats] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
