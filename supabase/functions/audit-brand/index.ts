import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SINGLE_PASS_AUDIT_PROMPT = `You are performing a detailed visual audit of multiple email campaigns from a single brand. Each campaign has been split into sequential vertical slices (top to bottom). Analyze ALL campaigns together to produce ONE unified audit.

Organize your audit around the FIVE RULE CATEGORIES that matter for email design. Be EXACT with values. If you cannot clearly determine a property, mark it as "[NEEDS CONFIRMATION]" rather than guessing.

Return a JSON object with these top-level keys: "audit", "inconsistencies", "needs_confirmation".

The "audit" object must contain:

{
  "campaign_inventory": {
    "total_campaigns_analyzed": number,
    "campaign_types_observed": [
      {
        "type": "e.g. product launch, sale/promo, welcome, editorial, review/social-proof",
        "description": "what this campaign type looks like structurally",
        "observed_in": ["Campaign 1", "Campaign 4"],
        "frequency": "common | occasional | rare"
      }
    ]
  },
  "campaign_color_system": {
    "system_type": "full_immersion | modular_cards | white_only | hybrid",
    "color_inheritance_pattern": "Describe exactly which sections change color per campaign and which stay fixed. e.g. 'Hero background, CTA fill, and footer all adopt the campaign's primary color. Body sections remain white.'",
    "is_color_theme_campaign_specific": true or false,
    "color_change_scope": "Describe precisely: hero? footer? CTAs? all sections? Which elements inherit the campaign color?",
    "observed_examples": [
      {
        "campaign": "Campaign 1",
        "primary_campaign_color": "#hex",
        "where_color_appears": ["hero background", "CTA fill", "footer background"]
      }
    ]
  },
  "logo_usage": {
    "has_dedicated_logo_bar": true or false,
    "logo_bar_background": "#hex or description",
    "light_version_used_when": "description of when light/white logo is used",
    "dark_version_used_when": "description of when dark logo is used",
    "logo_in_footer": true or false,
    "footer_logo_treatment": "description",
    "approximate_header_width": "approximate px or percentage",
    "has_secondary_mark": false,
    "secondary_mark_description": "description or null"
  },
  "cta_buttons": {
    "cta_system_overview": "2-3 sentences describing the CTA system as a whole. e.g. 'Andar uses a single fixed CTA shape across all campaigns. Only the fill color changes to match the campaign theme.'",
    "variants": [
      {
        "name": "primary",
        "fill_color": "#hex",
        "text_color": "#hex",
        "font_family": "exact name or [NEEDS CONFIRMATION]",
        "font_weight": "400 | 500 | 600 | 700",
        "font_style": "normal",
        "has_border": true or false,
        "border_color": "#hex or null",
        "border_weight": "Xpx or null",
        "border_radius": "sharp | slightly-rounded | rounded | pill",
        "border_radius_px": "approximate px value",
        "text_case": "sentence | uppercase | title",
        "padding_vertical": "approximate px",
        "padding_horizontal": "approximate px",
        "width_behavior": "auto | full-width | constrained",
        "is_color_campaign_reactive": true or false,
        "observed_colors_across_campaigns": ["#hex values seen for this variant across all campaigns"]
      }
    ],
    "color_reactivity": {
      "is_reactive": true or false,
      "reactive_property": "fill only | fill and border | border only | none",
      "reactive_to": "campaign primary color | section background | fixed palette"
    },
    "observed_labels": ["list every CTA label verbatim"],
    "max_label_length": "number of characters",
    "wraps_to_two_lines": false,
    "notes": "",
    "color_behavior": "fixed | campaign-reactive",
    "color_behavior_description": "If buttons appear in many different fill colors across campaigns (beyond 2-3 variants), describe the pattern: e.g. 'CTA fill color matches the campaign's primary section background color' or 'CTA adapts to each campaign's color theme'. If buttons use a fixed set of 1-3 colors, set color_behavior to 'fixed'."
  },
  "typography": {
    "headline_font_family": "exact name or [NEEDS CONFIRMATION]",
    "headline_weights": ["700", "900"],
    "headline_italic_pattern": "never | full headline | selective words (list which)",
    "headline_alignment": "centered | left-aligned | mixed",
    "headline_sizing_system": {
      "rule_description": "NOT a range. Describe the actual pattern: e.g. 'Shorter headlines use larger type. 1-2 words at ~100px, 3-4 words at ~60px, 5+ words at ~48px.'",
      "observed_examples": [
        { "text": "actual headline text", "approximate_size": "~60px" }
      ]
    },
    "body_font_family": "exact name or [NEEDS CONFIRMATION]",
    "body_weights": ["400", "700"],
    "body_bold_pattern": "description of what triggers bold",
    "body_size": "approximate px",
    "body_line_height": "tight | normal | loose",
    "body_text_alignment": "left | center | right | mixed",
    "subhead_font": "same as headline | same as body | distinct",
    "subhead_weight": "string",
    "cta_label_font": "same as body | same as headline | distinct"
  },
  "colors": {
    "primary_accent": "#hex",
    "primary_background": "#hex",
    "section_backgrounds": ["#hex"],
    "text_headline": "#hex",
    "text_body": "#hex",
    "text_muted": "#hex",
    "footer_background": "#hex",
    "footer_text": "#hex",
    "star_rating_color": "#hex or null (NEVER default to gold #FFD700 -- use what is observed)",
    "all_distinct_colors": [{"color": "#hex", "usage": "where used"}]
  },
  "spacing_and_sizing": {
    "email_max_width": "approximate px",
    "content_side_padding": "approximate px",
    "section_to_section_gap": "approximate px",
    "headline_to_subhead_gap": "approximate px",
    "body_to_cta_gap": "approximate px",
    "cta_vertical_padding": "approximate px (space above/below button in its section)",
    "footer_padding": "approximate px",
    "image_treatment": "full-bleed | padded | mixed",
    "image_corner_radius": "0 | approximate px",
    "card_border_radius": "approximate px or null",
    "card_border": "description or none",
    "card_shadow": "description or none"
  },
  "copy_patterns": {
    "cta_label_patterns": ["action-oriented", "includes product name", "casual", etc.],
    "headline_formulas": [{"pattern": "name", "examples": ["actual headline text"]}],
    "body_bold_usage": "description of what gets bolded with examples",
    "emojis_used": false,
    "tone_descriptors": ["3-5 adjective descriptors"]
  },
  "repeated_components": [
    {
      "name": "component name",
      "description": "structure and specific styling",
      "content_sample": "actual text content from the email"
    }
  ],
  "footer": {
    "background_color": "#hex",
    "logo_present": true,
    "social_icons": ["platform names observed"],
    "social_icon_style": "filled-circles | outline | icons-only | none",
    "address_text": "actual address from footer",
    "unsubscribe_style": "description"
  }
}

"inconsistencies" -- array of objects: [{"element": "e.g. cta_buttons.border_radius", "description": "Campaign 1 uses pill, Campaign 3 uses rounded", "campaigns": [1, 3]}]

"needs_confirmation" -- array of objects: [{"element": "e.g. typography.headline_italic_pattern", "reason": "Could be JPEG compression artifact vs actual italic"}]

CRITICAL RULES:
- CTA font-style defaults to NORMAL. Only mark italic if unmistakable across many buttons. Bold sans-serif at small sizes or JPEG compression can appear to lean -- default to font-style:normal.
- CTA has_border: Look VERY carefully at the button edges. If there is a visible outer stroke/border distinct from the fill, set has_border:true with exact border_color and border_weight. If there is NO visible stroke, set has_border:false. Do NOT guess -- zoom in mentally on every button edge.
- Star rating color: use what is OBSERVED. Never default to gold (#FFD700).
- List every CTA label verbatim -- do not paraphrase or generalize.
- Pull actual text content from the emails for component samples, headlines, etc.
- Do NOT invent or assume components that aren't visible.
- For unified values across campaigns, use the MOST COMMON value (majority rules).
- Note any inconsistencies between campaigns in the inconsistencies array.

Campaign color system: Determine whether this brand uses full-color campaign immersion (entire email adopts one color — hero, CTAs, footer all inherit it) or a modular approach (white canvas with isolated color sections). This is the single most structurally important finding.

Body text alignment: Examine each body text paragraph carefully. If the lines of text appear balanced around a center axis, report 'center'. Do not default to 'left' without verifying.

Headline sizing: Do not report a range. Report the rule you observe. Look at how font size relates to headline length across campaigns.

Logo: Note whether the logo sits in its own isolated bar (dedicated background, clear padding above and below) or integrates into the hero section sharing a background.

Return ONLY valid JSON. No markdown fences. No commentary.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const { images, brandName, industry, confirmed_properties } = await req.json();
    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: "No images provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build confirmed properties prefix
    let confirmedPrefix = "";
    if (confirmed_properties) {
      const parts: string[] = ["CONFIRMED PROPERTIES (from Figma/website -- these are exact, do not override them):\n"];
      if (confirmed_properties.fonts) {
        const f = confirmed_properties.fonts;
        if (f.headline) parts.push(`Headline font: ${f.headline.family} (weights: ${f.headline.weights?.join(", ") || "unknown"}, italic: ${f.headline.italic_used ? "yes, used selectively" : "no"})`);
        if (f.body) parts.push(`Body font: ${f.body.family} (weights: ${f.body.weights?.join(", ") || "unknown"}, italic: ${f.body.italic_used ? "yes" : "no"})`);
      }
      if (confirmed_properties.colors) {
        const c = confirmed_properties.colors;
        if (c.primary_accent) parts.push(`Primary accent: ${c.primary_accent}`);
        if (c.all_colors_found) parts.push(`All confirmed colors: ${c.all_colors_found.slice(0, 10).join(", ")}`);
      }
      if (confirmed_properties.buttons) {
        const b = confirmed_properties.buttons;
        const radiusPart = b.border_radius != null ? `${b.border_radius}px` : "unknown";
        parts.push(`Advisory (non-email source) button values: radius ${radiusPart}, font-weight ${b.font_weight || "unknown"}, font-style ${b.font_style || "normal"}`);
        parts.push(`Treat CTA border/radius/shape as VISUAL-EVIDENCE-FIRST from the email campaigns. If advisory values conflict with campaign screenshots, trust screenshots and note conflict under needs_confirmation.`);
      }
      parts.push("\nUse confirmed fonts/colors as ground truth. For CTA borders, radius, and variant shapes, prioritize what is visibly present in campaign screenshots. Focus your visual audit on: CTA label text, copy patterns, layout spacing, component structures, voice/tone, photography style.");
      confirmedPrefix = parts.join("\n") + "\n\n";
    }

    // Group slices by campaignIndex and build a single message
    const campaignGroups = new Map<number, Array<{ data: string; mediaType: string; sliceIndex: number; totalSlices: number }>>();
    for (const img of images) {
      const ci = img.campaignIndex ?? 0;
      if (!campaignGroups.has(ci)) campaignGroups.set(ci, []);
      campaignGroups.get(ci)!.push({
        data: typeof img === "string" ? img : img.data,
        mediaType: typeof img === "string" ? "image/jpeg" : (img.mediaType || "image/jpeg"),
        sliceIndex: img.sliceIndex ?? 0,
        totalSlices: img.totalSlices ?? 1,
      });
    }

    for (const [, slices] of campaignGroups) {
      slices.sort((a, b) => a.sliceIndex - b.sliceIndex);
    }

    // Cap slices using BOTH count and payload budget
    const MAX_TOTAL_SLICES = 80;
    const MAX_TOTAL_BASE64_BYTES = 24 * 1024 * 1024;
    const originalSliceCount = Array.from(campaignGroups.values()).reduce((sum, slices) => sum + slices.length, 0);

    const campaignKeys = Array.from(campaignGroups.keys()).sort((a, b) => a - b);
    const selectedGroups = new Map<number, Array<{ data: string; mediaType: string; sliceIndex: number; totalSlices: number }>>();
    const nextIndex = new Map<number, number>();
    for (const key of campaignKeys) {
      selectedGroups.set(key, []);
      nextIndex.set(key, 0);
    }

    let selectedCount = 0;
    let selectedBytes = 0;

    const tryAddSlice = (campaignKey: number, sliceIdx: number) => {
      const slices = campaignGroups.get(campaignKey)!;
      if (sliceIdx >= slices.length || selectedCount >= MAX_TOTAL_SLICES) return false;

      const slice = slices[sliceIdx];
      const approxBytes = Math.ceil((slice.data.length * 3) / 4);
      if (selectedBytes + approxBytes > MAX_TOTAL_BASE64_BYTES) return false;

      selectedGroups.get(campaignKey)!.push(slice);
      selectedCount += 1;
      selectedBytes += approxBytes;
      nextIndex.set(campaignKey, sliceIdx + 1);
      return true;
    };

    for (const key of campaignKeys) {
      tryAddSlice(key, 0);
    }

    let progress = true;
    while (progress && selectedCount < MAX_TOTAL_SLICES && selectedBytes < MAX_TOTAL_BASE64_BYTES) {
      progress = false;
      for (const key of campaignKeys) {
        const idx = nextIndex.get(key) ?? 0;
        if (tryAddSlice(key, idx)) {
          progress = true;
        }
        if (selectedCount >= MAX_TOTAL_SLICES || selectedBytes >= MAX_TOTAL_BASE64_BYTES) break;
      }
    }

    campaignGroups.clear();
    for (const key of campaignKeys) {
      const selected = selectedGroups.get(key) ?? [];
      if (selected.length > 0) campaignGroups.set(key, selected);
    }

    if (selectedCount < originalSliceCount) {
      console.log(`Trimmed slices from ${originalSliceCount} to ${selectedCount} (~${Math.round(selectedBytes / (1024 * 1024) * 10) / 10}MB payload)`);
    }

    const campaignCount = campaignGroups.size;
    const finalSliceCount = Array.from(campaignGroups.values()).reduce((s, v) => s + v.length, 0);
    console.log(`Auditing ${campaignCount} campaigns (${finalSliceCount} slices) in SINGLE call for brand: ${brandName}`);

    // Build one message with ALL images
    const imageContent: any[] = [];
    const sortedEntries = Array.from(campaignGroups.entries()).sort((a, b) => a[0] - b[0]);

    for (const [campaignIndex, slices] of sortedEntries) {
      imageContent.push({
        type: "text",
        text: `--- Campaign ${campaignIndex + 1} (${slices.length} slices, top to bottom) ---`,
      });
      for (const slice of slices) {
        imageContent.push({
          type: "image",
          source: { type: "base64", media_type: slice.mediaType, data: slice.data },
        });
      }
    }

    imageContent.push({
      type: "text",
      text: `${confirmedPrefix}Brand: ${brandName}. Industry: ${industry || "not specified"}. ${campaignCount} campaigns shown above. Perform a comprehensive unified visual audit organized by the five rule categories. Return the full JSON with "audit", "inconsistencies", and "needs_confirmation" keys.`,
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 16000,
        system: SINGLE_PASS_AUDIT_PROMPT,
        messages: [{ role: "user", content: imageContent }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse audit result - no JSON found");

    const parsed = JSON.parse(jsonMatch[0]);

    // Ensure expected structure
    if (!parsed.audit || typeof parsed.audit !== "object") {
      if (parsed.cta_buttons || parsed.typography) {
        const wrapped = {
          audit: parsed,
          inconsistencies: parsed.inconsistencies || [],
          needs_confirmation: parsed.needs_confirmation || [],
        };
        delete wrapped.audit.inconsistencies;
        delete wrapped.audit.needs_confirmation;
        console.log(`Audit complete (single call, ${campaignCount} campaigns)`);
        return new Response(JSON.stringify(wrapped), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log(`Audit complete (single call, ${campaignCount} campaigns)`);

    return new Response(JSON.stringify({
      audit: parsed.audit || parsed,
      inconsistencies: parsed.inconsistencies || [],
      needs_confirmation: parsed.needs_confirmation || [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Audit-brand error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
