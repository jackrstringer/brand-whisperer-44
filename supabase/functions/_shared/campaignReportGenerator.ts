import Anthropic from "https://esm.sh/@anthropic-ai/sdk";
import { CAMPAIGN_REPORT_SKILL } from "./campaignReportSkill.ts";

const REPORT_END_MARKER = "<!-- END OF REPORT -->";
const REQUIRED_MARKERS = [
  "Executive Dashboard",
  "High Performers",
  "Low Performers",
  "Competitor Analysis",
  "Recommendation 1:",
  "Recommendation 5:",
  "Methodology",
  REPORT_END_MARKER,
];

const SYSTEM_PROMPT =
  `You are a senior email marketing strategist generating a comprehensive performance analysis report. You have access to the CAMPAIGN_REPORT_SKILL which defines exactly how to structure this report, score campaigns, and write insights. Follow it precisely. Output only valid, complete HTML — no markdown, no explanation.

CRITICAL RENDERING CONSTRAINTS — the report will be rendered inside a Shadow DOM in a React application:
- Do NOT include <html>, <head>, or <body> tags. Output only a <style> block followed by the content markup.
- Do NOT include any <script> tags, onclick handlers, or JavaScript of any kind.
- Do NOT include any anchor links (href="#..."), sticky/fixed positioning, or interactive elements.
- Do NOT include any window.print() button or download button — the parent app provides those.
- The report is a long, static, beautifully typeset document — like a PDF. No interaction required.
- All styles must be scoped within the output (naturally scoped by Shadow DOM).
- Import Google Fonts (DM Sans + Instrument Serif) via @import at the top of the <style> block.
- Use the monochrome color palette defined in the skill document. No colorful accents except impact score badges.
- The report MUST include the header, all five major sections, and the visible Methodology section.
- The report MUST end with this exact literal marker on its own line: <!-- END OF REPORT -->`;

interface GenerateCampaignReportParams {
  compiledContext: string | null;
  scoredCampaigns: any[];
  competitorResearch: string;
}

interface ReportValidationResult {
  isComplete: boolean;
  missingMarkers: string[];
}

export async function generateCampaignReportHtml({
  compiledContext,
  scoredCampaigns,
  competitorResearch,
}: GenerateCampaignReportParams): Promise<string> {
  const anthropic = new Anthropic({
    apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
  });

  const sourcePrompt = `${CAMPAIGN_REPORT_SKILL}

BRAND CONTEXT:
${compiledContext || "No brand context available."}

SCORED CAMPAIGN DATA (365 days, impact scores calculated):
${JSON.stringify(scoredCampaigns, null, 2)}

COMPETITOR RESEARCH:
${competitorResearch}

Generate the complete 5-section campaign performance report as a single self-contained HTML fragment.
Requirements:
- Include the report header, all 5 major sections, and the visible Methodology section.
- This must be a long-form, multi-section report — not a one-screen summary.
- Start with a single <style> block.
- End with the exact literal marker <!-- END OF REPORT --> on its own line.`;

  let html = await requestReportChunk(anthropic, sourcePrompt);
  let validation = validateReportHtml(html);

  for (let attempt = 0; attempt < 4 && !validation.isComplete; attempt += 1) {
    const continuationPrompt = buildContinuationPrompt(
      sourcePrompt,
      html,
      validation.missingMarkers,
    );
    const continuation = await requestReportChunk(
      anthropic,
      continuationPrompt,
    );

    if (!continuation) break;

    html = appendWithOverlap(html, continuation);
    validation = validateReportHtml(html);
  }

  if (!validation.isComplete) {
    throw new Error(
      `Campaign report generation returned incomplete HTML. Missing: ${
        validation.missingMarkers.join(", ")
      }`,
    );
  }

  return html.trim();
}

async function requestReportChunk(
  anthropic: Anthropic,
  prompt: string,
): Promise<string> {
  const stream = anthropic.messages.stream({
    model: "claude-opus-4-20250514",
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const message = await stream.finalMessage();

  const html = sanitizeHtmlFragment(extractTextContent(message));
  console.log("generate-campaign-report chunk", {
    stopReason: message.stop_reason,
    length: html.length,
  });
  return html;
}

function extractTextContent(message: any): string {
  return (message?.content ?? [])
    .filter((block: any) => block?.type === "text")
    .map((block: any) => block.text ?? "")
    .join("")
    .trim();
}

function sanitizeHtmlFragment(raw: string): string {
  return raw
    .replace(/^```html\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function validateReportHtml(html: string): ReportValidationResult {
  const missingMarkers = REQUIRED_MARKERS.filter(
    (marker) => !html.toLowerCase().includes(marker.toLowerCase()),
  );

  return {
    isComplete: missingMarkers.length === 0,
    missingMarkers,
  };
}

function buildContinuationPrompt(
  sourcePrompt: string,
  existingHtml: string,
  missingMarkers: string[],
): string {
  const tail = existingHtml.slice(-4000);

  return `The current campaign report HTML was cut off before completion. Continue the exact same report from the very next character onward.

Rules:
- Do NOT restart the report.
- Do NOT repeat earlier content.
- Do NOT emit another <style> block unless the current fragment contains none.
- If the fragment ended mid-element, finish that element first and then continue normally.
- Complete every missing section.
- End with the exact literal marker <!-- END OF REPORT --> on its own line.
- Output ONLY the continuation HTML fragment.

Missing required markers:
${missingMarkers.join("\n")}

Current HTML tail for context:
${tail}`;
}

function appendWithOverlap(existingHtml: string, continuation: string): string {
  const maxOverlap = Math.min(1500, existingHtml.length, continuation.length);

  for (let size = maxOverlap; size > 0; size -= 1) {
    if (existingHtml.slice(-size) === continuation.slice(0, size)) {
      return `${existingHtml}${continuation.slice(size)}`;
    }
  }

  return `${existingHtml}${continuation}`;
}
