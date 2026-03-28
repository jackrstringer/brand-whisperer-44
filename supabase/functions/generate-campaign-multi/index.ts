import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CREATIVE_SEEDS = [
  {
    label: "Editorial & Bold",
    seed: "CREATIVE DIRECTION: Editorial & bold — dramatic imagery, magazine-style layout with strong visual hierarchy, bold headlines, and cinematic image treatment. Think high-fashion editorial meets email. Use large hero images, bold typography contrasts, and confident whitespace.",
  },
  {
    label: "Clean & Minimal",
    seed: "CREATIVE DIRECTION: Clean & minimal — generous whitespace, restrained palette, elegant typography. Think Apple-meets-Aesop. Focus on breathing room, single-column clarity, and let the product imagery speak for itself with minimal surrounding elements.",
  },
  {
    label: "Dynamic & Engaging",
    seed: "CREATIVE DIRECTION: Dynamic & engaging — mixed media sections, product grids, alternating layouts, and an energetic visual rhythm. Think vibrant lookbook. Use varied section types (hero, grid, split, testimonial) to create visual interest and momentum.",
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { brandId, campaignId } = body;
    if (!brandId || !campaignId) throw new Error("brandId and campaignId required");

    console.log(`[multi] Starting perfection mode for campaign ${campaignId}`);

    // Mark as generating with mode
    await supabase.from("campaigns").update({
      status: "generating",
      generation_mode: "perfection",
      generation_started_at: new Date().toISOString(),
      variant_htmls: [],
    }).eq("id", campaignId);

    // Return immediately — do heavy work in background
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use EdgeRuntime.waitUntil to process in the background
    (globalThis as any).EdgeRuntime.waitUntil(
      (async () => {
        try {
          // Fire 3 parallel generation calls with different creative seeds
          const generationPromises = CREATIVE_SEEDS.map(async (direction, index) => {
            const variantBody = {
              ...body,
              designNotes: [body.designNotes || "", direction.seed].filter(Boolean).join("\n\n"),
              _isSubGeneration: true,
              _variantIndex: index,
            };

            try {
              console.log(`[multi] Starting variant ${index}: ${direction.label}`);
              const resp = await fetch(`${supabaseUrl}/functions/v1/generate-campaign`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceKey}`,
                  "apikey": serviceKey,
                },
                body: JSON.stringify(variantBody),
              });

              if (!resp.ok) {
                const errText = await resp.text();
                console.error(`[multi] Variant ${index} failed: ${resp.status} ${errText}`);
                return { index, label: direction.label, html: null, error: errText };
              }

              const result = await resp.json();
              console.log(`[multi] Variant ${index} (${direction.label}) complete, html length: ${result.html?.length || 0}`);
              return { index, label: direction.label, html: result.html, error: null };
            } catch (err: any) {
              console.error(`[multi] Variant ${index} error:`, err);
              return { index, label: direction.label, html: null, error: err.message };
            }
          });

          const results = await Promise.all(generationPromises);

          // Build variant_htmls array
          const variantHtmls = results.map((r) => ({
            label: r.label,
            html: r.html || null,
            qa_score: null,
            qa_summary: null,
            qa_round: 0,
            status: r.html ? "generated" : "error",
            error: r.error,
          }));

          const successCount = variantHtmls.filter((v) => v.html).length;
          console.log(`[multi] ${successCount}/3 variants generated successfully`);

          // Save variants and set status
          await supabase.from("campaigns").update({
            variant_htmls: variantHtmls,
            status: successCount > 0 ? "variants_ready" : "error",
          }).eq("id", campaignId);
        } catch (err: any) {
          console.error("[multi] Background processing error:", err);
          await supabase.from("campaigns").update({
            status: "error",
          }).eq("id", campaignId);
        }
      })()
    );

    // Return immediately with accepted status
    return new Response(
      JSON.stringify({ success: true, message: "Generation started" }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[multi] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
