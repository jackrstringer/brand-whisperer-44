import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const REVISION = "2024-02-15";
const SEGMENT_REVISION = "2024-10-15";

async function klaviyoGet(path: string, apiKey: string, revision = REVISION): Promise<any> {
  const url = path.startsWith("http") ? path : `${KLAVIYO_API_BASE}${path}`;
  const headers = {
    "Authorization": `Klaviyo-API-Key ${apiKey}`,
    "revision": revision,
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

async function klaviyoPost(path: string, apiKey: string, body: any, revision = REVISION): Promise<any> {
  const url = `${KLAVIYO_API_BASE}${path}`;
  const headers = {
    "Authorization": `Klaviyo-API-Key ${apiKey}`,
    "revision": revision,
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

async function klaviyoDelete(path: string, apiKey: string, revision = REVISION): Promise<void> {
  const url = `${KLAVIYO_API_BASE}${path}`;
  const headers = {
    "Authorization": `Klaviyo-API-Key ${apiKey}`,
    "revision": revision,
    "Accept": "application/json",
  };
  let res = await fetch(url, { method: "DELETE", headers });
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    res = await fetch(url, { method: "DELETE", headers });
  }
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    console.warn(`[quick-stats] DELETE ${path} failed: ${res.status} ${body}`);
  }
}

const SEGMENT_NAME = "Active Profiles (can receive email marketing) v2";

async function getActiveProfileCount(apiKey: string, brandId: string, supabase: any): Promise<number | null> {
  const { data: conn } = await supabase
    .from("klaviyo_connections")
    .select("active_profiles_segment_id")
    .eq("brand_id", brandId)
    .single();

  let segmentId = conn?.active_profiles_segment_id || null;
  console.log("[quick-stats] Stored segment ID:", segmentId);

  // If no stored segment, search for existing ones and clean up old versions
  if (!segmentId) {
    const searchData = await klaviyoGet(`/segments/`, apiKey, SEGMENT_REVISION);
    const segments = searchData?.data || [];

    // Delete any old-name segments
    for (const s of segments) {
      const name = s.attributes?.name || "";
      if (
        name.toLowerCase().includes("can receive email marketing") &&
        name !== SEGMENT_NAME
      ) {
        console.log("[quick-stats] Deleting old segment:", s.id, name);
        await klaviyoDelete(`/segments/${s.id}`, apiKey, SEGMENT_REVISION);
      }
    }

    // Check if correct segment already exists
    const match = segments.find((s: any) => s.attributes?.name === SEGMENT_NAME);
    if (match) {
      segmentId = match.id;
      console.log("[quick-stats] Found existing correct segment:", segmentId);
    }
  }

  // Create segment if needed
  if (!segmentId) {
    console.log("[quick-stats] Creating new segment for active profiles...");
    const createData = await klaviyoPost(`/segments/`, apiKey, {
      data: {
        type: "segment",
        attributes: {
          name: SEGMENT_NAME,
          definition: {
            condition_groups: [{
              conditions: [{
                type: "profile-marketing-consent",
                consent: {
                  channel: "email",
                  can_receive_marketing: true,
                  consent_status: {
                    subscription: "any",
                  },
                },
              }],
            }],
          },
        },
      },
    }, SEGMENT_REVISION);

    segmentId = createData?.data?.id || null;
    if (!segmentId) throw new Error("Segment created but no ID returned");
    console.log("[quick-stats] Created segment:", segmentId);
  }

  // Persist segment ID
  await supabase
    .from("klaviyo_connections")
    .update({ active_profiles_segment_id: segmentId })
    .eq("brand_id", brandId);

  // Poll for profile_count with STABILIZATION — wait for count to stop changing
  let lastCount = -1;
  let stableRounds = 0;

  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 3000));
    }

    try {
      const countData = await klaviyoGet(
        `/segments/${segmentId}/?additional-fields[segment]=profile_count`,
        apiKey,
        SEGMENT_REVISION,
      );

      const count = countData?.data?.attributes?.profile_count;
      console.log(`[quick-stats] Attempt ${attempt + 1}: profile_count = ${count}, lastCount = ${lastCount}, stableRounds = ${stableRounds}`);

      if (count !== null && count !== undefined && count > 0) {
        if (count === lastCount) {
          stableRounds++;
          if (stableRounds >= 2) {
            console.log(`[quick-stats] Count stabilized at ${count} after ${attempt + 1} attempts`);
            return count;
          }
        } else {
          stableRounds = 0;
        }
        lastCount = count;
      }
    } catch (e) {
      console.warn(`[quick-stats] Segment count attempt ${attempt + 1} failed:`, e.message);
    }
  }

  console.log(`[quick-stats] Polling exhausted, returning lastCount: ${lastCount}`);
  return lastCount > 0 ? lastCount : null;
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
      getActiveProfileCount(apiKey, brandId, supabase),

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
