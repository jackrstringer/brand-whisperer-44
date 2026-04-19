// supabase/functions/analyze-reference-for-flow/index.ts
// Semantic reference analysis: tells the generator what each section of a reference email
// requires as a data source so it never hardcodes dynamic content.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { brand_id, reference_id, trigger_metric_name, flow_type } = await req.json();
    if (!reference_id) {
      return new Response(JSON.stringify({ sections: [], skipped: true, error: "reference_id required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch reference slices
    const { data: refCampaign } = await supabase
      .from("reference_campaigns")
      .select("image_slice_urls, title")
      .eq("id", reference_id)
      .single();

    if (!refCampaign?.image_slice_urls?.length) {
      return new Response(JSON.stringify({ sections: [], skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch available product feeds
    let productFeeds: any[] = [];
    if (brand_id) {
      const { data: klaviyoConn } = await supabase
        .from("klaviyo_connections")
        .select("cached_stats")
        .eq("brand_id", brand_id)
        .single();
      productFeeds = (klaviyoConn?.cached_stats as any)?.product_feeds || [];
    }

    // Build image content blocks from slices (skip index 0 overview, use detail slices)
    const detailSlices = (refCampaign.image_slice_urls as any[])
      .filter((s: any) => s.index !== 0)
      .slice(0, 6);

    async function fetchAsBase64(url: string): Promise<string> {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`);
      const buf = await r.arrayBuffer();
      const uint8 = new Uint8Array(buf);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    }

    const content: any[] = [];

    content.push({
      type: "text",
      text: `Analyze this reference email ("${refCampaign.title || "Unknown"}") section by section.
The email was triggered by: ${trigger_metric_name || "Unknown"} (${flow_type || "transactional"} flow).
Available Klaviyo product feeds in this account: ${
        productFeeds.length > 0
          ? productFeeds.map((f: any) => `"${f.name}" (${f.feed_type})`).join(", ")
          : "none configured"
      }

For each distinct visual section you can identify, determine what Klaviyo data source it requires and the exact Liquid syntax to implement it.

Return ONLY valid JSON in this exact structure:
{
  "sections": [
    {
      "label": "section name",
      "visual_description": "what it looks like",
      "data_source": "event_property|product_feed|catalog_lookup|static",
      "liquid_pattern": "the exact Liquid syntax to use",
      "recommended_feed": "feed name if data_source is product_feed, else null",
      "grid_columns": 1,
      "grid_rows": 1,
      "notes": "any important implementation notes"
    }
  ],
  "overall_flow_type_confirmed": "browse_abandonment|abandoned_checkout|post_purchase|etc",
  "primary_dynamic_element": "description of the main dynamic section"
}`,
    });

    for (const slice of detailSlices) {
      const isDataUrl = typeof slice.url === "string" && slice.url.startsWith("data:");
      const mediaType = isDataUrl ? slice.url.split(";")[0].split(":")[1] : "image/jpeg";
      const imageData = isDataUrl ? slice.url.split(",")[1] : await fetchAsBase64(slice.url);
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: imageData },
      });
      content.push({
        type: "text",
        text: `[Slice ${slice.index}: ${slice.label}]`,
      });
    }

    content.push({
      type: "text",
      text: `Now return the JSON analysis. Be specific about grid dimensions (columns × rows).
For product feed sections, specify exactly which available feed to use based on context.
For event_property sections, note which event variable provides the data.
This analysis will be used directly by the email generator — be precise.`,
    });

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 24000,
        system: `You are an expert Klaviyo email developer and email marketing strategist.
You analyze reference emails to identify their data architecture — what each section is
and what Klaviyo data source populates it. You understand the difference between:
- Static content (hardcoded images, text)
- Event-triggered dynamic content (the specific product that triggered the flow)
- Product feed content (Klaviyo feeds that populate per-recipient recommendations)
- Catalog lookup content (looking up a specific product by ID using {% catalog item_id %}...{% endcatalog %} block syntax)
IMPORTANT: Klaviyo uses {% catalog item_id %}...{% endcatalog %} block tags for catalog lookups — NOT {% catalog_lookup %}. Inside the block, use catalog_item.featured_image.full.src for images and {% currency_format catalog_item.metadata|lookup:"$price" %} for prices.
You always return valid JSON only, no explanation.`,
        messages: [{ role: "user", content }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Claude API error ${resp.status}: ${errText.substring(0, 500)}`);
    }

    const result = await resp.json();
    const rawText = result.content?.[0]?.text || "";
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const analysis = JSON.parse(jsonMatch[0]);

    console.log(`[analyze-reference-for-flow] Found ${analysis.sections?.length || 0} sections for "${refCampaign.title}"`);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[analyze-reference-for-flow]", err);
    // Never block generation — return empty on error
    return new Response(
      JSON.stringify({ sections: [], skipped: true, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
