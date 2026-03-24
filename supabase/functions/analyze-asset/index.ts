import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { imageUrl, filename, userCategory } = await req.json();
    if (!imageUrl) throw new Error("imageUrl is required");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an image analyst for an email marketing design system. Analyze the uploaded image and return structured metadata. Be concise and specific. Focus on what matters for email campaign usage.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this image for use in email campaigns.
Filename: ${filename || "unknown"}
User-assigned category: ${userCategory || "uncategorized"}

Return a JSON object with:
- "description": 1-2 sentence description of what's in the image, its composition, and mood. Be specific (e.g. "Close-up of a chrome showerhead against a white background, product centered with minimal negative space" not "a product photo").
- "dominant_colors": array of 3-5 hex color strings found in the image (e.g. ["#1A1A1A", "#FFFFFF", "#C0C0C0"])
- "suggested_category": one of "logo", "product_imagery", "hero_shots", "lifestyle", "icon", "texture", "other"
- "composition_notes": brief note on composition quality for email use (e.g. "well-composed, minimal negative space, good for hero sections" or "has excessive white space on left side, may need cropping")
- "transparent_bg": boolean, whether the image appears to have a transparent background

Return ONLY the JSON object, no markdown fences.`
              },
              {
                type: "image_url",
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_image",
              description: "Return structured analysis of an image for email campaign use",
              parameters: {
                type: "object",
                properties: {
                  description: { type: "string", description: "1-2 sentence description of image content, composition, and mood" },
                  dominant_colors: { type: "array", items: { type: "string" }, description: "3-5 hex color strings" },
                  suggested_category: { type: "string", enum: ["logo", "product_imagery", "hero_shots", "lifestyle", "icon", "texture", "other"] },
                  composition_notes: { type: "string", description: "Brief note on composition quality for email use" },
                  transparent_bg: { type: "boolean", description: "Whether the image has a transparent background" }
                },
                required: ["description", "dominant_colors", "suggested_category", "composition_notes", "transparent_bg"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "analyze_image" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      throw new Error(`AI gateway error: ${response.status} - ${errText}`);
    }

    const result = await response.json();
    
    // Extract from tool call response
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    let analysis;
    if (toolCall?.function?.arguments) {
      analysis = typeof toolCall.function.arguments === "string" 
        ? JSON.parse(toolCall.function.arguments) 
        : toolCall.function.arguments;
    } else {
      // Fallback: try parsing from content
      const content = result.choices?.[0]?.message?.content || "";
      analysis = JSON.parse(content.replace(/^```json?\n?/i, "").replace(/\n?```$/i, ""));
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
