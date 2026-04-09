import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";

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

    const { brandId } = await req.json();
    if (!brandId) throw new Error("brandId is required");

    // Verify brand ownership
    const { data: brand } = await supabase.from("brands").select("id, user_id").eq("id", brandId).single();
    if (!brand || brand.user_id !== user.id) throw new Error("Brand not found or unauthorized");

    // Get Klaviyo connection
    const { data: connection } = await supabase.from("klaviyo_connections").select("*").eq("brand_id", brandId).single();
    if (!connection) {
      // No Klaviyo connection — return standard Shopify schemas as fallback
      return new Response(JSON.stringify({
        connected: false,
        metrics: getStandardSchemas(),
        synced_at: null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = connection.api_key;

    // Fetch metrics from Klaviyo
    const metricsResp = await fetch(`${KLAVIYO_API_BASE}/metrics`, {
      headers: {
        "Authorization": `Klaviyo-API-Key ${apiKey}`,
        "revision": "2024-10-15",
        "Accept": "application/json",
      },
    });

    if (!metricsResp.ok) throw new Error(`Klaviyo metrics fetch failed: ${metricsResp.status}`);
    const metricsData = await metricsResp.json();
    const allMetrics = metricsData.data || [];

    // Known transactional metrics
    const transactionalNames: Record<string, { label: string; description: string; priority: number }> = {
      "Checkout Started": { label: "Checkout Started", description: "Abandoned Checkout flow", priority: 1 },
      "Started Checkout": { label: "Started Checkout", description: "Abandoned Checkout flow", priority: 1 },
      "Placed Order": { label: "Placed Order", description: "Order confirmation, post-purchase", priority: 2 },
      "Ordered Product": { label: "Ordered Product", description: "Order confirmation, post-purchase", priority: 2 },
      "Fulfilled Order": { label: "Fulfilled Order", description: "Shipping confirmation", priority: 3 },
      "Cancelled Order": { label: "Cancelled Order", description: "Cancellation notification", priority: 5 },
      "Refunded Order": { label: "Refunded Order", description: "Refund notification", priority: 6 },
      "Viewed Product": { label: "Viewed Product", description: "Browse abandonment", priority: 4 },
    };

    // For each transactional metric, try to fetch a sample event
    const metricResults = [];
    for (const metric of allMetrics) {
      const name = metric.attributes?.name;
      const meta = transactionalNames[name];
      if (!meta) continue;

      let samplePayload = null;
      let liquidVariables: string[] = [];
      let hasRealData = false;

      try {
        const eventsResp = await fetch(
          `${KLAVIYO_API_BASE}/events/?filter=equals(metric_id,"${metric.id}")&page[size]=1&sort=-datetime&fields[event]=event_properties,datetime`,
          {
            headers: {
              "Authorization": `Klaviyo-API-Key ${apiKey}`,
              "revision": "2024-10-15",
              "Accept": "application/json",
            },
          }
        );

        if (eventsResp.ok) {
          const eventsData = await eventsResp.json();
          const event = eventsData.data?.[0];
          if (event) {
            samplePayload = event.attributes?.event_properties || {};
            hasRealData = true;
            liquidVariables = extractLiquidVars(samplePayload);
          }
        }
      } catch (e) {
        console.warn(`Failed to fetch sample event for ${name}:`, e);
      }

      // Fallback to standard schema if no real data
      if (!samplePayload) {
        const standard = getStandardSchemaForMetric(name);
        samplePayload = standard.sample_payload;
        liquidVariables = standard.liquid_variables;
      }

      metricResults.push({
        metric_id: metric.id,
        metric_name: name,
        description: meta.description,
        priority: meta.priority,
        is_transactional: true,
        has_real_data: hasRealData,
        sample_payload: samplePayload,
        liquid_variables: liquidVariables,
      });
    }

    // Sort by priority
    metricResults.sort((a, b) => a.priority - b.priority);

    // Store in klaviyo_connections for caching
    const now = new Date().toISOString();
    const cachedStats = (connection.cached_stats || {}) as Record<string, unknown>;
    await supabase.from("klaviyo_connections").update({
      cached_stats: { ...cachedStats, event_schemas: { metrics: metricResults, synced_at: now } },
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

// Internal Klaviyo metadata keys that are NOT valid Liquid variables
const INTERNAL_KEYS = new Set(["$extra", "$attribution", "$flow", "$message", "$variation", "$timezone", "$anonymous", "$browser", "$browser_version", "$city", "$country", "$device_type", "$ip", "$latitude", "$longitude", "$os", "$platform", "$region", "$source", "$timestamp", "$timezone_offset", "extra"]);
const ALLOWED_DOLLAR_KEYS = new Set(["$value", "$event_id"]);

function isInternalKey(key: string): boolean {
  if (INTERNAL_KEYS.has(key)) return true;
  // Skip any $-prefixed key that isn't in the allowed set
  if (key.startsWith("$") && !ALLOWED_DOLLAR_KEYS.has(key)) return true;
  return false;
}

function extractLiquidVars(obj: any, prefix = "event"): string[] {
  const vars: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (isInternalKey(key)) continue;
    const path = `${prefix}.${key}`;
    if (Array.isArray(value)) {
      vars.push(path);
      if (value[0] && typeof value[0] === "object") {
        for (const itemKey of Object.keys(value[0])) {
          if (isInternalKey(itemKey)) continue;
          vars.push(`${path}[].${itemKey}`);
        }
      }
    } else if (value && typeof value === "object") {
      vars.push(...extractLiquidVars(value, path));
    } else {
      vars.push(path);
    }
  }
  return vars;
}

function getStandardSchemas() {
  return [
    { metric_id: "standard_checkout_started", metric_name: "Checkout Started", description: "Abandoned Checkout flow", priority: 1, is_transactional: true, has_real_data: false, ...getStandardSchemaForMetric("Checkout Started") },
    { metric_id: "standard_placed_order", metric_name: "Placed Order", description: "Order confirmation, post-purchase", priority: 2, is_transactional: true, has_real_data: false, ...getStandardSchemaForMetric("Placed Order") },
    { metric_id: "standard_fulfilled_order", metric_name: "Fulfilled Order", description: "Shipping confirmation", priority: 3, is_transactional: true, has_real_data: false, ...getStandardSchemaForMetric("Fulfilled Order") },
    { metric_id: "standard_viewed_product", metric_name: "Viewed Product", description: "Browse abandonment", priority: 4, is_transactional: true, has_real_data: false, ...getStandardSchemaForMetric("Viewed Product") },
  ];
}

function getStandardSchemaForMetric(name: string) {
  const schemas: Record<string, { sample_payload: any; liquid_variables: string[] }> = {
    "Checkout Started": {
      sample_payload: {
        "$event_id": "abc123",
        "$value": 89.00,
        "CheckoutURL": "https://store.com/checkout/123",
        "ItemNames": ["Product A", "Product B"],
        "Items": [
          { "ProductName": "Product A", "Quantity": 1, "ItemPrice": 49.00, "ImageURL": "https://store.com/img/a.jpg", "ProductURL": "https://store.com/a" },
          { "ProductName": "Product B", "Quantity": 1, "ItemPrice": 40.00, "ImageURL": "https://store.com/img/b.jpg", "ProductURL": "https://store.com/b" },
        ],
      },
      liquid_variables: ["event.$value", "event.CheckoutURL", "event.ItemNames", "event.Items", "event.Items[].ProductName", "event.Items[].Quantity", "event.Items[].ItemPrice", "event.Items[].ImageURL", "event.Items[].ProductURL"],
    },
    "Started Checkout": {
      sample_payload: {
        "$event_id": "abc123",
        "$value": 89.00,
        "CheckoutURL": "https://store.com/checkout/123",
        "Items": [
          { "ProductName": "Product A", "Quantity": 1, "ItemPrice": 49.00, "ImageURL": "https://store.com/img/a.jpg", "ProductURL": "https://store.com/a" },
        ],
      },
      liquid_variables: ["event.$value", "event.CheckoutURL", "event.Items", "event.Items[].ProductName", "event.Items[].Quantity", "event.Items[].ItemPrice", "event.Items[].ImageURL", "event.Items[].ProductURL"],
    },
    "Placed Order": {
      sample_payload: {
        "$event_id": "order_456",
        "$value": 124.00,
        "OrderId": "#1042",
        "Categories": ["Apparel"],
        "ItemNames": ["Classic Tee", "Denim Jacket"],
        "Items": [
          { "ProductName": "Classic Tee", "Quantity": 2, "ItemPrice": 29.00, "ImageURL": "https://store.com/img/tee.jpg", "ProductURL": "https://store.com/tee", "SKU": "TEE-001" },
          { "ProductName": "Denim Jacket", "Quantity": 1, "ItemPrice": 66.00, "ImageURL": "https://store.com/img/jacket.jpg", "ProductURL": "https://store.com/jacket", "SKU": "JKT-001" },
        ],
        "BillingAddress": { "FirstName": "Sarah", "LastName": "Smith", "City": "Los Angeles", "Region": "CA", "Country": "US" },
      },
      liquid_variables: ["event.$value", "event.OrderId", "event.Categories", "event.ItemNames", "event.Items", "event.Items[].ProductName", "event.Items[].Quantity", "event.Items[].ItemPrice", "event.Items[].ImageURL", "event.Items[].ProductURL", "event.Items[].SKU", "event.BillingAddress.FirstName"],
    },
    "Ordered Product": {
      sample_payload: {
        "$event_id": "order_456",
        "$value": 124.00,
        "OrderId": "#1042",
        "Items": [
          { "ProductName": "Classic Tee", "Quantity": 2, "ItemPrice": 29.00, "ImageURL": "https://store.com/img/tee.jpg" },
        ],
      },
      liquid_variables: ["event.$value", "event.OrderId", "event.Items", "event.Items[].ProductName", "event.Items[].Quantity", "event.Items[].ItemPrice", "event.Items[].ImageURL"],
    },
    "Fulfilled Order": {
      sample_payload: {
        "$event_id": "ful_789",
        "$value": 89.00,
        "OrderId": "#1042",
        "TrackingNumber": "1Z999AA10123456784",
        "TrackingURL": "https://ups.com/track/1Z999AA10123456784",
        "Carrier": "UPS",
        "Items": [
          { "ProductName": "Classic Tee", "Quantity": 1, "ItemPrice": 29.00, "ImageURL": "https://store.com/img/tee.jpg" },
        ],
      },
      liquid_variables: ["event.$value", "event.OrderId", "event.TrackingNumber", "event.TrackingURL", "event.Carrier", "event.Items", "event.Items[].ProductName", "event.Items[].Quantity", "event.Items[].ItemPrice", "event.Items[].ImageURL"],
    },
    "Viewed Product": {
      sample_payload: {
        "$event_id": "vp_101",
        "$value": 49.00,
        "ProductName": "Classic Tee",
        "ProductURL": "https://store.com/tee",
        "ImageURL": "https://store.com/img/tee.jpg",
        "Categories": ["Apparel"],
        "Brand": "MyBrand",
      },
      liquid_variables: ["event.$value", "event.ProductName", "event.ProductURL", "event.ImageURL", "event.Categories", "event.Brand"],
    },
  };
  return schemas[name] || { sample_payload: {}, liquid_variables: [] };
}
