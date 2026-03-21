import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXTRACTION_PROMPT = `You are an expert HTML email developer and brand analyst.
Analyze these email campaign screenshots and extract a precise, email-specific design system.

Extract exact values — not descriptions. For every value ask: could a developer use this to rebuild an email that looks identical?

Return a JSON object with:
{
  "colors": {
    "canvas": "string",
    "text_primary": "string",
    "text_secondary": "string",
    "accent": "string",
    "dark_card": "string",
    "button_border": "string"
  },
  "fonts": {
    "heading": "string",
    "heading_stack": "string",
    "body": "string",
    "body_stack": "string",
    "google_fonts_url": "string"
  },
  "spacing": {
    "canvas_width": 600,
    "side_padding": 0,
    "card_inset": 0,
    "card_radius": 0,
    "section_gap": 0
  },
  "buttons": {
    "primary_bg": "string",
    "primary_text": "string",
    "border_color": "string",
    "border_width": "string",
    "border_radius": "string",
    "padding": "string"
  },
  "layout": {
    "contrast_sections": "string",
    "background": "string"
  },
  "voice": {
    "tone": "string",
    "headline_structure": "string",
    "cta_style": "string",
    "urgency_level": "string",
    "notable_rules": []
  },
  "confidence": {
    "overall": "string",
    "low_confidence_fields": []
  }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const { images, brandName, industry } = await req.json();
    if (!images || !Array.isArray(images) || images.length < 3) {
      return new Response(JSON.stringify({ error: "At least 3 images required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build vision content blocks
    const imageBlocks = images.map((b64: string) => ({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: b64 },
    }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 4096,
        system: EXTRACTION_PROMPT,
        messages: [{
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Brand: ${brandName}. Industry: ${industry || "not specified"}. Analyze these ${images.length} email campaign images and extract the brand design system as JSON. After the JSON, generate a system_prompt string: a complete, copy-paste-ready prompt block that encodes every extracted rule so a developer could build a matching email from it alone. Return your response as JSON with two keys: "extraction" (the design system object) and "system_prompt" (the string).`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || "";

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse extraction result");

    const parsed = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify({
      extraction: parsed.extraction,
      system_prompt: parsed.system_prompt,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
