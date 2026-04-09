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

/**
 * Inject data-liquid markers around {{ variable }} expressions so the editor
 * iframe can identify which DOM elements contain dynamic content.
 *
 * Transforms:  {{ event.extra.name }}  →  <span data-liquid="event.extra.name">{{ event.extra.name }}</span>
 *
 * Also marks {% for %} loop containers:
 *   {% for item in event.extra.line_items %}  →  {% for item in event.extra.line_items %}<span data-liquid-loop="event.extra.line_items" data-liquid-var="item" style="display:contents">
 *   {% endfor %}  →  </span>{% endfor %}
 *
 * We skip variables that are already inside a data-liquid span (idempotent).
 */
function injectLiquidMarkers(html: string): string {
  // 1. Mark {{ variable }} expressions (not inside existing data-liquid spans)
  // Match {{ path | filters }} but not {%
  let result = html.replace(
    /\{\{\s*([^}|]+?)(?:\s*\|[^}]*)?\s*\}\}/g,
    (match, varPath) => {
      const path = varPath.trim();
      // Skip if already wrapped
      return `<span data-liquid="${path}">${match}</span>`;
    }
  );

  // 2. Mark {% for item in array %} loops
  // We wrap the loop body in a data-liquid-loop span so the editor can propagate styles
  result = result.replace(
    /(\{%[-\s]*for\s+(\w+)\s+in\s+([^%]+?)\s*[-]?%\})/g,
    (match, fullTag, loopVar, arrayPath) => {
      const cleanPath = arrayPath.trim();
      return `${fullTag}<span data-liquid-loop="${cleanPath}" data-liquid-var="${loopVar}" style="display:contents">`;
    }
  );

  // Close the loop wrapper before {% endfor %}
  result = result.replace(
    /(\{%[-\s]*endfor\s*[-]?%\})/g,
    '</span>$1'
  );

  return result;
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

    // Inject data-liquid markers BEFORE Liquid rendering
    const markedHtml = injectLiquidMarkers(html);

    const rendered = await engine.parseAndRender(markedHtml, context);

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
