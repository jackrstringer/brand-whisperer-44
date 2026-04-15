import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function fmt(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(fmt).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => { const f = fmt(v); return f ? `${k.replace(/_/g, " ")}: ${f}` : ""; })
      .filter(Boolean).join("; ");
  }
  return String(value);
}

function buildResearchSection(ai: Record<string, any>): string {
  let s = "";
  const bo = ai.brand_overview || {};
  const pl = ai.product_landscape || {};
  const ci = ai.customer_intelligence || {};
  const mi = ai.marketing_intelligence || {};
  const cl = ai.competitive_landscape || {};
  const sm = ai.sales_model || {};

  s += `--- AI RESEARCH PROFILE ---\n`;
  if (bo.primary_category) s += `Category: ${fmt(bo.primary_category)}\n`;
  if (bo.sub_category) s += `Sub-category: ${fmt(bo.sub_category)}\n`;
  if (bo.brand_positioning) s += `Positioning: ${fmt(bo.brand_positioning)}\n`;
  if (bo.mission_statement) s += `Mission: ${fmt(bo.mission_statement)}\n`;
  if (bo.tagline_or_slogan) s += `Tagline: ${fmt(bo.tagline_or_slogan)}\n`;
  if (bo.brand_story) s += `Brand story: ${fmt(bo.brand_story)}\n`;
  if (bo.key_brand_values) s += `Brand values: ${fmt(bo.key_brand_values)}\n`;
  if (bo.target_demographic) s += `Target demographic: ${fmt(bo.target_demographic)}\n`;
  if (bo.brand_voice_and_tone) s += `Voice and tone: ${fmt(bo.brand_voice_and_tone)}\n`;

  // Products
  if (pl.hero_products && Array.isArray(pl.hero_products) && pl.hero_products.length > 0) {
    s += `\n--- PRODUCTS ---\n`;
    s += `Hero products:\n`;
    for (const p of pl.hero_products) {
      s += `- ${p.name || "Unknown"}`;
      if (p.price && p.price !== "Unknown") s += ` ($${p.price})`;
      if (p.what_it_does) s += `: ${p.what_it_does}`;
      s += `\n`;
      if (p.unique_selling_points && Array.isArray(p.unique_selling_points)) {
        s += `  USPs: ${p.unique_selling_points.join("; ")}\n`;
      }
    }
  }
  if (pl.bestsellers && Array.isArray(pl.bestsellers) && pl.bestsellers.length > 0) {
    s += `Bestsellers: ${fmt(pl.bestsellers)}\n`;
  }
  if (pl.bundles_or_kits && Array.isArray(pl.bundles_or_kits) && pl.bundles_or_kits.length > 0) {
    s += `Bundles/kits: ${fmt(pl.bundles_or_kits)}\n`;
  }
  if (pl.new_launches && Array.isArray(pl.new_launches) && pl.new_launches.length > 0) {
    s += `New launches: ${fmt(pl.new_launches)}\n`;
  }
  if (pl.price_range) {
    const pr = pl.price_range;
    if (pr.low || pr.high) s += `Price range: ${pr.low || "?"} – ${pr.high || "?"}\n`;
    if (pr.avg_order_value_estimate) s += `Est. AOV: ${pr.avg_order_value_estimate}\n`;
  }
  if (pl.subscription_products && Array.isArray(pl.subscription_products) && pl.subscription_products.length > 0) {
    s += `Subscription products: ${fmt(pl.subscription_products)}\n`;
  }

  // Customer intelligence
  if (ci.primary_pain_points_solved && Array.isArray(ci.primary_pain_points_solved) && ci.primary_pain_points_solved.length > 0) {
    s += `\nPain points solved: ${fmt(ci.primary_pain_points_solved)}\n`;
  }
  if (ci.common_praise_in_reviews && Array.isArray(ci.common_praise_in_reviews) && ci.common_praise_in_reviews.length > 0) {
    s += `Customer praise: ${fmt(ci.common_praise_in_reviews)}\n`;
  }
  if (ci.repeat_purchase_drivers && Array.isArray(ci.repeat_purchase_drivers) && ci.repeat_purchase_drivers.length > 0) {
    s += `Repeat purchase drivers: ${fmt(ci.repeat_purchase_drivers)}\n`;
  }

  // Marketing intelligence
  if (mi.content_themes && Array.isArray(mi.content_themes) && mi.content_themes.length > 0) {
    s += `\nContent themes: ${fmt(mi.content_themes)}\n`;
  }
  if (mi.typical_offer_types && Array.isArray(mi.typical_offer_types) && mi.typical_offer_types.length > 0) {
    s += `Offer types: ${fmt(mi.typical_offer_types)}\n`;
  }
  if (mi.seasonal_moments && Array.isArray(mi.seasonal_moments) && mi.seasonal_moments.length > 0) {
    s += `Seasonal moments: ${fmt(mi.seasonal_moments)}\n`;
  }

  // Competitive landscape
  if (cl.direct_competitors && Array.isArray(cl.direct_competitors) && cl.direct_competitors.length > 0) {
    s += `\nDirect competitors: ${fmt(cl.direct_competitors)}\n`;
  }
  if (cl.competitive_advantages && Array.isArray(cl.competitive_advantages) && cl.competitive_advantages.length > 0) {
    s += `Competitive advantages: ${fmt(cl.competitive_advantages)}\n`;
  }

  // Sales model
  if (sm.free_shipping_threshold) s += `\nFree shipping threshold: ${sm.free_shipping_threshold}\n`;
  if (sm.subscription_discount_typical) s += `Subscription discount: ${sm.subscription_discount_typical}\n`;

  // Category lock
  const cat = bo.primary_category || bo.sub_category;
  if (cat) {
    s += `\nCATEGORY LOCK: This brand operates in "${fmt(cat)}". Treat this as binding. Do NOT generate ideas for adjacent categories like skincare, cosmetics, supplements (unless this IS a supplement brand), apparel, or food unless the research explicitly confirms the brand sells them.\n`;
  }

  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brand_id } = await req.json();
    if (!brand_id) {
      return new Response(JSON.stringify({ error: "brand_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Parallel fetch all brand data
    const [brandResult, intelResult, profileResult, assetsResult, campaignsResult, calendarResult, feedbackResult] = await Promise.all([
      supabase.from("brands").select("name, industry, website_url").eq("id", brand_id).single(),
      supabase.from("brand_intelligence").select("compiled_context, merged_profile, ai_research, survey_answers, klaviyo_compiled").eq("brand_id", brand_id).single(),
      supabase.from("brand_profiles").select("raw_extraction, brand_instructions, system_prompt").eq("brand_id", brand_id).single(),
      supabase.from("brand_assets").select("category, description, url, ai_category").eq("brand_id", brand_id),
      supabase.from("campaigns").select("name, brief, goal").eq("brand_id", brand_id).order("created_at", { ascending: false }).limit(20),
      supabase.from("brand_calendar").select("event_name, event_date, event_type").eq("brand_id", brand_id).gte("event_date", new Date().toISOString().split("T")[0]).order("event_date").limit(15),
      supabase.from("brand_feedback").select("feedback").eq("brand_id", brand_id).order("created_at", { ascending: false }).limit(5),
    ]);

    const brand = brandResult.data;
    const intel = intelResult.data;
    const profile = profileResult.data;
    const assets = assetsResult.data || [];
    const pastCampaigns = campaignsResult.data || [];
    const calendarEvents = calendarResult.data || [];
    const feedback = feedbackResult.data || [];
    const aiResearch = (intel?.ai_research as Record<string, unknown> | null) || null;

    // --- SECTION A: Lucy's Identity ---
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    let prompt = `You are Lucy, an elite AI creative director specializing in email marketing, brand strategy, and copywriting. You are the dedicated creative director for the brand described below. You've internalized their voice, audience, and positioning. Every idea you generate should feel like it came from someone embedded with this brand for months.

Today is ${today}. Factor in seasonality, upcoming holidays, and cultural timing when generating ideas.
Never drift into adjacent categories or invent products the brand does not sell. Stay literal to the brand's actual category, audience, and product universe.\n\n`;

    // --- SECTION B: Brand Intelligence ---
    prompt += `--- BRAND OVERVIEW ---\n`;
    if (brand) {
      prompt += `Brand: ${brand.name || "Unknown"}\n`;
      const bo = aiResearch?.brand_overview as Record<string, any> | undefined;
      if (brand.industry) prompt += `Industry: ${brand.industry}\n`;
      else if (bo?.primary_category) prompt += `Industry: ${fmt(bo.primary_category)}\n`;
      if (brand.website_url) prompt += `Website: ${brand.website_url}\n`;
    }
    prompt += `\n`;

    // Compiled context (the prose strategy brief from compile-brand-context)
    if (intel?.compiled_context) {
      prompt += `--- BRAND STRATEGY BRIEF ---\n${intel.compiled_context}\n\n`;
    }

    // AI research — use the correct nested schema
    if (aiResearch) {
      prompt += buildResearchSection(aiResearch as Record<string, any>);
      prompt += `\n`;
    }

    // Klaviyo performance intelligence
    if (intel?.klaviyo_compiled) {
      prompt += `--- EMAIL PERFORMANCE INTELLIGENCE (from Klaviyo) ---\n${intel.klaviyo_compiled}\n\n`;
    }

    // Merged profile (structured brand data)
    if (intel?.merged_profile) {
      const mp = intel.merged_profile as any;
      if (mp.products && Array.isArray(mp.products)) {
        prompt += `--- PRODUCTS (from merged profile) ---\n`;
        mp.products.forEach((p: any) => {
          prompt += `- ${p.name || p.product_name}${p.price ? ` ($${p.price})` : ""}${p.description ? `: ${p.description}` : ""}\n`;
        });
        prompt += `\n`;
      }
      if (mp.hero_products) prompt += `Hero products: ${Array.isArray(mp.hero_products) ? mp.hero_products.join(", ") : mp.hero_products}\n`;
      if (mp.target_audience) prompt += `Target audience: ${mp.target_audience}\n`;
      if (mp.price_tier) prompt += `Price tier: ${mp.price_tier}\n`;
      if (mp.competitors && Array.isArray(mp.competitors)) prompt += `Competitors: ${mp.competitors.join(", ")}\n`;
      if (mp.brand_values && Array.isArray(mp.brand_values)) prompt += `Brand values: ${mp.brand_values.join(", ")}\n`;
      prompt += `\n`;
    }

    // Voice profile from raw_extraction
    if (profile?.raw_extraction) {
      const rx = profile.raw_extraction as any;
      if (rx.voice) {
        prompt += `--- BRAND VOICE ---\n`;
        if (rx.voice.personality) prompt += `Personality: ${rx.voice.personality}\n`;
        if (rx.voice.tone_descriptors) prompt += `Tone: ${Array.isArray(rx.voice.tone_descriptors) ? rx.voice.tone_descriptors.join(", ") : rx.voice.tone_descriptors}\n`;
        if (rx.voice.vocabulary_patterns) prompt += `Vocabulary patterns: ${Array.isArray(rx.voice.vocabulary_patterns) ? rx.voice.vocabulary_patterns.join(", ") : rx.voice.vocabulary_patterns}\n`;
        if (rx.voice.avoid_patterns) prompt += `Avoid: ${Array.isArray(rx.voice.avoid_patterns) ? rx.voice.avoid_patterns.join(", ") : rx.voice.avoid_patterns}\n`;
        if (rx.voice.headline_style) prompt += `Headline style: ${rx.voice.headline_style}\n`;
        if (rx.voice.cta_style) prompt += `CTA style: ${rx.voice.cta_style}\n`;
        prompt += `\n`;
      }
    }

    // Brand instructions (user-written)
    if (profile?.brand_instructions) {
      prompt += `--- BRAND INSTRUCTIONS (from the user) ---\n${profile.brand_instructions}\n\n`;
    }

    // --- SECTION C: Past Campaign Context ---
    if (pastCampaigns.length > 0) {
      prompt += `--- PAST CAMPAIGNS (most recent, for context) ---\n`;
      pastCampaigns.slice(0, 10).forEach((c: any) => {
        prompt += `- ${c.name}\n`;
      });
      prompt += `\nUse these to avoid repeating the same campaign themes. Generate fresh ideas.\n\n`;
    }

    // --- SECTION D: Brand Assets ---
    const heroShots = assets.filter((a: any) => a.category === "hero_shots" || a.ai_category === "hero");
    const lifestyle = assets.filter((a: any) => a.category === "lifestyle" || a.ai_category === "lifestyle");
    if (heroShots.length > 0 || lifestyle.length > 0) {
      prompt += `--- AVAILABLE BRAND ASSETS ---\n`;
      if (heroShots.length > 0) prompt += `Hero/product shots: ${heroShots.length} available\n`;
      if (lifestyle.length > 0) prompt += `Lifestyle images: ${lifestyle.length} available\n`;
      prompt += `\n`;
    }

    // --- SECTION E: Calendar Events ---
    if (calendarEvents.length > 0) {
      prompt += `--- UPCOMING CALENDAR EVENTS ---\n`;
      calendarEvents.forEach((e: any) => {
        prompt += `- ${e.event_date}: ${e.event_name} (${e.event_type})\n`;
      });
      prompt += `\nConsider these for timely, seasonal campaign ideas.\n\n`;
    }

    // --- SECTION F: Brand Feedback ---
    if (feedback.length > 0) {
      prompt += `--- RECENT BRAND FEEDBACK ---\n`;
      feedback.forEach((f: any) => {
        if (f.feedback && typeof f.feedback === "object") {
          const fb = f.feedback as any;
          if (fb.notes) prompt += `- ${fb.notes}\n`;
        }
      });
      prompt += `\n`;
    }

    // Save compiled prompt
    await supabase.from("brands").update({
      ideation_prompt: prompt,
      ideation_prompt_built_at: new Date().toISOString(),
    }).eq("id", brand_id);

    console.log(`[build-ideation-prompt] Built prompt for brand ${brand_id}, length: ${prompt.length}`);

    return new Response(JSON.stringify({ success: true, prompt_length: prompt.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[build-ideation-prompt] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
