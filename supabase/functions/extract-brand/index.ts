import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAIL_DESIGN_QUALITY_FLOOR = `
EMAIL DESIGN QUALITY FLOOR -- These rules are NON-NEGOTIABLE and override brand references if they conflict:

LAYOUT:
- Fluid width: width="100%" with max-width:600px, margin:0 auto. NEVER fixed width:600px.
- Consistent padding: minimum 20px side padding on all content sections.
- Generous section spacing: minimum 24px between major sections.
- "Flowy" designs -- minimize hard section cuts. Prefer gentle transitions with spacing, subtle background color shifts. Avoid abrupt color/style changes between sections.

TYPOGRAPHY:
- Body text MINIMUM 16px. Recommended 16-18px for mobile readability.
- Line-height minimum 1.5 for body text.
- Never use raw gray (#999 or similar) for body text -- use the brand's text color or a slightly muted version.
- ALL text alignment within a section must be consistent.

BUTTONS:
- Minimum 44px tall tap targets.
- Auto width with 32-48px horizontal padding. NEVER full-width buttons.
- Must have clear visual distinction from surrounding content.
- Default to font-style: normal for CTA text. Italic CTAs are almost never correct.
- CTA text must NEVER wrap to a second line. Include white-space: nowrap.

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
=== HTML EMAIL DESIGN RULES TEMPLATE REFERENCE ===

This is NOT a coffee-table brand book. This is a working reference document that prevents the five categories of mistakes that make emails look wrong. Every section exists to prevent a specific category of error.

CSS ARCHITECTURE:
- CSS custom properties for ALL brand colors (--brand-accent, --brand-accent-dark, --black, --white, --g50 through --g900)
- Load ACTUAL brand fonts via Google Fonts <link> in <head> (NOT fallbacks -- the real font names)
- Always include JetBrains Mono for spec labels and code blocks
- Responsive @media (max-width: 768px) block
- clamp() for responsive font sizes on cover and section titles

PAGE STRUCTURE:

Cover (compact intro, dark bg, ~280-360px tall)
  Brand name (muted gray)
  "Email Design Rules" (white, large)
  Prepared by / date (JetBrains Mono)

Sticky Nav
  Section anchor links (JetBrains Mono, uppercase, small)

Section 1: CTA Rules          <-- MOST IMPORTANT, COMES FIRST
Section 2: Typography & Color
Section 3: Spacing & Sizing
Section 4: Copy Rules
Section 5: Repeated Components
Section 6: Do's and Don'ts

Footer (dark bg)
  Brand name / living document note

SECTION PATTERNS:

Cover: Compact dark intro section (NOT full viewport). Brand's accent color as a subtle blurred glow (600px circle, blur(200px), opacity 0.05). Simple and clean. CRITICAL: The cover MUST be compact — maximum 280-360px total height. Do NOT use height:100vh, min-height:100vh, or any viewport-relative height. Use a fixed max-height or let content dictate height.

VERTICAL RHYTHM GUARDRAILS:
- NEVER use 100vh, 100svh, 100dvh, or any viewport-relative height anywhere in the document.
- The cover section must be max 360px tall. Use padding: 48px 40px or similar, not large padding values.
- Keep title block spacing tight: ~8-20px between label/title/meta.
- Keep section vertical padding in a 36-56px range.
- Keep section intro paragraph bottom margin in a 20-32px range.

Section Header: Every section has:
  Label: "01 / CTA Rules" (JetBrains Mono, uppercase, small, tracked, muted)
  Title: h2 in display font
  Desc: 1-2 sentences max. What this section prevents.

=== SECTION 1: CTA RULES (MOST IMPORTANT) ===

This section must be comprehensive and airtight. Three representations that MUST all be consistent:

1. Live-rendered button examples in cards:
   - Standard CTA on light background
   - CTA on dark background (if observed)
   - Short label vs long label
   - Each button sits in a card with a spec note below (JetBrains Mono listing key properties)
   - Buttons MUST use: correct font-family (ACTUAL brand font), correct font-weight, font-style:normal (default), correct fill, correct border (if brand uses a stroke it MUST be visible), correct border-radius, correct padding, white-space:nowrap

IF the audit shows color_behavior = "campaign-reactive":
   - Show the PRIMARY default CTA variant(s) first as the canonical examples.
   - Then add a "Contextual Color Variants" subsection explaining that CTA fill/text colors adapt to each campaign's color theme.
   - Show 3-5 observed color pairings as smaller example swatches (not full button cards).
   - Include a rule: "CTA shape, radius, border, padding, font, and text-case remain constant. Only fill and text colors change to match the campaign theme."

2. CSS code block with syntax coloring:
   - .comment (green), .prop (blue), .val (orange/brown), .sel (gold)
   - Values MUST match the rendered buttons above

3. Hard rules callout (dark bg card):
   - CTA text must never wrap (white-space: nowrap)
   - CTA must always be [sentence/uppercase/title case -- from audit]
   - CTA must always have [border/no border -- from audit]
   - Max recommended label length: [N chars, from longest observed]

4. Observed CTA labels list:
   - Every CTA label found in reference emails, rendered in actual CTA font at actual size and weight

=== SECTION 2: TYPOGRAPHY & COLOR ===

Typography specimens (two cards):
- Headline/display font: render an ACTUAL headline from the reference emails in the actual font. Tag pills showing font name and fallback.
- Body font: render ACTUAL body copy. Same tag pills.

Emphasis pattern callout (dark card):
- When italic is used in headlines (selective words? never?)
- When bold is used in body (what kinds of phrases?)
- Examples pulled from reference emails with emphasis visually applied

Color palette grid:
- Color cards with swatch (120-140px tall), hex code pill overlaid, color name + usage below
- Group into brand colors and neutrals
- Include EVERY observed color including star rating color, footer text, muted text
- CRITICAL: star ratings use OBSERVED color. NEVER default to gold (#FFD700)

=== SECTION 3: SPACING & SIZING ===

Spacing scale visualization:
- Horizontal bars at increasing widths, labeled with px value and usage context
- Brand accent at ~70% opacity for bars
- Values: inline gaps, content side padding, headline-to-subhead, body-to-CTA, section-to-section, dark section padding

Sizing rules (simple spec table):
- Email max width
- Headline font size range
- Body font size
- CTA label font size
- CTA button width behavior
- Image treatment (full-bleed vs padded, corner radius)

NO wireframe diagrams. NO "email anatomy" illustrations. Just the numbers.

=== SECTION 4: COPY RULES ===

Voice attributes table (3 columns):
| Attribute | Sounds like | Doesn't sound like |
Pull "sounds like" from ACTUAL reference email copy. 3-5 rows max.

Headline formulas:
- Group observed headlines into patterns
- Render each in actual display font
- 2-3 examples per pattern

Bold usage rules:
- What gets bolded in body copy? Product claims? Pain points? Stats?
- Show examples from reference emails

CTA copy patterns:
- List observed labels
- Note pattern: action-oriented? Casual? Includes product name?

NO "messaging pillars." NO "brand philosophy." Just patterns.

=== SECTION 5: REPEATED COMPONENTS ===

Grid of component cards. Each card has:
- Preview area (g50 bg) showing mini-rendered version
- Component name + description below

CRITICAL RULES:
- ONLY include components actually observed in reference emails
- Use ACTUAL content from reference emails (real review text, real names, real headlines, real CTA labels, real addresses)
- Star ratings use OBSERVED color (NEVER gold by default)
- NO emojis. Use SVG line icons where needed
- Social icons must match ACTUAL platforms observed
- Footer address must be ACTUAL address from emails

=== SECTION 6: DO'S AND DON'TS ===

Two grids: Design do's/don'ts, Copy do's/don'ts.
- Green-tinted bg for do's, red-tinted bg for don'ts
- Plus prefix for do's, dash prefix for don'ts
- Every rule derived from observed patterns. NO generic design advice.
- Specific rules like: "CTA text must never wrap", "Star ratings use black not gold", "No emojis", "Bold in body is for product claims only"

WHAT NOT TO INCLUDE:
- No <img> tags referencing uploaded files
- No "Reference Library" or "Sample Campaigns" sections
- No emojis anywhere
- No placeholder text -- use real brand copy
- No "Photography Direction" section
- No "Email Layout System" wireframe section
- No "Messaging Pillars" or brand philosophy prose
- No gold (#FFD700) stars unless confirmed
- No font-style:italic on CTA buttons unless explicitly confirmed
- No colors that don't appear in the brand palette
- No social platform icons that weren't in the reference emails
- No components that weren't observed in reference emails
- No em dashes (use -- or reword)
`;

