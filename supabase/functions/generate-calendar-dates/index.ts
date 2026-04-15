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
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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

      const prompt = `Today is ${todayStr}. List every noteworthy date between ${todayStr} and ${endStr} that an ecommerce brand${industry ? ` in the ${industry} space` : ""} could potentially build a campaign around.

Include:
- Federal/national holidays (Memorial Day, Tax Day, etc.)
- Cultural events and awareness months/weeks/days
- Social media holidays (#NationalPizzaDay, #WorldBookDay, etc.)
- Niche observances (National Oral Health Month, National Coffee Day, etc.)
- Tax deadlines, back-to-school, seasonal transitions
- Pop culture moments, sporting events, award shows
- Fun/quirky holidays (National Masturbation Day, Talk Like a Pirate Day, etc.)

Be thorough — include at least 15-25 dates. Real dates only. No made-up holidays.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a calendar research assistant. Return ONLY valid JSON via the tool call. No markdown, no commentary." },
            { role: "user", content: prompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_calendar_dates",
                description: "Return the list of upcoming calendar dates",
                parameters: {
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
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["dates"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_calendar_dates" } },
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
      const dates = (parsed.dates || []).sort((a: any, b: any) => a.date.localeCompare(b.date));

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

      const prompt = `You are an elite DTC ecommerce email marketing strategist.

## THE BRAND
Brand name: "${brandName}"
Industry/category: ${categoryHint || "unknown"}
${productSummary ? `\nPRODUCT CATALOG:\n${productSummary}\n` : ""}
${contextBlock ? `\nBRAND CONTEXT:\n${contextBlock}\n` : ""}

## YOUR TASK
For EACH of the following dates, create exactly 5 distinct, high-quality campaign ideas specifically for "${brandName}".

CRITICAL MIX RULE — out of the 5 ideas:
- **4 ideas** must be EVERGREEN / non-promotional. These should be content-driven, storytelling, educational, community-oriented, or brand-awareness campaigns that simply piggyback off the date/theme. NO discounts, NO sales, NO promos, NO BOGO, NO bundles, NO free gifts. Think: behind-the-scenes, founder story, how-to guides, user-generated content spotlights, lifestyle content, product education, seasonal styling tips, mission-driven storytelling.
- **1 idea** (and ONLY 1) can be a promotional campaign with a specific offer mechanic (flash sale, bundle, % off, BOGO, mystery box, free gift, limited edition, etc.)

Each idea must:
- Reference the brand's ACTUAL products by name where relevant
- Be creative and varied — don't repeat similar angles
- Feel like something a top DTC brand would actually send
- The 4 non-promo ideas should still be compelling enough to drive opens and clicks without needing a discount

Think like the best email marketing strategists at brands like Javy Coffee, Liquid Death, Dr. Squatch, or Glossier.

## DATES TO IDEATE ON
${datesList}`;

      // Build the schema for structured output
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are an elite DTC ecommerce strategist. Return ONLY valid JSON via the tool call. IMPORTANT: 4 of 5 ideas per date must be evergreen/non-promotional (no discounts, no sales, no offers). Only 1 idea can include a promotion." },
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
