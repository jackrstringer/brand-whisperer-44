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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
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

    await supabase.from("klaviyo_connections").update({ sync_status: "analyzing" }).eq("brand_id", brandId);

    const systemPrompt = `You are a senior email marketing analyst. Analyze Klaviyo campaign data and return ONLY valid JSON — no markdown fences, no explanation, just raw JSON.`;

    const userPrompt = `Analyze this 30-day Klaviyo email campaign data. Return ONLY raw JSON (no \`\`\` fences).

Campaign data:
${JSON.stringify(intel.klaviyo_raw)}

Return this exact JSON structure:
{"summary":{"total_campaigns_sent":0,"avg_open_rate":0.0,"avg_click_rate":0.0,"avg_revenue_per_recipient":0.0,"total_revenue_attributed":0.0,"sending_frequency":"","best_sending_days":[],"best_sending_times":[]},"top_performers":[{"campaign_name":"","subject_line":"","preview_text":"","sent_at":"","open_rate":0.0,"click_rate":0.0,"revenue_per_recipient":0.0,"why_it_likely_worked":""}],"worst_performers":[{"campaign_name":"","subject_line":"","open_rate":0.0,"revenue_per_recipient":0.0,"likely_issue":""}],"subject_line_intelligence":{"avg_length_top_performers":0,"common_patterns_that_work":[],"common_patterns_that_flop":[],"best_subject_line_examples":[],"emoji_usage":"","personalization_usage":""},"content_intelligence":{"campaign_types_identified":[],"best_performing_campaign_type":"","product_focus_patterns":""},"list_health":{"avg_unsubscribe_rate":0.0,"deliverability_concerns":""},"recommendations":{"increase_frequency_of":[],"reduce_or_stop":[],"subject_line_formula_that_works":"","best_send_window":"","key_opportunities":[]}}

Top 5 performers by RPR, bottom 5 worst. Be analytical and specific.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 8192,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`AI API error ${response.status}: ${errBody}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    let report: any;
    try {
      // Strip markdown fences if present
      const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      report = JSON.parse(cleaned);
    } catch {
      // Try to extract and fix JSON
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON object found");
        // Attempt to fix common issues: trailing commas, unescaped newlines in strings
        let fixed = jsonMatch[0]
          .replace(/,\s*([}\]])/g, "$1") // trailing commas
          .replace(/[\x00-\x1F\x7F]/g, (ch: string) => ch === "\n" || ch === "\r" || ch === "\t" ? " " : ""); // control chars
        report = JSON.parse(fixed);
      } catch (e2) {
        console.error("[analyze-klaviyo] JSON parse failed after repair:", content.substring(0, 1000));
        throw new Error("Failed to parse AI report as JSON");
      }
    }

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
    // Set sync_status to failed
    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { brandId } = await new Response(req.clone().body).json().catch(() => ({}));
      if (brandId) {
        await supabase.from("klaviyo_connections").update({
          sync_status: "failed",
          sync_error: error.message,
        }).eq("brand_id", brandId);
      }
    } catch {}
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
