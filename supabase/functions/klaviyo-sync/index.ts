import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const REVISION = "2024-02-15";

function klaviyoHeaders(apiKey: string) {
  return {
    "Authorization": `Klaviyo-API-Key ${apiKey}`,
    "revision": REVISION,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

async function klaviyoFetch(path: string, apiKey: string, options: RequestInit = {}) {
  const url = path.startsWith("http") ? path : `${KLAVIYO_API_BASE}${path}`;
  const doFetch = () => fetch(url, {
    ...options,
    headers: { ...klaviyoHeaders(apiKey), ...(options.headers || {}) },
  });

  let res = await doFetch();
  if (res.status === 429) {
    console.warn(`[klaviyo-sync] Rate limited on ${path}, retrying in 2s...`);
    await new Promise(r => setTimeout(r, 2000));
    res = await doFetch();
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = Array.isArray(data?.errors) ? data.errors[0]?.detail || data.errors[0]?.title : JSON.stringify(data);
    throw new Error(`Klaviyo ${res.status}: ${err}`);
  }
  return data;
}

async function fetchAllPages(path: string, apiKey: string, params?: Record<string, string>): Promise<any[]> {
  const all: any[] = [];
  const qs = params
    ? Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
    : "";
  const separator = path.includes("?") ? "&" : "?";
  let url = `${path}${qs ? `${separator}${qs}` : ""}`;
  while (url) {
    const data = await klaviyoFetch(url, apiKey);
    if (data.data) all.push(...data.data);
    const nextLink = data.links?.next;
    if (nextLink) {
      try {
        const nextUrl = new URL(nextLink);
        url = `${nextUrl.pathname}${nextUrl.search}`.replace("/api", "");
      } catch {
        url = null as any;
      }
    } else {
      url = null as any;
    }
  }
  return all;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { brandId } = await req.json();
    if (!brandId) throw new Error("brandId is required");

    // Get connection
    const { data: conn, error: connErr } = await supabase
      .from("klaviyo_connections")
      .select("*")
      .eq("brand_id", brandId)
      .single();
    if (connErr || !conn) throw new Error("No Klaviyo connection found");

    const apiKey = conn.api_key;

    // Set syncing status
    await supabase.from("klaviyo_connections").update({
      sync_status: "syncing",
      sync_error: null,
    }).eq("brand_id", brandId);

    try {
      // ── Step 1: Fetch sent email campaigns from last 30 days ──
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const filterStr = `equals(messages.channel,'email'),greater-or-equal(created_at,${cutoff})`;

      console.log("[klaviyo-sync] Fetching campaigns (last 30 days)...");
      const allCampaigns = await fetchAllPages(
        `/campaigns?fields[campaign]=name,status,created_at,updated_at,send_time,scheduled_at`,
        apiKey,
        { "filter": filterStr }
      );
      const sentCampaigns = allCampaigns.filter((c: any) => {
        const status = c.attributes?.status;
        return status === "Sent" || status === "sent";
      });
      console.log(`[klaviyo-sync] Found ${sentCampaigns.length} sent campaigns out of ${allCampaigns.length} total`);

      // ── Step 2: Find Placed Order metric ID ──
      console.log("[klaviyo-sync] Resolving Placed Order metric ID...");
      const metricsData = await fetchAllPages("/metrics", apiKey);
      const placedOrderMetric = metricsData.find((m: any) =>
        m.attributes?.name?.toLowerCase().includes("placed order")
      );
      const placedOrderMetricId = placedOrderMetric?.id || null;
      console.log("[klaviyo-sync] Placed Order metric ID:", placedOrderMetricId);

      // ── Step 3: Fetch all campaign stats via Reporting API (single call) ──
      let reportResults: any[] = [];
      if (placedOrderMetricId && sentCampaigns.length > 0) {
        console.log("[klaviyo-sync] Fetching campaign values report...");
        try {
          const reportResp = await klaviyoFetch("/campaign-values-reports/", apiKey, {
            method: "POST",
            body: JSON.stringify({
              data: {
                type: "campaign-values-report",
                attributes: {
                  statistics: [
                    "recipients", "delivered", "opens_unique", "open_rate",
                    "clicks_unique", "click_rate", "click_to_open_rate",
                    "unsubscribes", "unsubscribe_rate",
                    "conversion_uniques", "conversion_value",
                    "revenue_per_recipient",
                  ],
                  timeframe: { key: "last_30_days" },
                  conversion_metric_id: placedOrderMetricId,
                  filter: `equals(send_channel,"email")`,
                },
              },
            }),
          });
          reportResults = reportResp?.data?.attributes?.results || [];
          console.log(`[klaviyo-sync] Report returned ${reportResults.length} campaign results`);
        } catch (e) {
          console.error("[klaviyo-sync] Campaign values report failed:", e);
        }
      }

      // Build a lookup map: campaign_id → stats from the report
      const statsMap = new Map<string, any>();
      for (const r of reportResults) {
        const cid = r.groupings?.campaign_id;
        if (cid) statsMap.set(cid, r.statistics || {});
      }

      // ── Step 4: Fetch message details (subject lines) in parallel batches ──
      const batchSize = 10;
      const messageDetailsMap = new Map<string, any>();

      for (let i = 0; i < sentCampaigns.length; i += batchSize) {
        const batch = sentCampaigns.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (campaign: any) => {
          const cid = campaign.id;
          try {
            const msgs = await klaviyoFetch(`/campaigns/${cid}/campaign-messages`, apiKey);
            const msg = msgs.data?.[0]?.attributes;
            return {
              id: cid,
              subject_line: msg?.content?.subject || msg?.definition?.content?.subject || "",
              preview_text: msg?.content?.preview_text || msg?.definition?.content?.preview_text || "",
              from_name: msg?.content?.from_name || msg?.definition?.content?.from_name || msg?.label || "",
            };
          } catch {
            return { id: cid, subject_line: "", preview_text: "", from_name: "" };
          }
        }));
        for (const r of results) messageDetailsMap.set(r.id, r);
      }

      // ── Step 5: Merge into final campaignData array ──
      const campaignData = sentCampaigns.map((campaign: any) => {
        const cid = campaign.id;
        const attrs = campaign.attributes || {};
        const stats = statsMap.get(cid) || {};
        const msgDetails = messageDetailsMap.get(cid) || {};

        const delivered = stats.delivered ?? stats.recipients ?? 0;
        const openRate = stats.open_rate ?? 0;
        const clickRate = stats.click_rate ?? 0;
        const ctr = stats.click_to_open_rate ?? 0;
        const uniqueOpens = stats.opens_unique ?? 0;
        const uniqueClicks = stats.clicks_unique ?? 0;
        const unsubscribes = stats.unsubscribes ?? 0;
        const unsubRate = stats.unsubscribe_rate ?? 0;
        const orders = stats.conversion_uniques ?? 0;
        const revenue = stats.conversion_value ?? 0;
        const rpr = stats.revenue_per_recipient ?? 0;

        return {
          id: cid,
          name: attrs.name || "",
          subject_line: msgDetails.subject_line || "",
          preview_text: msgDetails.preview_text || "",
          from_name: msgDetails.from_name || "",
          sent_at: attrs.send_time || attrs.created_at || "",
          recipient_count: delivered,
          delivered_count: delivered,
          unique_opens: uniqueOpens,
          open_rate: Math.round(openRate * 10000) / 10000,
          unique_clicks: uniqueClicks,
          click_rate: Math.round(clickRate * 10000) / 10000,
          click_to_open_rate: Math.round(ctr * 10000) / 10000,
          unsubscribes,
          unsubscribe_rate: Math.round(unsubRate * 10000) / 10000,
          orders_placed: orders,
          revenue: Math.round(revenue * 100) / 100,
          revenue_per_recipient: Math.round(rpr * 100) / 100,
        };
      });

      // ── Step 6: Save raw data (upsert to create row if missing) ──
      await supabase.from("brand_intelligence").upsert({
        brand_id: brandId,
        klaviyo_raw: campaignData,
        klaviyo_last_synced_at: new Date().toISOString(),
      }, { onConflict: "brand_id" });

      // ── Step 7: Sync lists and active segments ──
      const [listsData, segmentsData] = await Promise.all([
        klaviyoFetch("/lists", apiKey),
        klaviyoFetch("/segments?filter=equals(is_active,true)", apiKey),
      ]);

      // ── Step 8: Compute cached stats ──
      const totalRevenue = campaignData.reduce((sum: number, c: any) => sum + (c.revenue || 0), 0);

      // Preserve existing cached_stats (e.g. event_schemas)
      const { data: existingConn } = await supabase
        .from("klaviyo_connections")
        .select("cached_stats")
        .eq("brand_id", brandId)
        .single();

      const existingStats = (existingConn?.cached_stats as Record<string, any>) || {};

      const cachedStats = {
        ...existingStats,
        campaigns_sent_l30d: campaignData.length,
        total_revenue_l30d: Math.round(totalRevenue * 100) / 100,
      };

      await supabase.from("klaviyo_connections").update({
        cached_lists: listsData.data || [],
        cached_segments: segmentsData.data || [],
        cached_stats: cachedStats,
        last_synced_at: new Date().toISOString(),
        sync_status: "complete",
        sync_error: null,
      }).eq("brand_id", brandId);

      console.log(`[klaviyo-sync] Complete. ${campaignData.length} campaigns synced. Stats:`, cachedStats);

      // ── Step 9: Fire analyze-klaviyo-performance ──
      try {
        await fetch(`${supabaseUrl}/functions/v1/analyze-klaviyo-performance`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ brandId }),
        });
      } catch (e) {
        console.warn("[klaviyo-sync] Failed to trigger analysis:", e);
      }

      return new Response(JSON.stringify({
        success: true,
        campaignCount: campaignData.length,
        stats: cachedStats,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (syncError: any) {
      console.error("[klaviyo-sync] Sync failed:", syncError);
      await supabase.from("klaviyo_connections").update({
        sync_status: "failed",
        sync_error: syncError.message,
      }).eq("brand_id", brandId);
      throw syncError;
    }
  } catch (error: any) {
    console.error("[klaviyo-sync] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
