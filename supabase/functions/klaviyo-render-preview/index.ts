import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { html, event_properties, profile_name, profile_email } = await req.json();
    if (!html) throw new Error("html is required");

    // Simple Liquid-like substitution (without full liquidjs dependency)
    let rendered = html;
    const context: Record<string, any> = {
      event: event_properties || {},
      person: {
        first_name: profile_name?.split(" ")[0] || "there",
        last_name: profile_name?.split(" ").slice(1).join(" ") || "",
        email: profile_email || "customer@example.com",
      },
      organization: {
        unsubscribe_link: "#unsubscribe",
      },
    };

    // Replace {{ variable | default: 'fallback' }} patterns
    rendered = rendered.replace(/\{\{\s*([^}|]+?)(?:\s*\|\s*default:\s*['"]([^'"]*)['"]\s*)?\s*\}\}/g, (
      _match: string, path: string, defaultVal: string
    ) => {
      const value = resolvePath(context, path.trim());
      if (value !== undefined && value !== null && value !== "") return String(value);
      return defaultVal || "";
    });

    // Handle {% for item in event.Items %} ... {% endfor %} loops
    rendered = rendered.replace(
      /\{%\s*for\s+(\w+)\s+in\s+([^%]+?)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g,
      (_match: string, itemVar: string, arrayPath: string, body: string) => {
        const arr = resolvePath(context, arrayPath.trim());
        if (!Array.isArray(arr)) return "";
        return arr.map((item: any) => {
          let result = body;
          // Replace {{ itemVar.prop }} patterns
          result = result.replace(/\{\{\s*([^}|]+?)(?:\s*\|\s*default:\s*['"]([^'"]*)['"]\s*)?\s*\}\}/g, (
            _m: string, p: string, def: string
          ) => {
            const trimmed = p.trim();
            if (trimmed.startsWith(itemVar + ".")) {
              const subPath = trimmed.slice(itemVar.length + 1);
              const val = resolvePath(item, subPath);
              if (val !== undefined && val !== null && val !== "") return String(val);
              return def || "";
            }
            // Fall through to main context
            const val = resolvePath(context, trimmed);
            if (val !== undefined && val !== null && val !== "") return String(val);
            return def || "";
          });
          return result;
        }).join("");
      }
    );

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

function resolvePath(obj: any, path: string): any {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}
