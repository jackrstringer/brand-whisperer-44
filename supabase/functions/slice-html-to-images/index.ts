// slice-html-to-images: renders the campaign's HTML to a full-page PNG,
// uses vision to plan semantic row/column slices, crops each region, uploads
// the crops to storage, and writes campaign_slices rows the editor + Klaviyo
// pusher already know how to consume.
//
// This is the second half of the "HTML → Image Slices" pipeline. The first
// half is generate-campaign running with body.outputFormat === "html_to_image",
// which produces bold, art-directed HTML unconstrained by email-client rules.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const VISION_MODEL = "google/gemini-3.6-flash";

// ─── Types ────────────────────────────────────────────────────────────────
interface SliceColumn {
  x_start: number;   // 0..1 fraction of width
  x_end: number;
  href: string | null;
  region_label: string;
}
interface SliceRow {
  y_start: number;   // pixels
  y_end: number;
  columns: SliceColumn[];
}
interface SlicePlan { rows: SliceRow[]; notes?: string }

// ─── Helpers ──────────────────────────────────────────────────────────────
function extractHrefsFromHtml(html: string): string[] {
  const hrefs: string[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) continue;
    if (!seen.has(href)) { seen.add(href); hrefs.push(href); }
  }
  return hrefs;
}

function normalizePlan(raw: any, imgWidth: number, imgHeight: number): SlicePlan {
  if (!raw || !Array.isArray(raw.rows)) throw new Error("Vision planner returned no rows");
  const rows: SliceRow[] = [];
  for (const r of raw.rows) {
    const y_start = Math.max(0, Math.min(imgHeight, Math.round(Number(r.y_start))));
    const y_end = Math.max(0, Math.min(imgHeight, Math.round(Number(r.y_end))));
    if (!Number.isFinite(y_start) || !Number.isFinite(y_end) || y_end - y_start < 10) continue;
    const columnsRaw = Array.isArray(r.columns) && r.columns.length > 0 ? r.columns : [{ x_start: 0, x_end: 1, href: null, region_label: r.region_label || "section" }];
    // Enforce equal-width columns: reshape to N equal slices spanning 0..1
    const N = columnsRaw.length;
    const columns: SliceColumn[] = columnsRaw.map((c: any, i: number) => ({
      x_start: i / N,
      x_end: (i + 1) / N,
      href: (typeof c?.href === "string" && c.href.trim()) ? c.href.trim() : null,
      region_label: (typeof c?.region_label === "string" && c.region_label.trim()) ? c.region_label.trim() : `section-${rows.length + 1}-${i + 1}`,
    }));
    rows.push({ y_start, y_end, columns });
  }
  if (rows.length === 0) throw new Error("Vision planner produced 0 valid rows");
  // Sort by y_start and de-overlap by clamping each row's y_start to the previous row's y_end
  rows.sort((a, b) => a.y_start - b.y_start);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].y_start < rows[i - 1].y_end) rows[i].y_start = rows[i - 1].y_end;
  }
  // Ensure the last row extends to the bottom (avoid leaving orphan pixels)
  rows[rows.length - 1].y_end = imgHeight;
  return { rows, notes: typeof raw.notes === "string" ? raw.notes : undefined };
}

