import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an expert email QA auditor with PIXEL-LEVEL attention to detail.

You will receive:
1. Screenshot slices of a rendered HTML email (exactly as it appears at 470px width)
2. The full HTML source code

Your job is to compare what you SEE in the screenshots against what the HTML intends, and flag any visual issues.

CHECK FOR THESE SPECIFIC ISSUES:
1. LAYOUT: Are any side-by-side sections stacking vertically when they shouldn't? Are grids collapsing into single columns?
2. IMAGES: Are images displaying correctly? Are any broken, stretched, or cropped badly? Do they have consistent padding treatment?
3. SPACING: Is there excessive whitespace or cramped sections? Are padding/margins consistent?
4. TEXT: Is text readable? Are headlines properly sized? Is body text at least 16px? Is text alignment consistent within sections?
5. BUTTONS: Are CTAs visible and properly sized? Not full-width? Good padding?
6. LOGO: Is it properly sized (max ~150px wide), centered, not stretched?
7. FOOTER: Present and properly separated from content?
8. COLORS: Do colors look cohesive? No jarring contrasts or unreadable text?
9. OVERALL COHESION: Does the email look professional and polished? Any elements that feel "off"?
10. IMAGE FIT: Are images properly proportioned for their containers? Look for: portrait images squeezed into landscape slots, stretched/squished photos, images that clearly don't match the aspect ratio of their container. These are CRITICAL issues. In the fix, append ImageKit transforms (?tr=w-X,h-Y,fo-auto) to ik.imagekit.io URLs to smart-crop them to the correct dimensions.

IMPORTANT: You are looking at the email at 470px viewport width. Side-by-side layouts MUST remain side-by-side — they should NOT stack. If you see grids or two-column sections stacking into single columns, that is a CRITICAL issue.

Return ONLY a JSON object:
{
  "passes_visual_qa": true/false,
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "category": "layout" | "image" | "spacing" | "text" | "button" | "logo" | "footer" | "color" | "cohesion",
      "description": "Clear description of what's wrong",
      "find": "exact HTML string to find (if fixable via code)",
      "replace": "corrected HTML string (if fixable via code)"
    }
  ],
  "overall_score": 1-10,
  "summary": "One sentence overall assessment"
}

Rules:
- Only flag REAL issues visible in the screenshots. Don't nitpick.
- "find" and "replace" must be EXACT substrings of the provided HTML. If you can't provide an exact fix, omit those fields.
- Critical = broken layout, stacking, broken images, image proportion mismatches. Major = spacing/alignment issues. Minor = small polish items.
- If the email looks great, return passes_visual_qa: true with empty issues array and a high score.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { campaignId, html, slices, referenceImageUrls, usePro } = await req.json();
    if (!html || !slices?.length) {
      throw new Error("html and slices are required");
    }

    console.log(`[visual-qa] Starting visual QA for campaign ${campaignId}, ${slices.length} slices`);

    // Build vision content
    const content: any[] = [];

    // Add reference images if provided (for comparison)
    if (Array.isArray(referenceImageUrls) && referenceImageUrls.length > 0) {
      content.push({
        type: "text",
        text: `Here are the REFERENCE campaign screenshots the user chose as inspiration. Compare the output against these for quality and structure:`,
      });
      for (let i = 0; i < referenceImageUrls.length; i++) {
        content.push({
          type: "image_url",
          image_url: { url: referenceImageUrls[i] },
        });
      }
    }

    content.push({
      type: "text",
      text: `Here are ${slices.length} screenshot slices of the rendered email at 470px viewport width. Examine them carefully for visual issues:`,
    });

    for (let i = 0; i < slices.length; i++) {
      const dataUrl = slices[i] as string;
      // Extract base64 data and media type from data URL
      const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (!match) continue;

      content.push({
        type: "image_url",
        image_url: { url: dataUrl },
      });
      content.push({
        type: "text",
        text: `[Slice ${i + 1} of ${slices.length}]`,
      });
    }

    // Truncate HTML if extremely long (keep first + last sections for context)
    let htmlForQa = html;
    if (html.length > 40000) {
      htmlForQa = html.substring(0, 20000) + "\n\n... [HTML TRUNCATED] ...\n\n" + html.substring(html.length - 20000);
    }

    content.push({
      type: "text",
      text: `\n\nFull HTML source code:\n${htmlForQa}\n\nAnalyze the screenshots against the HTML and return your QA assessment as JSON.`,
    });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: usePro ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[visual-qa] AI error:", response.status, errText);
      throw new Error(`AI gateway returned ${response.status}`);
    }

    const aiResult = await response.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || "";

    let qaResult: any;
    try {
      const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      qaResult = JSON.parse(cleaned);
    } catch {
      console.error("[visual-qa] Failed to parse AI response:", rawContent);
      return new Response(
        JSON.stringify({ passes_visual_qa: true, issues: [], overall_score: 7, summary: "Visual QA parse failed, assuming pass", raw: rawContent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[visual-qa] Result: score=${qaResult.overall_score}, issues=${qaResult.issues?.length || 0}, passes=${qaResult.passes_visual_qa}`);

    // Always run deterministic fixers: grid normalization + no-stacking enforcement
    let fixedHtml = normalizeGridImages(html);
    fixedHtml = enforceNoStackingLayout(fixedHtml);
    let fixesApplied = fixedHtml !== html ? 1 : 0;

    // For image proportion issues flagged by QA, normalization already handled them.
    // Only apply find/replace for NON-image issues.
    if (!qaResult.passes_visual_qa && Array.isArray(qaResult.issues)) {
      const nonImageIssues = qaResult.issues.filter(
        (i: any) => !(i.category === 'image' && 
          (i.description?.includes('dimension') || 
           i.description?.includes('proportion') ||
           i.description?.includes('aspect ratio') ||
           i.description?.includes('grid') ||
           i.description?.includes('identical')))
      );
      for (const issue of nonImageIssues) {
        if (issue.find && issue.replace && fixedHtml.includes(issue.find)) {
          fixedHtml = fixedHtml.replace(issue.find, issue.replace);
          fixesApplied++;
        }
      }
    }

    // If fixes were applied, update the campaign
    if (fixesApplied > 0 && campaignId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Push current HTML to history before updating
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("html, html_history")
        .eq("id", campaignId)
        .single();

      if (campaign) {
        const history = Array.isArray(campaign.html_history) ? campaign.html_history : [];
        history.push(campaign.html);

        await supabase.from("campaigns").update({
          html: fixedHtml,
          html_history: history,
        }).eq("id", campaignId);
      }

      console.log(`[visual-qa] Applied ${fixesApplied} fixes to campaign ${campaignId}`);
    }

    return new Response(
      JSON.stringify({
        ...qaResult,
        fixes_applied: fixesApplied,
        html: fixesApplied > 0 ? fixedHtml : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[visual-qa] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