const SPEC_PROMPT = `You are building a structured email brand spec from confirmed audit findings.

You will receive confirmed audit findings (JSON) from a visual analysis of the brand's email campaigns, plus email design quality floor rules.

Return ONLY valid JSON (no markdown fences, no commentary) with these two keys:

"extraction" -- structured brand values for programmatic use:
{
  "colors": { "canvas": "#hex", "text_primary": "#hex", "text_secondary": "#hex", "accent": "#hex", "dark_card": "#hex or null", "button_border": "#hex", "star_rating": "#hex (use observed, NEVER default to gold)" },
  "fonts": { "heading": "exact name", "heading_stack": "CSS stack", "body": "exact name", "body_stack": "CSS stack", "google_fonts_url": "URL or null" },
  "spacing": { "canvas_width": 600, "side_padding": number, "card_inset": number, "card_radius": number, "section_gap": number },
  "buttons": { "primary_bg": "#hex", "primary_text": "#hex", "border_color": "#hex", "border_width": "Xpx", "border_radius": "Xpx", "padding": "Xpx Ypx", "font_weight": "number", "font_style": "normal", "text_case": "sentence|uppercase|title", "white_space": "nowrap" },
  "layout": { "contrast_sections": "description", "background": "#hex or gradient" },
  "voice": { "tone": "string", "headline_structure": "string", "cta_style": "string", "urgency_level": "string", "notable_rules": [] },
  "confidence": { "overall": "high|medium|low", "low_confidence_fields": [] }
}

"system_prompt" -- a complete, copy-paste-ready prompt for generating on-brand emails. Structure the system_prompt in this order:

1. CAMPAIGN COLOR SYSTEM (first — governs everything else)
   State the system type. Describe exactly what changes per campaign and what stays fixed.

2. CANVAS AND LAYOUT
   Exact values only.

3. FONT LOADING
   Exact Google Fonts <link> tags if applicable.
   If custom fonts: state they cannot be loaded via Google Fonts.
   For each font: role, name, complete CSS fallback stack.

4. TYPOGRAPHY RULES
   For each text element: all CSS properties.
   For headlines: use the word-count/length-based sizing rule, NOT a px range.

5. COLOR TOKENS
   Every color as a labeled token with exact hex and usage.
   Flag campaign-reactive colors explicitly.

6. CTA SYSTEM
   System overview first.
   Then each variant: complete CSS + whether color is fixed or reactive.
   Observed CTA labels list.

7. LOGO PLACEMENT
   Exact rules: dedicated bar vs integrated, light/dark usage, padding, footer treatment.

8. COMPONENT LIBRARY
   Each component: description + complete inline CSS.

9. CAMPAIGN STRUCTURE TEMPLATE
   Most common observed structure as an ordered block list.

10. PROHIBITED PATTERNS
    Explicit DO NOT list derived from audit observations.
    Design prohibitions AND copy prohibitions.
    Format as imperatives.

Do not include general email development advice. Every rule must be traceable to the reference campaigns.

Must include exact hex codes, px values, font stacks, layout rules, CTA rules (including white-space:nowrap), and the quality floor rules. This prompt should be detailed enough that an AI could build a matching email from it alone.

CRITICAL:
- CTA font-style defaults to NORMAL. Only mark italic if explicitly confirmed.
- Star rating color uses what was OBSERVED. Never default to gold.
- Every value must come from the audit. Do not fabricate.

Apply the quality floor rules. If the brand audit shows practices that violate the floor (e.g., 12px body text, full-width buttons), override with the floor values and note the override in the system_prompt.`;

