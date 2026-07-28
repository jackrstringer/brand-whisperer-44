// Phase 1 + Phase 2: locks the design system and slice plan for an image-mode
// campaign, then kicks off slice generation in the background.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PLANNER_OUTPUT_INSTRUCTIONS } from "../_shared/imageEmailPrompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

async function callPlanner(systemPrompt: string, userPrompt: string): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-7",
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Planner LLM failed [${res.status}]: ${errBody}`);
  }
  const data = await res.json();
  const raw = data?.content?.[0]?.text || "";
  // Extract first JSON object from the response
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`Planner returned non-JSON output: ${raw.slice(0, 400)}`);
  const jsonSlice = raw.slice(start, end + 1);
  try {
    return JSON.parse(jsonSlice);
  } catch (e: any) {
    throw new Error(`Planner returned invalid JSON: ${e.message}. Raw start: ${jsonSlice.slice(0, 400)}`);
  }
}

async function generateSliceInternally(sliceId: string, campaignId: string) {
  await fetch(`${SUPABASE_URL}/functions/v1/generate-slice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ sliceId, campaignId }),
  });
}

async function runPlanAndGenerate(campaignId: string, brief: string) {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    // Load campaign + brand context
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns").select("*").eq("id", campaignId).single();
    if (cErr || !campaign) throw new Error(`Campaign not found: ${cErr?.message}`);

    const { data: brand } = await supabase
      .from("brands").select("*").eq("id", campaign.brand_id).single();

    const { data: brandProfile } = await supabase
      .from("brand_profiles").select("audit_findings, brand_instructions")
      .eq("brand_id", campaign.brand_id).maybeSingle();

    const { data: intelligence } = await supabase
      .from("brand_intelligence").select("compiled_context")
      .eq("brand_id", campaign.brand_id).maybeSingle();

    const { data: archetypes } = await supabase
      .from("email_slice_archetypes")
      .select("slug, label, description, default_aspect_ratio, role_hint, category, usually_has_cta")
      .order("sort_order");

    const archetypeCatalog = (archetypes || [])
      .map((a: any) => `- ${a.slug} [${a.category}${a.role_hint ? `/${a.role_hint}` : ""}${a.usually_has_cta ? ", cta" : ""}] ${a.label}: ${a.description || ""} (default ${a.default_aspect_ratio})`)
      .join("\n");

    // ── Brand asset library ───────────────────────────────────────────────
    const { data: brandAssets } = await supabase
      .from("brand_assets")
      .select("url, category, description, ai_category, dominant_colors")
      .eq("brand_id", campaign.brand_id);

    const logoAssets = (brandAssets || []).filter((a: any) => a.category === "logo");
    const heroAssets = (brandAssets || []).filter((a: any) => a.category === "hero_shots");
    const productLibraryAssets = (brandAssets || []).filter((a: any) => a.category === "product_imagery");
    const lifestyleAssets = (brandAssets || []).filter((a: any) => a.category === "lifestyle");

    const formatAssetList = (list: any[], label: string) =>
      list.length === 0 ? "" : `${label}:\n${list.map((a: any, i: number) =>
        `  ${i + 1}. ${a.url} — ${a.description || a.ai_category || "(no description)"}${a.dominant_colors?.length ? ` [colors: ${a.dominant_colors.slice(0,3).join(", ")}]` : ""}`
      ).join("\n")}`;

    const brandAssetLibrary = [
      formatAssetList(logoAssets, "LOGO ASSETS (MUST be used in slice 1 header)"),
      formatAssetList(heroAssets, "HERO / KEY VISUAL ASSETS"),
      formatAssetList(productLibraryAssets, "PRODUCT IMAGERY (packaging shots)"),
      formatAssetList(lifestyleAssets, "LIFESTYLE IMAGERY"),
    ].filter(Boolean).join("\n\n") || "(no brand assets uploaded)";

    // ── Selected products + their assets ──────────────────────────────────
    const productIds: string[] = Array.isArray(campaign.product_ids) ? campaign.product_ids : [];
    let productBlock = "";
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("id, name, description, url")
        .in("id", productIds);
      const { data: productAssets } = await supabase
        .from("product_assets")
        .select("product_id, url, description, ai_category, dominant_colors")
        .in("product_id", productIds);
      productBlock = "SELECTED PRODUCTS FOR THIS CAMPAIGN (feature these; do NOT invent packaging):\n" +
        (products || []).map((p: any) => {
          const assets = (productAssets || []).filter((a: any) => a.product_id === p.id);
          const assetLines = assets.map((a: any, i: number) =>
            `      ${i + 1}. ${a.url} — ${a.description || a.ai_category || "product shot"}`
          ).join("\n");
          return `  • ${p.name}${p.description ? ` — ${p.description}` : ""}${p.url ? ` (${p.url})` : ""}\n${assetLines || "      (no product shots uploaded)"}`;
        }).join("\n");
    }

    // ── Reference campaigns ───────────────────────────────────────────────
    const refIds: string[] = Array.isArray(campaign.reference_campaign_ids) ? campaign.reference_campaign_ids : [];
    let referenceBlock = "";
    if (refIds.length > 0) {
      const { data: refs } = await supabase
        .from("reference_campaigns")
        .select("title, brand_name, category, tags, thumbnail_url, image_urls, extracted_copy, ai_metadata")
        .in("id", refIds);
      referenceBlock = "REFERENCE CAMPAIGNS (use these as structural + stylistic inspiration for palette, shape language, and slice sequencing — do NOT copy their copy or brand marks):\n" +
        (refs || []).map((r: any, i: number) => {
          const imgs = [r.thumbnail_url, ...(r.image_urls || [])].filter(Boolean).slice(0, 4);
          return `  Reference ${i + 1}: "${r.title}"${r.brand_name ? ` by ${r.brand_name}` : ""}${r.category ? ` [${r.category}]` : ""}\n` +
            `    Images: ${imgs.join(", ")}` +
            (r.extracted_copy ? `\n    Copy sample: ${String(r.extracted_copy).slice(0, 400)}` : "");
        }).join("\n\n");
    }

    // ── Pinned assets (user-locked images for this campaign) ──────────────
    const pinnedUrls: string[] = Array.isArray(campaign.pinned_asset_urls) ? campaign.pinned_asset_urls : [];
    const pinnedBlock = pinnedUrls.length > 0
      ? `PINNED ASSETS (user has explicitly pinned these — you SHOULD use them):\n${pinnedUrls.map((u, i) => `  ${i + 1}. ${u}`).join("\n")}`
      : "";

    const extraCopy = campaign.extra_copy ? `SPECIFIC COPY THE USER WANTS INCLUDED (use verbatim where it fits):\n${campaign.extra_copy}` : "";
    const goalLine = campaign.goal ? `CAMPAIGN GOAL / TYPE: ${campaign.goal}` : "";

    const brandContext = [
      `Brand: ${brand?.name}`,
      brand?.industry ? `Industry: ${brand.industry}` : "",
      brand?.website_url ? `Website: ${brand.website_url}` : "",
      brandProfile?.brand_instructions ? `Instructions: ${brandProfile.brand_instructions}` : "",
      intelligence?.compiled_context ? `Intelligence:\n${String(intelligence.compiled_context).slice(0, 4000)}` : "",
      brandProfile?.audit_findings ? `Brand audit findings:\n${JSON.stringify(brandProfile.audit_findings).slice(0, 3000)}` : "",
    ].filter(Boolean).join("\n\n");

    const systemPrompt = `You are a senior email art director. You plan pure image-based email campaigns where every slice is one fully-rendered PNG that will stack vertically to form ONE cohesive designed email at 390px mobile width.

Think of the final email as a single long designed page — like an editorial spread — cut into segments. Slices are NOT independent posters; they are chapters of one continuous composition. Great email designs (like the reference campaigns in this brief) use inset blocks living within shared negative-space margins, not full-bleed horizontal bands that hard-divide the email.

You MUST ground every product depiction in the brand's actual asset library. Never invent packaging, models, or products. If the brand's real logo, product shots, or lifestyle imagery is provided, reference those exact URLs in each slice's reference_asset_urls so the image generator reproduces them faithfully.

Your work must feel like a top-tier brand studio: distinctive, cohesive, magazine-quality, mobile-optimized, never generic.`;

    const userPrompt = `${brandContext}

${goalLine}

CAMPAIGN BRIEF:
${brief}

${extraCopy}

──────────────── BRAND ASSET LIBRARY ────────────────
${brandAssetLibrary}

${productBlock}

${pinnedBlock}

${referenceBlock}

AVAILABLE SLICE ARCHETYPES (pick from these):
${archetypeCatalog}

${PLANNER_OUTPUT_INSTRUCTIONS}`;

    const parsed = await callPlanner(systemPrompt, userPrompt);
    const designSystem = parsed.design_system;
    const slices = Array.isArray(parsed.slices) ? parsed.slices : [];
    if (!designSystem || slices.length === 0) throw new Error("Planner returned empty design_system or slices");

    // Persist the plan
    await supabase.from("campaigns").update({
      design_system: designSystem,
      slice_plan: { slices },
      status: "generating",
    }).eq("id", campaignId);

    // Delete any prior slices for this campaign (regenerate case)
    await supabase.from("campaign_slices").delete().eq("campaign_id", campaignId);

    // Insert placeholder slice rows
    const sliceRows = slices.map((s: any, idx: number) => ({
      campaign_id: campaignId,
      position: idx + 1,
      archetype_slug: s.archetype_slug || null,
      headline_copy: s.headline_copy || null,
      body_copy: s.body_copy || null,
      cta_label: s.cta_label || null,
      cta_url: s.cta_url || null,
      aspect_ratio: s.aspect_ratio || "4:5",
      composition_brief: s.composition_brief || null,
      reference_asset_urls: Array.isArray(s.reference_asset_urls) ? s.reference_asset_urls.filter((u: any) => typeof u === "string" && u.startsWith("http")) : [],
      generation_status: "pending",
    }));
    const { data: inserted, error: insErr } = await supabase
      .from("campaign_slices").insert(sliceRows).select().order("position");
    if (insErr) throw new Error(`Failed to insert slices: ${insErr.message}`);

    // Generate slices sequentially so each slice can reference prior ones
    // (this preserves visual continuity). Total runtime scales with slice count.
    for (const slice of (inserted || [])) {
      try {
        await generateSliceInternally(slice.id, campaignId);
      } catch (e: any) {
        console.error(`[plan-image-email] slice ${slice.id} kickoff failed:`, e.message);
      }
    }

    // Mark ready — slice statuses are the source of truth for per-slice UI
    await supabase.from("campaigns").update({ status: "ready" }).eq("id", campaignId);
  } catch (err: any) {
    console.error("[plan-image-email] error:", err);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    await supabase.from("campaigns").update({
      status: "error",
      last_error: (err?.message || String(err)).slice(0, 1500),
    }).eq("id", campaignId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { campaignId, brief } = await req.json();
    if (!campaignId || !brief) {
      return new Response(JSON.stringify({ error: "campaignId and brief required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    await supabase.from("campaigns").update({
      status: "generating",
      generation_started_at: new Date().toISOString(),
      brief,
      last_error: null,
    }).eq("id", campaignId);

    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(runPlanAndGenerate(campaignId, brief));
    } else {
      runPlanAndGenerate(campaignId, brief);
    }

    return new Response(JSON.stringify({ status: "generating", campaignId }), {
      status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[plan-image-email] top-level:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});