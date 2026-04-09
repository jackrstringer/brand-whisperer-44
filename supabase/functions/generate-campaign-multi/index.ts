import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { generateCampaignCore, logGenEvent } from "../_shared/generateCampaignCore.ts";

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

    // Generate a unique run_id for this generation attempt
    const runId = crypto.randomUUID();

    // Determine variant strategy:
    // - If multiple references provided (2-3), each variant uses a different reference
    // - If 0-1 references, use creative direction seeds for variety
    const multiRefMode = Array.isArray(references) && references.length > 1;
    const variantCount = multiRefMode ? references.length : 3;

    console.log(`[multi] Starting ${variantCount}-variant generation for campaign ${campaignId} run=${runId} (${multiRefMode ? `${references.length} references` : "creative seeds"})`);

    // Log generation start
    await logGenEvent(supabase, campaignId, "generation_start", {
      status: "started", run_id: runId, event_key: "generation_start",
      payload: { variant_count: variantCount, multi_ref_mode: multiRefMode, brief: body.brief?.slice(0, 200), goal: body.goal, campaign_mode: body.campaignMode, reference_ids: Array.isArray(references) ? references.map((r: any) => ({ id: r.id, title: r.title })) : [] },
    });

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
                _runId: runId,
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
                _runId: runId,
              };
            }

            return (async () => {
              try {
                const variantStart = Date.now();
                console.log(`[multi] Starting variant ${index}: ${label}`);
                await logGenEvent(supabase, campaignId, "variant_start", {
                  status: "started", run_id: runId, event_key: `variant_${index}_start`,
                  payload: { index, label },
                });
                const result = await generateCampaignCore(variantParams, supabase);
                const variantDuration = Date.now() - variantStart;
                console.log(`[multi] Variant ${index} (${label}) complete, html length: ${result.html?.length || 0}`);
                await logGenEvent(supabase, campaignId, "variant_start", {
                  status: "completed", run_id: runId, event_key: `variant_${index}_start`,
                  duration_ms: variantDuration, result: { index, label, html_length: result.html?.length || 0 },
                });
                return { index, label, html: result.html, error: null };
              } catch (err: any) {
                console.error(`[multi] Variant ${index} error:`, err);
                await logGenEvent(supabase, campaignId, "variant_start", {
                  status: "failed", run_id: runId, event_key: `variant_${index}_start`,
                  error: err.message, payload: { index, label },
                });
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

          // Derive a campaign name if still default
          const { data: existingCamp } = await supabase
            .from("campaigns")
            .select("name")
            .eq("id", campaignId)
            .single();

          const existingNameRaw = (existingCamp?.name || "").trim();
          const DEFAULT_NAMES = ["new campaign", "untitled campaign", "untitled", ""];
          const isDefaultName = DEFAULT_NAMES.includes(existingNameRaw.toLowerCase());

          let campaignName = existingNameRaw;
          if (isDefaultName) {
            if (body.brief && body.brief.trim().length > 3) {
              const briefWords = body.brief.trim().split(/\s+/);
              campaignName = briefWords.length <= 7 ? body.brief.trim() : briefWords.slice(0, 7).join(" ");
            } else if (originalHtml) {
              const h1Match = originalHtml.match(/<(?:h1|h2)[^>]*>([\s\S]*?)<\/(?:h1|h2)>/i);
              const titleMatch = originalHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
              const rawTitle = (h1Match?.[1] || titleMatch?.[1] || "").replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").replace(/\s+/g, " ").trim();
              const titleWords = rawTitle.split(/\s+/);
              if (rawTitle.length > 3) {
                campaignName = titleWords.length <= 7 ? rawTitle : titleWords.slice(0, 7).join(" ");
              } else {
                const goalLabels: Record<string, string> = { promotional: "Promotional Campaign", educational: "Educational Campaign", "re-engagement": "Re-engagement Campaign", seasonal: "Seasonal Campaign", welcome: "Welcome Email", social_proof: "Social Proof Campaign", highlight: "Brand Highlight", product_launch: "Product Launch", abandoned_cart: "Abandoned Cart", win_back: "Win-back Campaign", newsletter: "Newsletter", announcement: "Announcement" };
                campaignName = goalLabels[body.goal] || "Campaign";
              }
            }
          }

          await supabase.from("campaigns").update({
            variant_htmls: variantHtmls,
            html: originalHtml,
            status: successCount > 0 ? "variants_ready" : "error",
            name: campaignName,
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
