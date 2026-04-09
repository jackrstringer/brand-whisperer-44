// supabase/functions/capture-email-screenshot/index.ts
// Agent 3 — Renderer: Takes HTML, renders via ScreenshotOne at 470px viewport, returns base64 PNG.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { html } = await req.json();
    if (!html) {
      return new Response(
        JSON.stringify({ error: "html is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("SCREENSHOTONE_API_KEY");
    if (!apiKey) throw new Error("SCREENSHOTONE_API_KEY not configured");

    // CRITICAL: always 390px wide (iPhone 14/15 Gmail mobile viewport), device_scale_factor 1
    // Use POST to avoid URL length limits (campaign HTML is typically 15-50KB)
    const body = {
      access_key: apiKey,
      html: html,
      viewport_width: 390,
      viewport_height: 10000,
      full_page: true,
      format: "png",
      block_ads: true,
      block_cookie_banners: true,
      cache: false,
      delay: 2,
      device_scale_factor: 1,
    };

    console.log("[capture-email-screenshot] Rendering at 390px viewport via POST...");

    const resp = await fetch("https://api.screenshotone.com/take", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`ScreenshotOne error ${resp.status}: ${errText}`);
    }

    const buffer = await resp.arrayBuffer();

    // Parse PNG dimensions from header (bytes 16-23)
    const view = new DataView(buffer);
    const imgWidth = view.getUint32(16, false);
    const imgHeight = view.getUint32(20, false);

    // Chunked base64 encode to avoid stack overflow
    const uint8 = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    console.log(`[capture-email-screenshot] Done: ${imgWidth}x${imgHeight}px, ${Math.round(buffer.byteLength / 1024)}KB`);

    return new Response(
      JSON.stringify({ imageBase64: base64, mimeType: "image/png", width: imgWidth, height: imgHeight }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[capture-email-screenshot]", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
