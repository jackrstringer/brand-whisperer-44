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
  // We must ONLY wrap {{ }} that appear in TEXT CONTENT (between > and <),
  // never inside HTML attributes (between < and >). A naive global regex
  // breaks src="{{ url }}", href="{{ link }}", etc.

  // Strategy: split the HTML into segments of "inside tag" vs "text content",
  // and only inject markers in text content segments.
  let result = "";
  let i = 0;
  while (i < html.length) {
    if (html[i] === "<") {
      // Inside an HTML tag — copy verbatim until we hit >
      const closeIdx = html.indexOf(">", i);
      if (closeIdx === -1) {
        result += html.slice(i);
        break;
      }
      let tagContent = html.slice(i, closeIdx + 1);
      // If this tag has {{ }} in its attributes (e.g. href, src),
      // add a data-liquid-attr marker so the iframe can detect it as dynamic
      if (/\{\{[^}]+\}\}/.test(tagContent) && /^<[a-zA-Z]/.test(tagContent)) {
        // Add data-liquid-attr to the opening tag
        tagContent = tagContent.replace(/^(<[a-zA-Z][^\s>]*)/, '$1 data-liquid-attr="true"');
      }
      result += tagContent;
      i = closeIdx + 1;
    } else {
      // Text content — find next < or end
      const nextTag = html.indexOf("<", i);
      const textEnd = nextTag === -1 ? html.length : nextTag;
      let textSegment = html.slice(i, textEnd);

      // Wrap {{ variable }} expressions in this text segment
      textSegment = textSegment.replace(
        /\{\{\s*([^}|]+?)(?:\s*\|[^}]*)?\s*\}\}/g,
        (_match, varPath) => {
          const path = varPath.trim();
          return `<span data-liquid="${path}">${_match}</span>`;
        }
      );

      result += textSegment;
      i = textEnd;
    }
  }

  // Mark {% for %} loop bodies (these are always in text content already,
  // but we do a second pass for the loop wrappers)
  result = result.replace(
    /(\{%[-\s]*for\s+(\w+)\s+in\s+([^%]+?)\s*[-]?%\})/g,
    (_match, fullTag, _loopVar, arrayPath) => {
      const cleanPath = arrayPath.trim();
      return `${fullTag}<span data-liquid-loop="${cleanPath}" data-liquid-var="${_loopVar}" style="display:contents">`;
    }
  );

  result = result.replace(
    /(\{%[-\s]*endfor\s*[-]?%\})/g,
    '</span>$1'
  );

  return result;
}

/**
 * Strip Klaviyo-specific template tags that LiquidJS can't parse.
 * Replace {% catalog %}...{% endcatalog %} blocks with their inner content
 * (using placeholder values for catalog_item variables).
 * Replace {% currency_format ... %} with a placeholder price.
 */
function stripKlaviyoTags(html: string): string {
  // Remove {% catalog ... %} and {% endcatalog %} tags but keep inner content
  let result = html.replace(/\{%-?\s*catalog\s+[^%]*-?%\}/gi, '');
  result = result.replace(/\{%-?\s*endcatalog\s*-?%\}/gi, '');

  // Replace catalog_item variables with placeholder values
  result = result.replace(/\{\{\s*catalog_item\.title[^}]*\}\}/gi, 'Product Title');
  result = result.replace(/\{\{\s*catalog_item\.url[^}]*\}\}/gi, '#');
  result = result.replace(/\{\{\s*catalog_item\.featured_image\.full\.src[^}]*\}\}/gi, 'https://placehold.co/300x300/f5f5f5/999999?text=Product');
  result = result.replace(/\{\{\s*catalog_item\.featured_image\.thumbnail\.src[^}]*\}\}/gi, 'https://placehold.co/180x180/f5f5f5/999999?text=Product');
  result = result.replace(/\{\{\s*catalog_item\.[^}]*\}\}/gi, '');

  // Replace {% currency_format ... %} with a placeholder price
  result = result.replace(/\{%-?\s*currency_format\s+[^%]*-?%\}/gi, '$0.00');

  // Replace {% has_category ... %} blocks
  result = result.replace(/\{%-?\s*has_category\s+[^%]*-?%\}/gi, '');

  // Replace {% elif %} with {% elsif %} (Django→Liquid)
  result = result.replace(/\{%-?\s*elif\b/g, '{%- elsif');

  // Strip {% unless %}/{% endunless %} → LiquidJS supports these, keep them
  // But strip Klaviyo-specific conditional operators that LiquidJS doesn't understand:
  // e.g. "not" as unary operator: {% if not condition %} → {% unless condition %}
  // Handle this by replacing {% if not X %} with {% unless X %}
  result = result.replace(/\{%-?\s*if\s+not\s+/g, '{%- unless ');

  // Catch-all: strip any remaining unknown Klaviyo block tags that would crash LiquidJS
  // Known safe tags: if, elsif, else, endif, for, endfor, unless, endunless, assign, capture, endcapture, comment, endcomment, raw, endraw, case, when, endcase, increment, decrement, cycle, tablerow, endtablerow, break, continue, render, include, layout, block, endblock
  const safeTagNames = /^-?\s*(if|elsif|else|endif|for|endfor|unless|endunless|assign|capture|endcapture|comment|endcomment|raw|endraw|case|when|endcase|increment|decrement|cycle|tablerow|endtablerow|break|continue|render|include|layout|block|endblock)\b/i;
  result = result.replace(/\{%([^%]*?)%\}/g, (match, inner) => {
    const trimmed = inner.trim().replace(/^-/, '').trim();
    if (safeTagNames.test(trimmed)) {
      return match; // Keep safe tags
    }
    // Unknown tag — strip it
    console.log(`[stripKlaviyoTags] Stripping unknown tag: {% ${inner.trim()} %}`);
    return '';
  });

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
    const cleanedHtml = stripKlaviyoTags(html);
    const markedHtml = injectLiquidMarkers(cleanedHtml);

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
