import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

const HTML_GUIDE_TEMPLATE = `
=== HTML BRAND GUIDE TEMPLATE REFERENCE ===

You MUST generate the brand guide HTML following this exact CSS architecture and HTML structure. This is the quality bar. The guide must look like a premium design deliverable, not a data dump.

CSS ARCHITECTURE:
- Use CSS custom properties for ALL brand colors (--brand-accent, --black, --white, --gray-50 through --gray-900)
- Load Google Fonts via <link> in <head> (the brand's heading font, body font, plus JetBrains Mono for code/labels)
- Use clamp() for responsive font sizes on cover and section titles
- Include a responsive @media (max-width: 768px) block that collapses grids to single column

REQUIRED CSS CLASSES AND PATTERNS:

1. COVER SECTION (.cover):
   - Full-viewport dark background (--gray-900)
   - Centered brand name, large title with one word in brand accent + italic using <em>, subtitle, meta line
   - Subtle blurred accent circle using ::before pseudo-element (600px circle, blur(200px), opacity 0.05)
   - Meta line uses monospace font (JetBrains Mono), shows "Prepared by [name] · [date] · v1.0"

2. STICKY NAV (.sticky-nav):
   - position: sticky; top: 0; z-index: 100
   - White background, bottom border, brand name on left, section links as uppercase monospace labels
   - Links: COLOR, TYPOGRAPHY, BUTTONS, LAYOUT, COMPONENTS, PHOTOGRAPHY, VOICE, RULES
   - Horizontal scroll on mobile with hidden scrollbar

3. SECTION PATTERN (.section):
   - 80px vertical padding, 60px horizontal (48px/24px on mobile)
   - Each section has: .section-label (monospace, uppercase, "01 / COLOR"), .section-title (serif, large), .section-desc (max-width 640px, muted color)

4. COLOR PALETTE SECTION:
   - .subgroup-label for "PRIMARY COLORS" and "SUPPORTING NEUTRALS"
   - .color-card with .color-swatch (140px tall, color fill, hex label at bottom) + .color-info (name + usage description)
   - Use .color-hex.on-dark (white text with subtle white bg) or .color-hex.on-light (dark text with subtle dark bg)
   - Grid of 3 for primary, grid of 4 for supporting neutrals
   - End with .callout block (dark bg, accent title, muted body) showing "Color Ratio Rule"

5. TYPOGRAPHY SECTION:
   - .specimen-card with .specimen-preview (live rendered text in the actual font) + .specimen-info (tags showing font name/stack + description)
   - Grid of 2: heading font specimen on left, body font specimen on right
   - .type-scale-table: role / size+weight / live preview columns for Hero Headline, Section Header, Subhead, Body, CTA Label, Fine Print
   - End with .callout showing "Emphasis Pattern" (how italic/bold is used)

6. BUTTON SYSTEM SECTION:
   - .button-card with .button-preview (live rendered CTA button) + .button-label-card (variant name + monospace spec note)
   - Grid of 3: Primary CTA, Primary CTA (Short), Primary CTA on Dark (dark preview bg)
   - Actual rendered button must use the EXACT brand button styles (fill, border, radius, weight, font-style: normal)
   - .code-block: dark background, syntax-highlighted CSS spec with .comment, .sel, .prop, .val classes
   - End with .callout showing "CTA Copy Patterns" with examples from the audit

7. LAYOUT SECTION:
   - .wireframe-grid (grid of 3): Each wireframe shows an email type structure
   - .wireframe with .wireframe-title + .wireframe-body containing stacked .wf-block elements
   - Block types: .wf-block.accent (brand accent), .wf-block.dark (dark bg), .wf-block.light (white with border), .wf-block.image (gray placeholder), .wf-block.cta (accent with border, pill shape, centered)
   - Below wireframes: spacing system with .spacing-row (colored bar + monospace label) showing the spacing scale

8. REUSABLE COMPONENTS SECTION:
   - .component-card with .component-preview (mini rendered component) + .component-info (name + description)
   - Grid of 2 or 3 depending on component count
   - Include ALL observed components: announcement bars, review cards (with condition tags, stars, quoted title, body, author), benefit stacks (icon circles + text rows), founder story blocks (dark bg, serif headline), stat callouts (large number with accent highlight), risk reversal/guarantee blocks, product+text splits, comparison grids, standard footer (dark bg, brand wordmark, social SVG icons, legal text)
   - Use SVG line icons for any icon representation — NEVER emojis
   - Social icons in footer component must be actual SVG paths (Facebook, Instagram, TikTok, YouTube, etc.)

9. PHOTOGRAPHY DIRECTION SECTION:
   - .photo-card with .photo-gradient (120px tall, CSS gradient representing the mood) + .photo-info (style name + description)
   - Grid of 3 photography styles (e.g., "Product on Neutral", "Lifestyle / In-Use", "People / Results")
   - Below: .rules-grid with Do's and Don'ts cards for photography
   - .rule-card.do (light green bg) and .rule-card.dont (light red bg) with + and - prefixes

10. VOICE & TONE SECTION:
    - .voice-table: Attribute / What It Sounds Like / What It Doesn't Sound Like columns
    - 4-5 brand voice attributes with real examples from the audit findings
    - Below: .formula-group sections showing headline formulas by category (Low-Effort Promise, Perspective Shift, Quiet Confidence, Social Proof, etc.) with live-rendered headlines using the brand's heading font, including <em> for italic emphasis words
    - End with .callout showing "Messaging Pillars" (numbered list of brand messaging strategies)

11. DESIGN RULES SECTION:
    - .subgroup-label "DESIGN" + .rules-grid with Do and Don't cards
    - .subgroup-label "COPY" + .rules-grid with Do and Don't cards
    - Each rule item is specific and derived from observed patterns
    - Include quality floor overrides where applicable: "Brand references showed X, but we recommend Y for better performance."

12. GUIDE FOOTER:
    - Dark background, brand name in serif, "living document" note, credit line in monospace

CRITICAL GENERATION RULES:
- NEVER use emojis anywhere. Use SVG line icons for icon representations.
- NEVER include <img> tags or image file references. The guide is 100% self-contained.
- NEVER include a "Sample Campaigns" or "Reference Emails" section.
- ALL CTA button examples MUST use font-style: normal unless italic was explicitly confirmed in the audit.
- The code block CSS spec must EXACTLY match the rendered button examples.
- Match the brand's actual conventions (sentence case vs title case, alignment, etc.)
- No em dashes -- use -- or reword.
- The guide itself must feel like a premium design agency deliverable.
- Use generous whitespace, clean typography, and consistent spacing throughout.
`;

