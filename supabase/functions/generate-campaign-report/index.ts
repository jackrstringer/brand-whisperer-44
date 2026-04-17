import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CAMPAIGN_REPORT_SKILL } from "../_shared/campaignReportSkill.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SALE_KEYWORDS = [
  "off", "%", "sale", "deal", "save", "discount", "free shipping",
  "bogo", "bundle", "flash", "limited time", "ends tonight",
  "last chance", "today only", "hours only",
];

function isSaleCampaign(subjectLine: string): boolean {
  const lower = (subjectLine || "").toLowerCase();
  return SALE_KEYWORDS.some((kw) => lower.includes(kw));
}

function calcImpactScore(campaign: any): number {
  const openRate = campaign.unique_opens / campaign.delivered_count;
  const clickRate = campaign.unique_clicks / campaign.delivered_count;
  const rpr = campaign.revenue_per_recipient || 0;
  const unsubRate = campaign.unsubscribe_rate || 0;
  const reachWeight = Math.log10(campaign.delivered_count + 1);

  return (
    openRate * 0.25 +
    clickRate * 0.25 +
    rpr * 0.40 +
    (1 - unsubRate) * 0.10
  ) * reachWeight;
}

function scoreCampaigns(campaigns: any[]): any[] {
  const eligible = campaigns.filter((c) => (c.delivered_count || 0) >= 500);
  if (eligible.length === 0) return [];

  const withRaw = eligible.map((c) => ({
    ...c,
    isSale: isSaleCampaign(c.subject_line || ""),
    rawScore: calcImpactScore(c),
  }));

  const maxScore = Math.max(...withRaw.map((c) => c.rawScore));

  return withRaw
    .map((c) => ({
      ...c,
      impactScore: maxScore > 0 ? Math.round((c.rawScore / maxScore) * 100) : 0,
    }))
    .sort((a, b) => b.impactScore - a.impactScore);
}

async function researchCompetitor(name: string): Promise<string> {
  const key = Deno.env.get("PERPLEXITY_API_KEY");
  if (!key) return `Research unavailable for ${name} (API key not configured).`;

  try {
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{
          role: "user",
          content:
            `Research ${name}'s email marketing program. Find: estimated send frequency per week, typical offer types (% off, free gift, etc), subject line patterns and tone, content themes, any recent notable campaigns. Be specific. 300 words max.`,
        }],
        max_tokens: 4096,
      }),
    });

    if (!resp.ok) throw new Error(`Perplexity HTTP ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content ||
      `No research content returned for ${name}.`;
  } catch (err: any) {
    return `Research unavailable for ${name}: ${err.message}`;
  }
}

async function researchCompetitors(aiResearch: any): Promise<string> {
  const competitors: string[] =
    aiResearch?.competitive_landscape?.direct_competitors?.slice(0, 5) || [];

  if (competitors.length === 0) {
    return "No competitor data available in brand intelligence.";
  }

  const results = await Promise.all(
    competitors.map((name) => researchCompetitor(name)),
  );

  return competitors
    .map((name, i) => `### ${name}\n${results[i]}`)
    .join("\n\n");
}

async function generateReportHtml(
  compiledContext: string | null,
  scoredCampaigns: any[],
  competitorResearch: string,
): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;

  console.log("[campaign-report] Calling Claude Opus for HTML generation...");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 64000,
      system: `You are a senior email marketing strategist generating a comprehensive performance analysis report. Output only a <style> block followed by valid HTML content — no <!DOCTYPE>, no <html>, no <head>, no <body> tags. No JavaScript. No anchor links. No sticky elements. Pure static long-scroll document. Import Google Fonts (DM Sans + Instrument Serif) via @import at the top of the <style> block. Use the monochrome color palette defined in the skill document.`,
      messages: [{
        role: "user",
        content: `${CAMPAIGN_REPORT_SKILL}

BRAND CONTEXT:
${compiledContext || "No brand context available."}

SCORED CAMPAIGN DATA (180 days, impact scores pre-calculated):
${JSON.stringify(scoredCampaigns, null, 2)}

COMPETITOR RESEARCH:
${competitorResearch}

Generate the complete 5-section campaign performance report. Follow the skill document exactly.`,
      }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  let html = result.content?.[0]?.text || "";

  // Strip markdown fences if present
  html = html.replace(/^```html?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  console.log(`[campaign-report] HTML generated. Length: ${html.length}`);
  return html;
}

async function runPipeline(supabase: any, brandId: string) {
  const { data: bi, error: biError } = await supabase
    .from("brand_intelligence")
    .select("klaviyo_raw, ai_research, compiled_context")
    .eq("brand_id", brandId)
    .single();

  if (biError || !bi) {
    throw new Error(`Failed to load brand_intelligence: ${biError?.message}`);
  }

  const scoredCampaigns = scoreCampaigns(bi.klaviyo_raw || []);
  console.log(`[campaign-report] Scored ${scoredCampaigns.length} campaigns`);

  const competitorResearch = await researchCompetitors(bi.ai_research);
  console.log(`[campaign-report] Competitor research complete`);

  const html = await generateReportHtml(
    bi.compiled_context,
    scoredCampaigns,
    competitorResearch,
  );

  // Save to brand_intelligence (current report)
  await supabase
    .from("brand_intelligence")
    .update({
      campaign_report_html: html,
      campaign_report_status: "complete",
      campaign_report_generated_at: new Date().toISOString(),
      campaign_report_error: null,
    })
    .eq("brand_id", brandId);

  // Save to campaign_reports history
  await supabase.from("campaign_reports").insert({
    brand_id: brandId,
    report_html: html,
    campaign_count: scoredCampaigns.length,
    date_range_days: 180,
  });

  console.log(`[campaign-report] Complete for brand ${brandId}, html length: ${html.length}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { brand_id } = await req.json();
    if (!brand_id) throw new Error("brand_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Set status immediately before returning
    await supabase
      .from("brand_intelligence")
      .update({
        campaign_report_status: "generating",
        campaign_report_error: null,
      })
      .eq("brand_id", brand_id);

    // Run pipeline in background — keep isolate alive via waitUntil
    const bgTask = runPipeline(supabase, brand_id).catch(async (err: any) => {
      console.error("[campaign-report] Pipeline error:", err);
      await supabase
        .from("brand_intelligence")
        .update({
          campaign_report_status: "failed",
          campaign_report_error: err.message,
        })
        .eq("brand_id", brand_id);
    });

    // @ts-ignore — EdgeRuntime is available in Supabase Edge Runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(bgTask);
    }

    // Return immediately — frontend polls campaign_report_status
    return new Response(
      JSON.stringify({ success: true, status: "generating" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
