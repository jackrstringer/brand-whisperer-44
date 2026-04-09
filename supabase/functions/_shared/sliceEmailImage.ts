// supabase/functions/_shared/sliceEmailImage.ts
// Agent 1 — Slicer: shared utility for content-aware email image slicing.
// Called by slice-reference (reference upload pipeline) and slice-image-on-demand (QA pipeline).

import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface EmailSlice {
  index: number;
  label: string;
  url: string;
  yTop: number;
  yBottom: number;
}

export interface SliceEmailImageOptions {
  imageUrl?: string;
  imageBase64?: string;
  mimeType?: string;
  maxSliceHeight?: number;
  overlapPx?: number;
}

// ─── Internal Types ───────────────────────────────────────────────────────────

interface OcrParagraph {
  yTop: number;
  yBottom: number;
}

interface WhitespaceGap {
  yTop: number;
  yBottom: number;
  height: number;
}

interface SliceDecision {
  yTop: number;
  yBottom: number;
  label: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ANALYSIS_MAX_HEIGHT = 1568;
const MIN_GAP_ROWS = 15;
const BRIGHTNESS_THRESHOLD = 220;
const IMAGEKIT_QUALITY = 90;
const IMAGEKIT_FORMAT = "jpg";

// ─── Main exported function ───────────────────────────────────────────────────

export async function sliceEmailImage(
  options: SliceEmailImageOptions,
  googleVisionApiKey: string,
  anthropicApiKey: string
): Promise<EmailSlice[]> {
  const { imageUrl, imageBase64, mimeType = "image/png" } = options;

  if (!imageUrl && !imageBase64) {
    throw new Error("sliceEmailImage: must provide either imageUrl or imageBase64");
  }

  // ── Step 1: Obtain raw image bytes ──────────────────────────────────────────
  let imageBytes: Uint8Array;

  if (imageBase64) {
    imageBytes = base64ToUint8Array(imageBase64);
  } else {
    const resp = await fetch(imageUrl!);
    if (!resp.ok) {
      throw new Error(`sliceEmailImage: failed to download image ${imageUrl}: ${resp.status} ${resp.statusText}`);
    }
    const buf = await resp.arrayBuffer();
    imageBytes = new Uint8Array(buf);
  }

  // ── Step 2: Decode image with ImageScript to get real dimensions + pixel data ──
  let decoded: Image;
  try {
    decoded = await Image.decode(imageBytes);
  } catch (e) {
    throw new Error(`sliceEmailImage: ImageScript could not decode image: ${e}`);
  }

  const originalWidth = decoded.width;
  const originalHeight = decoded.height;

  console.log(`[sliceEmailImage] Decoded image: ${originalWidth}x${originalHeight}px`);

  // ── Step 3: Run Vision OCR + whitespace detection in parallel ───────────────
  const [ocrParagraphs, whitespaceGaps] = await Promise.all([
    runGoogleVisionOcr(imageBytes, googleVisionApiKey),
    detectWhitespaceGaps(decoded, originalWidth, originalHeight),
  ]);

  console.log(
    `[sliceEmailImage] OCR paragraphs: ${ocrParagraphs.length}, whitespace gaps: ${whitespaceGaps.length}`
  );

  // ── Step 4: Short-circuit for images within Anthropic's height limit ────────
  if (originalHeight <= ANALYSIS_MAX_HEIGHT) {
    console.log("[sliceEmailImage] Image fits within 1568px — returning single detail slice, no Claude needed");
    return buildSlicesForShortImage({
      imageUrl,
      imageBase64,
      decoded,
      mimeType,
      originalHeight,
    });
  }

  // ── Step 5: Downscale image for Claude analysis ──────────────────────────────
  const scaleFactor = ANALYSIS_MAX_HEIGHT / originalHeight;
  const analysisHeight = Math.floor(originalHeight * scaleFactor);
  const analysisWidth = Math.max(1, Math.floor(originalWidth * scaleFactor));

  let analysisBase64: string;
  let analysisMediaType: string;

  if (imageUrl) {
    const analysisImageUrl = `${stripImageKitParams(imageUrl)}?tr=h-${analysisHeight},w-${analysisWidth},q-80,f-jpg`;
    const resp = await fetch(analysisImageUrl);
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      analysisBase64 = uint8ArrayToBase64(bytes);
      const ct = resp.headers.get("content-type")?.split(";")[0].trim();
      analysisMediaType = ct && ct.startsWith("image/") ? ct : "image/jpeg";
    } else {
      const resized = decoded.clone().resize(analysisWidth, analysisHeight);
      const encoded = await resized.encode(1);
      analysisBase64 = uint8ArrayToBase64(encoded);
      analysisMediaType = "image/png";
    }
  } else {
    const resized = decoded.clone().resize(analysisWidth, analysisHeight);
    const encoded = await resized.encode(1);
    analysisBase64 = uint8ArrayToBase64(encoded);
    analysisMediaType = "image/png";
  }

