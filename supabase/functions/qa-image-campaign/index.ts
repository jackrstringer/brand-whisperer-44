// Whole-campaign visual QA for image-slice campaigns (Blocklab Stage 6).
// Sends the fully-stitched preview + individual slice URLs to Claude Sonnet
// with vision, applies a 14-point rubric, and returns findings. One
// auto-apply pass may regenerate the single worst-scoring slice.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const RUBRIC = `14-POINT VISUAL RUBRIC — score each 1-10:
1. Palette adherence — every slice uses only the locked palette
2. Typography consistency — heading/body treatment matches across slices
3. Vertical cohesion — slices merge into one continuous piece (no hard full-bleed dividers between them)
4. Mobile legibility at 390px — type large enough, no crowded columns
5. Product fidelity — packaging/logo matches brand assets (no invented products)
6. Copy accuracy — headlines/body/CTAs are spelled correctly and rendered legibly
7. Logo header present — slice 1 is a compact logo band
8. CTA prominence — buttons look like buttons, sized for tap targets
9. Whitespace balance — inset compositions, breathable margins
10. Shape-language consistency — dividers/frames/cutouts consistent throughout
11. Background handoff — top of each slice matches bottom of previous
12. No placeholder text — no lorem/dummy content, no watermarks, no mockup chrome
13. Focal hierarchy — each slice has ONE dominant focal point
14. Overall campaign polish — publish-ready, magazine quality`;

async function callClaudeVision(sliceImages: { position: number; url: string }[], designSystem: any, brandName: string) {
  const content: any[] = [{
    type: "text",
    text: `You are auditing a marketing email built from vertically-stacked PNG slices for ${brandName}. Below you'll see each slice in order (top to bottom).\n\nLOCKED DESIGN SYSTEM: ${JSON.stringify(designSystem).slice(0, 2000)}\n\n${RUBRIC}\n\nReturn STRICT JSON only (no markdown):\n{\n  "overall_score": <1-100 integer>,\n  "verdict": "<one sentence summary>",\n  "per_slice": [\n    { "position": <int>, "score": <1-100>, "issues": ["..."], "worst_issue": "..." }\n  ],\n  "worst_slice_position": <int or null>,\n  "worst_slice_fix_brief": "<if there is a clearly worst slice with a fixable single-issue, describe exactly what the regenerated slice should show; else empty string>"\n}`,
  }];
  for (const s of sliceImages) {
    content.push({ type: "text", text: `Slice ${s.position}:` });
    content.push({ type: "image", source: { type: "url", url: s.url } });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`Claude vision failed [${res.status}]: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  const text = data?.content?.[0]?.text || "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Claude returned no JSON: ${text.slice(0, 300)}`);
  return JSON.parse(jsonMatch[0]);
}

async function runQa(campaignId: string, autoApply: boolean) {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const { data: campaign } = await supabase.from("campaigns").select("brand_id, design_system").eq("id", campaignId).single();
    if (!campaign) throw new Error("Campaign not found");

    const { data: slices } = await supabase.from("campaign_slices")
      .select("id, position, image_url, headline_copy, composition_brief")
      .eq("campaign_id", campaignId)
      .eq("generation_status", "complete")
      .order("position");

    if (!slices || slices.length === 0) throw new Error("No completed slices to QA");

    const { data: brand } = await supabase.from("brands").select("name").eq("id", campaign.brand_id).single();

    const sliceImages = slices.map((s: any) => ({ position: s.position, url: s.image_url })).filter((s: any) => s.url);

    const rubric = await callClaudeVision(sliceImages, campaign.design_system, brand?.name || "Brand");

    // Persist findings per slice
    for (const finding of (rubric.per_slice || [])) {
      const slice = slices.find((s: any) => s.position === finding.position);
      if (!slice) continue;
      await supabase.from("campaign_slices").update({
        qa_finding: finding,
      }).eq("id", slice.id);
    }

    await supabase.from("campaigns").update({
      visual_qa_score: rubric.overall_score,
      visual_qa_status: "complete",
    }).eq("id", campaignId);

    // Auto-apply one repair pass on the worst slice, if requested and one is identified.
    if (autoApply && rubric.worst_slice_position && rubric.worst_slice_fix_brief) {
      const worst = slices.find((s: any) => s.position === rubric.worst_slice_position);
      if (worst) {
        console.log(`[qa-image-campaign] auto-applying fix to slice ${worst.id}`);
        await supabase.from("campaign_slices").update({
          composition_brief: `${worst.composition_brief}\n\nQA FIX: ${rubric.worst_slice_fix_brief}`,
          qa_regenerated_at: new Date().toISOString(),
          generation_status: "pending",
          last_error: null,
        }).eq("id", worst.id);
        await fetch(`${SUPABASE_URL}/functions/v1/generate-slice`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ sliceId: worst.id, campaignId }),
        }).catch((e) => console.error("[qa-image-campaign] regenerate invoke failed:", e));
      }
    }

    return rubric;
  } catch (err: any) {
    console.error("[qa-image-campaign] error:", err);
    await supabase.from("campaigns").update({
      visual_qa_status: "failed",
      last_error: (err?.message || String(err)).slice(0, 1500),
    }).eq("id", campaignId);
    throw err;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { campaignId, autoApply = true } = await req.json();
    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaignId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rubric = await runQa(campaignId, autoApply);
    return new Response(JSON.stringify(rubric), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[qa-image-campaign] top-level:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});