import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior email marketing strategist writing a briefing document for an AI that generates email campaigns. Be specific, direct, and practical. No fluff.`;

function buildUserPrompt(mergedProfile: any): string {
  return `Using the following brand intelligence data, write a concise strategy brief optimized for injection into an AI email generation prompt. Write it as prose, not JSON. A knowledgeable strategist briefing a copywriter before a campaign shoot.

Cover in order:
1. What this brand sells, their catalog type, and why customers buy it
2. Hero products — name them specifically, note their price and key claims
3. Sales model — subscription details, evergreen offer, typical promotions
4. Cross-sell paths — specific product pairings to push
5. Customer profile — who they are, their pain points, their objections
6. What works — offer types, content themes, proof types that resonate
7. Voice and tone — how the brand speaks, what language to avoid
8. Anything critical the AI must never get wrong about this brand

Max 1800 tokens. Be specific. If something is unknown, omit it rather than padding.

Brand data:
${JSON.stringify(mergedProfile, null, 2)}`;
}

/** Deep merge where survey values override AI research values */
function mergeProfiles(aiResearch: any, surveyAnswers: any): any {
  if (!aiResearch && !surveyAnswers) return {};
  if (!aiResearch) return { ...surveyAnswers };
  if (!surveyAnswers) return { ...aiResearch };

  const merged = JSON.parse(JSON.stringify(aiResearch));

  // Overlay survey answers on top
  for (const [key, value] of Object.entries(surveyAnswers)) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      merged[key] = mergeProfiles(merged[key] || {}, value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brand_id } = await req.json();
    if (!brand_id) {
      return new Response(JSON.stringify({ error: "brand_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch brand intelligence
    const { data: intel, error: fetchError } = await supabase
      .from("brand_intelligence")
      .select("*")
      .eq("brand_id", brand_id)
      .single();

    if (fetchError || !intel) {
      throw new Error("Brand intelligence record not found");
    }

    // Merge AI research + survey answers (survey wins)
    const mergedProfile = mergeProfiles(intel.ai_research, intel.survey_answers);

    // Save merged profile
    await supabase
      .from("brand_intelligence")
      .update({ merged_profile: mergedProfile })
      .eq("brand_id", brand_id);

    // Call Claude Sonnet to compile context
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(mergedProfile) }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[compile-brand-context] Anthropic error:", resp.status, errText);
      throw new Error(`Anthropic API error: ${resp.status}`);
    }

    const result = await resp.json();
    const compiledContext = result.content?.[0]?.text || "";

    // Save compiled context and update status
    const { error: updateError } = await supabase
      .from("brand_intelligence")
      .update({
        compiled_context: compiledContext,
        research_status: "complete",
        last_compiled_at: new Date().toISOString(),
      })
      .eq("brand_id", brand_id);

    if (updateError) {
      console.error("[compile-brand-context] Update error:", updateError);
      throw new Error(`Database error: ${updateError.message}`);
    }

    // Fire-and-forget: rebuild ideation prompt
    try {
      const functionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/build-ideation-prompt`;
      fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ brand_id }),
      }).catch(() => {});
    } catch {}

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[compile-brand-context] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