async function planSlicesWithVision(
  imageBase64: string,
  html: string,
  hrefs: string[],
  imgWidth: number,
  imgHeight: number,
): Promise<SlicePlan> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const prompt = `You are analyzing a rendered email design (${imgWidth}×${imgHeight}px, viewed at 390px mobile width) so it can be sliced into image blocks for a Klaviyo drag-and-drop template.

Your job: return a JSON plan that carves this image into semantic rows, where each row can optionally be split into equal-width side-by-side columns.

RULES:
1. Slice at natural design boundaries — background color changes, section dividers, blank space, distinct content zones. Don't slice through text or images.
2. Aim for 4–10 rows total. Never fewer than 2, never more than 15.
3. A row gets multiple columns ONLY if the design clearly shows side-by-side content of visually equal width (e.g. a 2-up product grid, 3 feature icons, 4 category tiles). If the split is unequal, keep it as ONE full-width row.
4. All columns in one row must be equal width (the export requires it).
5. For each column, if there is a visible clickable element (button, product tile, image link) within that region, pick the most relevant href from the AVAILABLE HREFS list below. If nothing clickable, use null.
6. Every href you return MUST come from the AVAILABLE HREFS list — do not invent URLs. Match by CTA text, product name, or visible link.
7. Cover the image top to bottom with no gaps and no overlaps. First row starts at y_start:0. Last row ends at y_end:${imgHeight}.

AVAILABLE HREFS (pick from this list only, or use null):
${hrefs.length > 0 ? hrefs.map((h, i) => `  ${i + 1}. ${h}`).join("\n") : "  (none — every column href should be null)"}

Return ONLY this JSON, no prose:
{
  "rows": [
    {
      "y_start": 0,
      "y_end": 320,
      "columns": [
        { "href": "https://...", "region_label": "hero" }
      ]
    },
    {
      "y_start": 320,
      "y_end": 780,
      "columns": [
        { "href": "https://...", "region_label": "product-left" },
        { "href": "https://...", "region_label": "product-right" }
      ]
    }
  ]
}`;

  const resp = await fetch(LOVABLE_GATEWAY, {
    method: "POST",
    headers: {
      "Lovable-API-Key": LOVABLE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } },
        ],
      }],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Vision planner failed ${resp.status}: ${body.slice(0, 500)}`);
  }
  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("Vision planner returned no content");
  let parsed: any;
  try { parsed = JSON.parse(content); }
  catch { throw new Error(`Vision planner returned non-JSON: ${content.slice(0, 300)}`); }

  return normalizePlan(parsed, imgWidth, imgHeight);
}

async function cropAndUpload(
  supabase: any,
  pngBytes: Uint8Array,
  plan: SlicePlan,
  campaignId: string,
  imgWidth: number,
): Promise<Array<{ url: string; row_index: number; column_index: number; columns_in_row: number; region_label: string; href: string | null }>> {
  const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
  const src = await Image.decode(pngBytes);

  const uploaded: Array<{ url: string; row_index: number; column_index: number; columns_in_row: number; region_label: string; href: string | null }> = [];
  const bucket = "qa-artifacts";

  for (let r = 0; r < plan.rows.length; r++) {
    const row = plan.rows[r];
    const height = row.y_end - row.y_start;
    if (height < 4) continue;
    for (let c = 0; c < row.columns.length; c++) {
      const col = row.columns[c];
      const x0 = Math.round(col.x_start * imgWidth);
      const x1 = Math.round(col.x_end * imgWidth);
      const width = x1 - x0;
      if (width < 4) continue;
      const cropped = src.clone().crop(x0, row.y_start, width, height);
      const encoded = await cropped.encode();
      const path = `html-slices/${campaignId}/${Date.now()}-r${r}-c${c}.png`;
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, encoded, {
        contentType: "image/png",
        upsert: true,
      });
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
      uploaded.push({
        url: pub.publicUrl,
        row_index: r,
        column_index: c,
        columns_in_row: row.columns.length,
        region_label: col.region_label,
        href: col.href,
      });
    }
  }
  return uploaded;
}

async function runSlicing(campaignId: string) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1) Load campaign
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns").select("id, html").eq("id", campaignId).single();
    if (cErr || !campaign) throw new Error(`Campaign not found: ${cErr?.message}`);
    if (!campaign.html) throw new Error("Campaign has no HTML to slice");

    // 2) Render
    console.log(`[slice-html-to-images] Rendering HTML for ${campaignId}`);
    const renderResp = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/capture-email-screenshot`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ html: campaign.html }),
      },
    );
    if (!renderResp.ok) {
      const text = await renderResp.text().catch(() => "");
      throw new Error(`capture-email-screenshot failed ${renderResp.status}: ${text.slice(0, 400)}`);
    }
    const renderJson = await renderResp.json();
    const { imageBase64, width: imgWidth, height: imgHeight } = renderJson;
    if (!imageBase64) throw new Error("Renderer returned no image");

    // 3) Extract candidate hrefs from HTML
    const hrefs = extractHrefsFromHtml(campaign.html);
    console.log(`[slice-html-to-images] Found ${hrefs.length} candidate hrefs`);

    // 4) Plan slices with vision
    const plan = await planSlicesWithVision(imageBase64, campaign.html, hrefs, imgWidth, imgHeight);
    console.log(`[slice-html-to-images] Planned ${plan.rows.length} rows`);

    // 5) Persist the plan on the campaign row (audit trail + editor UI)
    await supabase.from("campaigns").update({
      slice_plan_html: plan as any,
    }).eq("id", campaignId);

    // 6) Decode PNG bytes for cropping
    const pngBytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));

    // 7) Crop + upload each region
    const regions = await cropAndUpload(supabase, pngBytes, plan, campaignId, imgWidth);

    // 8) Wipe any prior slices for this campaign and insert fresh ones
    await supabase.from("campaign_slices").delete().eq("campaign_id", campaignId);
    const rows = regions.map((r, i) => ({
      campaign_id: campaignId,
      position: i,
      row_index: r.row_index,
      column_index: r.column_index,
      columns_in_row: r.columns_in_row,
      region_label: r.region_label,
      image_url: r.url,
      cta_url: r.href,
      aspect_ratio: "custom",
      generation_status: "complete",
    }));
    const { error: insErr } = await supabase.from("campaign_slices").insert(rows);
    if (insErr) throw new Error(`Insert slices failed: ${insErr.message}`);

    console.log(`[slice-html-to-images] Complete — ${rows.length} slices inserted`);

    await supabase.from("chat_messages").insert({
      campaign_id: campaignId,
      role: "system",
      content: `Sliced HTML into ${rows.length} image blocks (${plan.rows.length} rows)`,
    });
  } catch (err: any) {
    console.error("[slice-html-to-images] Error:", err);
    const reason = (err?.message || String(err)).slice(0, 1500);
    await supabase.from("campaigns").update({
      status: "error",
      last_error: `HTML slicing failed: ${reason}`,
    }).eq("id", campaignId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { campaignId } = await req.json();
    if (!campaignId) {
      return new Response(JSON.stringify({ error: "campaignId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(runSlicing(campaignId));
    } else {
      runSlicing(campaignId);
    }

    return new Response(JSON.stringify({ ok: true, status: "slicing", campaignId }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[slice-html-to-images] Top-level error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});