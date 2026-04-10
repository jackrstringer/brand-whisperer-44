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
      "Ordered Product": { label: "Ordered Product", description: "Per-product trigger", priority: 3 },
      "Fulfilled Order": { label: "Fulfilled Order", description: "Shipping confirmation", priority: 4 },
      "Cancelled Order": { label: "Cancelled Order", description: "Order cancellation", priority: 5 },
      "Refunded Order": { label: "Refunded Order", description: "Refund confirmation", priority: 6 },
      "Viewed Product": { label: "Viewed Product", description: "Browse abandonment", priority: 7 },
      "Added to Cart": { label: "Added to Cart", description: "Cart abandonment", priority: 8 },
    };

    const matchedMetrics = allMetrics.filter((m: any) => {
      const name = m.attributes?.name;
      return name && transactionalNames[name];
    });

    const metricResults = [];

    for (const metric of matchedMetrics) {
      const name = metric.attributes?.name;
      const meta = transactionalNames[name];

      let samplePayload: any = null;
      let liquidVariables: string[] = [];
      let hasRealData = false;

      // Try to fetch a real event for this metric to get its actual schema
      try {
        const eventsUrl = `${KLAVIYO_API_BASE}/events/?filter=equals(metric_id,"${metric.id}")&fields[event]=event_properties&page[size]=1&sort=-datetime`;
        const eventsResp = await fetch(eventsUrl, {
          headers: {
            "Authorization": `Klaviyo-API-Key ${apiKey}`,
            "revision": "2024-10-15",
            "Accept": "application/json",
          },
        });

        if (eventsResp.ok) {
          const eventsData = await eventsResp.json();
          const events = eventsData.data || [];
          if (events.length > 0) {
            const props = events[0].attributes?.event_properties || {};
            // Remap $-prefixed keys to clean names for Liquid compatibility
            samplePayload = remapDollarKeys(props);
            liquidVariables = extractLiquidVars(samplePayload);
            hasRealData = true;
          }
        } else {
          await eventsResp.text(); // consume body
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

    // Fetch product feeds (Klaviyo Web Feeds API) for recommendation grids
    let productFeeds: { id: string; name: string; feed_type: string }[] = [];
    try {
      const feedsResp = await fetch(
        `${KLAVIYO_API_BASE}/web-feeds/?page[size]=20`,
        {
          headers: {
            "Authorization": `Klaviyo-API-Key ${apiKey}`,
            "revision": "2025-07-15",
            "Accept": "application/json",
          },
        }
      );
      if (feedsResp.ok) {
        const feedsData = await feedsResp.json();
        console.log("[klaviyo-fetch-schema] Web feeds response:", JSON.stringify(feedsData.data?.length ?? 0), "feeds found");
        productFeeds = (feedsData.data || []).map((f: any) => ({
          id: f.id,
          name: f.attributes?.name || "",
          feed_type: f.type || "web-feed",
        }));
      } else {
        const errText = await feedsResp.text();
        console.warn("[klaviyo-fetch-schema] Web feeds fetch returned", feedsResp.status, errText);
      }
    } catch (e) {
      console.warn("[klaviyo-fetch-schema] Failed to fetch web feeds:", e);
    }

    // Store in klaviyo_connections for caching
    const now = new Date().toISOString();
    const cachedStats = (connection.cached_stats || {}) as Record<string, unknown>;
    await supabase.from("klaviyo_connections").update({
      cached_stats: {
        ...cachedStats,
        event_schemas: { metrics: metricResults, synced_at: now },
        product_feeds: productFeeds,
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

// Internal Klaviyo metadata keys to skip — NOT useful for Liquid templates
const SKIP_KEYS = new Set(["$attribution", "$flow", "$message", "$variation", "$timezone", "$anonymous", "$browser", "$browser_version", "$city", "$country", "$device_type", "$ip", "$latitude", "$longitude", "$os", "$platform", "$region", "$source", "$timestamp", "$timezone_offset", "$currency_code"]);

/**
 * Recursively remap $-prefixed keys to clean names.
 * $extra → extra, $value → value, $event_id → event_id
 * This makes them accessible via normal Liquid dot notation: {{ event.extra.field }}
 */
function remapDollarKeys(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => remapDollarKeys(item));
  }
  if (typeof obj === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SKIP_KEYS.has(key)) continue;
      // Strip $ prefix for Liquid compatibility
      const cleanKey = key.startsWith("$") ? key.slice(1) : key;
      result[cleanKey] = remapDollarKeys(value);
    }
    return result;
  }
  return obj;
}

function extractLiquidVars(obj: any, prefix = "event", depth = 0): string[] {
  if (depth > 8) return []; // prevent infinite recursion
  const vars: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = `${prefix}.${key}`;
    if (Array.isArray(value)) {
      vars.push(path);
      if (value[0] && typeof value[0] === "object") {
        // Recurse into the first array element to discover nested paths
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
        "event_id": "abc123",
        "value": 89.00,
        "CheckoutURL": "https://store.com/checkout/123",
        "ItemNames": ["Product A", "Product B"],
        "Items": [
          { "ProductName": "Product A", "Quantity": 1, "ItemPrice": 49.00, "ImageURL": "https://store.com/img/a.jpg", "ProductURL": "https://store.com/a" },
          { "ProductName": "Product B", "Quantity": 1, "ItemPrice": 40.00, "ImageURL": "https://store.com/img/b.jpg", "ProductURL": "https://store.com/b" },
        ],
      },
      liquid_variables: ["event.value", "event.CheckoutURL", "event.ItemNames", "event.Items", "event.Items[].ProductName", "event.Items[].Quantity", "event.Items[].ItemPrice", "event.Items[].ImageURL", "event.Items[].ProductURL"],
    },
    "Started Checkout": {
      sample_payload: {
        "event_id": "abc123",
        "value": 89.00,
        "CheckoutURL": "https://store.com/checkout/123",
        "Items": [
          { "ProductName": "Product A", "Quantity": 1, "ItemPrice": 49.00, "ImageURL": "https://store.com/img/a.jpg", "ProductURL": "https://store.com/a" },
        ],
      },
      liquid_variables: ["event.value", "event.CheckoutURL", "event.Items", "event.Items[].ProductName", "event.Items[].Quantity", "event.Items[].ItemPrice", "event.Items[].ImageURL", "event.Items[].ProductURL"],
    },
    "Placed Order": {
      sample_payload: {
        "event_id": "order_456",
        "value": 124.00,
        "OrderId": "#1042",
        "Categories": ["Apparel"],
        "ItemNames": ["Classic Tee", "Denim Jacket"],
        "Items": [
          { "ProductName": "Classic Tee", "Quantity": 2, "ItemPrice": 29.00, "ImageURL": "https://store.com/img/tee.jpg", "ProductURL": "https://store.com/tee", "SKU": "TEE-001", "Variant": "Large / Black" },
          { "ProductName": "Denim Jacket", "Quantity": 1, "ItemPrice": 66.00, "ImageURL": "https://store.com/img/jacket.jpg", "ProductURL": "https://store.com/jacket", "SKU": "JKT-001", "Variant": "Medium / Blue" },
        ],
        "extra": {
          "shipping_address": { "first_name": "Sarah", "last_name": "Smith", "address1": "123 Main St", "city": "Los Angeles", "province": "California", "zip": "90001", "country": "United States" },
          "billing_address": { "first_name": "Sarah", "last_name": "Smith", "address1": "123 Main St", "city": "Los Angeles", "province": "California", "zip": "90001", "country": "United States" },
          "line_items": [
            { "name": "Classic Tee", "quantity": 2, "price": 29.00, "image": "https://store.com/img/tee.jpg", "sku": "TEE-001" },
          ],
          "order_number": 1042,
          "total_price": "124.00",
          "subtotal_price": "114.01",
          "total_tax": "9.99",
          "total_shipping_price_set": { "shop_money": { "amount": "5.99" } },
        },
        "Subtotal": 124.00,
        "Tax": 9.30,
        "Shipping": 5.99,
        "Discount": 0,
        "DiscountCodes": [],
        "Currency": "USD",
      },
      liquid_variables: [
        "event.value", "event.OrderId", "event.Categories", "event.ItemNames",
        "event.extra.order_number", "event.extra.total_price", "event.extra.subtotal_price", "event.extra.total_tax",
        "event.extra.shipping_address.first_name", "event.extra.shipping_address.last_name", "event.extra.shipping_address.city", "event.extra.shipping_address.province",
        "event.extra.billing_address.first_name", "event.extra.billing_address.last_name",
        "event.extra.line_items", "event.extra.line_items[].name", "event.extra.line_items[].quantity", "event.extra.line_items[].price", "event.extra.line_items[].image", "event.extra.line_items[].sku",
        "event.Subtotal", "event.Tax", "event.Shipping", "event.Discount", "event.DiscountCodes", "event.Currency",
      ],
    },
    "Ordered Product": {
      sample_payload: {
        "event_id": "order_456",
        "value": 124.00,
        "OrderId": "#1042",
        "Items": [
          { "ProductName": "Classic Tee", "Quantity": 2, "ItemPrice": 29.00, "ImageURL": "https://store.com/img/tee.jpg" },
        ],
      },
      liquid_variables: ["event.value", "event.OrderId", "event.Items", "event.Items[].ProductName", "event.Items[].Quantity", "event.Items[].ItemPrice", "event.Items[].ImageURL"],
    },
    "Fulfilled Order": {
      sample_payload: {
        "event_id": "ful_789",
        "value": 89.00,
        "OrderId": "#1042",
        "TrackingNumber": "1Z999AA10123456784",
        "TrackingURL": "https://ups.com/track/1Z999AA10123456784",
        "Carrier": "UPS",
        "Items": [
          { "ProductName": "Classic Tee", "Quantity": 1, "ItemPrice": 29.00, "ImageURL": "https://store.com/img/tee.jpg" },
        ],
      },
      liquid_variables: ["event.value", "event.OrderId", "event.TrackingNumber", "event.TrackingURL", "event.Carrier", "event.Items", "event.Items[].ProductName", "event.Items[].Quantity", "event.Items[].ItemPrice", "event.Items[].ImageURL"],
    },
    "Viewed Product": {
      sample_payload: {
        "event_id": "vp_101",
        "value": 49.00,
        "ProductName": "Classic Tee",
        "ProductURL": "https://store.com/tee",
        "ImageURL": "https://store.com/img/tee.jpg",
        "Categories": ["Apparel"],
        "Brand": "MyBrand",
      },
      liquid_variables: ["event.value", "event.ProductName", "event.ProductURL", "event.ImageURL", "event.Categories", "event.Brand"],
    },
  };
  return schemas[name] || { sample_payload: {}, liquid_variables: [] };
}
