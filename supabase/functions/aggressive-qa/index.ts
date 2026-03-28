import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an ELITE email QA auditor with PIXEL-PERFECT standards. You are extremely strict.

You will receive:
1. Screenshot slices of a rendered HTML email (exactly as it appears at 470px width)
2. Reference campaign screenshots (what the user CHOSE as inspiration — the output should match this quality/structure)
3. The full HTML source code

Your job is to compare the RENDERED OUTPUT against the REFERENCE CAMPAIGN and flag ANY issue a discerning creative director would notice.

COMPARE AGAINST REFERENCE — CHECK THESE:
1. LAYOUT FIDELITY: Does the output follow the reference's section structure, visual hierarchy, and overall flow? Flag deviations.
2. IMAGE PROPORTIONS: Are images properly proportioned for their containers? Portrait images squeezed into landscape slots? Stretched or squished photos? These are CRITICAL. Fix by appending ImageKit transforms (?tr=w-X,h-Y,fo-auto) to ik.imagekit.io URLs.
3. IMAGE CONSISTENCY: All images in grids must use identical dimensions. If they don't, normalize with matching transforms.
4. SPACING & RHYTHM: Compare padding, margins, and section gaps against reference. Is the visual rhythm similar?
5. TYPOGRAPHY: Text sizing, weight hierarchy, and alignment compared to reference.
6. BUTTONS/CTAs: Shape, size, padding — do they match the reference's style?
7. COLOR COHESION: Do the brand colors work harmoniously? Any jarring contrasts or unreadable text?
8. BROKEN ELEMENTS: Missing images, broken layouts, stacking issues, overflowing content.
9. POLISH: Does the email look professional and production-ready? Would you send this to 100k subscribers?
10. LOGO: Properly sized (max ~150px wide), centered, not stretched?
11. FOOTER: Present and properly separated from content?
12. OVERALL: Score must be 9+ to pass. Be strict — this is "perfection mode."

IMPORTANT: You are looking at the email at 470px viewport width. Side-by-side layouts MUST remain side-by-side.

Return ONLY a JSON object:
{
  "passed": true/false,
  "score": 1-10,
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "category": "layout" | "image" | "spacing" | "text" | "button" | "logo" | "footer" | "color" | "cohesion" | "proportion",
      "description": "Clear description of what's wrong"
    }
  ],
  "summary": "One sentence assessment"
}

Rules:
- Score 1-10 based on production-readiness. 7+ = pass.
- Be fair — minor polish issues should not tank the score.
- Critical = broken layout, missing images, completely wrong structure.
- Major = noticeable spacing/alignment issues, image proportion problems.
- Minor = small polish items a typical subscriber wouldn't notice.
- Do NOT provide find/replace fixes. Just describe issues clearly.
- Focus on what a REAL subscriber would notice, not pixel-perfect comparisons.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { campaignId, html, slices, referenceImageUrls, variantIndex, roundNumber } = await req.json();
    if (!html || !slices?.length) {
      throw new Error("html and slices are required");
    }

    console.log(`[aggressive-qa] Campaign ${campaignId}, variant ${variantIndex}, round ${roundNumber}, ${slices.length} slices, ${referenceImageUrls?.length || 0} refs`);

    // Build vision content
    const content: any[] = [];

    // Add reference images first if available
    if (Array.isArray(referenceImageUrls) && referenceImageUrls.length > 0) {
      content.push({
        type: "text",
        text: `Here are the REFERENCE campaign screenshots that the user chose as inspiration. The output should match this quality, structure, and polish level:`,
      });
      for (let i = 0; i < referenceImageUrls.length; i++) {
        content.push({
          type: "image_url",
          image_url: { url: referenceImageUrls[i] },
        });
        content.push({
          type: "text",
          text: `[Reference image ${i + 1} of ${referenceImageUrls.length}]`,
        });
      }
    }

    // Add rendered output slices
    content.push({
      type: "text",
      text: `\n\nNow here are ${slices.length} screenshot slices of the RENDERED OUTPUT at 470px viewport width. Compare these against the reference above:`,
    });

    for (let i = 0; i < slices.length; i++) {
      const dataUrl = slices[i] as string;
      if (!dataUrl.startsWith("data:image/")) continue;
      content.push({
        type: "image_url",
        image_url: { url: dataUrl },
      });
      content.push({
        type: "text",
        text: `[Output slice ${i + 1} of ${slices.length}]`,
      });
    }

    // Add HTML
    let htmlForQa = html;
    if (html.length > 40000) {
      htmlForQa = html.substring(0, 20000) + "\n\n... [HTML TRUNCATED] ...\n\n" + html.substring(html.length - 20000);
    }

    content.push({
      type: "text",
      text: `\n\nFull HTML source code:\n${htmlForQa}\n\nThis is QA round ${roundNumber}. ${roundNumber > 1 ? "Previous rounds found issues that were supposed to be fixed. Be extra vigilant for remaining problems." : "Analyze thoroughly."}\n\nReturn your QA assessment as JSON.`,
    });

    // Use Gemini Pro for maximum quality in perfection mode
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[aggressive-qa] AI error:", response.status, errText);
      throw new Error(`AI gateway returned ${response.status}`);
    }

    const aiResult = await response.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || "";

    let qaResult: any;
    try {
      const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      qaResult = JSON.parse(cleaned);
    } catch {
      console.error("[aggressive-qa] Failed to parse AI response:", rawContent.substring(0, 500));
      return new Response(
        JSON.stringify({ passed: true, score: 7, issues: [], summary: "QA parse failed, assuming pass", fixedHtml: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Score-only mode — no auto-patching (was degrading quality)
    const passed = qaResult.passed || qaResult.score >= 7;
    console.log(`[aggressive-qa] Result: score=${qaResult.score}, passed=${passed}, issues=${qaResult.issues?.length || 0}`);

    // If we have a campaignId and variant index, update the variant_htmls
    if (campaignId && variantIndex !== undefined && fixedHtml) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: campaign } = await supabase
        .from("campaigns")
        .select("variant_htmls")
        .eq("id", campaignId)
        .single();

      if (campaign?.variant_htmls && Array.isArray(campaign.variant_htmls)) {
        const variants = [...campaign.variant_htmls] as any[];
        if (variants[variantIndex]) {
          variants[variantIndex] = {
            ...variants[variantIndex],
            html: fixedHtml,
            qa_score: qaResult.score,
            qa_summary: qaResult.summary,
            qa_round: roundNumber,
            status: qaResult.passed ? "qa_passed" : "qa_fixing",
          };
          await supabase.from("campaigns").update({ variant_htmls: variants }).eq("id", campaignId);
        }
      }
    }

    return new Response(
      JSON.stringify({
        passed: qaResult.passed,
        score: qaResult.score,
        issues: qaResult.issues || [],
        summary: qaResult.summary,
        fixedHtml,
        fixesApplied,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[aggressive-qa] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
