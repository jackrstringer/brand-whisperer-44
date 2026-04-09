// supabase/functions/visual-qa/index.ts
// Agent 4 — QA Agent: Compares reference slices vs output slices, returns pass/fail + patches.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an expert email QA auditor with PIXEL-LEVEL attention to detail.

You will receive:
1. Screenshot slices of a REFERENCE email (the STRUCTURAL BLUEPRINT the output was supposed to match)
2. Screenshot slices of the GENERATED OUTPUT email (exactly as it appears at 390px width)
3. The full HTML source code of the generated output

CRITICAL CONTEXT — READ FIRST:
The reference email is used ONLY as a STRUCTURAL/ARCHITECTURAL blueprint. The generated output is for a COMPLETELY DIFFERENT BRAND with different products, copy, colors, fonts, and imagery. This is BY DESIGN — the system intentionally takes a reference layout and applies a different brand's identity to it.

Therefore you MUST NEVER flag:
- Different brand name, logo, or company identity
- Different products, product images, or product categories
- Different copy, headlines, or marketing messages
- Different colors, fonts, or visual styling
- Different order details, customer names, or transactional data
- Different industry or business type (e.g. skincare vs pet food)

These are EXPECTED differences, not errors.

Your job is to compare the STRUCTURE and LAYOUT fidelity, flag genuine visual bugs, and score how faithfully the output replicates the reference's architecture.

CHECK FOR THESE SPECIFIC ISSUES:
1. LAYOUT: Are any side-by-side sections stacking vertically when they shouldn't? Are grids collapsing into single columns?
2. IMAGES: Are images displaying correctly? Are any broken, stretched, or cropped badly? Do they have consistent padding treatment?
3. SPACING: Is there excessive whitespace or cramped sections? Are padding/margins consistent?
4. TEXT: Is text readable? Are headlines properly sized? Is body text at least 16px? Is text alignment consistent within sections?
5. BUTTONS: Are CTAs visible and properly sized? Not full-width? Good padding?
6. LOGO: Is it properly sized (max ~150px wide), centered, not stretched?
7. FOOTER: Present and properly separated from content?
8. COLORS: Do colors look cohesive WITHIN THE OUTPUT's own brand palette? (Do NOT compare against reference colors)
9. GRID IMAGE DIMENSIONS: For every multi-column image row, verify all images share identical width and height attributes, have a fixed pixel height in their inline style (never height:auto), and have matching ?tr=w-{W},h-{H},fo-auto on ImageKit URLs. Flag any height:auto on a grid image as critical.
10. PLACEHOLDER DIMENSIONS: Flag any image with width under 100px or height under 100px that is not a logo or icon. These are placeholder values that will break the layout.
11. GRID STRUCTURE: Flag any multi-column grid that uses display:inline-block tables instead of direct <td> siblings inside a single <tr>. Flag any CSS class (e.g. mobile-grid-col) that sets display:block on grid columns. These techniques cause vertical stacking at the 390px viewport.
12. GEOMETRIC ACCURACY: Inspect every circular element — progress indicators, icon containers, status badges. Any element that appears oval or egg-shaped when it should be circular is CRITICAL. Flag with category "geometry", severity "critical". Also flag connecting lines that pass through circles instead of running between them.
13. DYNAMIC DATA POPULATION (flow emails only): When preview data has been used, verify that all dynamic fields have populated correctly — customer name appears as a real name (not a Liquid tag), order numbers are real, product images are loading and showing actual products, prices are formatted correctly. If you see any raw Liquid syntax like {{ event.extra.order_number }} visible in the rendered output, that is a CRITICAL error — it means a variable failed to render.

STRUCTURAL COMPARISON (when reference screenshots are provided):
Compare the generated output against the reference screenshots and score STRUCTURAL fidelity only:
- Does the output have the SAME number of major sections? (hero, product grid, CTA block, text block, footer, etc.)
- Does the output preserve the SAME section ordering as the reference?
- Do multi-column grids have the SAME column count? (e.g., 2-col vs 3-col must match)
- Is the image-to-text ratio similar?
- Are structural elements (hero banner, product grids, dividers, footers) in the same relative positions?
- Does the overall visual weight and density feel similar?

Remember: The reference is a LAYOUT BLUEPRINT. Different brand, different products, different copy is EXPECTED and CORRECT.