  const scaledOcr = ocrParagraphs.map((p) => ({
    yTop: Math.floor(p.yTop * scaleFactor),
    yBottom: Math.floor(p.yBottom * scaleFactor),
  }));
  const scaledGaps = whitespaceGaps.map((g) => ({
    yTop: Math.floor(g.yTop * scaleFactor),
    yBottom: Math.floor(g.yBottom * scaleFactor),
    height: Math.floor(g.height * scaleFactor),
  }));

  // ── Step 6: Ask Claude Sonnet for slice decisions ───────────────────────────
  const sliceDecisions = await askClaudeForSlices({
    base64Image: analysisBase64,
    mediaType: analysisMediaType,
    analysisWidth,
    analysisHeight,
    scaledOcrParagraphs: scaledOcr,
    scaledGaps,
    anthropicApiKey,
  });

  console.log("[sliceEmailImage] Claude slice decisions:", JSON.stringify(sliceDecisions));

  const originalSlices: SliceDecision[] = sliceDecisions
    .filter((s) => s.label !== "full-overview")
    .map((s) => ({
      yTop: Math.round(s.yTop / scaleFactor),
      yBottom: Math.round(s.yBottom / scaleFactor),
      label: s.label,
    }));

  // ── Step 7: Build output EmailSlice array ────────────────────────────────────
  return buildSlices({
    imageUrl,
    imageBase64,
    decoded,
    mimeType,
    originalHeight,
    originalWidth,
    sliceDecisions: originalSlices,
  });
}

// ─── Slice construction helpers ───────────────────────────────────────────────

async function buildSlicesForShortImage(params: {
  imageUrl?: string;
  imageBase64?: string;
  decoded: Image;
  mimeType: string;
  originalHeight: number;
}): Promise<EmailSlice[]> {
  const { imageUrl, imageBase64, decoded, mimeType, originalHeight } = params;
  const slices: EmailSlice[] = [];

  if (imageUrl) {
    const base = stripImageKitParams(imageUrl);
    slices.push({
      index: 0,
      label: "full-overview",
      url: `${base}?tr=h-${ANALYSIS_MAX_HEIGHT},fo-top,q-${IMAGEKIT_QUALITY},f-${IMAGEKIT_FORMAT}`,
      yTop: 0,
      yBottom: originalHeight,
    });
    slices.push({
      index: 1,
      label: "full-email",
      url: `${base}?tr=x-0,y-0,w-600,h-${originalHeight},cm-extract,q-${IMAGEKIT_QUALITY},f-${IMAGEKIT_FORMAT}`,
      yTop: 0,
      yBottom: originalHeight,
    });
  } else {
    const overviewBytes = await resizeToFit(decoded, ANALYSIS_MAX_HEIGHT);
    const overviewB64 = uint8ArrayToBase64(overviewBytes);
    slices.push({
      index: 0,
      label: "full-overview",
      url: `data:${mimeType};base64,${overviewB64}`,
      yTop: 0,
      yBottom: originalHeight,
    });
    const detailBytes = await decoded.encode(1);
    const detailB64 = uint8ArrayToBase64(detailBytes);
    slices.push({
      index: 1,
      label: "full-email",
      url: `data:${mimeType};base64,${detailB64}`,
      yTop: 0,
      yBottom: originalHeight,
    });
  }

  return slices;
}

