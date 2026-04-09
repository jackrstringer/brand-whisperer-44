import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk';
import { CAMPAIGN_REPORT_SKILL } from '../_shared/campaignReportSkill.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { brand_id } = await req.json();
    if (!brand_id) throw new Error('brand_id is required');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await runPipeline(supabase, brand_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ─── Pipeline Orchestrator ───

async function runPipeline(supabase: any, brandId: string) {
  const { data: bi, error: biError } = await supabase
    .from('brand_intelligence')
    .select('klaviyo_raw, ai_research, compiled_context')
    .eq('brand_id', brandId)
    .single();

  if (biError || !bi) throw new Error(`Failed to load brand_intelligence: ${biError?.message}`);

  await supabase
    .from('brand_intelligence')
    .update({ campaign_report_status: 'generating', campaign_report_error: null })
    .eq('brand_id', brandId);

  try {
    const scoredCampaigns = scoreCampaigns(bi.klaviyo_raw || []);
    const competitorResearchResults = await researchCompetitors(bi.ai_research);
    const html = await generateReportHtml(bi.compiled_context, scoredCampaigns, competitorResearchResults);

    await supabase
      .from('brand_intelligence')
      .update({
        campaign_report_html: html,
        campaign_report_status: 'complete',
        campaign_report_generated_at: new Date().toISOString(),
        campaign_report_error: null,
      })
      .eq('brand_id', brandId);
  } catch (err: any) {
    await supabase
      .from('brand_intelligence')
      .update({
        campaign_report_status: 'failed',
        campaign_report_error: err.message,
      })
      .eq('brand_id', brandId);
    throw err;
  }
}

// ─── Campaign Scoring ───

const SALE_KEYWORDS = [
  'off', '%', 'sale', 'deal', 'save', 'discount', 'free shipping',
  'bogo', 'bundle', 'flash', 'limited time', 'ends tonight',
  'last chance', 'today only', 'hours only'
];

function isSaleCampaign(subjectLine: string): boolean {
  const lower = (subjectLine || '').toLowerCase();
  return SALE_KEYWORDS.some(kw => lower.includes(kw));
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
  const eligible = campaigns.filter(c => (c.delivered_count || 0) >= 500);
  if (eligible.length === 0) return [];

  const withRaw = eligible.map(c => ({
    ...c,
    isSale: isSaleCampaign(c.subject_line || ''),
    rawScore: calcImpactScore(c),
  }));

  const maxScore = Math.max(...withRaw.map(c => c.rawScore));

  return withRaw
    .map(c => ({
      ...c,
      impactScore: maxScore > 0 ? Math.round((c.rawScore / maxScore) * 100) : 0,
    }))
    .sort((a, b) => b.impactScore - a.impactScore);
}

// ─── Competitor Research ───

async function researchCompetitor(name: string): Promise<string> {
  const key = Deno.env.get('PERPLEXITY_API_KEY');
  if (!key) return `Research unavailable for ${name} (API key not configured).`;

  try {
    const resp = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{
          role: 'user',
          content: `Research ${name}'s email marketing program. Find: estimated send frequency per week, typical offer types (% off, free gift, etc), subject line patterns and tone, content themes, any recent notable campaigns. Be specific. 300 words max.`,
        }],
        max_tokens: 500,
      }),
    });

    if (!resp.ok) throw new Error(`Perplexity HTTP ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || `No research content returned for ${name}.`;
  } catch (err: any) {
    return `Research unavailable for ${name}: ${err.message}`;
  }
}

async function researchCompetitors(aiResearch: any): Promise<string> {
  const competitors: string[] =
    aiResearch?.competitive_landscape?.direct_competitors?.slice(0, 5) || [];

  if (competitors.length === 0) {
    return 'No competitor data available in brand intelligence.';
  }

  const results = await Promise.all(competitors.map(name => researchCompetitor(name)));

  return competitors
    .map((name, i) => `### ${name}\n${results[i]}`)
    .join('\n\n');
}

// ─── HTML Generation ───

async function generateReportHtml(
  compiledContext: string,
  scoredCampaigns: any[],
  competitorResearch: string
): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const message = await anthropic.messages.create(
      {
        model: 'claude-opus-4-6',
        max_tokens: 8192,
        system: `You are a senior email marketing strategist generating a comprehensive performance analysis report. You have access to the CAMPAIGN_REPORT_SKILL which defines exactly how to structure this report, score campaigns, and write insights. Follow it precisely. Output only valid, complete HTML — no markdown, no explanation.

CRITICAL RENDERING CONSTRAINTS — the report will be rendered inside a Shadow DOM in a React application:
- Do NOT include <html>, <head>, or <body> tags. Output only a <style> block followed by the content markup.
- Do NOT include any <script> tags, onclick handlers, or JavaScript of any kind.
- Do NOT include any anchor links (href="#..."), sticky/fixed positioning, or interactive elements.
- Do NOT include any window.print() button or download button — the parent app provides those.
- The report is a long, static, beautifully typeset document — like a PDF. No interaction required.
- All styles must be scoped within the output (naturally scoped by Shadow DOM).
- Import Google Fonts (DM Sans + Instrument Serif) via @import at the top of the <style> block.
- Use the monochrome color palette defined in the skill document. No colorful accents except impact score badges.`,
        messages: [
          {
            role: 'user',
            content: `${CAMPAIGN_REPORT_SKILL}

BRAND CONTEXT:
${compiledContext || 'No brand context available.'}

SCORED CAMPAIGN DATA (365 days, impact scores calculated):
${JSON.stringify(scoredCampaigns, null, 2)}

COMPETITOR RESEARCH:
${competitorResearch}

Generate the complete 5-section campaign performance report as a single self-contained HTML file. Include all sections: Executive Dashboard, High Performers, Low Performers, Competitor Analysis, Recommendations. Follow all HTML, CSS, and content standards in the skill document exactly.`,
          },
        ],
      },
      { signal: controller.signal }
    );

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '';

    return raw
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  } finally {
    clearTimeout(timeout);
  }
}