const SPEC_PROMPT = `You are building a structured email brand spec from confirmed audit findings.

You will receive confirmed audit findings (JSON) from a visual analysis of the brand's email campaigns, plus email design quality floor rules.

Return ONLY valid JSON (no markdown fences, no commentary) with these two keys:

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

Apply the quality floor rules. If the brand audit shows practices that violate the floor (e.g., 12px body text, full-width buttons), override with the floor values and note the override in the system_prompt.`;

const GUIDE_PROMPT = `You are generating a comprehensive, self-contained HTML email brand design guide document.

You will receive:
1. Confirmed audit findings (JSON)
2. Brand extraction spec (JSON)
3. Brand name and industry
4. An HTML template reference showing the exact CSS architecture and section structure to follow

Your output must be ONLY the raw HTML document — starting with <!DOCTYPE html> and ending with </html>. No JSON wrapping. No markdown fences. No commentary before or after.

The HTML must be a premium visual deliverable with:
- Full-viewport cover section with brand name, blurred accent circle effect, and metadata
- Sticky navigation bar with anchor links to each section
- 8 full sections: Color Palette, Typography (with specimens and type scale table), Button System (with live rendered buttons, CSS code block, and copy patterns), Email Layout (wireframe diagrams built in HTML/CSS, spacing system), Reusable Components (mini rendered previews of every observed component), Photography Direction (gradient mood cards, do's/don'ts), Voice & Tone (attribute table, headline formulas with live-rendered examples, messaging pillars), Design Rules (do's/don'ts grids for design and copy)
- Guide footer with brand name and credit
- CSS custom properties for all brand colors
- Google Fonts loaded via <link>
- JetBrains Mono for monospace labels and code
- Responsive design with mobile breakpoint
- SVG icons where needed (never emojis)
- No external images — entirely self-contained
- The guide itself must look like it was designed by a premium agency

Do NOT abbreviate or skip sections. Every section must be fully fleshed out with real content from the audit findings.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const { auditFindings, brandName, industry, brandId, step, confirmed_properties } = await req.json();
    if (!auditFindings) {
      return new Response(JSON.stringify({ error: "No audit findings provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If brandId provided, support step-based processing to avoid runtime timeouts.
    if (brandId) {
      const mode = step === "guide" ? "guide" : step === "full" ? "full" : "spec";

      // Run spec synchronously so the caller can reliably trigger guide generation next.
      if (mode === "spec") {
        await processSpecStep(ANTHROPIC_API_KEY, auditFindings, brandName, industry, brandId, confirmed_properties);
        return new Response(JSON.stringify({ status: "spec_complete", brandId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Guide generation can run in background while frontend polls DB.
      const promise = mode === "full"
        ? processExtraction(ANTHROPIC_API_KEY, auditFindings, brandName, industry, brandId)
        : processGuideStep(ANTHROPIC_API_KEY, auditFindings, brandName, industry, brandId);

      promise.catch((err) => {
        console.error(`[extract-brand] ${mode} background processing error:`, err);
        saveError(brandId, err.message).catch(console.error);
      });

      return new Response(JSON.stringify({ status: `${mode}_processing`, brandId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Legacy synchronous mode (no brandId) - kept for backward compat
    const result = await processExtraction(ANTHROPIC_API_KEY, auditFindings, brandName, industry);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Extract-brand error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function saveError(brandId: string, errorMessage: string) {
  const sb = getSupabaseAdmin();
  const { data: existing } = await sb
    .from("brand_profiles")
    .select("audit_findings")
    .eq("brand_id", brandId)
    .maybeSingle();

  const baseAudit = existing?.audit_findings && typeof existing.audit_findings === "object" && !Array.isArray(existing.audit_findings)
    ? existing.audit_findings as Record<string, unknown>
    : {};

  await sb.from("brand_profiles").update({
    audit_findings: { ...baseAudit, _error: errorMessage },
  }).eq("brand_id", brandId);
}

function stripRuntimeKeys(auditFindings: any) {
  if (!auditFindings || typeof auditFindings !== "object" || Array.isArray(auditFindings)) {
    return auditFindings;
  }

  const { _error, _status, ...rest } = auditFindings;
  return rest;
}

async function runSpecCall(
  apiKey: string,
  auditFindings: any,
  brandName: string,
  industry: string,
  confirmedProperties?: any,
) {
  const anthropicHeaders = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  const auditJson = JSON.stringify(auditFindings, null, 2);

  let confirmedBlock = "";
  if (confirmedProperties) {
    confirmedBlock = `\n\n=== CONFIRMED PROPERTIES (exact values from Figma/website -- use these, do not guess) ===\n${JSON.stringify(confirmedProperties, null, 2)}`;
  }

  console.log(`[extract-brand] Call 1: Generating spec for ${brandName}`);
  const specResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: anthropicHeaders,
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: SPEC_PROMPT,
      messages: [{
        role: "user",
        content: `Brand: ${brandName}\nIndustry: ${industry || "not specified"}\n\n=== CONFIRMED AUDIT FINDINGS ===\n${auditJson}${confirmedBlock}\n\n=== EMAIL DESIGN QUALITY FLOOR RULES ===\n${EMAIL_DESIGN_QUALITY_FLOOR}`,
      }],
    }),
  });

  if (!specResponse.ok) {
    const errText = await specResponse.text();
    throw new Error(`Spec API error: ${specResponse.status} - ${errText}`);
  }

  const specResult = await specResponse.json();
  const specText = specResult.content?.[0]?.text || "";
  const specJsonMatch = specText.match(/\{[\s\S]*\}/);
  if (!specJsonMatch) throw new Error("Failed to parse spec result");

  return JSON.parse(specJsonMatch[0]);
}

async function runGuideCall(
  apiKey: string,
  auditFindings: any,
  brandName: string,
  industry: string,
  extraction: any,
) {
  const anthropicHeaders = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  const auditJson = JSON.stringify(auditFindings, null, 2);

  console.log(`[extract-brand] Call 2: Generating HTML guide for ${brandName}`);
  const guideResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: anthropicHeaders,
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 36000,
      system: GUIDE_PROMPT,
      messages: [{
        role: "user",
        content: `Brand: ${brandName}\nIndustry: ${industry || "not specified"}\n\n=== CONFIRMED AUDIT FINDINGS ===\n${auditJson}\n\n=== BRAND EXTRACTION SPEC ===\n${JSON.stringify(extraction, null, 2)}\n\n=== EMAIL DESIGN QUALITY FLOOR RULES ===\n${EMAIL_DESIGN_QUALITY_FLOOR}\n\n${HTML_GUIDE_TEMPLATE}\n\nGenerate the FULL premium HTML brand guide document. Start with <!DOCTYPE html> and end with </html>. Do not abbreviate or skip sections.`,
      }],
    }),
  });

  if (!guideResponse.ok) {
    const errText = await guideResponse.text();
    throw new Error(`Guide API error: ${guideResponse.status} - ${errText}`);
  }

  const guideResult = await guideResponse.json();
  let guideHtml = guideResult.content?.[0]?.text || "";

  guideHtml = guideHtml.replace(/^```html?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  if (!guideHtml.startsWith("<!DOCTYPE") && !guideHtml.startsWith("<html")) {
    const docStart = guideHtml.indexOf("<!DOCTYPE");
    if (docStart > -1) guideHtml = guideHtml.substring(docStart);
  }

  console.log(`[extract-brand] Call 2 complete. Guide HTML length: ${guideHtml.length}`);
  return guideHtml;
}

