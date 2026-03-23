import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXTRACTION_PROMPT = `You are an expert HTML email developer and brand analyst.
Analyze these email campaign screenshots and extract a precise, email-specific design system.

Extract exact values — not descriptions. For every value ask: could a developer use this to rebuild an email that looks identical?

Return a JSON object with two keys: "extraction" and "system_prompt".

"extraction" must contain:
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
}

"system_prompt" must be a complete, copy-paste-ready prompt block that encodes every extracted rule so a developer could build a matching email from it alone.

Return ONLY valid JSON with these two keys. No markdown fences. No commentary.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const { images, brandName, industry } = await req.json();
    if (!images || !Array.isArray(images) || images.length < 3) {
      return new Response(JSON.stringify({ error: `At least 3 images required (got ${images?.length || 0})` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit to 5 images max to stay within API limits
    const limitedImages = images.slice(0, 5);
    console.log(`Processing ${limitedImages.length} images for brand: ${brandName}`);

    // Build vision content blocks - images can be { data, mediaType } objects or plain base64 strings
    const imageBlocks = images.map((img: any) => {
      const data = typeof img === "string" ? img : img.data;
      const mediaType = typeof img === "string" ? detectMediaType(data) : (img.mediaType || "image/png");
      return {
        type: "image",
        source: { type: "base64", media_type: mediaType, data },
      };
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
        max_tokens: 4096,
        system: EXTRACTION_PROMPT,
        messages: [{
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Brand: ${brandName}. Industry: ${industry || "not specified"}. Analyze these ${images.length} email campaign images and extract the brand design system. Return ONLY valid JSON with "extraction" and "system_prompt" keys.`,
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

function detectMediaType(base64: string): string {
  if (base64.startsWith("/9j/") || base64.startsWith("/9J/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}
