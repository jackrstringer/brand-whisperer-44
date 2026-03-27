import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageDataUrl, width, height } = await req.json();
    if (!imageDataUrl) {
      return new Response(JSON.stringify({ error: "imageDataUrl required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an image analysis tool that detects unnecessary padding/margins around email campaign screenshots.

Email campaigns are often screenshotted or exported with extra uniform-color padding on the left, right, top, or bottom edges. This padding is NOT part of the actual email design — it's blank space from the email client or export tool.

Your job: analyze the image and determine how much padding exists on each side as a PERCENTAGE of the image dimensions.

Rules:
- Padding is a uniform or near-uniform color strip along an edge (white, gray, or any solid color)
- The padding color may differ from section to section vertically (e.g. a dark header area has dark padding, a white body area has white padding) — what matters is that each row's edge pixels are uniform and not part of the email content
- Do NOT crop into actual email content — be conservative
- If there's no padding on a side, return 0
- Common patterns: 5-15% padding on left and right sides, sometimes with matching top/bottom

Respond with ONLY a JSON object: {"left": number, "right": number, "top": number, "bottom": number}
Each value is a percentage (0-50) of the image dimension to crop from that side.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this email campaign image (${width}x${height}px) and detect any padding/margins that should be cropped. Return the padding percentages as JSON.`,
              },
              {
                type: "image_url",
                image_url: { url: imageDataUrl },
              },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("AI gateway error:", resp.status, errText);
      return new Response(JSON.stringify({ left: 0, right: 0, top: 0, bottom: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await resp.json();
    const raw = aiResult.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = raw.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ left: 0, right: 0, top: 0, bottom: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const result = {
      left: Math.max(0, Math.min(50, Number(parsed.left) || 0)),
      right: Math.max(0, Math.min(50, Number(parsed.right) || 0)),
      top: Math.max(0, Math.min(50, Number(parsed.top) || 0)),
      bottom: Math.max(0, Math.min(50, Number(parsed.bottom) || 0)),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("auto-crop-detect error:", e);
    return new Response(JSON.stringify({ left: 0, right: 0, top: 0, bottom: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
