import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PER_CAMPAIGN_AUDIT_PROMPT = `You are performing a detailed visual audit of one email campaign that has been split into sequential vertical slices (top to bottom). The slices shown together form one complete email. Analyze them as a unified design.

Audit the following design elements with EXACT values. If you cannot clearly determine a property, mark it as "[NEEDS CONFIRMATION]" rather than guessing.

Return a JSON object with these keys:

{
  "logo": {
    "type": "text_wordmark | image_logo | none",
    "font_family": "string or null",
    "font_weight": "string or null",
    "size_description": "string (relative to email width)",
    "position": "centered | left-aligned | right-aligned",
    "spacing": "string (above/below description)",
    "color": "#hex or null"
  },
  "colors": {
    "primary_background": "#hex",
    "section_backgrounds": ["#hex, ..."],
    "accent_highlight": "#hex",
    "text_headline": "#hex",
    "text_body": "#hex",
    "text_muted": "#hex",
    "footer_background": "#hex or same as body",
    "context_specific_colors": [{"color": "#hex", "usage": "description"}]
  },
  "typography_headlines": {
    "serif_or_sans": "serif | sans-serif",
    "approximate_weight": "light | regular | medium | bold | black",
    "italic_used": false,
    "italic_pattern": "null or description of which words",
    "alignment": "centered | left-aligned | mixed",
    "approximate_size": "string",
    "line_height": "tight | normal | loose"
  },
  "typography_body": {
    "serif_or_sans": "serif | sans-serif",
    "weight": "regular | mixed",
    "bold_pattern": "description of what gets bolded",
    "alignment": "centered | left-aligned | mixed",
    "line_height": "tight | normal | loose",
    "approximate_size": "string"
  },
  "typography_subheads": {
    "same_as": "headlines | body | distinct",
    "weight": "string",
    "size_relative": "string",
    "color": "#hex or same as headlines"
  },
  "cta_buttons": {
    "variants": [
      {
        "name": "primary",
        "background_fill": "#hex",
        "text_color": "#hex",
        "has_border": true,
        "border_color": "#hex or null",
        "border_weight": "string or null",
        "border_radius": "sharp | slightly-rounded | rounded | pill",
        "border_radius_px": "approximate px value",
        "text_weight": "regular | bold",
        "text_style": "normal",
        "text_case": "sentence | uppercase | title",
        "approximate_padding": "string"
      }
    ],
    "notes": "IMPORTANT: CTA text is almost NEVER italic. Bold sans-serif at small sizes or JPEG compression can appear to lean. Default to font-style:normal unless the lean is unmistakable across multiple buttons."
  },
  "image_treatment": {
    "bleed": "full-bleed | padded | mixed",
    "photo_style": "on-white | lifestyle | people | mixed",
    "images_per_email": "approximate count",
    "rounded_corners": true,
    "corner_radius_px": "approximate px or 0"
  },
  "section_dividers": {
    "type": "background-color-change | horizontal-rule | spacing-only | none",
    "spacing_between_sections": "generous | moderate | tight",
    "approximate_gap_px": "number"
  },
  "footer": {
    "background_color": "#hex",
    "logo_present": true,
    "social_icons": ["platform names in order"],
    "social_icon_style": "filled-circles | outline | icons-only | none",
    "address_format": "description",
    "unsubscribe_style": "description"
  },
  "icons_decorative": {
    "uses_icons": false,
    "icon_style": "line | filled | circular-bg | none",
    "emojis_used": false,
    "emoji_locations": "description or none"
  },
  "special_patterns": [
    {"name": "pattern name", "description": "structure and styling"}
  ],
  "voice": {
    "tone_descriptors": ["3-5 adjective descriptors"],
    "headline_formula": "pattern description",
    "cta_copy_style": "description"
  },
  "card_container_design": {
    "uses_cards": true,
    "card_background": "#hex or null",
    "card_border": "description or none",
    "card_radius_px": "number",
    "card_shadow": "description or none",
    "card_padding": "approximate px"
  }
}

Return ONLY valid JSON. No markdown fences. No commentary.`;

const SYNTHESIS_AUDIT_PROMPT = `You are synthesizing individual visual audits from multiple email campaigns into a unified brand audit report.

You will receive JSON audits from multiple campaigns. Your job:
1. Identify the DOMINANT patterns across all campaigns
2. Where campaigns differ, note inconsistencies
3. Flag any properties that couldn't be clearly determined

Return a JSON object with exactly three keys:

"audit" — the unified findings organized by design element (same structure as individual audits, but representing the brand-wide consensus)

"inconsistencies" — array of objects: [{"element": "e.g. cta_buttons.border_radius", "description": "Campaign 1 uses pill, Campaign 3 uses rounded", "campaigns": [1, 3]}]

"needs_confirmation" — array of objects: [{"element": "e.g. typography_headlines.italic_used", "reason": "Could be JPEG compression artifact vs actual italic"}]

For the unified audit values, use the MOST COMMON value (majority rules). If there's a tie, pick the more professional/standard option.

IMPORTANT for CTA buttons: Default to font-style: normal. Bold sans-serif text in JPEG screenshots can appear slightly italicized due to compression. Only mark as italic if unmistakable across multiple emails.

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

    // Build confirmed properties prefix for the audit prompt
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
        parts.push(`Button border-radius: ${b.border_radius}px, font-weight: ${b.font_weight}, font-style: ${b.font_style || "normal"}`);
      }
      parts.push("\nUse these values as ground truth. Focus your visual audit on: layout patterns, voice/tone, emphasis patterns, photography style, component structures, section flow. Do NOT guess at font names or hex colors -- they have been confirmed above.");
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

    // === PASS 1: Per-campaign deep audit (parallel, Sonnet) ===
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
          text: `Brand: ${brandName}. Industry: ${industry || "not specified"}. This campaign has ${slices.length} slices. Perform a comprehensive visual audit.`,
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

    // === SYNTHESIS: Merge audits (text-only, Opus) ===
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
