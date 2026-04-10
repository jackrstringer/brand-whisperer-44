import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const KLAVIYO_REVISION = "2025-04-15";

// ── Feed presets ─────────────────────────────────────────────────
interface FeedPreset {
  key: string;
  label: string;
  metric: string | null;
  measurement: string;
  groupBy: string;
  timeframeDays: number | null;
  sort: string;
  catalogSort: string | null;
}

const FEED_PRESETS: Record<string, FeedPreset> = {
  best_sellers: {
    key: "best_sellers",
    label: "Best Sellers",
    metric: "Ordered Product",
    measurement: "count",
    groupBy: "$variation",
    timeframeDays: 30,
    sort: "-count",
    catalogSort: null,
  },
  trending: {
    key: "trending",
    label: "Trending Now",
    metric: "Viewed Product",
    measurement: "count",
    groupBy: "$variation",
    timeframeDays: 7,
    sort: "-count",
    catalogSort: null,
  },
  new_arrivals: {
    key: "new_arrivals",
    label: "New Arrivals",
    metric: null,
    measurement: "",
    groupBy: "",
    timeframeDays: null,
    sort: "",
    catalogSort: "-created",
  },
  most_viewed: {
    key: "most_viewed",
    label: "Most Viewed",
    metric: "Viewed Product",
    measurement: "count",
    groupBy: "$variation",
    timeframeDays: 30,
    sort: "-count",
    catalogSort: null,
  },
};

interface ProductSlot {
  external_id: string;
  title: string;
  price: number | null;
  url: string;
  image_url: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function klaviyoHeaders(apiKey: string) {
  return {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    revision: KLAVIYO_REVISION,
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
  };
}

/** Resolve metric name → metric ID. Cached in klaviyo_connections.cached_stats.metric_id_cache */
async function resolveMetricId(
  apiKey: string,
  metricName: string,
  cachedMetricIds: Record<string, string>
): Promise<string | null> {
  if (cachedMetricIds[metricName]) return cachedMetricIds[metricName];

  const resp = await fetch(`${KLAVIYO_API_BASE}/metrics/?filter=equals(name,"${metricName}")`, {
    headers: klaviyoHeaders(apiKey),
  });
  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[klaviyo-fetch-products] Failed to resolve metric "${metricName}": ${resp.status} ${err}`);
    return null;
  }
  const data = await resp.json();
  const metrics = data.data || [];
  if (metrics.length === 0) return null;
  const id = metrics[0].id;
  cachedMetricIds[metricName] = id;
  return id;
}

/** Fetch ranked product IDs via Metric Aggregates */
async function fetchMetricAggregates(
  apiKey: string,
  metricId: string,
  preset: FeedPreset,
  slotCount: number
): Promise<string[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (preset.timeframeDays || 30));

  const payload = {
    data: {
      type: "metric-aggregate",
      attributes: {
        metric_id: metricId,
        measurements: [preset.measurement],
        interval: "day",
        page_size: slotCount,
        by: [preset.groupBy],
        filter: [
          `greater-or-equal(datetime,${startDate.toISOString().split("T")[0]}T00:00:00)`,
          `less-than(datetime,${endDate.toISOString().split("T")[0]}T00:00:00)`,
        ],
        sort: preset.sort,
      },
    },
  };

  const resp = await fetch(`${KLAVIYO_API_BASE}/metric-aggregates/`, {
    method: "POST",
    headers: klaviyoHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[klaviyo-fetch-products] Metric aggregates failed: ${resp.status} ${err}`);
    return [];
  }

  const data = await resp.json();
  // Extract product IDs from grouped results
  // The response has data.attributes.data where each entry has dimensions and measurements
  const results = data?.data?.attributes?.data || [];
  const ids: string[] = [];
  for (const row of results) {
    const dimensions = row.dimensions || [];
    if (dimensions.length > 0 && dimensions[0]) {
      ids.push(dimensions[0]);
    }
  }
  return ids.slice(0, slotCount);
}

