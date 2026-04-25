import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FLOW_LABELS: Record<string, string> = {
  welcome: "Welcome",
  abandoned_checkout: "Abandoned Checkout",
  post_purchase: "Post-Purchase",
  browse_abandonment: "Browse Abandonment",
  winback: "Winback",
};

function compact(value: unknown, max = 6000) {
  const text = typeof value === "string" ? value : JSON.stringify(value || {}, null, 2);
  return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text;
}

function normalizeDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null;
  }
}

async function invokeInternal(name: string, payload: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Backend env not configured");
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${name} failed: ${t.slice(0, 300)}`);
  }
  return res;
}

async function runPerplexitySiteResearch(domain: string): Promise<string> {
  const key = Deno.env.get("PERPLEXITY_API_KEY");
  if (!key) {
    console.warn("[flow-setup-research] PERPLEXITY_API_KEY missing, skipping site research");
    return "";
  }
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `For the brand at ${domain}, find:
1. Their current welcome / first-order offer (discount code, % off, free shipping threshold, or no offer)
2. Their hero product or top 1-2 products
3. Whether they have a subscription option and on what products
4. Their free shipping threshold if any
Be specific. Return only what you can confirm from the actual website. 200 words max.`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[flow-setup-research] perplexity error", res.status, t.slice(0, 300));
    return "";
  }
  const json = await res.json();
  return json?.choices?.[0]?.message?.content || "";
}

async function generateRecommendations({
  brandName,
  flowType,
  compiledContext,
  klaviyoCompiled,
  siteText,
}: {
  brandName: string;
  flowType: string;
  compiledContext: string;
  klaviyoCompiled: string;
  siteText: string;
}): Promise<any> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const flowLabel = FLOW_LABELS[flowType] || flowType;

  const system = `You are an elite Klaviyo email flow strategist generating a setup recommendation for a ${flowLabel} flow for the brand "${brandName}".

You have three sources:
- BRAND INTELLIGENCE: ${compact(compiledContext, 6000)}
- KLAVIYO PERFORMANCE: ${compact(klaviyoCompiled, 4000)}
- LIVE WEBSITE RESEARCH: ${compact(siteText, 2000)}

Your job: produce a JSON object with three sections — complexity_options, setup_confirmations, quick_preferences.

RULES:
- Be SPECIFIC. Reference actual product names, real offer details, real discount codes, real categories from the data above. NEVER use generic placeholders like "your hero product" or "your discount code".
- Recommend exactly ONE complexity option. The recommendation must be tailored to this brand's actual data (subscriber base, AOV, repeat rate, catalog size, etc.).
- The rationale on the recommended complexity must cite a real signal from the data (e.g. specific Klaviyo stat, specific brand fact).
- Generate 2-4 complexity options total. They must be meaningfully different (single vs split vs full branching).
- Generate 2-4 setup_confirmations covering: offer, hero product / product scope, primary audience filter, and any other ${flowLabel}-specific decision.
- Generate 1-3 quick_preferences (toggles or selects) for things the agent genuinely cannot infer.
- The "source" tag on each confirmation must be one of: "Found on website", "From Klaviyo", "From brand research", or "Inferred default".
- If you cannot confirm an offer from the website research, say so explicitly in the value (e.g. "No evergreen offer detected — assume none unless edited").

OUTPUT FORMAT — return ONLY valid JSON, no prose, no markdown fences:
{
  "complexity_options": [
    {
      "id": "kebab-case-id",
      "title": "Short title (2-4 words)",
      "description": "One short sentence",
      "bullets": ["3 short bullets describing what this means in practice"],
      "recommended": true | false,
      "rationale": "One sentence citing a real signal — only on the recommended one, null otherwise"
    }
  ],
  "recommended_complexity_id": "<id of recommended option>",
  "setup_confirmations": [
    {
      "key": "snake_case_key",
      "label": "Short label",
      "value": "Specific pre-filled value",
      "source": "Found on website | From Klaviyo | From brand research | Inferred default",
      "editable": true
    }
  ],
  "quick_preferences": [
    {
      "key": "snake_case_key",
      "label": "Short question",
      "type": "toggle" | "select",
      "options": ["only for select type"],
      "default": true | false | "string",
      "recommendation": true | false | "string",
      "rationale": "One short sentence"
    }
  ]
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 3000,
      system,
      messages: [
        {
          role: "user",
          content: `Generate the setup recommendation JSON for a ${flowLabel} flow for ${brandName}. Return only the JSON object.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 400)}`);
  }
  const json = await res.json();
  const text: string = json?.content?.[0]?.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Model did not return JSON");
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("[flow-setup-research] JSON parse error", err, text.slice(0, 500));
    throw new Error("Model returned malformed JSON");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brand_id, flow_type, force_refresh } = await req.json();
    if (!brand_id || !flow_type) {
      return new Response(JSON.stringify({ error: "brand_id and flow_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [{ data: brand }, { data: intel }] = await Promise.all([
      sb.from("brands").select("name, website_url, industry").eq("id", brand_id).maybeSingle(),
      sb
        .from("brand_intelligence")
        .select(
          "compiled_context, klaviyo_compiled, ai_research, research_status, site_context, site_context_fetched_at"
        )
        .eq("brand_id", brand_id)
        .maybeSingle(),
    ]);

    if (!brand) {
      return new Response(JSON.stringify({ error: "Brand not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1 — ensure compiled context exists
    let compiledContext = intel?.compiled_context || "";
    if (!compiledContext.trim() && brand.website_url) {
      try {
        await invokeInternal("research-brand", {
          brand_id,
          brand_name: brand.name,
          domain: brand.website_url,
        });
        // Best-effort wait for compiled context (poll up to 30s)
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const { data: refreshed } = await sb
            .from("brand_intelligence")
            .select("compiled_context")
            .eq("brand_id", brand_id)
            .maybeSingle();
          if (refreshed?.compiled_context?.trim()) {
            compiledContext = refreshed.compiled_context;
            break;
          }
        }
      } catch (err) {
        console.warn("[flow-setup-research] research-brand failed (continuing)", err);
      }
    }

    // Step 2 — Perplexity site research (cache reuse unless force_refresh)
    const domain = normalizeDomain(brand.website_url);
    let siteText = intel?.site_context || "";
    const cacheStale =
      !intel?.site_context_fetched_at ||
      Date.now() - new Date(intel.site_context_fetched_at).getTime() > 7 * 24 * 60 * 60 * 1000;
    if (domain && (force_refresh || !siteText.trim() || cacheStale)) {
      try {
        const fresh = await runPerplexitySiteResearch(domain);
        if (fresh.trim()) {
          siteText = fresh;
          await sb
            .from("brand_intelligence")
            .update({
              site_context: fresh,
              site_context_fetched_at: new Date().toISOString(),
            })
            .eq("brand_id", brand_id);
        }
      } catch (err) {
        console.warn("[flow-setup-research] perplexity failed (continuing)", err);
      }
    }

    // Step 3 — generate recommendations via Opus
    const recommendations = await generateRecommendations({
      brandName: brand.name,
      flowType: flow_type,
      compiledContext,
      klaviyoCompiled: intel?.klaviyo_compiled || "",
      siteText,
    });

    return new Response(
      JSON.stringify({
        brand: { id: brand_id, name: brand.name },
        flow_type,
        site_context: siteText,
        recommendations,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[flow-setup-research] error", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});