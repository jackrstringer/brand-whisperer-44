import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PER_CAMPAIGN_AUDIT_PROMPT = `You are performing a detailed visual audit of one email campaign that has been split into sequential vertical slices (top to bottom). The slices shown together form one complete email. Analyze them as a unified design.

Organize your audit around the FIVE RULE CATEGORIES that matter for email design. Be EXACT with values. If you cannot clearly determine a property, mark it as "[NEEDS CONFIRMATION]" rather than guessing.

Return a JSON object with these keys:

{
  "cta_buttons": {
    "variants": [
      {
        "name": "primary",
        "fill_color": "#hex",
        "text_color": "#hex",
        "font_family": "exact name or [NEEDS CONFIRMATION]",
        "font_weight": "400 | 500 | 600 | 700",
        "font_style": "normal",
        "has_border": true,
        "border_color": "#hex or null",
        "border_weight": "Xpx or null",
        "border_radius": "sharp | slightly-rounded | rounded | pill",
        "border_radius_px": "approximate px value",
        "text_case": "sentence | uppercase | title",
        "padding_vertical": "approximate px",
        "padding_horizontal": "approximate px",
        "width_behavior": "auto | full-width | constrained"
      }
    ],
    "observed_labels": ["list every CTA label verbatim"],
    "max_label_length": "number of characters",
    "wraps_to_two_lines": false,
    "notes": "IMPORTANT: CTA text is almost NEVER italic. Bold sans-serif at small sizes or JPEG compression can appear to lean. Default to font-style:normal unless the lean is unmistakable across multiple buttons."
  },
  "typography": {
    "headline_font_family": "exact name or [NEEDS CONFIRMATION]",
    "headline_weights": ["700", "900"],
    "headline_italic_pattern": "never | full headline | selective words (list which)",
    "headline_alignment": "centered | left-aligned | mixed",
    "headline_size_range": "approximate px range",
    "body_font_family": "exact name or [NEEDS CONFIRMATION]",
    "body_weights": ["400", "700"],
    "body_bold_pattern": "description of what triggers bold",
    "body_size": "approximate px",
    "body_line_height": "tight | normal | loose",
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

CRITICAL RULES:
- CTA font-style defaults to NORMAL. Only mark italic if unmistakable across many buttons.
- Star rating color: use what is OBSERVED. Never default to gold (#FFD700).
- List every CTA label verbatim -- do not paraphrase or generalize.
- Pull actual text content from the emails for component samples, headlines, etc.
- Do NOT invent or assume components that aren't visible.

Return ONLY valid JSON. No markdown fences. No commentary.`;

const SYNTHESIS_AUDIT_PROMPT = `You are synthesizing individual visual audits from multiple email campaigns into a unified brand audit report.

You will receive JSON audits from multiple campaigns. Your job:
1. Identify the DOMINANT patterns across all campaigns
2. Where campaigns differ, note inconsistencies
3. Flag any properties that couldn't be clearly determined

Return a JSON object with exactly three keys:

"audit" -- the unified findings using the same structure as individual audits (cta_buttons, typography, colors, spacing_and_sizing, copy_patterns, repeated_components, footer). Represents brand-wide consensus.

"inconsistencies" -- array of objects: [{"element": "e.g. cta_buttons.border_radius", "description": "Campaign 1 uses pill, Campaign 3 uses rounded", "campaigns": [1, 3]}]

"needs_confirmation" -- array of objects: [{"element": "e.g. typography.headline_italic_pattern", "reason": "Could be JPEG compression artifact vs actual italic"}]

For unified values, use the MOST COMMON value (majority rules).

For CTA border/stroke specifically:
- If ANY campaign clearly shows a visible outer stroke on primary CTA, preserve a stroked CTA variant in the unified audit.
- Do NOT drop the stroke because some campaigns vary.
- If mixed usage exists (some stroked, some unstroked), keep the stroked variant and add an inconsistency entry.

CRITICAL:
- CTA font-style defaults to NORMAL. Bold sans-serif text in JPEG screenshots can appear slightly italicized due to compression.
- Star rating color: use what was OBSERVED. Never default to gold (#FFD700).
- Merge all observed_labels from all campaigns into one deduplicated list.
- Merge all repeated_components, noting which appeared in multiple campaigns.

Return ONLY valid JSON. No markdown fences. No commentary.`;

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

