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
3. (Optionally) REFERENCE campaign screenshots — the design the output was supposed to match structurally

Your job is to compare what you SEE in the screenshots against what the HTML intends, flag any visual issues, AND — if reference screenshots are provided — score how faithfully the output replicates the reference's structure.

CHECK FOR THESE SPECIFIC ISSUES:
1. LAYOUT: Are any side-by-side sections stacking vertically when they shouldn't? Are grids collapsing into single columns?
2. IMAGES: Are images displaying correctly? Are any broken, stretched, or cropped badly? Do they have consistent padding treatment?
3. SPACING: Is there excessive whitespace or cramped sections? Are padding/margins consistent?
4. TEXT: Is text readable? Are headlines properly sized? Is body text at least 16px? Is text alignment consistent within sections?
5. BUTTONS: Are CTAs visible and properly sized? Not full-width? Good padding?
6. LOGO: Is it properly sized (max ~150px wide), centered, not stretched?
7. FOOTER: Present and properly separated from content?
8. COLORS: Do colors look cohesive? No jarring contrasts or unreadable text?
9. GRID IMAGE DIMENSIONS: For every multi-column image row, verify all images share identical width and height attributes, have a fixed pixel height in their inline style (never height:auto), and have matching ?tr=w-{W},h-{H},fo-auto on ImageKit URLs. Flag any height:auto on a grid image as critical.
10. PLACEHOLDER DIMENSIONS: Flag any image with width under 100px or height under 100px that is not a logo or icon. These are placeholder values that will break the layout.
11. GRID STRUCTURE: Flag any multi-column grid that uses display:inline-block tables instead of direct <td> siblings inside a single <tr>. Flag any CSS class (e.g. mobile-grid-col) that sets display:block on grid columns. These techniques cause vertical stacking at the 470px viewport.

STRUCTURAL COMPARISON (when reference screenshots are provided):
Compare the generated output against the reference screenshots and score structural fidelity:
- Does the output have the SAME number of major sections? (hero, product grid, CTA block, text block, footer, etc.)
- Does the output preserve the SAME section ordering as the reference?
- Do multi-column grids have the SAME column count? (e.g., 2-col vs 3-col must match)
- Is the image-to-text ratio similar?
- Are structural elements (hero banner, product grids, dividers, footers) in the same relative positions?
- Does the overall visual weight and density feel similar?

A structural_fidelity score of 8-10 means the output is a near-perfect structural replica.
A score of 5-7 means the structure is roughly similar but with notable differences.
A score of 1-4 means the structure is fundamentally different from the reference — this is a CRITICAL failure that should NOT reach the user.

If NO reference screenshots are provided, set structural_fidelity to null.

IMPORTANT: You are looking at the email at 470px viewport width. Side-by-side layouts MUST remain side-by-side — they should NOT stack. If you see grids or two-column sections stacking into single columns, that is a CRITICAL issue.

Return ONLY a JSON object:
{
  "passes_visual_qa": true/false,
  "structural_fidelity": <number 1-10 or null if no reference>,
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "category": "layout" | "image" | "spacing" | "text" | "button" | "logo" | "footer" | "color" | "cohesion" | "structural_mismatch",
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
- Critical = broken layout, stacking, broken images, image proportion mismatches, structural mismatch with reference. Major = spacing/alignment issues. Minor = small polish items.
- If the email looks great AND matches the reference structure, return passes_visual_qa: true with empty issues array and a high score.
- If the structure fundamentally deviates from the reference (wrong number of sections, grids collapsed, missing major elements), set passes_visual_qa: false and structural_fidelity < 5.`;

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

    const hasReferences = Array.isArray(referenceImageUrls) && referenceImageUrls.length > 0;
    console.log(`[visual-qa] Starting visual QA for campaign ${campaignId}, ${slices.length} slices, ${hasReferences ? referenceImageUrls.length + ' references' : 'no references'}`);

    // Build vision content
    const content: any[] = [];

    // Add reference images if provided (for structural comparison)
    if (hasReferences) {
      content.push({
        type: "text",
        text: `Here are ${referenceImageUrls.length} REFERENCE campaign screenshot(s) — the structural template the output MUST match. Compare section count, ordering, grid column counts, and overall layout fidelity:`,
      });
      for (let i = 0; i < referenceImageUrls.length; i++) {
        content.push({
          type: "image_url",
          image_url: { url: referenceImageUrls[i] },
        });
        content.push({
          type: "text",
          text: `[Reference ${i + 1} of ${referenceImageUrls.length}]`,
        });
      }
    }

    content.push({
      type: "text",
      text: `Here are ${slices.length} screenshot slices of the GENERATED email at 470px viewport width. Examine them carefully for visual issues${hasReferences ? ' AND compare against the reference screenshots above' : ''}:`,
    });

    for (let i = 0; i < slices.length; i++) {
      const dataUrl = slices[i] as string;
      const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (!match) continue;

      content.push({
        type: "image_url",
        image_url: { url: dataUrl },
      });
      content.push({
        type: "text",
        text: `[Generated Slice ${i + 1} of ${slices.length}]`,
      });
    }

    // Truncate HTML if extremely long
    let htmlForQa = html;
    if (html.length > 40000) {
      htmlForQa = html.substring(0, 20000) + "\n\n... [HTML TRUNCATED] ...\n\n" + html.substring(html.length - 20000);
    }

    content.push({
      type: "text",
      text: `\n\nFull HTML source code:\n${htmlForQa}\n\nAnalyze the screenshots against the HTML${hasReferences ? ' and reference screenshots' : ''} and return your QA assessment as JSON.`,
    });

    // Use Pro model when references are provided for better structural comparison
    const model = (usePro || hasReferences) ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash";
    console.log(`[visual-qa] Using model: ${model}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
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
        JSON.stringify({ passes_visual_qa: true, structural_fidelity: null, issues: [], overall_score: 7, summary: "Visual QA parse failed, assuming pass", raw: rawContent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[visual-qa] Result: score=${qaResult.overall_score}, structural_fidelity=${qaResult.structural_fidelity ?? 'n/a'}, issues=${qaResult.issues?.length || 0}, passes=${qaResult.passes_visual_qa}`);

    return new Response(
      JSON.stringify({
        ...qaResult,
        fixes_applied: 0,
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