async function processSpecStep(
  apiKey: string,
  auditFindings: any,
  brandName: string,
  industry: string,
  brandId: string,
) {
  const cleanedAudit = stripRuntimeKeys(auditFindings);
  const specParsed = await runSpecCall(apiKey, cleanedAudit, brandName, industry);

  const sb = getSupabaseAdmin();
  await sb.from("brand_profiles").update({
    system_prompt: specParsed.system_prompt,
    raw_extraction: specParsed.extraction,
    audit_findings: cleanedAudit,
  }).eq("brand_id", brandId);

  console.log(`[extract-brand] Spec saved for brand ${brandId}`);
  return specParsed;
}

async function processGuideStep(
  apiKey: string,
  auditFindings: any,
  brandName: string,
  industry: string,
  brandId: string,
) {
  const sb = getSupabaseAdmin();
  const cleanedAudit = stripRuntimeKeys(auditFindings);

  const { data: profile, error: profileError } = await sb
    .from("brand_profiles")
    .select("raw_extraction, audit_findings")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Failed to load profile for guide generation: ${profileError.message}`);
  }

  let extraction = profile?.raw_extraction;
  const effectiveAudit = cleanedAudit ?? stripRuntimeKeys(profile?.audit_findings) ?? {};

  // Fallback if spec step was skipped.
  if (!extraction) {
    const specParsed = await processSpecStep(apiKey, effectiveAudit, brandName, industry, brandId);
    extraction = specParsed.extraction;
  }

  const guideHtml = await runGuideCall(apiKey, effectiveAudit, brandName, industry, extraction);

  await sb.from("brand_profiles").update({
    brand_guide_html: guideHtml,
    audit_findings: effectiveAudit,
  }).eq("brand_id", brandId);

  console.log(`[extract-brand] Guide saved for brand ${brandId}`);

  return {
    extraction,
    brand_guide_html: guideHtml,
  };
}

async function processExtraction(
  apiKey: string,
  auditFindings: any,
  brandName: string,
  industry: string,
  brandId?: string,
) {
  const cleanedAudit = stripRuntimeKeys(auditFindings);
  const specParsed = await runSpecCall(apiKey, cleanedAudit, brandName, industry);

  if (brandId) {
    const sb = getSupabaseAdmin();
    await sb.from("brand_profiles").update({
      system_prompt: specParsed.system_prompt,
      raw_extraction: specParsed.extraction,
      audit_findings: cleanedAudit,
    }).eq("brand_id", brandId);
    console.log(`[extract-brand] Spec saved for brand ${brandId}`);
  }

  const guideHtml = await runGuideCall(apiKey, cleanedAudit, brandName, industry, specParsed.extraction);

  const result = {
    extraction: specParsed.extraction,
    system_prompt: specParsed.system_prompt,
    brand_guide_html: guideHtml,
  };

  // If async mode, save everything to DB
  if (brandId) {
    const sb = getSupabaseAdmin();
    await sb.from("brand_profiles").update({
      system_prompt: specParsed.system_prompt,
      raw_extraction: specParsed.extraction,
      brand_guide_html: guideHtml,
      audit_findings: cleanedAudit,
    }).eq("brand_id", brandId);
    console.log(`[extract-brand] Full results saved for brand ${brandId}`);
  }

  return result;
}
