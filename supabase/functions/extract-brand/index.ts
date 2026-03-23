import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAIL_DESIGN_QUALITY_FLOOR = `
EMAIL DESIGN QUALITY FLOOR — These rules are NON-NEGOTIABLE and override brand references if they conflict:

LAYOUT:
- Fluid width: width="100%" with max-width:600px, margin:0 auto. NEVER fixed width:600px.
- Consistent padding: minimum 20px side padding on all content sections.
- Generous section spacing: minimum 24px between major sections.
- "Flowy" designs — minimize hard section cuts. Prefer gentle transitions with spacing, subtle background color shifts, or gradient-like progressions. Avoid abrupt color/style changes between sections.

TYPOGRAPHY:
- Body text MINIMUM 16px. Recommended 16-18px for mobile readability.
- Line-height minimum 1.5 for body text.
- Never use raw gray (#999 or similar) for body text — use the brand's text color or a slightly muted version.
- ALL text alignment within a section must be consistent.

BUTTONS:
- Minimum 44px tall tap targets.
- Auto width with 32-48px horizontal padding. NEVER full-width buttons.
- Must have clear visual distinction from surrounding content.
- Default to font-style: normal for CTA text. Italic CTAs are almost never correct.

LOGO:
- Centered, max-width 150px, with padding above and below.
- NEVER stretched to full width. NEVER cropped.

IMAGES:
- No text overlay on images.
- Images with excessive negative space (>30% empty) must be cropped or skipped.
- Consistent treatment: all full-bleed OR all padded within a single email.

FOOTER:
- Always present as a SEPARATE section from main content.
- Must include: brand name, unsubscribe link (#unsubscribe), address placeholder.
- Small text (11-12px), muted color, centered.

ROUNDED CORNERS:
- Preferred for cards/containers unless brand explicitly uses sharp corners.
- When the brand uses rounded corners, apply consistently to ALL cards and containers.

DARK MODE SAFETY:
- White backgrounds: use background-image:linear-gradient(#ffffff,#ffffff) alongside background-color:#ffffff.
`;

const SPEC_AND_GUIDE_PROMPT = `You are building a comprehensive email brand design system from confirmed audit findings.

You will receive:
1. Confirmed audit findings (JSON) from a visual analysis of the brand's email campaigns
2. Brand name and industry
3. A set of non-negotiable email design quality floor rules

Your job has THREE outputs, returned as a single JSON object with these keys:

"extraction" — structured brand values for programmatic use:
{
  "colors": { "canvas": "#hex", "text_primary": "#hex", "text_secondary": "#hex", "accent": "#hex", "dark_card": "#hex or null", "button_border": "#hex" },
  "fonts": { "heading": "name", "heading_stack": "CSS stack", "body": "name", "body_stack": "CSS stack", "google_fonts_url": "URL or null" },
  "spacing": { "canvas_width": 600, "side_padding": number, "card_inset": number, "card_radius": number, "section_gap": number },
  "buttons": { "primary_bg": "#hex", "primary_text": "#hex", "border_color": "#hex", "border_width": "Xpx", "border_radius": "Xpx", "padding": "Xpx Ypx" },
  "layout": { "contrast_sections": "description", "background": "#hex or gradient" },
  "voice": { "tone": "string", "headline_structure": "string", "cta_style": "string", "urgency_level": "string", "notable_rules": [] },
  "confidence": { "overall": "high|medium|low", "low_confidence_fields": [] }
}

"system_prompt" — a complete, copy-paste-ready prompt for generating on-brand emails. Must include exact hex codes, px values, font stacks, layout rules, and the quality floor rules. This prompt should be detailed enough that an AI could build a matching email from it alone.

"brand_guide_html" — a self-contained HTML document (single file, no external images, using Google Fonts via <link>) that serves as a visual brand guide. Requirements:
- Use CSS custom properties for brand colors
- Sections: Color System (swatches + hex + usage), Typography (specimens + scale), Button System (live rendered examples + CSS spec), Layout/Anatomy (wireframe diagrams in HTML/CSS), Reusable Components, Photography Direction (color-gradient mood blocks, no actual photos), Voice & Tone, Design Rules (Do's/Don'ts)
- Professional design — the guide itself should look premium
- NO images — use CSS gradients, color blocks, borders for visual examples
- NO emojis anywhere
- ALL button examples must use font-style: normal unless confirmed italic
- Include the quality floor rules in the Design Rules section
- Where the brand's actual practice conflicts with quality floor rules, note: "Brand references showed X, but we recommend Y for better performance."

IMPORTANT: Apply the quality floor rules when generating the system_prompt. If the brand audit shows practices that violate the floor (e.g., 12px body text, full-width buttons), override with the floor values and note the override.

Return ONLY valid JSON with these three keys. No markdown fences. No commentary.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const { auditFindings, brandName, industry } = await req.json();
    if (!auditFindings) {
      return new Response(JSON.stringify({ error: "No audit findings provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generating brand spec + guide for: ${brandName}`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        system: SPEC_AND_GUIDE_PROMPT,
        messages: [{
          role: "user",
          content: `Brand: ${brandName}
Industry: ${industry || "not specified"}

=== CONFIRMED AUDIT FINDINGS ===
${JSON.stringify(auditFindings, null, 2)}

=== EMAIL DESIGN QUALITY FLOOR RULES ===
${EMAIL_DESIGN_QUALITY_FLOOR}

Generate the extraction, system_prompt, and brand_guide_html.`,
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse result");

    const parsed = JSON.parse(jsonMatch[0]);

    console.log(`Brand spec + guide generation complete`);

    return new Response(JSON.stringify({
      extraction: parsed.extraction,
      system_prompt: parsed.system_prompt,
      brand_guide_html: parsed.brand_guide_html,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Extract-brand error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
