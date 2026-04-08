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

    // Track errors per stat
    const errors: Record<string, string | null> = {
      active_profiles: null,
      campaigns_last_30d: null,
      revenue_last_30d: null,
    };

    // Run all 3 calls in parallel
    const [profilesResult, campaignsResult, revenueResult] = await Promise.allSettled([
      // Call 1: Active profiles count — meta.total is at response root, not nested under data
      (async () => {
        const data = await klaviyoGet(`/profiles/?page[size]=1`, apiKey);
        console.log("[quick-stats] Profiles response keys:", Object.keys(data), "meta:", JSON.stringify(data?.meta));
        const total = data?.meta?.total ?? null;
        if (total === null) {
          throw new Error(`meta.total not found in profiles response. Keys: ${Object.keys(data).join(", ")}`);
        }
        return total;
      })(),

      // Call 2: Campaigns sent in last 30 days — status must be capitalized 'Sent'
      (async () => {
        const data = await klaviyoGet(
          `/campaigns/?filter=equals(messages.channel,'email'),equals(status,'Sent'),greater-or-equal(updated_at,${thirtyDaysAgo})&page[size]=1`,
          apiKey
        );
        console.log("[quick-stats] Campaigns response keys:", Object.keys(data), "meta:", JSON.stringify(data?.meta));
        return data?.meta?.total ?? null;
      })(),

      // Call 3: Revenue in last 30 days — fetch all metrics, find Placed Order client-side
      (async () => {
        // Fetch metrics with large page size and find Placed Order by name
        const metricsData = await klaviyoGet(`/metrics/?page[size]=100`, apiKey);
        const metrics = metricsData?.data || [];
        const placedOrderMetric = metrics.find((m: any) =>
          m.attributes?.name?.toLowerCase().includes('placed order')
        );
        if (!placedOrderMetric) {
          console.warn("[quick-stats] No 'Placed Order' metric found among", metrics.length, "metrics");
          return null;
        }
        const metricId = placedOrderMetric.id;
        console.log("[quick-stats] Found Placed Order metric:", metricId);

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

    // Extract values and capture errors
    const activeProfiles = profilesResult.status === "fulfilled" ? profilesResult.value : null;
    const campaignsL30d = campaignsResult.status === "fulfilled" ? campaignsResult.value : null;
    const revenueL30d = revenueResult.status === "fulfilled" ? revenueResult.value : null;

    if (profilesResult.status === "rejected") {
      errors.active_profiles = profilesResult.reason?.message || "Unknown error";
      console.warn("[quick-stats] Profiles failed:", errors.active_profiles);
    }
    if (campaignsResult.status === "rejected") {
      errors.campaigns_last_30d = campaignsResult.reason?.message || "Unknown error";
      console.warn("[quick-stats] Campaigns failed:", errors.campaigns_last_30d);
    }
    if (revenueResult.status === "rejected") {
      errors.revenue_last_30d = revenueResult.reason?.message || "Unknown error";
      console.warn("[quick-stats] Revenue failed:", errors.revenue_last_30d);
    }

    const quickStats = {
      active_profiles: activeProfiles,
      campaigns_last_30d: campaignsL30d,
      revenue_last_30d: revenueL30d,
      fetched_at: new Date().toISOString(),
    };

    // Save to klaviyo_connections
    await supabase
      .from("klaviyo_connections")
      .update({ quick_stats: quickStats })
      .eq("brand_id", brandId);

    console.log("[quick-stats] Stats saved for brand", brandId, quickStats);

    return new Response(JSON.stringify({
      success: true,
      stats: quickStats,
      errors,
    }), {
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
