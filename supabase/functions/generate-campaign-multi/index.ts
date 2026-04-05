import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateCampaignCore } from "../_shared/generateCampaignCore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VARIANT_SEEDS = [
  {
    label: "Original",
    seed: "",
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
    const { brandId, campaignId, references } = body;
    if (!brandId || !campaignId) throw new Error("brandId and campaignId required");

    // Determine variant strategy:
    // - If multiple references provided (2-3), each variant uses a different reference
    // - If 0-1 references, use creative direction seeds for variety
    const multiRefMode = Array.isArray(references) && references.length > 1;
    const variantCount = multiRefMode ? references.length : 3;

    console.log(`[multi] Starting ${variantCount}-variant generation for campaign ${campaignId} (${multiRefMode ? `${references.length} references` : "creative seeds"})`);

    // Mark as generating
    await supabase.from("campaigns").update({
      status: "generating",
      generation_started_at: new Date().toISOString(),
      variant_htmls: [],
    }).eq("id", campaignId);

    // Use EdgeRuntime.waitUntil to process in the background
    (globalThis as any).EdgeRuntime.waitUntil(
      (async () => {
        try {
          const generationPromises = Array.from({ length: variantCount }, (_, index) => {
            let variantParams: any;
            let label: string;

            if (multiRefMode) {
              // Multi-reference mode: each variant gets its own reference
              const ref = references[index];
              label = ref.title || `Reference ${index + 1}`;
              variantParams = {
                ...body,
                // Override the single reference for this variant
                reference: ref,
                references: undefined, // Don't pass array to core
                _isSubGeneration: true,
                _variantIndex: index,
              };
            } else {
              // Creative direction mode: same reference (if any), different seeds
              const direction = VARIANT_SEEDS[index];
              label = direction.label;
              // If single reference was passed in references array, use it
              const singleRef = Array.isArray(references) && references.length === 1 ? references[0] : body.reference;
              variantParams = {
                ...body,
                reference: singleRef || undefined,
                references: undefined,
                designNotes: direction.seed
                  ? [body.designNotes || "", direction.seed].filter(Boolean).join("\n\n")
                  : body.designNotes || "",
                _isSubGeneration: true,
                _variantIndex: index,
              };
            }

            return (async () => {
              try {
                console.log(`[multi] Starting variant ${index}: ${label}`);
                const result = await generateCampaignCore(variantParams, supabase);
                console.log(`[multi] Variant ${index} (${label}) complete, html length: ${result.html?.length || 0}`);
                return { index, label, html: result.html, error: null };
              } catch (err: any) {
                console.error(`[multi] Variant ${index} error:`, err);
                return { index, label, html: null, error: err.message };
              }
            })();
          });

          const results = await Promise.all(generationPromises);

          const variantHtmls = results.map((r) => ({
            label: r.label,
            html: r.html || null,
            status: r.html ? "generated" : "error",
            error: r.error,
          }));

          const successCount = variantHtmls.filter((v) => v.html).length;
          console.log(`[multi] ${successCount}/${variantCount} variants generated successfully`);

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

          const originalHtml = variantHtmls[0]?.html || variantHtmls.find(v => v.html)?.html || null;

          await supabase.from("campaigns").update({
            variant_htmls: variantHtmls,
            html: originalHtml,
            status: successCount > 0 ? "variants_ready" : "error",
          }).eq("id", campaignId);
        } catch (err: any) {
          console.error("[multi] Background processing error:", err);

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