/** Build compound catalog ID */
function compoundId(externalId: string): string {
  return `$custom:::$default:::${externalId}`;
}

/** Hydrate product data from Catalog Items API */
async function hydrateCatalogItems(
  apiKey: string,
  externalIds: string[],
): Promise<ProductSlot[]> {
  if (externalIds.length === 0) return [];

  const compoundIds = externalIds.map(compoundId);
  const filterStr = `any(ids,["${compoundIds.join('","')}"])`;
  const fields = "external_id,title,description,url,price,image_full_url,image_thumbnail_url";

  const url = `${KLAVIYO_API_BASE}/catalog-items/?filter=${encodeURIComponent(filterStr)}&fields[catalog-item]=${fields}`;
  const resp = await fetch(url, { headers: klaviyoHeaders(apiKey) });

  if (!resp.ok) {
    // If catalog-items fails, try catalog-variants (metric may return variant IDs)
    console.warn(`[klaviyo-fetch-products] Catalog items fetch failed (${resp.status}), trying variants`);
    await resp.text();
    return await hydrateFromVariants(apiKey, externalIds);
  }

  const data = await resp.json();
  const items = data.data || [];

  // Map back in original order
  const itemMap = new Map<string, ProductSlot>();
  for (const item of items) {
    const attrs = item.attributes || {};
    const slot: ProductSlot = {
      external_id: attrs.external_id || "",
      title: attrs.title || "",
      price: attrs.price ?? null,
      url: attrs.url || "#",
      image_url: attrs.image_full_url || attrs.image_thumbnail_url || "",
    };
    itemMap.set(attrs.external_id, slot);
    // Also map by compound ID
    itemMap.set(item.id, slot);
  }

  // If we got fewer items than IDs, some may be variant IDs
  if (items.length < externalIds.length) {
    const missingIds = externalIds.filter(id => !itemMap.has(id) && !itemMap.has(compoundId(id)));
    if (missingIds.length > 0) {
      const variantSlots = await hydrateFromVariants(apiKey, missingIds);
      for (const slot of variantSlots) {
        itemMap.set(slot.external_id, slot);
      }
    }
  }

  // Return in original order
  return externalIds
    .map(id => itemMap.get(id) || itemMap.get(compoundId(id)))
    .filter(Boolean) as ProductSlot[];
}