async function buildSlices(params: {
  imageUrl?: string;
  imageBase64?: string;
  decoded: Image;
  mimeType: string;
  originalHeight: number;
  originalWidth: number;
  sliceDecisions: SliceDecision[];
}): Promise<EmailSlice[]> {
  const { imageUrl, imageBase64, decoded, mimeType, originalHeight, sliceDecisions } = params;
  const slices: EmailSlice[] = [];

  if (imageUrl) {
    const base = stripImageKitParams(imageUrl);

    slices.push({
      index: 0,
      label: "full-overview",
      url: `${base}?tr=h-${ANALYSIS_MAX_HEIGHT},fo-top,q-${IMAGEKIT_QUALITY},f-${IMAGEKIT_FORMAT}`,
      yTop: 0,
      yBottom: originalHeight,
    });

    sliceDecisions.forEach((s, i) => {
      const h = Math.max(1, s.yBottom - s.yTop);
      slices.push({
        index: i + 1,
        label: s.label,
        url: `${base}?tr=x-0,y-${s.yTop},w-600,h-${h},cm-extract,q-${IMAGEKIT_QUALITY},f-${IMAGEKIT_FORMAT}`,
        yTop: s.yTop,
        yBottom: s.yBottom,
      });
    });
  } else {
    const overviewBytes = await resizeToFit(decoded, ANALYSIS_MAX_HEIGHT);
    const overviewB64 = uint8ArrayToBase64(overviewBytes);
    slices.push({
      index: 0,
      label: "full-overview",
      url: `data:${mimeType};base64,${overviewB64}`,
      yTop: 0,
      yBottom: originalHeight,
    });

    for (let i = 0; i < sliceDecisions.length; i++) {
      const s = sliceDecisions[i];
      const h = Math.max(1, s.yBottom - s.yTop);
      const cropped = decoded.clone().crop(0, s.yTop, decoded.width, h);
      const croppedBytes = await cropped.encode(1);
      const croppedB64 = uint8ArrayToBase64(croppedBytes);
      slices.push({
        index: i + 1,
        label: s.label,
        url: `data:${mimeType};base64,${croppedB64}`,
        yTop: s.yTop,
        yBottom: s.yBottom,
      });
    }
  }

  return slices;
}

// ─── Google Vision OCR ────────────────────────────────────────────────────────

