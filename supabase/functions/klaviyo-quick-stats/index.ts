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
  const headers = {
    "Authorization": `Klaviyo-API-Key ${apiKey}`,
    "revision": REVISION,
    "Accept": "application/json",
  };
  let res = await fetch(url, { headers });
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    res = await fetch(url, { headers });
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Klaviyo ${res.status}: ${body}`);
  }
  return res.json();
}

async function klaviyoPost(path: string, apiKey: string, body: any): Promise<any> {
  const url = `${KLAVIYO_API_BASE}${path}`;
  const headers = {
    "Authorization": `Klaviyo-API-Key ${apiKey}`,
    "revision": REVISION,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  let res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  }
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Klaviyo ${res.status}: ${errBody}`);
  }
  return res.json();
}

async function getActiveProfileCount(apiKey: string, brandId: string, supabase: any): Promise<number | null> {
  const headers = {
    "Authorization": `Klaviyo-API-Key ${apiKey}`,
    "revision": REVISION,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  // Step 1 — check if we already have a segment ID stored
  const { data: conn } = await supabase
    .from("klaviyo_connections")
    .select("active_profiles_segment_id")
    .eq("brand_id", brandId)
    .single();

  let segmentId = conn?.active_profiles_segment_id || null;
  console.log("[quick-stats] Stored segment ID:", segmentId);

  // Step 2 — if no stored segment, search for existing one first
  if (!segmentId) {
    const searchResp = await fetch(
      `${KLAVIYO_API_BASE}/segments/`,
      { headers }
    );
    if (searchResp.ok) {
      const searchData = await searchResp.json();
      const segments = searchData?.data || [];
      const match = segments.find((s: any) =>
        s.attributes?.name?.toLowerCase().includes("can receive email marketing")
      );
      if (match) {
        segmentId = match.id;
        console.log("[quick-stats] Found existing segment:", segmentId);
      }
    }
  }

  // Step 3 — if still no segment, create one
  if (!segmentId) {
    console.log("[quick-stats] Creating new segment for active profiles...");
    const createResp = await fetch(`${KLAVIYO_API_BASE}/segments/`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: {
          type: "segment",
          attributes: {
            name: "Active Profiles (can receive email marketing)",
            definition: {
              condition_groups: [{
                conditions: [{
                  type: "profile",
                  dimension: {
                    type: "email_marketing",
                    value: "can_receive_email_marketing",
                  },
                  operator: { id: "equals" },
                  value: true,
                }],
              }],
            },
          },
        },
      }),
    });

    if (!createResp.ok) {
      const errText = await createResp.text();
      throw new Error(`Failed to create segment: ${createResp.status}: ${errText}`);
    }
    const createData = await createResp.json();
    segmentId = createData?.data?.id || null;
    if (!segmentId) throw new Error("Segment created but no ID returned");

    console.log("[quick-stats] Created segment:", segmentId);

    // Store the segment ID so we never recreate it
    await supabase
      .from("klaviyo_connections")
      .update({ active_profiles_segment_id: segmentId })
      .eq("brand_id", brandId);
  } else if (!conn?.active_profiles_segment_id) {
    // Found via search but not stored yet — persist it
    await supabase
      .from("klaviyo_connections")
      .update({ active_profiles_segment_id: segmentId })
      .eq("brand_id", brandId);
  }

  // Step 4 — poll for profile_count every 3 seconds, up to 10 attempts
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 3000));
    }

    const countResp = await fetch(
      `${KLAVIYO_API_BASE}/segments/${segmentId}/?additional-fields[segment]=profile_count`,
      { headers }
    );

    if (!countResp.ok) {
      console.warn(`[quick-stats] Segment count attempt ${attempt + 1} failed: ${countResp.status}`);
      continue;
    }

    const countData = await countResp.json();
    const count = countData?.data?.attributes?.profile_count;
    console.log(`[quick-stats] Attempt ${attempt + 1}: profile_count =`, count);

    if (count !== null && count !== undefined && count > 0) {
      return count;
    }
  }

  return null;
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
    const now = new Date().toISOString().split("T")[0] + "T23:59:59+00:00";

    const errors: Record<string, string | null> = {
      active_profiles: null,
      campaigns_last_30d: null,
      revenue_last_30d: null,
    };

    const [profilesResult, campaignsResult, revenueResult] = await Promise.allSettled([
      // Call 1: Active profiles via segment
      getActiveProfileCount(apiKey, brandId, supabase),

      // Call 2: Campaigns sent in last 30 days
      (async () => {
        const data = await klaviyoGet(
          `/campaigns/?filter=equals(messages.channel,'email'),equals(status,'Sent'),greater-or-equal(updated_at,${thirtyDaysAgo})`,
          apiKey
        );
        console.log("[quick-stats] Campaigns response keys:", Object.keys(data), "meta:", JSON.stringify(data?.meta));
        const total = data?.meta?.total ?? data?.meta?.page_info?.count ?? null;
        if (total !== null) return total;
        return data?.data?.length ?? 0;
      })(),

      // Call 3: Revenue in last 30 days
      (async () => {
        const metricsData = await klaviyoGet(`/metrics/`, apiKey);
        const metrics = metricsData?.data || [];
        const placedOrderMetric = metrics.find((m: any) =>
          m.attributes?.name?.toLowerCase().includes("placed order")
        );
        if (!placedOrderMetric) {
          console.warn("[quick-stats] No 'Placed Order' metric found among", metrics.length, "metrics");
          return null;
        }
        const metricId = placedOrderMetric.id;
        console.log("[quick-stats] Found Placed Order metric:", metricId);

        const aggData = await klaviyoPost(`/metric-aggregates/`, apiKey, {
          data: {
            type: "metric-aggregate",
            attributes: {
              metric_id: metricId,
              interval: "month",
              measurements: ["sum_value"],
              filter: `greater-or-equal(datetime,${thirtyDaysAgo}),less-than(datetime,${now})`,
              timezone: "UTC",
            },
          },
        });

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