/** Fallback: hydrate from catalog variants and get parent item data */
async function hydrateFromVariants(
  apiKey: string,
  externalIds: string[],
): Promise<ProductSlot[]> {
  const compoundIds = externalIds.map(compoundId);
  const filterStr = `any(ids,["${compoundIds.join('","')}"])`;
  const url = `${KLAVIYO_API_BASE}/catalog-variants/?filter=${encodeURIComponent(filterStr)}&fields[catalog-variant]=external_id,title,price,image_full_url&include=items&fields[catalog-item]=external_id,title,url,image_full_url`;

  const resp = await fetch(url, { headers: klaviyoHeaders(apiKey) });
  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[klaviyo-fetch-products] Catalog variants fetch failed: ${resp.status} ${err}`);
    return [];
  }

  const data = await resp.json();
  const variants = data.data || [];
  const included = data.included || [];

  // Build parent item map
  const parentMap = new Map<string, any>();
  for (const inc of included) {
    if (inc.type === "catalog-item") {
      parentMap.set(inc.id, inc.attributes || {});
    }
  }

  const slots: ProductSlot[] = [];
  for (const v of variants) {
    const attrs = v.attributes || {};
    // Try to get parent item for URL
    const parentRel = v.relationships?.items?.data?.[0];
    const parent = parentRel ? parentMap.get(parentRel.id) : null;

    slots.push({
      external_id: attrs.external_id || "",
      title: attrs.title || parent?.title || "",
      price: attrs.price ?? null,
      url: parent?.url || "#",
      image_url: attrs.image_full_url || parent?.image_full_url || "",
    });
  }
  return slots;
}

/** Fetch catalog items sorted by creation date (New Arrivals) */
async function fetchNewArrivals(
  apiKey: string,
  slotCount: number,
): Promise<ProductSlot[]> {
  const fields = "external_id,title,description,url,price,image_full_url,image_thumbnail_url";
  const url = `${KLAVIYO_API_BASE}/catalog-items/?sort=-created&page[size]=${slotCount}&fields[catalog-item]=${fields}&filter=${encodeURIComponent("equals(published,true)")}`;

  const resp = await fetch(url, { headers: klaviyoHeaders(apiKey) });
  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[klaviyo-fetch-products] New arrivals fetch failed: ${resp.status} ${err}`);
    return [];
  }

  const data = await resp.json();
  return (data.data || []).map((item: any) => {
    const attrs = item.attributes || {};
    return {
      external_id: attrs.external_id || "",
      title: attrs.title || "",
      price: attrs.price ?? null,
      url: attrs.url || "#",
      image_url: attrs.image_full_url || attrs.image_thumbnail_url || "",
    };
  });
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
    const { brandId, presetKey, slotCount: requestedSlotCount } = body;
    if (!brandId) throw new Error("brandId is required");

    const preset = FEED_PRESETS[presetKey || "best_sellers"];
    if (!preset) throw new Error(`Unknown preset: ${presetKey}`);

    const slotCount = Math.min(requestedSlotCount || 6, 20);

    // Get Klaviyo connection
    const { data: connection } = await supabase
      .from("klaviyo_connections")
      .select("api_key, cached_stats")
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

    // Check scope permissions early
    try {
      const testResp = await fetch(`${KLAVIYO_API_BASE}/catalog-items/?page[size]=1`, {
        headers: klaviyoHeaders(apiKey),
      });
      if (testResp.status === 403) {
        const errBody = await testResp.text();
        return new Response(JSON.stringify({
          error: "Missing API scopes. Your Klaviyo API key needs: catalogs:read, metrics:read",
          details: errBody,
          products: [],
          presetKey: preset.key,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await testResp.text(); // consume body
    } catch (scopeErr) {
      console.warn("[klaviyo-fetch-products] Scope check error:", scopeErr);
    }

    // Load cached metric IDs
    const cachedStats = (connection.cached_stats || {}) as Record<string, any>;
    const cachedMetricIds: Record<string, string> = cachedStats.metric_id_cache || {};
    let products: ProductSlot[] = [];
    let fellBackToNewArrivals = false;

    if (preset.metric) {
      // Metric-based preset (best sellers, trending, most viewed)
      const metricId = await resolveMetricId(apiKey, preset.metric, cachedMetricIds);

      if (!metricId) {
        console.warn(`[klaviyo-fetch-products] Could not resolve metric "${preset.metric}", falling back to new arrivals`);
        products = await fetchNewArrivals(apiKey, slotCount);
        fellBackToNewArrivals = true;
      } else {
        const rankedIds = await fetchMetricAggregates(apiKey, metricId, preset, slotCount);

        if (rankedIds.length === 0) {
          console.warn(`[klaviyo-fetch-products] No aggregate data for "${preset.metric}", falling back to new arrivals`);
          products = await fetchNewArrivals(apiKey, slotCount);
          fellBackToNewArrivals = true;
        } else {
          products = await hydrateCatalogItems(apiKey, rankedIds);
        }
      }

      // Persist metric ID cache
      if (Object.keys(cachedMetricIds).length > 0) {
        await supabase.from("klaviyo_connections").update({
          cached_stats: { ...cachedStats, metric_id_cache: cachedMetricIds },
        }).eq("brand_id", brandId);
      }
    } else {
      // Catalog-only preset (new arrivals)
      products = await fetchNewArrivals(apiKey, slotCount);
    }

    return new Response(JSON.stringify({
      products,
      presetKey: preset.key,
      presetLabel: preset.label,
      fellBackToNewArrivals,
      slotCount,
      presets: Object.values(FEED_PRESETS).map(p => ({ key: p.key, label: p.label })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("[klaviyo-fetch-products] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
