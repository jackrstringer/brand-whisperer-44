import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { brand_id, mode = "list", selected_dates } = body;
    if (!brand_id) throw new Error("brand_id required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured (required for web-searched calendar dates)");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const endDate = new Date(today.getTime() + 30 * 86400000);
    const endStr = endDate.toISOString().split("T")[0];

    // ── MODE: LIST ── Just find dates, no brand-specific angles
    if (mode === "list") {
      const [{ data: brand }] = await Promise.all([
        sb.from("brands").select("industry").eq("id", brand_id).single(),
      ]);

      const industry = brand?.industry || "";

      const prompt = `Today is ${todayStr}. Use the web_search tool to find every noteworthy date between ${todayStr} and ${endStr} that an ecommerce brand${industry ? ` in the ${industry} space` : ""} could potentially build a campaign around.

Search the web for:
- US federal/national holidays in this date range
- Cultural events and awareness months/weeks/days currently running
- Social media holidays (#NationalPizzaDay, #WorldBookDay, etc.)
- Niche observances${industry ? ` relevant to the ${industry} space` : ""}
- Tax deadlines, back-to-school, seasonal transitions
- Pop culture moments, sporting events, award shows happening in this window
- Fun/quirky national days

Run multiple web searches as needed. Be thorough — include at least 15-25 REAL, VERIFIED dates that fall between ${todayStr} and ${endStr}. Do not make up dates. Do not include dates outside this window.

After researching, return your final answer ONLY via the return_calendar_dates tool — no commentary.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 4096,
          system: "You are a calendar research assistant. Use the web_search tool to find real, verified dates. Never invent holidays. Return final results only via the return_calendar_dates tool.",
          tools: [
            { type: "web_search_20250305", name: "web_search", max_uses: 6 },
            {
              name: "return_calendar_dates",
              description: "Return the final list of upcoming calendar dates",
              input_schema: {
                type: "object",
                properties: {
                  dates: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string", description: "YYYY-MM-DD format" },
                        name: { type: "string", description: "Event or holiday name" },
                        type: { type: "string", enum: ["holiday", "cultural", "social_media", "awareness", "niche", "seasonal", "pop_culture"] },
                      },
                      required: ["date", "name", "type"],
                    },
                  },
                },
                required: ["dates"],
              },
            },
          ],
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Anthropic calendar error:", response.status, errText);
        if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`Anthropic error: ${response.status} ${errText.slice(0, 200)}`);
      }

      const result = await response.json();
      const toolUseBlock = (result.content || []).find((b: any) => b.type === "tool_use" && b.name === "return_calendar_dates");
      if (!toolUseBlock?.input?.dates) {
        console.error("No return_calendar_dates tool call in response:", JSON.stringify(result).slice(0, 500));
        throw new Error("AI did not return calendar dates via the structured tool call");
      }

      const dates = (toolUseBlock.input.dates || []).sort((a: any, b: any) => a.date.localeCompare(b.date));

      return new Response(JSON.stringify({ dates }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── MODE: IDEATE ── Generate 5 brand-specific ideas per selected date
    if (mode === "ideate") {
      if (!selected_dates || !Array.isArray(selected_dates) || selected_dates.length === 0) {
        throw new Error("selected_dates required for ideate mode");
      }

      // Fetch full brand context
      const [{ data: brand }, { data: intel }] = await Promise.all([
        sb.from("brands").select("name, industry, website_url").eq("id", brand_id).single(),
        sb.from("brand_intelligence").select("compiled_context, ai_research").eq("brand_id", brand_id).single(),
      ]);

      const brandName = brand?.name || "Unknown";
      const industry = brand?.industry || "";
      const context = intel?.compiled_context || "";
      const aiResearch = intel?.ai_research as Record<string, any> | null;

      // Build rich context
      let categoryHint = industry;
      let productSummary = "";
      if (aiResearch) {
        const overview = aiResearch.brand_overview || {};
        categoryHint = overview.primary_category || overview.sub_category || industry || "";
        const catalog = aiResearch.product_catalog;
        if (catalog) productSummary = JSON.stringify(catalog).slice(0, 2000);
      }

      let contextBlock = "";
      if (context) {
        contextBlock = context.slice(0, 4000);
      } else if (aiResearch) {
        contextBlock = JSON.stringify({
          brand_overview: aiResearch.brand_overview,
          product_catalog: aiResearch.product_catalog,
          competitive_landscape: aiResearch.competitive_landscape,
        }, null, 2).slice(0, 4000);
      }

      const datesList = selected_dates.map((d: any) => `- ${d.date}: ${d.name} (${d.type})`).join("\n");

      const prompt = `## THE BRAND
Brand: "${brandName}"
Category: ${categoryHint || "unknown"}
${productSummary ? `\nPRODUCT CATALOG:\n${productSummary}\n` : ""}
${contextBlock ? `\nBRAND CONTEXT:\n${contextBlock}\n` : ""}

## THE DATES
${datesList}

## TASK
For each date above, come up with 5 email campaign ideas for "${brandName}".

Find the natural, authentic connection between the brand/products and the occasion. Don't force it — if the link is tenuous, lean into humor or cleverness rather than pretending relevance.

At most 1 out of 5 ideas may include a promotional mechanic (discount, sale, bundle, etc.). The rest should drive engagement without needing an offer.

Reference the brand's actual products by name. Each idea should feel like something a top-tier DTC brand would actually send.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: "You are an elite email marketing strategist for DTC ecommerce brands. Return ONLY valid JSON via the tool call." },
            { role: "user", content: prompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_date_ideas",
                description: "Return campaign ideas grouped by date",
                parameters: {
                  type: "object",
                  properties: {
                    date_ideas: {
                      type: "array",
                      description: "One entry per selected date",
                      items: {
                        type: "object",
                        properties: {
                          date: { type: "string", description: "YYYY-MM-DD" },
                          name: { type: "string", description: "Event/holiday name" },
                          ideas: {
                            type: "array",
                            description: "Exactly 5 campaign ideas for this date",
                            items: {
                              type: "object",
                              properties: {
                                title: { type: "string", description: "Catchy campaign title" },
                                description: { type: "string", description: "2-3 sentence campaign description with specific products and offer details" },
                                campaign_type: { type: "string", description: "e.g. flash_sale, giveaway, bundle, limited_edition, mystery_box, bogo, educational, ugc" },
                                subject_line: { type: "string", description: "Email subject line" },
                              },
                              required: ["title", "description", "campaign_type", "subject_line"],
                              additionalProperties: false,
                            },
                          },
                        },
                        required: ["date", "name", "ideas"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["date_ideas"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_date_ideas" } },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("AI gateway error:", response.status, errText);
        if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error(`AI error: ${response.status}`);
      }

      const result = await response.json();
      const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) throw new Error("No structured output from AI");

      const parsed = JSON.parse(toolCall.function.arguments);
      const dateIdeas = parsed.date_ideas || [];

      return new Response(JSON.stringify({ date_ideas: dateIdeas }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown mode: ${mode}`);
  } catch (e) {
    console.error("generate-calendar-dates error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
