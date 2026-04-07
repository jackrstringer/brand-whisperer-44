import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a senior DTC e-commerce strategist conducting deep brand intelligence research. You have access to web search — USE IT EXTENSIVELY.

CRITICAL RULE: You are researching ONE SPECIFIC brand at ONE SPECIFIC domain. The domain provided is the AUTHORITATIVE source of truth. 
- ALWAYS start by searching for and visiting the EXACT domain provided. 
- Do NOT confuse this brand with other brands that have similar or identical names.
- If the brand name is generic (e.g. "Enhanced", "Flow", "Glow"), there may be MANY unrelated companies with the same name. You MUST only report on the company that operates at the given domain.
- Cross-check every fact against the actual website. If information from a third-party source contradicts what's on the actual website, trust the website.
- When searching for reviews or press, always include the domain name in your search query to avoid pulling results for the wrong company.

Your job is to produce an extremely detailed, factual research dossier about the brand at the specific domain. Be exhaustive. Search multiple times if needed.

Mark fields "unknown" ONLY if you searched and genuinely cannot find the information. Never guess or fabricate. Never fill in data from a different company.`;

function buildUserPrompt(brandName: string, domain: string): string {
  return `Conduct deep research on the brand "${brandName}" whose website is at ${domain}.

IMPORTANT: The domain ${domain} is the DEFINITIVE source. This is the ONLY brand you are researching. If "${brandName}" is a common word, do NOT confuse this with other companies that happen to share the name. Only report facts about the company operating at ${domain}.

RESEARCH INSTRUCTIONS:
1. FIRST: Search for "${domain}" and visit the actual website at ${domain} — examine homepage, product pages, about page, FAQ, shipping/returns policy. This is your primary source of truth.
2. Search for "site:${domain}" to find all indexed pages on their actual site
3. Search for "${domain} reviews" (using the domain, not just the brand name) to find customer sentiment
4. Search for "${brandName} ${domain}" on social media and press — always include the domain to disambiguate
5. Search for competitors in their space to understand positioning
6. Look for pricing, subscription offers, bundles, and promotional patterns ON THEIR ACTUAL SITE

Be THOROUGH. Do multiple searches. Cross-reference information. The more detail and accuracy, the better. If you find conflicting info from different "brands" with the same name, ONLY use info from the company at ${domain}.

Return ONLY a valid JSON object matching this exact structure:

{
  "brand_overview": {
    "founding_year": "",
    "founders": "",
    "headquarters": "",
    "mission_statement": "",
    "brand_story": "",
    "brand_positioning": "",
    "primary_category": "",
    "sub_category": "",
    "brand_voice_and_tone": "",
    "key_brand_values": [],
    "tagline_or_slogan": "",
    "target_demographic": {
      "age_range": "",
      "gender_skew": "",
      "income_level": "",
      "psychographic_profile": "",
      "lifestyle_descriptors": []
    }
  },
  "product_landscape": {
    "catalog_type": "",
    "total_product_count_estimate": "",
    "hero_products": [
      {
        "name": "",
        "price": "",
        "what_it_does": "",
        "why_its_hero": "",
        "key_ingredients_or_specs": "",
        "unique_selling_points": [],
        "claims": [],
        "rating": "",
        "review_count_estimate": ""
      }
    ],
    "product_lines_or_collections": [],
    "price_range": { "low": "", "high": "", "avg_order_value_estimate": "" },
    "subscription_products": [],
    "bundles_or_kits": [],
    "bestsellers": [],
    "new_launches": []
  },
  "sales_model": {
    "primary_channel": "",
    "also_sold_at": [],
    "subscription_platform": "",
    "subscription_discount_typical": "",
    "trial_or_intro_offers": "",
    "free_shipping_threshold": "",
    "loyalty_program": "",
    "referral_program": "",
    "return_policy_summary": "",
    "payment_methods": []
  },
  "competitive_landscape": {
    "direct_competitors": [],
    "indirect_competitors": [],
    "competitive_advantages": [],
    "competitive_weaknesses": [],
    "market_positioning_vs_competitors": "",
    "price_positioning": ""
  },
  "marketing_intelligence": {
    "content_themes": [],
    "proof_types_used": [],
    "typical_offer_types": [],
    "seasonal_moments": [],
    "social_platforms": [],
    "estimated_email_frequency": "",
    "email_style_observations": "",
    "influencer_or_ambassador_program": "",
    "ugc_usage": "",
    "ad_platforms_observed": [],
    "notable_campaigns_or_collabs": []
  },
  "customer_intelligence": {
    "primary_pain_points_solved": [],
    "common_objections_before_purchase": [],
    "common_praise_in_reviews": [],
    "common_complaints_in_reviews": [],
    "typical_customer_journey": "",
    "repeat_purchase_drivers": [],
    "community_or_loyalty_signals": ""
  },
  "brand_design_observations": {
    "primary_colors_observed": [],
    "typography_style": "",
    "photography_style": "",
    "overall_aesthetic": "",
    "packaging_notes": ""
  },
  "research_confidence": "",
  "research_notes": "",
  "sources_consulted": []
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
    if (!domain || !domain.trim()) {
      return new Response(JSON.stringify({ error: "A website URL is required to run brand research. Please add it in your brand settings first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Call Claude Opus with web search tool
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 20,
          }
        ],
        messages: [{ role: "user", content: buildUserPrompt(brand_name, domain) }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[research-brand] Anthropic error:", resp.status, errText);
      throw new Error(`Anthropic API error: ${resp.status}`);
    }

    const result = await resp.json();
    
    // Extract the final text content from the response (may contain tool_use and web_search_result blocks)
    const textBlocks = (result.content || []).filter((b: any) => b.type === "text");
    const rawText = textBlocks.map((b: any) => b.text).join("\n");

    console.log("[research-brand] Response had", result.content?.length, "content blocks,", textBlocks.length, "text blocks");

    // Parse JSON from response
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      const jsonMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        const start = rawText.indexOf("{");
        const end = rawText.lastIndexOf("}");
        if (start >= 0 && end > start) {
          parsed = JSON.parse(rawText.substring(start, end + 1));
        } else {
          console.error("[research-brand] Could not parse JSON from:", rawText.substring(0, 500));
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

    return new Response(JSON.stringify({
      success: true,
      research_status: "ai_complete",
      ai_research_confidence: parsed.research_confidence || "unknown",
      last_researched_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[research-brand] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
