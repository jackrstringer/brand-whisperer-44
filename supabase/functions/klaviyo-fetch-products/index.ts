import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const KLAVIYO_REVISION = "2025-04-15";

// ── Property resolver ────────────────────────────────────────────
const PROPERTY_MAP: Record<string, string[]> = {
  product_id: ["ProductID", "$product_id", "product_id", "$variant_id", "VariantId"],
  product_name: ["ProductName", "$product_name", "product_name", "Name", "Title"],
  image_url: ["ImageURL", "$image", "image_url", "ProductImageURL", "ImageUrl"],
  product_url: ["ProductURL", "$url", "product_url", "URL", "Url"],
  price: ["Price", "$price", "price", "$value"],
  quantity: ["Quantity", "$quantity", "quantity"],
  sku: ["SKU", "$sku", "sku"],
  brand: ["Brand", "$brand", "brand", "Vendor"],
  categories: ["Categories", "$categories", "collections", "ProductType"],
};

function resolveProperty(props: Record<string, any>, field: string): any {
  const keys = PROPERTY_MAP[field];
  if (!keys) return null;
  for (const key of keys) {
    if (props[key] !== undefined && props[key] !== null && props[key] !== "") {
      return props[key];
    }
  }
  return null;
}

// ── Junk filter ──────────────────────────────────────────────────
const JUNK_NAME_BLACKLIST = [
  "shipping protection", "route protection", "route package protection",
  "shipping insurance", "package protection", "order protection",
  "delivery protection", "carbon neutral", "carbon offset",
  "offset shipping", "eco shipping", "free gift", "free sample",
  "gwp ", "gift with purchase", "bonus gift", "mystery gift",
  "warranty", "extended warranty", "product warranty", "protection plan",
  "care plan", "tip for", "tip - ", "gratuity", "donation", "charitable",
  "gift card", "gift certificate", "e-gift", "egift", "store credit",
  "placeholder", "test product", "do not delete", "draft product", "hidden product",
];

const JUNK_SKU_PREFIXES = [
  "SHIP-", "PROTECT-", "GWP-", "FREE-", "WARRANTY-", "TIP-",
  "DONATION-", "GC-", "GIFTCARD-",
];

function isJunkProduct(name: string | null, price: number | null, sku: string | null, imageUrl: string | null): boolean {
  const nameLower = (name || "").toLowerCase();
  for (const term of JUNK_NAME_BLACKLIST) {
    if (nameLower.includes(term)) return true;
  }
  if (price !== null && (price <= 0.01 || price > 5000)) return true;
  if (sku) {
    const skuUpper = sku.toUpperCase();
    for (const prefix of JUNK_SKU_PREFIXES) {
      if (skuUpper.startsWith(prefix)) return true;
    }
  }
  if (!name || !imageUrl) return true;
  return false;
}

// ── Feed presets ─────────────────────────────────────────────────
interface FeedPreset {
  key: string;
  label: string;
  metric: string;
  timeframeDays: number;
  description: string;
  countField: string; // column in DB to sort by
}

const FEED_PRESETS: Record<string, FeedPreset> = {
  best_sellers: {
    key: "best_sellers",
    label: "Best Sellers",
    metric: "Ordered Product",
    timeframeDays: 30,
    description: "Products with the most orders in the last 30 days",
    countField: "order_count",
  },
  trending: {
    key: "trending",
    label: "Trending Now",
    metric: "Viewed Product",
    timeframeDays: 7,
    description: "Most viewed products in the last 7 days",
    countField: "view_count",
  },
  most_viewed: {
    key: "most_viewed",
    label: "Most Viewed",
    metric: "Viewed Product",
    timeframeDays: 30,
    description: "Most viewed products in the last 30 days",
    countField: "view_count",
  },
  popular_checkouts: {
    key: "popular_checkouts",
    label: "Popular Picks",
    metric: "Started Checkout",
    timeframeDays: 30,
    description: "Products most frequently added to checkout in the last 30 days",
    countField: "checkout_count",
  },
};

