import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { brandId } = await req.json();
    if (!brandId) throw new Error("brandId is required");

    const { data: intel } = await supabase
      .from("brand_intelligence")
      .select("klaviyo_raw")
      .eq("brand_id", brandId)
      .single();

    if (!intel?.klaviyo_raw || !Array.isArray(intel.klaviyo_raw) || intel.klaviyo_raw.length === 0) {
      throw new Error("No Klaviyo raw data found");
    }

    console.log(`[analyze-klaviyo] Analyzing ${intel.klaviyo_raw.length} campaigns for brand ${brandId}`);

    // Update sync_status to 'analyzing'
    await supabase.from("klaviyo_connections").update({ sync_status: "analyzing" }).eq("brand_id", brandId);

    const systemPrompt = `You are a senior email marketing analyst. You analyze Klaviyo campaign performance data and extract actionable intelligence for a brand's email program. Be specific, data-driven, and direct.`;

    const userPrompt = `Analyze the following 365 days of Klaviyo email campaign performance data for this brand and return a structured JSON intelligence report.

Campaign data:
${JSON.stringify(intel.klaviyo_raw, null, 2)}

Return ONLY valid JSON matching this structure:

{
  "summary": {
    "total_campaigns_sent": 0,
    "avg_open_rate": 0.0,
    "avg_click_rate": 0.0,
    "avg_revenue_per_recipient": 0.0,
    "total_revenue_attributed": 0.0,
    "sending_frequency": "",
    "best_sending_days": [],
    "best_sending_times": []
  },
  "top_performers": [
    {
      "campaign_name": "",
      "subject_line": "",
      "preview_text": "",
      "sent_at": "",
      "open_rate": 0.0,
      "click_rate": 0.0,
      "revenue_per_recipient": 0.0,
      "why_it_likely_worked": ""
    }
  ],
  "worst_performers": [
    {
      "campaign_name": "",
      "subject_line": "",
      "open_rate": 0.0,
      "revenue_per_recipient": 0.0,
      "likely_issue": ""
    }
  ],
  "subject_line_intelligence": {
    "avg_length_top_performers": 0,
    "common_patterns_that_work": [],
    "common_patterns_that_flop": [],
    "best_subject_line_examples": [],
    "emoji_usage": "",
    "personalization_usage": "",
    "question_vs_statement_performance": ""
  },
  "offer_performance": {
    "best_offer_type": "",
    "offer_types_seen": [],
    "discount_vs_no_discount_open_rate_delta": "",
    "free_gift_performance": "",
    "urgency_scarcity_impact": ""
  },
  "content_intelligence": {
    "campaign_types_identified": [],
    "educational_vs_promotional_split": "",
    "best_performing_campaign_type": "",
    "seasonal_patterns": [],
    "product_focus_patterns": ""
  },
  "list_health": {
    "avg_unsubscribe_rate": 0.0,
    "unsubscribe_spikes": [],
    "deliverability_concerns": ""
  },
  "recommendations": {
    "increase_frequency_of": [],
    "reduce_or_stop": [],
    "subject_line_formula_that_works": "",
    "best_send_window": "",
    "key_opportunities": []
  }
}

For top_performers return the top 5 by revenue_per_recipient. For worst_performers return the bottom 5. Be analytical about why things worked or didn't based on subject line, timing, offer type, and context.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || "";

    // Extract JSON from response
    let report: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      report = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("[analyze-klaviyo] Failed to parse report:", content.substring(0, 500));
      throw new Error("Failed to parse AI report as JSON");
    }

    // Save report
    await supabase.from("brand_intelligence").update({
      klaviyo_report: report,
    }).eq("brand_id", brandId);

    console.log("[analyze-klaviyo] Report saved. Triggering compile...");

    // Fire compile-klaviyo-context
    try {
      await fetch(`${supabaseUrl}/functions/v1/compile-klaviyo-context`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ brandId }),
      });
    } catch (e) {
      console.warn("[analyze-klaviyo] Failed to trigger compile:", e);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[analyze-klaviyo] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