const GUIDE_PROMPT = `You are generating a self-contained HTML email design rules document.

This is NOT a coffee-table brand book. This is a working reference that prevents the five categories of mistakes that make emails look wrong: CTA rules, typography/color, spacing/sizing, copy rules, and component rules.

You will receive:
1. Confirmed audit findings (JSON)
2. Brand extraction spec (JSON)
3. Brand name and industry
4. An HTML template reference showing the exact structure to follow

Your output must be ONLY the raw HTML document -- starting with <!DOCTYPE html> and ending with </html>. No JSON wrapping. No markdown fences. No commentary.

The HTML must follow the template structure exactly:
- Cover section with brand name, blurred accent glow
- Sticky nav with anchor links
- Sections as defined below
- Guide footer

SECTION ORDER:

SECTION 0A — CAMPAIGN INVENTORY
List every campaign type observed with: type name, description, which reference campaigns it includes, and what varies between types vs. what is constant across all of them.

SECTION 0B — CAMPAIGN COLOR SYSTEM
State the system type prominently.
Describe exactly what changes per campaign and what stays fixed.
Render live demo blocks showing the same email component (headline + CTA button) in 3-4 of the observed campaign colors.
Document footer color inheritance rules.
This section is mandatory — skip it only if the brand uses white-only.

SECTION 0C — LOGO USAGE
Show logo placement rules: dedicated bar vs. integrated into hero.
Light vs. dark version usage rules with exact conditions.
Padding values above and below in header.
Footer logo treatment.

SECTION 1: CTA RULES — restructure as:
1. System overview (2-3 sentences describing the CTA system holistically)
2. Base styles (the invariant properties — shape, radius, padding, font, text-case)
3. Variants (each with live-rendered demo button + complete CSS)
   - Clearly label which properties are fixed vs. campaign-reactive
4. Color reactivity section
   - If reactive: render the same button in 4+ campaign colors
   - State exactly which properties change and which don't
5. Observed CTA labels (verbatim, rendered in actual button font at actual size and weight)
6. Non-negotiable rules callout (dark bg card with hard rules)

SECTION 2: Typography & Color
SECTION 3: Spacing & Sizing
SECTION 4: Copy Rules
SECTION 5: Repeated Components — each component must include:
1. Live-rendered example using actual brand copy from the campaigns
2. Complete CSS code block (inline-ready, all properties)
3. Color reactivity note (does this component change with campaign color?)
4. Usage context (where does this appear in the email?)
If a component cannot be documented to this standard, omit it.

SECTION 6: Do's and Don'ts

CRITICAL GENERATION RULES:
- FONT SEPARATION: Fonts used only in the guide's own UI chrome must not appear in the Typography section. Only document fonts observed in actual campaign emails. If uncertain, note it.
- SPECIFICITY: Never use ranges where a rule exists. Never write 'varies' without documenting the rule that governs the variation. Every sentence must be a specific actionable rule, not advice.
- NEVER fabricate values. Every hex code, font name, border weight, padding value must come from the audit or confirmed properties. If unknown, mark TBD.
- NEVER use placeholder content. No "Shop the Collection", no "Premium quality materials", no "123 Main Street". Every piece of text must be pulled from actual reference emails in the audit.
- CTA section is MOST IMPORTANT. Live buttons, CSS code block, and spec table must ALL be consistent and match exactly.
- CTA buttons MUST include white-space:nowrap. CTA text must never wrap to a second line.
- Star ratings MUST use the observed color from audit. NEVER default to gold (#FFD700).
- NEVER use emojis anywhere. Use SVG line icons where needed.
- NEVER use colors not in the brand palette.
- Component previews must use ACTUAL brand content from audit (real review text, real names, real CTA labels).
- ONLY include components that were actually observed in reference emails.
- DO NOT invent CTA button variants. Render only variants explicitly present in audit.cta_buttons.variants.
- Social icons must match the actual platforms observed.
- NO Photography Direction section, NO wireframe diagrams, NO Messaging Pillars prose.
- No em dashes -- use -- or reword.
- Load ACTUAL brand fonts via Google Fonts (not fallbacks).
- Avoid excessive whitespace: never use min-height:100vh and avoid large top/bottom blank regions around headings.
- The guide must feel like a premium, lean design reference -- not a bloated brand book.`;

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

    if (brandId) {
      const mode = step === "guide" ? "guide" : step === "full" ? "full" : "spec";

      if (mode === "spec") {
        await processSpecStep(ANTHROPIC_API_KEY, auditFindings, brandName, industry, brandId, confirmed_properties);
        return new Response(JSON.stringify({ status: "spec_complete", brandId }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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
  const auditJson = JSON.stringify(auditFindings, null, 2);

  let confirmedBlock = "";
  if (confirmedProperties) {
    confirmedBlock = `\n\n=== CONFIRMED PROPERTIES (exact values from Figma/website -- use these, do not guess) ===\n${JSON.stringify(confirmedProperties, null, 2)}`;
  }

  console.log(`[extract-brand] Call 1: Generating spec for ${brandName}`);
  const specResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
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
  const auditJson = JSON.stringify(auditFindings, null, 2);

  console.log(`[extract-brand] Call 2: Generating HTML guide for ${brandName}`);
  const guideResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-20250514",
      max_tokens: 32000,
      system: GUIDE_PROMPT,
      messages: [{
        role: "user",
        content: `Brand: ${brandName}\nIndustry: ${industry || "not specified"}\n\n=== CONFIRMED AUDIT FINDINGS ===\n${auditJson}\n\n=== BRAND EXTRACTION SPEC ===\n${JSON.stringify(extraction, null, 2)}\n\n=== EMAIL DESIGN QUALITY FLOOR RULES ===\n${EMAIL_DESIGN_QUALITY_FLOOR}\n\n${HTML_GUIDE_TEMPLATE}\n\nGenerate the FULL email design rules HTML document. Start with <!DOCTYPE html> and end with </html>. Follow the template structure exactly. Do not skip sections. Use actual content from the audit -- no placeholder text.`,
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

  guideHtml = normalizeGuideHtmlSpacing(guideHtml);

  console.log(`[extract-brand] Call 2 complete. Guide HTML length: ${guideHtml.length}`);
  return guideHtml;
}

function normalizeGuideHtmlSpacing(html: string) {
  return html
    .replace(/min-height:\s*100vh\s*;/gi, "min-height: 340px;")
    .replace(/padding:\s*4rem\s+2rem\s*;/gi, "padding: 2.75rem 2rem;")
    .replace(/margin-bottom:\s*3rem\s*;/gi, "margin-bottom: 1.75rem;");
}

async function processSpecStep(
  apiKey: string,
  auditFindings: any,
  brandName: string,
  industry: string,
  brandId: string,
  confirmedProperties?: any,
) {
  const cleanedAudit = stripRuntimeKeys(auditFindings);
  const specParsed = await runSpecCall(apiKey, cleanedAudit, brandName, industry, confirmedProperties);

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