A structural_fidelity score of 8-10 means the output is a near-perfect structural replica.
A score of 5-7 means the structure is roughly similar but with notable differences.
A score of 1-4 means the structure is fundamentally different from the reference — this is a CRITICAL failure.

GRID GEOMETRY (CRITICAL): If the reference shows an NxN grid of equally-sized images, the output MUST replicate that exact geometry. A 2×2 equal grid converted into a "1 large + 2 stacked" mosaic layout is a CRITICAL structural failure (structural_fidelity ≤ 3).

If NO reference screenshots are provided, set structural_fidelity to null.

IMPORTANT: You are looking at the email at 390px viewport width. Side-by-side layouts MUST remain side-by-side — they should NOT stack. If you see grids or two-column sections stacking into single columns, that is a CRITICAL issue.

Return ONLY a JSON object:
{
  "passes_visual_qa": true/false,
  "structural_fidelity": <number 1-10 or null if no reference>,
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "category": "layout" | "image" | "spacing" | "text" | "button" | "logo" | "footer" | "color" | "cohesion" | "structural_mismatch" | "geometry",
      "description": "Clear description of what's wrong",
      "find": "exact HTML string to find (if fixable via code)",
      "replace": "corrected HTML string (if fixable via code)"
    }
  ],
  "overall_score": 1-10,
  "summary": "One sentence overall assessment"
}

Rules:
- Only flag REAL issues visible in the screenshots. Don't nitpick.
- NEVER mention brand/product/copy differences — those are intentional.
- "find" and "replace" must be EXACT substrings of the provided HTML. If you can't provide an exact fix, omit those fields.
- Critical = broken layout, stacking, broken images, image proportion mismatches, structural mismatch with reference, geometric distortion. Major = spacing/alignment issues. Minor = small polish items.
- If the email looks great AND matches the reference structure, return passes_visual_qa: true with empty issues array and a high score.
- If the structure fundamentally deviates from the reference (wrong number of sections, grids collapsed, missing major elements), set passes_visual_qa: false and structural_fidelity < 5.`;

/** Cap a base64 image to max dimensions by checking PNG header. Returns true if oversized. */
function isBase64ImageOversized(base64Data: string, maxDim: number): boolean {
  try {
    // Decode first 24 bytes to read PNG header
    const raw = atob(base64Data.substring(0, 48));
    if (raw.length < 24) return false;
    // PNG signature check
    if (raw.charCodeAt(0) !== 0x89 || raw.charCodeAt(1) !== 0x50) return false;
    const width = (raw.charCodeAt(16) << 24) | (raw.charCodeAt(17) << 16) | (raw.charCodeAt(18) << 8) | raw.charCodeAt(19);
    const height = (raw.charCodeAt(20) << 24) | (raw.charCodeAt(21) << 16) | (raw.charCodeAt(22) << 8) | raw.charCodeAt(23);
    return width > maxDim || height > maxDim;
  } catch {
    return false;
  }
}

/** Fetch a URL and return its content as base64. */
async function fetchAsBase64(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch ${url}: ${r.status}`);
  const buf = await r.arrayBuffer();
  const uint8 = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Cap an ImageKit URL to max dimensions using URL transforms. */
