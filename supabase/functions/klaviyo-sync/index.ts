import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const REVISION = "2024-02-15";

async function klaviyoFetch(path: string, apiKey: string, options: RequestInit = {}) {
  const res = await fetch(`${KLAVIYO_API_BASE}${path}`, {
    ...options,
    headers: {
      "Authorization": `Klaviyo-API-Key ${apiKey}`,
      "revision": REVISION,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = Array.isArray(data?.errors) ? data.errors[0]?.detail || data.errors[0]?.title : JSON.stringify(data);
    throw new Error(`Klaviyo ${res.status}: ${err}`);
  }
  return data;
}

async function fetchAllPages(path: string, apiKey: string, params?: Record<string, string>): Promise<any[]> {
  const all: any[] = [];
  const qs = new URLSearchParams(params || {});
  let url = `${path}${qs.toString() ? `?${qs.toString()}` : ""}`;
  while (url) {
    const data = await klaviyoFetch(url, apiKey);
    if (data.data) all.push(...data.data);
    // Klaviyo returns full URLs in links.next
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
      // Step 1: Fetch sent campaigns from last 365 days
      const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const filter = `equals(messages.channel,"email"),greater-or-equal(created_at,${cutoff})`;
      
      console.log("[klaviyo-sync] Fetching campaigns...");
      const allCampaigns = await fetchAllPages("/campaigns", apiKey, filter);
      const sentCampaigns = allCampaigns.filter((c: any) => c.attributes?.status === "Sent");
      console.log(`[klaviyo-sync] Found ${sentCampaigns.length} sent campaigns out of ${allCampaigns.length} total`);

      // Step 2: Resolve metric IDs
      console.log("[klaviyo-sync] Resolving metric IDs...");
      const metricsData = await fetchAllPages("/metrics", apiKey);
      const metricMap: Record<string, string> = {};
      const targetMetrics = ["Opened Email", "Clicked Email", "Unsubscribed", "Placed Order", "Received Email"];
      for (const m of metricsData) {
        if (targetMetrics.includes(m.attributes?.name)) {
          metricMap[m.attributes.name] = m.id;
        }
      }
      console.log("[klaviyo-sync] Resolved metrics:", Object.keys(metricMap));

      // Step 3: Fetch metrics for each campaign in batches of 10
      const campaignData: any[] = [];
      const batchSize = 10;

      for (let i = 0; i < sentCampaigns.length; i += batchSize) {
        const batch = sentCampaigns.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (campaign: any) => {
          const cid = campaign.id;
          const attrs = campaign.attributes || {};
          
          const metrics: Record<string, any> = {};
          
          // Fetch each metric for this campaign
          for (const [metricName, metricId] of Object.entries(metricMap)) {
            try {
              const result = await klaviyoFetch("/metric-aggregates", apiKey, {
                method: "POST",
                body: JSON.stringify({
                  data: {
                    type: "metric-aggregate",
                    attributes: {
                      metric_id: metricId,
                      filter: [`equals(\"Campaign Name\",\"${attrs.name}\")`],
                      measurements: ["count", "sum_value", "unique"],
                      interval: "month",
                      page_size: 1,
                    },
                  },
                }),
              });
              const measurements = result.data?.attributes?.data || [];
              let count = 0, sumValue = 0, unique = 0;
              for (const m of measurements) {
                if (m.measurements?.count) count += m.measurements.count.reduce((a: number, b: number) => a + b, 0);
                if (m.measurements?.sum_value) sumValue += m.measurements.sum_value.reduce((a: number, b: number) => a + b, 0);
                if (m.measurements?.unique) unique += m.measurements.unique.reduce((a: number, b: number) => a + b, 0);
              }
              metrics[metricName] = { count, sumValue, unique };
            } catch (e) {
              console.warn(`[klaviyo-sync] Failed to fetch ${metricName} for campaign ${cid}:`, e);
              metrics[metricName] = { count: 0, sumValue: 0, unique: 0 };
            }
          }

          const delivered = metrics["Received Email"]?.count || 0;
          const uniqueOpens = metrics["Opened Email"]?.unique || 0;
          const uniqueClicks = metrics["Clicked Email"]?.unique || 0;
          const unsubscribes = metrics["Unsubscribed"]?.count || 0;
          const orders = metrics["Placed Order"]?.count || 0;
          const revenue = metrics["Placed Order"]?.sumValue || 0;
          const openRate = delivered > 0 ? uniqueOpens / delivered : 0;
          const clickRate = delivered > 0 ? uniqueClicks / delivered : 0;
          const ctr = uniqueOpens > 0 ? uniqueClicks / uniqueOpens : 0;

          // Get message details
          let subjectLine = "";
          let previewText = "";
          let fromName = "";
          try {
            const msgs = await klaviyoFetch(`/campaigns/${cid}/campaign-messages`, apiKey);
            const msg = msgs.data?.[0]?.attributes;
            if (msg) {
              subjectLine = msg.content?.subject || msg.definition?.content?.subject || "";
              previewText = msg.content?.preview_text || msg.definition?.content?.preview_text || "";
              fromName = msg.content?.from_name || msg.definition?.content?.from_name || msg.label || "";
            }
          } catch {}

          return {
            id: cid,
            name: attrs.name || "",
            subject_line: subjectLine,
            preview_text: previewText,
            from_name: fromName,
            sent_at: attrs.send_time || attrs.created_at || "",
            recipient_count: delivered,
            delivered_count: delivered,
            unique_opens: uniqueOpens,
            open_rate: Math.round(openRate * 10000) / 10000,
            unique_clicks: uniqueClicks,
            click_rate: Math.round(clickRate * 10000) / 10000,
            click_to_open_rate: Math.round(ctr * 10000) / 10000,
            unsubscribes,
            unsubscribe_rate: delivered > 0 ? Math.round((unsubscribes / delivered) * 10000) / 10000 : 0,
            orders_placed: orders,
            revenue: Math.round(revenue * 100) / 100,
            revenue_per_recipient: delivered > 0 ? Math.round((revenue / delivered) * 100) / 100 : 0,
          };
        }));
        campaignData.push(...batchResults);
        console.log(`[klaviyo-sync] Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(sentCampaigns.length / batchSize)}`);
      }

      // Step 4: Save raw data
      await supabase.from("brand_intelligence").update({
        klaviyo_raw: campaignData,
        klaviyo_last_synced_at: new Date().toISOString(),
      }).eq("brand_id", brandId);

      // Step 5: Sync lists and segments
      const [listsData, segmentsData] = await Promise.all([
        klaviyoFetch("/lists", apiKey),
        klaviyoFetch("/segments", apiKey),
      ]);

      await supabase.from("klaviyo_connections").update({
        cached_lists: listsData.data || [],
        cached_segments: segmentsData.data || [],
        last_synced_at: new Date().toISOString(),
        sync_status: "complete",
        sync_error: null,
      }).eq("brand_id", brandId);

      console.log(`[klaviyo-sync] Complete. ${campaignData.length} campaigns synced.`);

      // Step 6: Fire analyze-klaviyo-performance
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
