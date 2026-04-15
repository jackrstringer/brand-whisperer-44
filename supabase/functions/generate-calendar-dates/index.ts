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
    const { brand_id } = await req.json();
    if (!brand_id) throw new Error("brand_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch brand + intelligence
    const [{ data: brand }, { data: intel }] = await Promise.all([
      sb.from("brands").select("name, industry, website_url").eq("id", brand_id).single(),
      sb.from("brand_intelligence").select("compiled_context, ai_research").eq("brand_id", brand_id).single(),
    ]);

    const brandName = brand?.name || "Unknown";
    const industry = brand?.industry || "";
    const context = intel?.compiled_context || "";
    const aiResearch = intel?.ai_research as Record<string, any> | null;

    // Extract category/audience hints from research
    let categoryHint = industry;
    if (aiResearch) {
      const cat = aiResearch.category || aiResearch.industry || "";
      const audience = aiResearch.target_audience || aiResearch.target_demographic || "";
      if (cat) categoryHint = cat;
      if (audience) categoryHint += ` (audience: ${audience})`;
    }

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const endDate = new Date(today.getTime() + 30 * 86400000);
    const endStr = endDate.toISOString().split("T")[0];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `Today is ${todayStr}. You are a marketing calendar researcher for "${brandName}", a ${categoryHint} brand.

${context ? `Brand context (abbreviated):\n${context.slice(0, 2000)}\n` : ""}

List ALL notable dates between ${todayStr} and ${endStr} that are relevant for email marketing campaigns for this specific brand. Include:
- Federal/national holidays (e.g. Memorial Day, Independence Day)
- Cultural events and awareness months/weeks/days
- Social media holidays (#NationalPizzaDay, #WorldBookDay, etc.)
- Niche observances specifically relevant to this brand's industry (e.g. National Masturbation Day for sexual wellness, National Oral Health Month for dental, National Pet Day for pet brands)
- Tax deadlines, back-to-school, seasonal transitions
- Pop culture moments, sporting events, award shows
- Any brand-specific opportunities (product launch windows, seasonal peaks)

For EACH date, provide:
- The exact date (YYYY-MM-DD)
- The event/holiday name
- A type classification: one of "holiday", "cultural", "social_media", "awareness", "niche", "seasonal", "pop_culture"
- A specific 1-sentence campaign angle tailored to "${brandName}"

Be thorough — include at least 15-25 dates. Don't skip niche or quirky holidays. Real dates only — no made-up holidays.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a marketing calendar researcher. Return ONLY valid JSON — an array of objects with keys: date, name, type, angle. No markdown, no code fences, no commentary." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_calendar_dates",
              description: "Return the list of upcoming calendar dates relevant for marketing",
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
                        angle: { type: "string", description: "1-sentence campaign angle for this brand" },
                      },
                      required: ["date", "name", "type", "angle"],
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
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("No structured output from AI");
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const dates = parsed.dates || [];

    // Sort by date
    dates.sort((a: any, b: any) => a.date.localeCompare(b.date));

    return new Response(JSON.stringify({ dates }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-calendar-dates error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
