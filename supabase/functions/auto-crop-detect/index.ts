import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageDataUrl } = await req.json();
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
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Look at this email campaign image. Does it have uniform-color padding (blank space) on BOTH the left AND right sides? This padding is extra space from the email client — not part of the email design itself. The padding is typically a single solid color (white, gray, or matching the email background) that runs the full height of the image on both edges.

Answer with ONLY "yes" or "no".`,
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
      console.error("AI gateway error:", resp.status);
      return new Response(JSON.stringify({ hasPadding: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await resp.json();
    const raw = (aiResult.choices?.[0]?.message?.content || "").trim().toLowerCase();
    const hasPadding = raw.startsWith("yes");

    return new Response(JSON.stringify({ hasPadding }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("auto-crop-detect error:", e);
    return new Response(JSON.stringify({ hasPadding: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
