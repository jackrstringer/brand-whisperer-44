import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PER_CAMPAIGN_PROMPT = `You are analyzing one email campaign that has been split into sequential vertical slices (top to bottom).
The slices shown together form one complete email. Analyze them as a unified design.

Extract the following with EXACT values — not descriptions. Every value must be precise enough for a developer to rebuild an identical email.

Return a JSON object with these keys:
{
  "colors": {
    "canvas": "#hex",
    "text_primary": "#hex",
    "text_secondary": "#hex",
    "accent": "#hex",
    "dark_card": "#hex or null",
    "button_border": "#hex"
  },
  "fonts": {
    "heading": "font name",
    "heading_stack": "full CSS font-family stack",
    "body": "font name",
    "body_stack": "full CSS font-family stack",
    "google_fonts_url": "URL or null"
  },
  "spacing": {
    "canvas_width": 600,
    "side_padding": number,
    "card_inset": number,
    "card_radius": number,
    "section_gap": number
  },
  "buttons": {
    "primary_bg": "#hex",
    "primary_text": "#hex",
    "border_color": "#hex",
    "border_width": "Xpx",
    "border_radius": "Xpx",
    "padding": "Xpx Ypx"
  },
  "layout": {
    "image_treatment": "full-bleed | padded | mixed",
    "section_types": ["hero", "cards", "text-block", etc],
    "contrast_sections": "description of dark/colored sections",
    "background": "#hex or gradient"
  },
  "voice": {
    "tone": "string",
    "headline_structure": "string",
    "cta_style": "string",
    "urgency_level": "string"
  }
}

Return ONLY valid JSON. No markdown fences. No commentary.`;

const SYNTHESIS_PROMPT = `You are synthesizing individual brand analyses from multiple email campaigns into a unified brand design system.

You will receive JSON analyses from multiple campaigns. Your job:
1. Identify the DOMINANT patterns across all campaigns
2. Where campaigns differ, use the MOST COMMON value (majority rules)
3. Flag any significant inconsistencies

Return a JSON object with exactly two keys: "extraction" and "system_prompt".

"extraction" must contain the unified brand values:
{
  "colors": { "canvas", "text_primary", "text_secondary", "accent", "dark_card", "button_border" },
  "fonts": { "heading", "heading_stack", "body", "body_stack", "google_fonts_url" },
  "spacing": { "canvas_width", "side_padding", "card_inset", "card_radius", "section_gap" },
  "buttons": { "primary_bg", "primary_text", "border_color", "border_width", "border_radius", "padding" },
  "layout": { "image_treatment", "contrast_sections", "background" },
  "voice": { "tone", "headline_structure", "cta_style", "urgency_level", "notable_rules": [] },
  "confidence": { "overall": "high|medium|low", "low_confidence_fields": [] }
}

"system_prompt" must be a complete, copy-paste-ready prompt that encodes every extracted design rule so a developer could build a matching email from it alone. Include exact hex codes, px values, font stacks, and layout rules.

Return ONLY valid JSON with these two keys. No markdown fences. No commentary.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const { images, brandName, industry } = await req.json();
    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: `No images provided` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group slices by campaignIndex
    const campaignGroups = new Map<number, Array<{ data: string; mediaType: string; sliceIndex: number; totalSlices: number }>>();
    
    for (const img of images) {
      const campaignIndex = img.campaignIndex ?? 0;
      if (!campaignGroups.has(campaignIndex)) {
        campaignGroups.set(campaignIndex, []);
      }
      campaignGroups.get(campaignIndex)!.push({
        data: typeof img === "string" ? img : img.data,
        mediaType: typeof img === "string" ? "image/jpeg" : (img.mediaType || "image/jpeg"),
        sliceIndex: img.sliceIndex ?? 0,
        totalSlices: img.totalSlices ?? 1,
      });
    }

    // Sort slices within each campaign
    for (const [, slices] of campaignGroups) {
      slices.sort((a, b) => a.sliceIndex - b.sliceIndex);
    }

    const campaignCount = campaignGroups.size;
    console.log(`Processing ${campaignCount} campaigns (${images.length} total slices) for brand: ${brandName}`);

    // === PASS 1: Per-campaign analysis (parallel, using Sonnet for speed) ===
    const campaignEntries = Array.from(campaignGroups.entries());
    
    // Process up to 3 campaigns in parallel
    const batchSize = 3;
    const perCampaignResults: Array<{ campaignIndex: number; analysis: any }> = [];

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
          text: `Brand: ${brandName}. Industry: ${industry || "not specified"}. This campaign has ${slices.length} slices. Extract the exact design attributes.`,
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
            max_tokens: 2048,
            system: PER_CAMPAIGN_PROMPT,
            messages: [{ role: "user", content: imageContent }],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`Pass 1 failed for campaign ${campaignIndex}: ${response.status} - ${errText}`);
          return null;
        }

        const result = await response.json();
        const text = result.content?.[0]?.text || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn(`Pass 1: no JSON found for campaign ${campaignIndex}`);
          return null;
        }

        try {
          return { campaignIndex, analysis: JSON.parse(jsonMatch[0]) };
        } catch {
          console.warn(`Pass 1: invalid JSON for campaign ${campaignIndex}`);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      for (const r of batchResults) {
        if (r) perCampaignResults.push(r);
      }
    }

    if (perCampaignResults.length === 0) {
      throw new Error("All per-campaign analyses failed");
    }

    console.log(`Pass 1 complete: ${perCampaignResults.length}/${campaignCount} campaigns analyzed successfully`);

    // === PASS 2: Synthesis (text-only, using Opus for quality) ===
    const synthesisInput = perCampaignResults
      .map((r) => `=== Campaign ${r.campaignIndex + 1} Analysis ===\n${JSON.stringify(r.analysis, null, 2)}`)
      .join("\n\n");

    const synthesisResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        system: SYNTHESIS_PROMPT,
        messages: [{
          role: "user",
          content: `Brand: ${brandName}. Industry: ${industry || "not specified"}.\n\nHere are individual analyses from ${perCampaignResults.length} email campaigns. Synthesize into a unified brand design system.\n\n${synthesisInput}`,
        }],
      }),
    });

    if (!synthesisResponse.ok) {
      const errText = await synthesisResponse.text();
      throw new Error(`Synthesis API error: ${synthesisResponse.status} - ${errText}`);
    }

    const synthesisResult = await synthesisResponse.json();
    const synthesisText = synthesisResult.content?.[0]?.text || "";
    const jsonMatch = synthesisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse synthesis result");

    const parsed = JSON.parse(jsonMatch[0]);

    console.log(`Pass 2 complete: synthesis successful`);

    return new Response(JSON.stringify({
      extraction: parsed.extraction,
      system_prompt: parsed.system_prompt,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Extract-brand error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