async function runGoogleVisionOcr(
  imageBytes: Uint8Array,
  apiKey: string
): Promise<OcrParagraph[]> {
  if (!apiKey) {
    console.warn("[sliceEmailImage] GOOGLE_CLOUD_VISION_API_KEY not set — skipping OCR");
    return [];
  }

  const base64 = uint8ArrayToBase64(imageBytes);

  const payload = {
    requests: [
      {
        image: { content: base64 },
        features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
      },
    ],
  };

  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[sliceEmailImage] Google Vision error: ${resp.status} ${errText}`);
    return [];
  }

  const data = await resp.json();
  const response = data.responses?.[0];

  if (!response || response.error) {
    console.error("[sliceEmailImage] Vision response error:", response?.error);
    return [];
  }

  const paragraphs: OcrParagraph[] = [];
  for (const page of response.fullTextAnnotation?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        const vertices = paragraph.boundingBox?.vertices ?? [];
        if (vertices.length < 4) continue;
        const ys = vertices.map((v: { x?: number; y?: number }) => v.y ?? 0);
        const yTop = Math.max(0, Math.min(...ys));
        const yBottom = Math.max(...ys);
        paragraphs.push({ yTop, yBottom });
      }
    }
  }

  return paragraphs;
}

// ─── Whitespace Gap Detection (ImageScript row-brightness scan) ────────────────

async function detectWhitespaceGaps(
  img: Image,
  width: number,
  height: number
): Promise<WhitespaceGap[]> {
  const gaps: WhitespaceGap[] = [];
  let gapStart: number | null = null;

  for (let y = 0; y < height; y++) {
    let rowBrightnessSum = 0;
    let sampledPixels = 0;

    for (let x = 0; x < width; x += 4) {
      const rgba = img.getPixelAt(x + 1, y + 1);
      if (!rgba) continue;
      const r = (rgba >> 24) & 0xff;
      const g = (rgba >> 16) & 0xff;
      const b = (rgba >> 8) & 0xff;
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      rowBrightnessSum += brightness;
      sampledPixels++;
    }

    const avgBrightness = sampledPixels > 0 ? rowBrightnessSum / sampledPixels : 0;
    const isNearWhite = avgBrightness >= BRIGHTNESS_THRESHOLD;

    if (isNearWhite) {
      if (gapStart === null) gapStart = y;
    } else {
      if (gapStart !== null) {
        const gapHeight = y - gapStart;
        if (gapHeight >= MIN_GAP_ROWS) {
          gaps.push({ yTop: gapStart, yBottom: y, height: gapHeight });
        }
        gapStart = null;
      }
    }
  }

  if (gapStart !== null) {
    const gapHeight = height - gapStart;
    if (gapHeight >= MIN_GAP_ROWS) {
      gaps.push({ yTop: gapStart, yBottom: height, height: gapHeight });
    }
  }

  return gaps;
}

// ─── Claude Slice Decision ────────────────────────────────────────────────────

async function askClaudeForSlices(params: {
  base64Image: string;
  mediaType: string;
  analysisWidth: number;
  analysisHeight: number;
  scaledOcrParagraphs: OcrParagraph[];
  scaledGaps: WhitespaceGap[];
  anthropicApiKey: string;
}): Promise<SliceDecision[]> {
  const {
    base64Image, mediaType, analysisWidth, analysisHeight,
    scaledOcrParagraphs, scaledGaps, anthropicApiKey,
  } = params;

  if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const systemPrompt = `You are an expert at analyzing email campaign layouts. Your job is to decide where to horizontally slice a reference email image into readable chunks for a vision AI.

Rules you MUST follow:
1. Output ONLY a raw JSON array. No explanation, no markdown, no code fences. Just the array.
2. Produce between 3 and 6 slices (NOT counting the full-overview entry).
3. Never cut through a text bounding box. The OCR data lists paragraph bounding boxes — no slice boundary (yTop or yBottom of any slice) may fall inside any paragraph's yTop–yBottom range.
4. Prefer cutting in whitespace gaps when gap data is available. Place cut points at the vertical center of a gap whenever possible.
5. Horizontal cuts ONLY. No vertical splits whatsoever.
6. Each slice should be roughly 200–600px tall in the analysis image you see (coordinates are in the ${analysisWidth}x${analysisHeight}px space).
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

  const userMessage = `Here is the email image at analysis resolution (${analysisWidth}x${analysisHeight}px).${ocrContext}${gapContext}

Decide where to slice this email into 3–6 horizontal chunks. Return ONLY the JSON array.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Image },
            },
            { type: "text", text: userMessage },
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
    if (
      typeof entry.yTop !== "number" ||
      typeof entry.yBottom !== "number" ||
      typeof entry.label !== "string"
    ) {
      throw new Error(`Claude slice entry missing required fields: ${JSON.stringify(entry)}`);
    }
  }

  return parsed;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function stripImageKitParams(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString();
  } catch {
    return url;
  }
}

async function resizeToFit(img: Image, maxHeight: number): Promise<Uint8Array> {
  if (img.height <= maxHeight) {
    return img.encode(1);
  }
  const scale = maxHeight / img.height;
  const newWidth = Math.max(1, Math.floor(img.width * scale));
  const resized = img.clone().resize(newWidth, maxHeight);
  return resized.encode(1);
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
