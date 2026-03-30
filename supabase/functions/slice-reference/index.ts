import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SliceDecision {
  yTop: number;
  yBottom: number;
  label: string;
}

interface ImageSliceRecord {
  index: number;
  label: string;
  url: string;
  yTop: number;
  yBottom: number;
}

interface OcrParagraph {
  yTop: number;
  yBottom: number;
}

interface WhitespaceGap {
  yTop: number;
  yBottom: number;
  height: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ANALYSIS_MAX_HEIGHT = 1568;
const MIN_GAP_ROWS = 15;
const BRIGHTNESS_THRESHOLD = 220;
const IMAGEKIT_QUALITY = 90;
const IMAGEKIT_FORMAT = "jpg";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Chunked base64 encoding */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let referenceCampaignId: string;

  try {
    const body = await req.json();
    referenceCampaignId = body.referenceCampaignId;
    if (!referenceCampaignId) {
      throw new Error("referenceCampaignId is required");
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    await runSlicePipeline(supabase, referenceCampaignId);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[slice-reference] Pipeline error:", err);
    await supabase
      .from("reference_campaigns")
      .update({ slicing_status: "failed" } as any)
      .eq("id", referenceCampaignId);

    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Pipeline ─────────────────────────────────────────────────────────────────

async function runSlicePipeline(
  supabase: ReturnType<typeof createClient>,
  referenceCampaignId: string
): Promise<void> {
  // 1. Load the reference campaign row
  const { data: campaign, error: fetchError } = await supabase
    .from("reference_campaigns")
    .select("id, thumbnail_url, image_urls")
    .eq("id", referenceCampaignId)
    .single();

  if (fetchError || !campaign) {
    throw new Error(`Could not load reference campaign: ${fetchError?.message}`);
  }

  // Use the first image_url or thumbnail_url as the source
  const imageUrl: string = (campaign as any).image_urls?.[0] || (campaign as any).thumbnail_url;
  if (!imageUrl) {
    throw new Error("Reference campaign has no image URL");
  }

  // Mark as processing
  await supabase
    .from("reference_campaigns")
    .update({ slicing_status: "processing" } as any)
    .eq("id", referenceCampaignId);

  // 2. Download the full image
  console.log("[slice-reference] Downloading image:", imageUrl);
  const imageResp = await fetch(imageUrl);
  if (!imageResp.ok) {
    throw new Error(`Failed to download image: ${imageResp.status} ${imageResp.statusText}`);
  }
  const imageBuffer = await imageResp.arrayBuffer();
  const imageBytes = new Uint8Array(imageBuffer);

  // 3. Get image dimensions by decoding with canvas-like approach
  // In Deno edge runtime, we'll use a simpler approach: detect dimensions from the image header
  // and use pixel-row analysis on the raw decoded data
  const { width: originalWidth, height: originalHeight, pixelData } = await decodeImageDimensions(imageBytes);

  console.log(`[slice-reference] Original dimensions: ${originalWidth}x${originalHeight}`);

  // 4. Run Vision OCR and whitespace detection in parallel
  const [ocrParagraphs, whitespaceGaps] = await Promise.all([
    runGoogleVisionOcr(imageBytes),
    detectWhitespaceGapsFromBrightness(pixelData, originalWidth, originalHeight),
  ]);

  console.log(
    `[slice-reference] OCR paragraphs: ${ocrParagraphs.length}, Whitespace gaps: ${whitespaceGaps.length}`
  );

  // 5. Compute scale factor for Claude analysis
  const scaleFactor = originalHeight > ANALYSIS_MAX_HEIGHT
    ? ANALYSIS_MAX_HEIGHT / originalHeight
    : 1.0;

  const analysisHeight = Math.floor(originalHeight * scaleFactor);
  const analysisWidth = Math.max(1, Math.floor(originalWidth * scaleFactor));

  // Build a downscaled version for Claude using ImageKit transform on the URL
  const analysisImageUrl = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}tr=h-${analysisHeight},w-${analysisWidth},q-80,f-jpg`;
  
  // Fetch the downscaled image for Claude
  const analysisResp = await fetch(analysisImageUrl);
  let analysisBase64: string;
  let analysisMediaType: string;
  
  if (analysisResp.ok) {
    const analysisBuf = await analysisResp.arrayBuffer();
    const analysisBytes = new Uint8Array(analysisBuf);
    analysisBase64 = uint8ArrayToBase64(analysisBytes);
    // Detect actual media type from response header or image bytes
    const ct = analysisResp.headers.get("content-type")?.split(";")[0].trim();
    analysisMediaType = ct && ct.startsWith("image/") ? ct : detectMediaType(analysisBytes);
  } else {
    // Fallback: send the original image (Claude will downscale internally)
    analysisBase64 = uint8ArrayToBase64(imageBytes);
    analysisMediaType = detectMediaType(imageBytes);
  }

  // Scale OCR paragraph boxes to analysis dimensions
  const scaledOcrParagraphs = ocrParagraphs.map((p) => ({
    yTop: Math.floor(p.yTop * scaleFactor),
    yBottom: Math.floor(p.yBottom * scaleFactor),
  }));

  const scaledGaps = whitespaceGaps.map((g) => ({
    yTop: Math.floor(g.yTop * scaleFactor),
    yBottom: Math.floor(g.yBottom * scaleFactor),
    height: Math.floor(g.height * scaleFactor),
  }));

  // 6. Ask Claude where to slice
  const sliceDecisions = await askClaudeForSlices({
    base64Image: analysisBase64,
    mediaType: analysisMediaType,
    analysisWidth,
    analysisHeight,
    scaledOcrParagraphs,
    scaledGaps,
  });

  console.log("[slice-reference] Claude slice decisions:", JSON.stringify(sliceDecisions));

  // 7. Scale slice decisions back to original image coordinates
  const originalSlices: SliceDecision[] = sliceDecisions.map((s) => ({
    yTop: Math.round(s.yTop / scaleFactor),
    yBottom: Math.round(s.yBottom / scaleFactor),
    label: s.label,
  }));

  // 8. Build ImageKit URLs
  const imagekitBase = buildImageKitBase(imageUrl);
  const sliceRecords: ImageSliceRecord[] = buildSliceRecords(
    imagekitBase,
    originalSlices,
    originalHeight
  );

  console.log("[slice-reference] Slice records:", JSON.stringify(sliceRecords));

  // 9. Persist to DB
  const { error: updateError } = await supabase
    .from("reference_campaigns")
    .update({
      image_slice_urls: sliceRecords,
      image_total_height: originalHeight,
      slicing_status: "complete",
    } as any)
    .eq("id", referenceCampaignId);

  if (updateError) {
    throw new Error(`Failed to save slice records: ${updateError.message}`);
  }

  console.log("[slice-reference] Done. Saved", sliceRecords.length, "slices.");
}

// ─── Image dimension detection ─────────────────────────────────────────────────

async function decodeImageDimensions(imageBytes: Uint8Array): Promise<{
  width: number;
  height: number;
  pixelData: null; // We'll use a different approach for whitespace detection
}> {
  // Try PNG header first
  if (imageBytes[0] === 0x89 && imageBytes[1] === 0x50) {
    // PNG: width at bytes 16-19, height at bytes 20-23 (big-endian)
    const width = (imageBytes[16] << 24) | (imageBytes[17] << 16) | (imageBytes[18] << 8) | imageBytes[19];
    const height = (imageBytes[20] << 24) | (imageBytes[21] << 16) | (imageBytes[22] << 8) | imageBytes[23];
    return { width, height, pixelData: null };
  }
  
  // JPEG: parse SOF markers
  if (imageBytes[0] === 0xFF && imageBytes[1] === 0xD8) {
    let offset = 2;
    while (offset < imageBytes.length - 9) {
      if (imageBytes[offset] !== 0xFF) { offset++; continue; }
      const marker = imageBytes[offset + 1];
      // SOF0, SOF1, SOF2 markers
      if (marker >= 0xC0 && marker <= 0xC2) {
        const height = (imageBytes[offset + 5] << 8) | imageBytes[offset + 6];
        const width = (imageBytes[offset + 7] << 8) | imageBytes[offset + 8];
        return { width, height, pixelData: null };
      }
      const segLength = (imageBytes[offset + 2] << 8) | imageBytes[offset + 3];
      offset += 2 + segLength;
    }
  }

  // WebP
  if (imageBytes[8] === 0x57 && imageBytes[9] === 0x45 && imageBytes[10] === 0x42 && imageBytes[11] === 0x50) {
    // VP8 simple
    if (imageBytes[12] === 0x56 && imageBytes[13] === 0x50 && imageBytes[14] === 0x38 && imageBytes[15] === 0x20) {
      const width = ((imageBytes[26] | (imageBytes[27] << 8)) & 0x3FFF);
      const height = ((imageBytes[28] | (imageBytes[29] << 8)) & 0x3FFF);
      return { width, height, pixelData: null };
    }
  }

  throw new Error("Could not detect image dimensions from header");
}

// ─── Google Cloud Vision OCR ───────────────────────────────────────────────────

async function runGoogleVisionOcr(imageBytes: Uint8Array): Promise<OcrParagraph[]> {
  const apiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
  if (!apiKey) {
    console.warn("[slice-reference] GOOGLE_CLOUD_VISION_API_KEY not set, skipping OCR");
    return [];
  }

  const base64 = uint8ArrayToBase64(imageBytes);

  const visionPayload = {
    requests: [
      {
        image: { content: base64 },
        features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
      },
    ],
  };

  const visionResp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(visionPayload),
    }
  );

  if (!visionResp.ok) {
    const errText = await visionResp.text();
    console.error(`[slice-reference] Google Vision API error: ${visionResp.status} ${errText}`);
    return [];
  }

  const visionData = await visionResp.json();
  const response = visionData.responses?.[0];

  if (!response || response.error) {
    console.error(`[slice-reference] Vision response error:`, response?.error);
    return [];
  }

  const paragraphs: OcrParagraph[] = [];
  const pages = response.fullTextAnnotation?.pages ?? [];
  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        const vertices = paragraph.boundingBox?.vertices ?? [];
        if (vertices.length < 4) continue;
        const ys = vertices.map((v: { x?: number; y?: number }) => v.y ?? 0);
        const yTop = Math.min(...ys);
        const yBottom = Math.max(...ys);
        paragraphs.push({ yTop: Math.max(0, yTop), yBottom });
      }
    }
  }

  return paragraphs;
}

// ─── Whitespace Gap Detection (without pixel data — uses ImageKit sampling) ────

async function detectWhitespaceGapsFromBrightness(
  _pixelData: null,
  originalWidth: number,
  originalHeight: number
): Promise<WhitespaceGap[]> {
  // Since we can't decode pixels in Deno edge runtime easily without ImageScript,
  // we'll return empty and let Claude rely on visual analysis + OCR boxes.
  // The OCR paragraph boxes provide sufficient cut-point guidance.
  // Claude can visually identify whitespace gaps from the image itself.
  console.log("[slice-reference] Whitespace detection deferred to Claude visual analysis");
  return [];
}

// ─── Claude Slice Decision ────────────────────────────────────────────────────

async function askClaudeForSlices({
  base64Image,
  mediaType,
  analysisWidth,
  analysisHeight,
  scaledOcrParagraphs,
  scaledGaps,
}: {
  base64Image: string;
  mediaType: string;
  analysisWidth: number;
  analysisHeight: number;
  scaledOcrParagraphs: OcrParagraph[];
  scaledGaps: WhitespaceGap[];
}): Promise<SliceDecision[]> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const systemPrompt = `You are an expert at analyzing email campaign layouts. Your job is to decide where to horizontally slice a reference email image into readable chunks for a vision AI.

Rules you MUST follow:
1. Output ONLY a raw JSON array. No explanation, no markdown, no code fences. Just the array.
2. Produce between 3 and 6 slices (NOT counting the full-overview entry).
3. Never cut through a text bounding box. The OCR data lists paragraph bounding boxes — no slice boundary (yTop or yBottom of any slice) may fall inside any paragraph's yTop–yBottom range.
4. Prefer cutting in whitespace gaps when gap data is available. Place cut points at the vertical center of a gap whenever possible.
5. Horizontal cuts ONLY. No vertical splits whatsoever.
6. Each slice should be roughly 200-600px tall in the analysis image you see (coordinates are in the ${analysisWidth}x${analysisHeight}px space).
7. The first element of your array must span the very top (yTop: 0) to the very bottom (yBottom: ${analysisHeight}) — this is the "full-overview" entry.
8. Slices after index 0 must together cover the full height of the image (yTop of first = 0, yBottom of last = ${analysisHeight}), and must not overlap.
9. Label each slice with a short semantic name: e.g. "header", "hero", "product-section", "testimonials", "pricing", "footer". Use "full-overview" for the first entry.

Output format (JSON array only):
[
  {"yTop": 0, "yBottom": ${analysisHeight}, "label": "full-overview"},
  {"yTop": 0, "yBottom": 420, "label": "header"},
  ...
]`;

  const ocrContext = scaledOcrParagraphs.length > 0
    ? `\n\nOCR paragraph bounding boxes (never cut inside these ranges):\n${JSON.stringify(scaledOcrParagraphs, null, 2)}`
    : "";

  const gapContext = scaledGaps.length > 0
    ? `\n\nDetected whitespace gaps (prefer cutting here):\n${JSON.stringify(scaledGaps, null, 2)}`
    : "";

  const userMessage = `Here is the reference email image at analysis resolution (${analysisWidth}x${analysisHeight}px).${ocrContext}${gapContext}

Decide where to slice this email into 3–6 horizontal chunks. Return ONLY the JSON array.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: "text",
              text: userMessage,
            },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Claude API error: ${resp.status} ${errText}`);
  }

  const message = await resp.json();
  const rawText = message.content?.find((b: any) => b.type === "text")?.text?.trim() ?? "";

  // Parse Claude's JSON response
  let parsed: SliceDecision[];
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Claude returned unparseable JSON: ${rawText}\n${e}`);
  }

  if (!Array.isArray(parsed) || parsed.length < 2) {
    throw new Error(`Claude returned invalid slice array (expected 2+ elements): ${rawText}`);
  }

  for (const entry of parsed) {
    if (typeof entry.yTop !== "number" || typeof entry.yBottom !== "number" || typeof entry.label !== "string") {
      throw new Error(`Claude slice entry missing required fields: ${JSON.stringify(entry)}`);
    }
  }

  return parsed;
}