function capImageKitUrl(url: string, maxDim: number): string {
  if (!url.includes("ik.imagekit.io")) return url;
  // Add or replace tr parameter
  const trParam = `tr=w-${maxDim},h-${maxDim},c-at_max`;
  if (url.includes("?tr=")) {
    return url.replace(/\?tr=[^&]+/, `?${trParam}`);
  } else if (url.includes("?")) {
    return url + `&${trParam}`;
  }
  return url + `?${trParam}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const { campaignId, html, renderedHtml, outputSlices, referenceSlices, previewDataUsed } = await req.json();
    if (!html || !outputSlices?.length) {
      throw new Error("html and outputSlices are required");
    }

    const MAX_SLICE_DIM = 1800;
    const hasReferences = Array.isArray(referenceSlices) && referenceSlices.length > 0;
    console.log(
      `[visual-qa] Starting QA for campaign ${campaignId}, ${outputSlices.length} output slices, ${hasReferences ? referenceSlices.length + " reference slices" : "no references"}, previewDataUsed=${!!previewDataUsed}`
    );

    // Build Claude vision content array
    const content: any[] = [];

    // Tell Claude whether this is a flow email rendered with real data
    if (previewDataUsed) {
      content.push({
        type: "text",
        text: `IMPORTANT: The output screenshots below have been rendered with REAL Klaviyo event data (real customer name, real order number, real product images). This is exactly what the customer will see. QA this as a real email — verify that dynamic data has populated correctly, product images are showing, names are rendering, and nothing looks broken or placeholder-like.`,
      });
    } else {
      content.push({
        type: "text",
        text: `NOTE: This is a standard campaign email (not a flow/transactional). Screenshots show the email as designed.`,
      });
    }

    // Reference slices (skip index 0 full-overview, use detail slices only)
    if (hasReferences) {
      const detailReferenceSlices = referenceSlices.filter((s: any) => s.index !== 0);
      if (detailReferenceSlices.length > 0) {
        content.push({
          type: "text",
          text: `REFERENCE EMAIL (${detailReferenceSlices.length} slices, top to bottom — match this structure):`,
        });
        for (const slice of detailReferenceSlices) {
          const isDataUrl = typeof slice.url === "string" && slice.url.startsWith("data:");
          let mediaType = isDataUrl
            ? slice.url.split(";")[0].split(":")[1]
            : "image/jpeg";
          let imageData: string;

          if (isDataUrl) {
            imageData = slice.url.split(",")[1];
          } else {
            // Cap URL dimensions for ImageKit URLs
            const cappedUrl = capImageKitUrl(slice.url, MAX_SLICE_DIM);
            imageData = await fetchAsBase64(cappedUrl);
          }

          // Check if oversized after fetch
          if (isBase64ImageOversized(imageData, MAX_SLICE_DIM)) {
            console.warn(`[visual-qa] Reference slice ${slice.index} exceeds ${MAX_SLICE_DIM}px, skipping`);
            continue;
          }

          content.push({
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageData },
          });
          content.push({
            type: "text",
            text: `[Reference slice ${slice.index}: ${slice.label}]`,
          });
        }
      }
    }

    // Output slices
    content.push({
      type: "text",
      text: `GENERATED OUTPUT (${outputSlices.length} slices, top to bottom — audit this):`,
    });
    for (const slice of outputSlices) {
      const isDataUrl = typeof slice.url === "string" && slice.url.startsWith("data:");
      let mediaType = isDataUrl
        ? slice.url.split(";")[0].split(":")[1]
        : "image/jpeg";
      let imageData: string;

      if (isDataUrl) {
        imageData = slice.url.split(",")[1];
      } else {
        const cappedUrl = capImageKitUrl(slice.url, MAX_SLICE_DIM);
        imageData = await fetchAsBase64(cappedUrl);
      }

      // Check if oversized after fetch
      if (isBase64ImageOversized(imageData, MAX_SLICE_DIM)) {
        console.warn(`[visual-qa] Output slice ${slice.index} exceeds ${MAX_SLICE_DIM}px, skipping`);
        continue;
      }

      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: imageData },
      });
      content.push({
        type: "text",
        text: `[Output slice ${slice.index}: ${slice.label}]`,
      });
    }

    // HTML source
    let htmlForQa = html;
    if (html.length > 40000) {
      htmlForQa =
        html.substring(0, 20000) +
        "\n\n... [HTML TRUNCATED] ...\n\n" +
        html.substring(html.length - 20000);
    }

    content.push({
      type: "text",
      text: `HTML SOURCE:\n${htmlForQa}`,
    });

    // Call Claude Sonnet 4
    console.log("[visual-qa] Calling Claude claude-sonnet-4-20250514...");

    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      console.error("[visual-qa] Claude error:", anthropicResp.status, errText);
      throw new Error(`Claude API returned ${anthropicResp.status}: ${errText.substring(0, 500)}`);
    }

    const result = await anthropicResp.json();
    const rawText = result.content?.[0]?.text || "";

    let qaResult: any;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in Claude response");
      qaResult = JSON.parse(jsonMatch[0]);
    } catch (parseErr: any) {
      console.error("[visual-qa] Failed to parse Claude response:", rawText.substring(0, 1000));
      return new Response(
        JSON.stringify({ error: `Failed to parse QA response: ${parseErr.message}`, raw: rawText.substring(0, 500) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[visual-qa] Result: score=${qaResult.overall_score}, structural_fidelity=${qaResult.structural_fidelity ?? "n/a"}, issues=${qaResult.issues?.length || 0}, passes=${qaResult.passes_visual_qa}`
    );

    return new Response(
      JSON.stringify({ ...qaResult, fixes_applied: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[visual-qa] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
