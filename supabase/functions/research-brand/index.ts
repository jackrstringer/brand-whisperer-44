import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior DTC e-commerce strategist. You conduct deep brand intelligence research to help an AI email marketing platform understand a brand before generating campaigns. Be specific and factual. Mark fields "unknown" if you cannot find reliable information — never guess or fabricate.`;

function buildUserPrompt(brandName: string, domain: string): string {
  return `Research the brand ${brandName} at ${domain} thoroughly. Search their website, product pages, about page, pricing, reviews, press coverage, and any available third-party information.

Return ONLY a valid JSON object matching this exact structure:

{
  "brand_overview": {
    "founding_year": "",
    "headquarters": "",
    "mission_statement": "",
    "brand_positioning": "",
    "primary_category": "",
    "sub_category": "",
    "brand_tone": "",
    "target_demographic": {
      "age_range": "",
      "gender_skew": "",
      "income_level": "",
      "psychographic_profile": ""
    }
  },
  "product_landscape": {
    "catalog_type": "",
    "hero_products": [
      {
        "name": "",
        "price": "",
        "what_it_does": "",
        "why_its_hero": "",
        "key_ingredients_or_specs": "",
        "claims": []
      }
    ],
    "product_lines": [],
    "price_range": { "low": "", "high": "", "avg_order_value_estimate": "" },
    "subscription_products": [],
    "bundles_or_kits": []
  },
  "sales_model": {
    "primary_channel": "",
    "subscription_platform": "",
    "subscription_discount_typical": "",
    "trial_or_intro_offers": "",
    "free_shipping_threshold": "",
    "loyalty_program": ""
  },
  "competitive_landscape": {
    "direct_competitors": [],
    "competitive_advantages": [],
    "market_positioning_vs_competitors": ""
  },
  "marketing_intelligence": {
    "content_themes": [],
    "proof_types_used": [],
    "typical_offer_types": [],
    "seasonal_moments": [],
    "social_platforms": [],
    "estimated_email_frequency": ""
  },
  "customer_intelligence": {
    "primary_pain_points_solved": [],
    "common_objections_before_purchase": [],
    "typical_customer_journey": "",
    "repeat_purchase_drivers": []
  },
  "research_confidence": "",
  "research_notes": ""
}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brand_id, brand_name, domain } = await req.json();
    if (!brand_id || !brand_name) {
      return new Response(JSON.stringify({ error: "brand_id and brand_name required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Call Claude Opus
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(brand_name, domain || brand_name) }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[research-brand] Anthropic error:", resp.status, errText);
      throw new Error(`Anthropic API error: ${resp.status}`);
    }

    const result = await resp.json();
    const rawText = result.content?.[0]?.text || "";

    // Parse JSON from response
    let parsed: any;
    try {
      // Try direct parse first
      parsed = JSON.parse(rawText);
    } catch {
      // Extract JSON from markdown fences
      const jsonMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        // Try finding JSON object boundaries
        const start = rawText.indexOf("{");
        const end = rawText.lastIndexOf("}");
        if (start >= 0 && end > start) {
          parsed = JSON.parse(rawText.substring(start, end + 1));
        } else {
          throw new Error("Could not parse JSON from AI response");
        }
      }
    }

    // Upsert into brand_intelligence
    const { error: upsertError } = await supabase
      .from("brand_intelligence")
      .upsert({
        brand_id,
        ai_research: parsed,
        research_status: "ai_complete",
        ai_research_confidence: parsed.research_confidence || "unknown",
        last_researched_at: new Date().toISOString(),
      }, { onConflict: "brand_id" });

    if (upsertError) {
      console.error("[research-brand] Upsert error:", upsertError);
      throw new Error(`Database error: ${upsertError.message}`);
    }

    return new Response(JSON.stringify({ success: true, research: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[research-brand] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