// ── Klaviyo API helpers ──────────────────────────────────────────
function klaviyoHeaders(apiKey: string) {
  return {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    revision: KLAVIYO_REVISION,
    Accept: "application/vnd.api+json",
  };
}

async function resolveMetricId(
  apiKey: string,
  metricName: string,
  cache: Record<string, string>
): Promise<string | null> {
  if (cache[metricName]) return cache[metricName];
  let allMetrics: any[] = [];
  let nextUrl: string | null = `${KLAVIYO_API_BASE}/metrics/`;
  while (nextUrl && allMetrics.length < 500) {
    const resp = await fetch(nextUrl, { headers: klaviyoHeaders(apiKey) });
    if (!resp.ok) {
      const errBody = await resp.text();
      console.error(`[product-sync] Metrics fetch failed: ${resp.status} ${errBody}`);
      return null;
    }
    const data = await resp.json();
    allMetrics = allMetrics.concat(data.data || []);
    nextUrl = data.links?.next || null;
  }
  const found = allMetrics.find((m: any) => m.attributes?.name === metricName);
  if (!found) return null;
  cache[metricName] = found.id;
  return found.id;
}

async function fetchEventsForMetric(
  metricId: string,
  startDate: Date,
  endDate: Date,
  apiKey: string,
  minEvents: number = 500
): Promise<any[]> {
  const allEvents: any[] = [];
  const startISO = startDate.toISOString().replace(/\.\d{3}Z$/, "Z");
  const endISO = endDate.toISOString().replace(/\.\d{3}Z$/, "Z");
  const filter = `equals(metric_id,"${metricId}"),greater-or-equal(datetime,${startISO}),less-than(datetime,${endISO})`;
  let url: string | null = `${KLAVIYO_API_BASE}/events/?filter=${encodeURIComponent(filter)}&sort=-datetime&page[size]=100`;

  const timeout = Date.now() + 10000; // 10s max

  while (url && allEvents.length < minEvents && Date.now() < timeout) {
    const response = await fetch(url, { headers: klaviyoHeaders(apiKey) });
    if (!response.ok) {
      console.error(`[product-sync] Events fetch failed: ${response.status}`);
      break;
    }
    const data = await response.json();
    allEvents.push(...(data.data || []));
    url = data.links?.next || null;
  }

  return allEvents;
}

// ── Sync logic ───────────────────────────────────────────────────
interface ExtractedProduct {
  product_id: string;
  product_name: string;
  image_url: string;
  product_url: string;
  price: number | null;
  sku: string | null;
  brand: string | null;
  categories: string[] | null;
  order_count: number;
  view_count: number;
  checkout_count: number;
  first_seen: string;
  last_seen: string;
}

type MetricType = "Ordered Product" | "Viewed Product" | "Started Checkout";
const METRIC_COUNT_FIELD: Record<MetricType, keyof Pick<ExtractedProduct, "order_count" | "view_count" | "checkout_count">> = {
  "Ordered Product": "order_count",
  "Viewed Product": "view_count",
  "Started Checkout": "checkout_count",
};