// ─── ImageKit URL Construction ─────────────────────────────────────────────────

function buildImageKitBase(imageUrl: string): string {
  const url = new URL(imageUrl);
  url.search = "";
  return url.toString();
}

function buildSliceRecords(
  imagekitBase: string,
  slices: SliceDecision[],
  originalHeight: number
): ImageSliceRecord[] {
  const records: ImageSliceRecord[] = [];

  // Index 0: full overview
  records.push({
    index: 0,
    label: "full-overview",
    url: `${imagekitBase}?tr=h-1568,fo-top,q-${IMAGEKIT_QUALITY},f-${IMAGEKIT_FORMAT}`,
    yTop: 0,
    yBottom: originalHeight,
  });

  // Indices 1+: detail slices
  const detailSlices = slices.filter((s) => s.label !== "full-overview");

  detailSlices.forEach((slice, i) => {
    const height = slice.yBottom - slice.yTop;
    const url = `${imagekitBase}?tr=x-0,y-${slice.yTop},w-600,h-${height},cm-extract,q-${IMAGEKIT_QUALITY},f-${IMAGEKIT_FORMAT}`;

    records.push({
      index: i + 1,
      label: slice.label,
      url,
      yTop: slice.yTop,
      yBottom: slice.yBottom,
    });
  });

  return records;
}
