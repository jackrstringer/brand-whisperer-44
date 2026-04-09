import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Liquid } from "https://esm.sh/liquidjs@10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const engine = new Liquid({ strictVariables: false, strictFilters: false });

/**
 * Recursively remap $-prefixed keys to clean names so Liquid dot notation works.
 * e.g. $extra → extra, $value → value, $event_id → event_id
 */
function remapDollarKeys(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => remapDollarKeys(item));
  }
  if (typeof obj === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanKey = key.startsWith("$") ? key.slice(1) : key;
      result[cleanKey] = remapDollarKeys(value);
    }
    return result;
  }
  return obj;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { html, event_properties, profile_name, profile_email } = await req.json();
    if (!html) throw new Error("html is required");

    // Remap $-prefixed keys so {{ event.extra.line_items }} works
    const cleanedProps = remapDollarKeys(event_properties || {});

    const context = {
      event: cleanedProps,
      person: {
        first_name: profile_name?.split(" ")[0] || "there",
        last_name: profile_name?.split(" ").slice(1).join(" ") || "",
        email: profile_email || "customer@example.com",
      },
      organization: {
        unsubscribe_link: "#unsubscribe",
      },
    };

    console.log("[klaviyo-render-preview] Context keys:", Object.keys(cleanedProps));
    if (cleanedProps.extra) {
      console.log("[klaviyo-render-preview] extra keys:", Object.keys(cleanedProps.extra));
      if (cleanedProps.extra.line_items) {
        console.log("[klaviyo-render-preview] line_items count:", cleanedProps.extra.line_items.length);
      }
    }

    const rendered = await engine.parseAndRender(html, context);

    return new Response(JSON.stringify({ rendered_html: rendered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("klaviyo-render-preview error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
