import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatResearchValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((item) => formatResearchValue(item)).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => {
        const formatted = formatResearchValue(nested);
        return formatted ? `${key.replace(/_/g, " ")}: ${formatted}` : "";
      })
      .filter(Boolean)
      .join("; ");
  }
  return String(value);
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
      if (brand.industry) prompt += `Industry: ${brand.industry}\n`;
      else if (aiResearch?.primary_category) prompt += `Industry: ${formatResearchValue(aiResearch.primary_category)}\n`;
      if (brand.website_url) prompt += `Website: ${brand.website_url}\n`;
    }
    prompt += `\n`;

    // Compiled context (the prose strategy brief from compile-brand-context)
    if (intel?.compiled_context) {
      prompt += `--- BRAND STRATEGY BRIEF ---\n${intel.compiled_context}\n\n`;
    }

    // AI research fallback / enrichment
    if (aiResearch) {
      prompt += `--- AI RESEARCH PROFILE ---\n`;
      if (aiResearch.primary_category) prompt += `Category: ${formatResearchValue(aiResearch.primary_category)}\n`;
      if (aiResearch.sub_category) prompt += `Sub-category: ${formatResearchValue(aiResearch.sub_category)}\n`;
      if (aiResearch.brand_positioning) prompt += `Positioning: ${formatResearchValue(aiResearch.brand_positioning)}\n`;
      if (aiResearch.mission_statement) prompt += `Mission: ${formatResearchValue(aiResearch.mission_statement)}\n`;
      if (aiResearch.tagline_or_slogan) prompt += `Tagline: ${formatResearchValue(aiResearch.tagline_or_slogan)}\n`;
      if (aiResearch.brand_story) prompt += `Brand story: ${formatResearchValue(aiResearch.brand_story)}\n`;
      if (aiResearch.key_brand_values) prompt += `Brand values: ${formatResearchValue(aiResearch.key_brand_values)}\n`;
      if (aiResearch.target_demographic) prompt += `Target demographic: ${formatResearchValue(aiResearch.target_demographic)}\n`;
      if (aiResearch.brand_voice_and_tone) prompt += `Voice and tone: ${formatResearchValue(aiResearch.brand_voice_and_tone)}\n`;
      prompt += `\nCATEGORY LOCK: Treat the category above as binding. Do not swap in adjacent categories like skincare, cosmetics, supplements, or apparel unless the research explicitly says the brand sells them.\n\n`;
    }

    // Klaviyo performance intelligence
    if (intel?.klaviyo_compiled) {
      prompt += `--- EMAIL PERFORMANCE INTELLIGENCE (from Klaviyo) ---\n${intel.klaviyo_compiled}\n\n`;
    }

    // Merged profile (structured brand data)
    if (intel?.merged_profile) {
      const mp = intel.merged_profile as any;
      if (mp.products && Array.isArray(mp.products)) {
        prompt += `--- PRODUCTS ---\n`;
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