async function syncProductStore(
  supabase: any,
  brandId: string,
  klaviyoAccountId: string,
  apiKey: string,
  fullSync: boolean = true
): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  const metricCache: Record<string, string> = {};
  const productMap = new Map<string, ExtractedProduct>();

  const metricsToSync: MetricType[] = ["Ordered Product", "Viewed Product", "Started Checkout"];
  const lookbackDays = fullSync ? 30 : 2; // 48h overlap for incremental
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);
  const endDate = new Date();

  for (const metricName of metricsToSync) {
    const metricId = await resolveMetricId(apiKey, metricName, metricCache);
    if (!metricId) {
      console.warn(`[product-sync] Could not resolve metric "${metricName}"`);
      errors.push(`Metric "${metricName}" not found — this account may not have ${metricName} tracking enabled.`);
      continue;
    }

    console.log(`[product-sync] Fetching events for "${metricName}" (metric ${metricId}), lookback ${lookbackDays}d`);
    const events = await fetchEventsForMetric(metricId, startDate, endDate, apiKey, fullSync ? 500 : 200);
    console.log(`[product-sync] Got ${events.length} events for "${metricName}"`);

    const countField = METRIC_COUNT_FIELD[metricName];

    for (const event of events) {
      const props = event.attributes?.event_properties || {};
      
      // Handle events with Items array (checkout, order events)
      const items = props.Items || props.items || props.line_items || (props.extra?.line_items);
      if (items && Array.isArray(items)) {
        for (const item of items) {
          processEventItem(item, event.attributes?.datetime, countField, productMap);
        }
      } else {
        // Single product event (Viewed Product, etc.)
        processEventItem(props, event.attributes?.datetime, countField, productMap);
      }
    }
  }

  // Persist metric ID cache
  if (Object.keys(metricCache).length > 0) {
    const { data: conn } = await supabase
      .from("klaviyo_connections")
      .select("cached_stats")
      .eq("brand_id", brandId)
      .single();
    if (conn) {
      const stats = (conn.cached_stats || {}) as Record<string, any>;
      await supabase.from("klaviyo_connections").update({
        cached_stats: { ...stats, metric_id_cache: metricCache },
      }).eq("brand_id", brandId);
    }
  }

  // Upsert to DB
  const products = Array.from(productMap.values());
  console.log(`[product-sync] Extracted ${products.length} unique products, upserting to store`);

  let synced = 0;
  const now = new Date().toISOString();

  // Batch upsert in chunks of 50
  for (let i = 0; i < products.length; i += 50) {
    const chunk = products.slice(i, i + 50);
    const rows = chunk.map((p) => ({
      brand_id: brandId,
      klaviyo_account_id: klaviyoAccountId,
      product_id: p.product_id,
      product_name: p.product_name,
      image_url: p.image_url || null,
      product_url: p.product_url || null,
      price: p.price,
      sku: p.sku,
      brand: p.brand,
      categories: p.categories,
      is_junk: isJunkProduct(p.product_name, p.price, p.sku, p.image_url),
      first_seen: p.first_seen,
      last_seen: p.last_seen,
      order_count: p.order_count,
      view_count: p.view_count,
      checkout_count: p.checkout_count,
      last_synced: now,
    }));

    const { error } = await supabase
      .from("klaviyo_product_store")
      .upsert(rows, {
        onConflict: "brand_id,product_id",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`[product-sync] Upsert error:`, error);
      errors.push(`Database upsert failed: ${error.message}`);
    } else {
      synced += chunk.length;
    }
  }

  return { synced, errors };
}

function processEventItem(
  props: Record<string, any>,
  eventDatetime: string,
  countField: keyof Pick<ExtractedProduct, "order_count" | "view_count" | "checkout_count">,
  productMap: Map<string, ExtractedProduct>
) {
  const productId = resolveProperty(props, "product_id");
  if (!productId) return;

  const idStr = String(productId);
  const existing = productMap.get(idStr);

  const name = resolveProperty(props, "product_name") || existing?.product_name || "";
  const imageUrl = resolveProperty(props, "image_url") || existing?.image_url || "";
  const productUrl = resolveProperty(props, "product_url") || existing?.product_url || "";
  const rawPrice = resolveProperty(props, "price");
  const price = rawPrice !== null ? Number(rawPrice) : (existing?.price ?? null);
  const sku = resolveProperty(props, "sku") || existing?.sku || null;
  const brand = resolveProperty(props, "brand") || existing?.brand || null;
  const rawCats = resolveProperty(props, "categories");
  const categories = rawCats
    ? (Array.isArray(rawCats) ? rawCats : [String(rawCats)])
    : (existing?.categories || null);

  const dt = eventDatetime || new Date().toISOString();

  const product: ExtractedProduct = {
    product_id: idStr,
    product_name: name,
    image_url: imageUrl,
    product_url: productUrl,
    price,
    sku,
    brand,
    categories,
    order_count: (existing?.order_count || 0) + (countField === "order_count" ? 1 : 0),
    view_count: (existing?.view_count || 0) + (countField === "view_count" ? 1 : 0),
    checkout_count: (existing?.checkout_count || 0) + (countField === "checkout_count" ? 1 : 0),
    first_seen: existing?.first_seen && existing.first_seen < dt ? existing.first_seen : dt,
    last_seen: existing?.last_seen && existing.last_seen > dt ? existing.last_seen : dt,
  };

  productMap.set(idStr, product);
}