function mostCommonString(values: Array<string | null | undefined>): string | null {
  const filtered = values.filter((v): v is string => !!v && v.trim().length > 0);
  if (filtered.length === 0) return null;
  const counts = new Map<string, number>();
  for (const value of filtered) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best: string | null = null;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function mostCommonNumber(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (filtered.length === 0) return null;
  const counts = new Map<number, number>();
  for (const value of filtered) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best: number | null = null;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function normalizeBorderWeight(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return `${value}px`;
  if (typeof value === "string" && value.trim().length > 0) {
    const trimmed = value.trim();
    return trimmed.endsWith("px") ? trimmed : `${trimmed}px`;
  }
  return null;
}

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
        parts.push(`Button border-radius: ${radiusPart}, font-weight: ${b.font_weight || "unknown"}, font-style: ${b.font_style || "normal"}`);
        if (b.has_border === true) {
          parts.push(`CTA has visible outer stroke: yes`);
          if (b.border_color) parts.push(`CTA border color: ${b.border_color}`);
          if (b.border_weight != null) parts.push(`CTA border weight: ${typeof b.border_weight === "number" ? `${b.border_weight}px` : b.border_weight}`);
        } else if (b.has_border === false) {
          parts.push(`CTA has visible outer stroke: no`);
        }
      }
      parts.push("\nUse these values as ground truth. Focus your visual audit on: CTA label text, copy patterns, layout spacing, component structures, voice/tone, photography style. Do NOT guess at font names or hex colors -- they have been confirmed above. If CTA stroke is confirmed, preserve it and do not remove it as a simplification.");
      confirmedPrefix = parts.join("\n") + "\n\n";
    }

    // Group slices by campaignIndex
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

    const campaignCount = campaignGroups.size;
    console.log(`Auditing ${campaignCount} campaigns (${images.length} total slices) for brand: ${brandName}`);

    // === PASS 1: Per-campaign audit (parallel, Sonnet) ===
    const campaignEntries = Array.from(campaignGroups.entries());
    const batchSize = 3;
    const perCampaignResults: Array<{ campaignIndex: number; audit: any }> = [];

    for (let batch = 0; batch < campaignEntries.length; batch += batchSize) {
      const batchEntries = campaignEntries.slice(batch, batch + batchSize);

      const batchPromises = batchEntries.map(async ([campaignIndex, slices]) => {
        const imageContent: any[] = [];
        for (const slice of slices) {
          imageContent.push({
            type: "text",
            text: `Slice ${slice.sliceIndex + 1}/${slice.totalSlices} of this email campaign (reading top to bottom):`,
          });
          imageContent.push({
            type: "image",
            source: { type: "base64", media_type: slice.mediaType, data: slice.data },
          });
        }

        imageContent.push({
          type: "text",
          text: `${confirmedPrefix}Brand: ${brandName}. Industry: ${industry || "not specified"}. This campaign has ${slices.length} slices. Perform a comprehensive visual audit organized by the five rule categories.`,
        });

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: PER_CAMPAIGN_AUDIT_PROMPT,
            messages: [{ role: "user", content: imageContent }],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`Audit failed for campaign ${campaignIndex}: ${response.status} - ${errText}`);
          return null;
        }

        const result = await response.json();
        const text = result.content?.[0]?.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn(`No JSON found for campaign ${campaignIndex}`);
          return null;
        }

        try {
          return { campaignIndex, audit: JSON.parse(jsonMatch[0]) };
        } catch {
          console.warn(`Invalid JSON for campaign ${campaignIndex}`);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      for (const r of batchResults) {
        if (r) perCampaignResults.push(r);
      }
    }

    if (perCampaignResults.length === 0) {
      throw new Error("All per-campaign audits failed");
    }

    console.log(`Pass 1 complete: ${perCampaignResults.length}/${campaignCount} campaigns audited`);

    // === SYNTHESIS: Merge audits (text-only, Sonnet) ===
    const synthesisInput = perCampaignResults
      .map((r) => `=== Campaign ${r.campaignIndex + 1} Audit ===\n${JSON.stringify(r.audit, null, 2)}`)
      .join("\n\n");

    const synthesisResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 6000,
        system: SYNTHESIS_AUDIT_PROMPT,
        messages: [{
          role: "user",
          content: `Brand: ${brandName}. Industry: ${industry || "not specified"}.\n\nSynthesize these ${perCampaignResults.length} individual audits into a unified brand audit report.\n\n${synthesisInput}`,
        }],
      }),
    });

    if (!synthesisResponse.ok) {
      const errText = await synthesisResponse.text();
      throw new Error(`Synthesis error: ${synthesisResponse.status} - ${errText}`);
    }

    const synthesisResult = await synthesisResponse.json();
    const synthesisText = synthesisResult.content?.[0]?.text || "";
    const jsonMatch = synthesisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse synthesis result");

    const parsed = JSON.parse(jsonMatch[0]);

    const borderEvidence = perCampaignResults
      .map((entry) => {
        const variants = Array.isArray(entry.audit?.cta_buttons?.variants) ? entry.audit.cta_buttons.variants : [];
        const strokedVariant = variants.find((variant: any) => toBoolean(variant?.has_border));
        return {
          campaignIndex: entry.campaignIndex,
          hasBorder: !!strokedVariant,
          borderColor: strokedVariant?.border_color ?? null,
          borderWeight: strokedVariant?.border_weight ?? null,
        };
      });

    const campaignsWithBorder = borderEvidence.filter((entry) => entry.hasBorder);
    const confirmedHasBorder = confirmed_properties?.buttons?.has_border;

    if (!parsed.audit || typeof parsed.audit !== "object") parsed.audit = {};
    if (!parsed.audit.cta_buttons || typeof parsed.audit.cta_buttons !== "object") parsed.audit.cta_buttons = {};
    if (!Array.isArray(parsed.audit.cta_buttons.variants)) parsed.audit.cta_buttons.variants = [];
    if (parsed.audit.cta_buttons.variants.length === 0) {
      parsed.audit.cta_buttons.variants.push({ name: "primary" });
    }

    if (!Array.isArray(parsed.inconsistencies)) parsed.inconsistencies = [];
    if (!Array.isArray(parsed.needs_confirmation)) parsed.needs_confirmation = [];

    const unifiedVariants = parsed.audit.cta_buttons.variants;
    const unifiedHasBorder = unifiedVariants.some((variant: any) => toBoolean(variant?.has_border));

    const inferredBorderColor = mostCommonString(campaignsWithBorder.map((entry) => entry.borderColor));
    const inferredBorderWeightRaw = mostCommonString(campaignsWithBorder.map((entry) => {
      const weight = entry.borderWeight;
      if (typeof weight === "number") return `${weight}`;
      if (typeof weight === "string") return weight;
      return null;
    }));
    const inferredBorderWeight = normalizeBorderWeight(inferredBorderWeightRaw);

    const primaryVariant = unifiedVariants[0];
    const shouldForceBorderFromConfirmed = confirmedHasBorder === true;
    const shouldForceBorderFromEvidence = confirmedHasBorder == null && campaignsWithBorder.length > 0 && !unifiedHasBorder;

    if (shouldForceBorderFromConfirmed || shouldForceBorderFromEvidence) {
      primaryVariant.has_border = true;
      if (!primaryVariant.border_color) {
        primaryVariant.border_color = confirmed_properties?.buttons?.border_color ?? inferredBorderColor;
      }
      if (!primaryVariant.border_weight) {
        const confirmedWeight = normalizeBorderWeight(confirmed_properties?.buttons?.border_weight);
        primaryVariant.border_weight = confirmedWeight ?? inferredBorderWeight;
      }
    }

    const hasMixedBorderUsage = campaignsWithBorder.length > 0 && campaignsWithBorder.length < perCampaignResults.length;
    if (hasMixedBorderUsage) {
      parsed.inconsistencies.push({
        element: "cta_buttons.variants[].has_border",
        description: `Visible CTA border appears in ${campaignsWithBorder.length}/${perCampaignResults.length} campaigns. Keep stroked variant and treat usage as mixed.`,
        campaigns: borderEvidence.filter((entry) => entry.hasBorder).map((entry) => entry.campaignIndex + 1),
      });
    }

    if (confirmedHasBorder == null && campaignsWithBorder.length === 0) {
      parsed.needs_confirmation.push({
        element: "cta_buttons.variants[].has_border",
        reason: "No campaign produced high-confidence CTA stroke detection. Border presence should be manually confirmed if this is a key brand trait.",
      });
    }

    const inferredBorderRadius = mostCommonNumber(
      perCampaignResults
        .flatMap((entry) => Array.isArray(entry.audit?.cta_buttons?.variants) ? entry.audit.cta_buttons.variants : [])
        .map((variant: any) => {
          const value = variant?.border_radius_px;
          if (typeof value === "number") return value;
          if (typeof value === "string") {
            const parsedValue = parseFloat(value);
            return Number.isFinite(parsedValue) ? parsedValue : null;
          }
          return null;
        })
    );

    if (!primaryVariant.border_radius_px && inferredBorderRadius != null) {
      primaryVariant.border_radius_px = Math.round(inferredBorderRadius);
    }

    console.log(`Audit synthesis complete`);

    return new Response(JSON.stringify({
      audit: parsed.audit,
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
