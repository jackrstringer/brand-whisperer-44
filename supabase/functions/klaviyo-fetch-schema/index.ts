import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";

const KLAVIYO_HEADERS = (apiKey: string) => ({
  "Authorization": `Klaviyo-API-Key ${apiKey}`,
  "revision": "2024-10-15",
  "Accept": "application/json",
});

/** Known transactional metrics that get recommended badges and sort first */
const RECOMMENDED_METRICS: Record<string, { description: string; priority: number }> = {
  "Checkout Started": { description: "Abandoned Checkout flow", priority: 1 },
  "Started Checkout": { description: "Abandoned Checkout flow", priority: 1 },
  "Placed Order": { description: "Order confirmation, post-purchase", priority: 2 },
  "Ordered Product": { description: "Per-product trigger", priority: 3 },
  "Fulfilled Order": { description: "Shipping confirmation", priority: 4 },
  "Cancelled Order": { description: "Order cancellation", priority: 5 },
  "Refunded Order": { description: "Refund confirmation", priority: 6 },
  "Viewed Product": { description: "Browse abandonment", priority: 7 },
  "Added to Cart": { description: "Cart abandonment", priority: 8 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { brandId, fetchEventFor } = body;
    if (!brandId) throw new Error("brandId is required");

    // Verify brand ownership
    const { data: brand } = await supabase.from("brands").select("id, user_id").eq("id", brandId).single();
    if (!brand || brand.user_id !== user.id) throw new Error("Brand not found or unauthorized");

    // Get Klaviyo connection
    const { data: connection } = await supabase.from("klaviyo_connections").select("*").eq("brand_id", brandId).single();
    if (!connection) {
      return new Response(JSON.stringify({
        connected: false,
        metrics: getStandardSchemas(),
        synced_at: null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = connection.api_key;

    // ---------- MODE: Lazy event fetch for a single metric ----------
    if (fetchEventFor) {
      const result = await fetchEventDataForMetric(apiKey, fetchEventFor);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- MODE: List all metrics ----------
    const allMetrics = await fetchAllMetrics(apiKey);

    const metricResults = allMetrics.map((metric: any) => {
      const name = metric.attributes?.name || "Unknown";
      const integration = metric.attributes?.integration || {};
      const recommended = RECOMMENDED_METRICS[name];

      return {
        metric_id: metric.id,
        metric_name: name,
        description: recommended?.description || "",
        integration_name: integration.name || null,
        integration_category: integration.category || null,
        priority: recommended?.priority ?? 999,
        is_recommended: !!recommended,
        has_real_data: true, // All come from live Klaviyo account
      };
    });

    // Sort: recommended first by priority, then alphabetical
    metricResults.sort((a: any, b: any) => {
      if (a.is_recommended && !b.is_recommended) return -1;
      if (!a.is_recommended && b.is_recommended) return 1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.metric_name.localeCompare(b.metric_name);
    });

    // Cache
    const now = new Date().toISOString();
    const cachedStats = (connection.cached_stats || {}) as Record<string, unknown>;
    await supabase.from("klaviyo_connections").update({
      cached_stats: {
        ...cachedStats,
        event_schemas: { metrics: metricResults, synced_at: now },
      },
    }).eq("brand_id", brandId);

    return new Response(JSON.stringify({
      connected: true,
      metrics: metricResults,
      synced_at: now,
      account_name: connection.klaviyo_account_name,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("klaviyo-fetch-schema error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/** Fetch all metrics from Klaviyo, paginating through results */
async function fetchAllMetrics(apiKey: string): Promise<any[]> {
  const all: any[] = [];
  let url: string | null = `${KLAVIYO_API_BASE}/metrics?page[size]=50`;

  while (url) {
    const resp = await fetch(url, { headers: KLAVIYO_HEADERS(apiKey) });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`Klaviyo metrics fetch failed: ${resp.status}`, body);
      throw new Error(`Klaviyo metrics fetch failed: ${resp.status} — ${body.slice(0, 300)}`);
    }
    const data = await resp.json();
    all.push(...(data.data || []));
    url = data.links?.next || null;
    // Safety cap — most accounts have <100 metrics
    if (all.length > 500) break;
  }

  return all;
}

/** Fetch sample event data for a single metric (lazy load on selection) */
async function fetchEventDataForMetric(apiKey: string, metricId: string) {
  try {
    const eventsUrl = `${KLAVIYO_API_BASE}/events/?filter=equals(metric_id,"${metricId}")&fields[event]=event_properties&page[size]=1&sort=-datetime`;
    const eventsResp = await fetch(eventsUrl, { headers: KLAVIYO_HEADERS(apiKey) });

    if (eventsResp.ok) {
      const eventsData = await eventsResp.json();
      const events = eventsData.data || [];
      if (events.length > 0) {
        const props = events[0].attributes?.event_properties || {};
        const samplePayload = remapDollarKeys(props);
        const liquidVariables = extractLiquidVars(samplePayload);
        return { sample_payload: samplePayload, liquid_variables: liquidVariables, has_real_data: true };
      }
    } else {
      await eventsResp.text();
    }
  } catch (e) {
    console.warn(`Failed to fetch sample event for metric ${metricId}:`, e);
  }

  // No real data found — return empty schema
  // Check if this is a known metric and use standard schema
  return { sample_payload: {}, liquid_variables: [], has_real_data: false };
}

// Internal Klaviyo metadata keys to skip
const SKIP_KEYS = new Set(["$attribution", "$flow", "$message", "$variation", "$timezone", "$anonymous", "$browser", "$browser_version", "$city", "$country", "$device_type", "$ip", "$latitude", "$longitude", "$os", "$platform", "$region", "$source", "$timestamp", "$timezone_offset", "$currency_code"]);

function remapDollarKeys(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(item => remapDollarKeys(item));
  if (typeof obj === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SKIP_KEYS.has(key)) continue;
      const cleanKey = key.startsWith("$") ? key.slice(1) : key;
      result[cleanKey] = remapDollarKeys(value);
    }
    return result;
  }
  return obj;
}

function extractLiquidVars(obj: any, prefix = "event", depth = 0): string[] {
  if (depth > 8) return [];
  const vars: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = `${prefix}.${key}`;
    if (Array.isArray(value)) {
      vars.push(path);
      if (value[0] && typeof value[0] === "object") {
        vars.push(...extractLiquidVars(value[0], `${path}[]`, depth + 1));
      }
    } else if (value && typeof value === "object") {
      vars.push(...extractLiquidVars(value, path, depth + 1));
    } else {
      vars.push(path);
    }
  }
  return vars;
}

function getStandardSchemas() {
  return [
    { metric_id: "standard_checkout_started", metric_name: "Checkout Started", description: "Abandoned Checkout flow", priority: 1, is_recommended: true, has_real_data: false, integration_name: "Shopify", integration_category: "ecommerce", sample_payload: {}, liquid_variables: [] },
    { metric_id: "standard_placed_order", metric_name: "Placed Order", description: "Order confirmation, post-purchase", priority: 2, is_recommended: true, has_real_data: false, integration_name: "Shopify", integration_category: "ecommerce", sample_payload: {}, liquid_variables: [] },
    { metric_id: "standard_fulfilled_order", metric_name: "Fulfilled Order", description: "Shipping confirmation", priority: 3, is_recommended: true, has_real_data: false, integration_name: "Shopify", integration_category: "ecommerce", sample_payload: {}, liquid_variables: [] },
    { metric_id: "standard_viewed_product", metric_name: "Viewed Product", description: "Browse abandonment", priority: 4, is_recommended: true, has_real_data: false, integration_name: "Shopify", integration_category: "ecommerce", sample_payload: {}, liquid_variables: [] },
  ];
}
