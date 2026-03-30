import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VARIANT_SEEDS = [
  {
    label: "Original",
    seed: "", // No modification — identical to standard generation
  },
  {
    label: "Creative",
    seed: "CREATIVE DIRECTION OVERRIDE: Push the creative boundaries — use bolder typography choices, more dramatic visual hierarchy, unexpected layout compositions, and stronger color contrasts. Be more experimental with spacing, imagery placement, and section arrangements. Think editorial magazine meets email.",
  },
  {
    label: "Conservative",
    seed: "CREATIVE DIRECTION OVERRIDE: Keep this clean, proven, and conversion-focused — use a straightforward single-column layout, conventional typography hierarchy, generous whitespace, clear visual flow from top to bottom, and standard CTA placement. Prioritize readability and clarity over creative risk.",
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

    console.log(`[multi] Starting 3-variant generation for campaign ${campaignId}`);

    // Mark as generating
    await supabase.from("campaigns").update({
      status: "generating",
      generation_started_at: new Date().toISOString(),
      variant_htmls: [],
    }).eq("id", campaignId);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use EdgeRuntime.waitUntil to process in the background
    (globalThis as any).EdgeRuntime.waitUntil(
      (async () => {
        try {
          const generationPromises = VARIANT_SEEDS.map(async (direction, index) => {
            const variantBody = {
              ...body,
              // Only append seed if non-empty (Original has no seed)
              designNotes: direction.seed
                ? [body.designNotes || "", direction.seed].filter(Boolean).join("\n\n")
                : body.designNotes || "",
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

          const variantHtmls = results.map((r) => ({
            label: r.label,
            html: r.html || null,
            status: r.html ? "generated" : "error",
            error: r.error,
          }));

          const successCount = variantHtmls.filter((v) => v.html).length;
          console.log(`[multi] ${successCount}/3 variants generated successfully`);

          // STATUS GUARD: only update if campaign is still in "generating" state
          const { data: latest } = await supabase
            .from("campaigns")
            .select("status")
            .eq("id", campaignId)
            .single();

          if (latest?.status !== "generating") {
            console.log(`[multi] Campaign status is "${latest?.status}", skipping update (race condition guard)`);
            return;
          }

          // If at least variant 0 (Original) succeeded, also set the main html
          const originalHtml = variantHtmls[0]?.html || variantHtmls.find(v => v.html)?.html || null;

          await supabase.from("campaigns").update({
            variant_htmls: variantHtmls,
            html: originalHtml,
            status: successCount > 0 ? "variants_ready" : "error",
          }).eq("id", campaignId);
        } catch (err: any) {
          console.error("[multi] Background processing error:", err);

          // STATUS GUARD: don't overwrite if already moved past generating
          const { data: latest } = await supabase
            .from("campaigns")
            .select("status")
            .eq("id", campaignId)
            .single();

          if (latest?.status === "generating") {
            await supabase.from("campaigns").update({
              status: "error",
            }).eq("id", campaignId);
          }
        }
      })()
    );

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