// ── Query local store ────────────────────────────────────────────
async function queryPresetFromStore(
  supabase: any,
  brandId: string,
  presetKey: string,
  slotCount: number
): Promise<any[]> {
  const preset = FEED_PRESETS[presetKey];
  if (!preset) return [];

  // For trending, also filter by last_seen within timeframe
  let query = supabase
    .from("klaviyo_product_store")
    .select("product_id, product_name, image_url, product_url, price, order_count, view_count, checkout_count")
    .eq("brand_id", brandId)
    .eq("is_junk", false)
    .not("image_url", "is", null);

  if (presetKey === "trending") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    query = query.gte("last_seen", cutoff.toISOString());
  }

  query = query.order(preset.countField, { ascending: false }).limit(slotCount);

  const { data, error } = await query;
  if (error) {
    console.error(`[product-sync] Store query error:`, error);
    return [];
  }
  return data || [];
}

// ── Main handler ─────────────────────────────────────────────────
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
    const { brandId, presetKey, slotCount: requestedSlotCount, forceSync } = body;
    if (!brandId) throw new Error("brandId is required");

    const preset = FEED_PRESETS[presetKey || "best_sellers"];
    if (!preset) throw new Error(`Unknown preset: ${presetKey}`);
    const slotCount = Math.min(requestedSlotCount || 8, 20);

    // Get Klaviyo connection
    const { data: connection } = await supabase
      .from("klaviyo_connections")
      .select("api_key, klaviyo_account_id")
      .eq("brand_id", brandId)
      .single();

    if (!connection?.api_key) {
      return new Response(JSON.stringify({
        error: "No Klaviyo connection found",
        products: [],
        presetKey: preset.key,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = connection.api_key;
    const accountId = connection.klaviyo_account_id || brandId;

    // Check if store has recent data
    const { data: storeCheck } = await supabase
      .from("klaviyo_product_store")
      .select("last_synced")
      .eq("brand_id", brandId)
      .order("last_synced", { ascending: false })
      .limit(1)
      .single();

    const staleThresholdMs = 24 * 60 * 60 * 1000; // 24 hours
    const isStale = !storeCheck?.last_synced ||
      (Date.now() - new Date(storeCheck.last_synced).getTime()) > staleThresholdMs;

    let syncPerformed = false;
    let syncErrors: string[] = [];

    if (forceSync || isStale || !storeCheck) {
      // Sync now — full sync if empty, incremental if just stale
      const isFirstSync = !storeCheck;
      console.log(`[product-sync] ${isFirstSync ? "First" : "Incremental"} sync for brand ${brandId}`);

      const result = await syncProductStore(supabase, brandId, accountId, apiKey, isFirstSync || forceSync);
      syncPerformed = true;
      syncErrors = result.errors;
      console.log(`[product-sync] Synced ${result.synced} products, ${result.errors.length} errors`);
    }

    // Query from local store
    const products = await queryPresetFromStore(supabase, brandId, presetKey || "best_sellers", slotCount);

    // If no products after sync, provide specific error
    let error: string | null = null;
    if (products.length === 0 && syncPerformed) {
      if (syncErrors.length > 0) {
        error = syncErrors.join("; ");
      } else {
        error = "No product data available yet. This account needs Viewed Product or Ordered Product tracking enabled in Klaviyo.";
      }
    }

    return new Response(JSON.stringify({
      products: products.map((p: any) => ({
        external_id: p.product_id,
        title: p.product_name,
        price: p.price,
        url: p.product_url || "#",
        image_url: p.image_url || "",
      })),
      presetKey: preset.key,
      presetLabel: preset.label,
      slotCount,
      syncPerformed,
      syncErrors: syncErrors.length > 0 ? syncErrors : undefined,
      error,
      presets: Object.values(FEED_PRESETS).map((p) => ({
        key: p.key,
        label: p.label,
        description: p.description,
      })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("[klaviyo-fetch-products] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
