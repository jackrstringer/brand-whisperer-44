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

    // Build a concise product summary from context
    const contextBlock = context ? context.slice(0, 4000) : "";

    const prompt = `Today is ${todayStr}. You are an elite ecommerce email marketing strategist.

## THE BRAND
Brand name: "${brandName}"
Industry/category: ${categoryHint || "unknown"}
${contextBlock ? `\nFull brand context (READ THIS CAREFULLY — it tells you exactly what they sell):\n${contextBlock}\n` : ""}

## YOUR TASK
FIRST: Identify exactly what "${brandName}" sells from the brand context above. State it clearly to yourself before generating ideas.

Then find every upcoming date between ${todayStr} and ${endStr} that this SPECIFIC brand could build a campaign around. For EACH date, create a campaign idea that is DIRECTLY tied to what "${brandName}" actually sells.

INCLUDE dates like:
- Federal/national holidays (Memorial Day, Tax Day, etc.)
- Cultural events, awareness months/weeks/days
- Social media holidays (#NationalPizzaDay, #WorldBookDay, etc.)
- Niche observances relevant to THIS brand's actual products (e.g. National Oral Health Month for dental/oral care brands, National Coffee Day for coffee brands, etc.)
- Tax deadlines, back-to-school, seasonal transitions
- Pop culture moments, sporting events, award shows

## CAMPAIGN ANGLE RULES
Every angle MUST reference the brand's actual products. Think like a DTC brand strategist:

GOOD examples:
- Coffee brand on Tax Day: "Tax Day: In the spirit of refunds, we're REFUNDING 15 random orders placed today 💰"
- Oral care brand on National Smile Day: "Flash sale: 30% off whitening kits — show off that smile"
- Pet brand on National Pet Day: "Buy any bag of treats, get a free bandana for your pup"

BAD examples (NEVER do this):
- "Celebrate Earth Day with our eco-friendly products" ← too generic, doesn't say WHAT products
- "Treat yourself after managing your taxes" ← lazy, no actual offer
- "Enjoy our products on this special day" ← useless

The angle should be a SPECIFIC promotion with real mechanics (BOGO, mystery box, flash sale, giveaway, bundle, % off, free gift, etc.) tied to the brand's ACTUAL products.

Be thorough — include at least 15-25 dates. Real dates only.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You are an elite DTC ecommerce strategist specializing in email marketing campaigns. You must CAREFULLY read the brand context to understand what the brand actually sells before generating ideas. Every campaign angle must reference the brand's real products — never generic filler. Return ONLY valid JSON — an array of objects with keys: date, name, type, angle. No markdown, no code fences, no commentary.` },
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
