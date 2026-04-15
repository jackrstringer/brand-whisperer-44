// supabase/functions/_shared/sliceEmailImage.ts
// Agent 1 — Slicer: Content-aware email image slicing.
// Full pipeline: Google Vision (3 parallel calls) + pixel-level edge detection
// (delegated to detect-edges function) + Claude Sonnet semantic boundary detection
// + deterministic refinement.

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
}

// ─── Internal Types ───────────────────────────────────────────────────────────

interface OcrParagraph {
  yTop: number;
  yBottom: number;
  xLeft: number;
  xRight: number;
  text?: string;
}

interface DetectedObject {
  name: string;
  score: number;
  yTop: number;
  yBottom: number;
  xLeft: number;
  xRight: number;
}

interface DetectedLogo {
  description: string;
  yTop: number;
  yBottom: number;
  xLeft: number;
  xRight: number;
}

interface RawVisionData {
  paragraphs: OcrParagraph[];
  objects: DetectedObject[];
  logos: DetectedLogo[];
}

interface EdgeHint {
  y: number;
  strength: number;
  colorAbove: { r: number; g: number; b: number };
  colorBelow: { r: number; g: number; b: number };
}

interface ContentBand {
  yTop: number;
  yBottom: number;
  isFooterLikely?: boolean;
}

interface WhitespaceGap {
  gapStart: number;
  gapEnd: number;
  gapMid: number;
}

interface SliceDecision {
  y_start: number;
  y_end: number;
  module_type: string;
  section_label: string;
}

interface RefinementEvent {
  boundary_index: number;
  original_y: number;
  adjusted_y: number;
  reason: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_AI_DIMENSION = 4000;
const IMAGEKIT_QUALITY = 90;
const IMAGEKIT_FORMAT = "jpg";

// Refinement constants
const CONTENT_MARGIN = 8;
const MIN_GAP = 20;
const BOUNDARY_SEARCH_RADIUS = 160;
const NEAR_CONTENT_THRESHOLD = 12;

// Footer keywords
const FOOTER_KEYWORDS = [
  'unsubscribe', 'privacy', 'terms', 'view in browser', 'preferences',
  'all rights reserved', 'inc.', 'llc', 'copyright', '©',
  'no longer receive', 'opt out', 'manage preferences'
];

const SOCIAL_PLATFORMS = [
  'facebook', 'instagram', 'tiktok', 'youtube', 'twitter', 'x.com',
  'linkedin', 'pinterest', 'snapchat', 'threads'
];

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

  // ── Step 1: Get original image bytes ──────────────────────────────────────
  let imageBytes: Uint8Array;
  if (imageBase64) {
    imageBytes = base64ToUint8Array(imageBase64);
  } else {
    const resp = await fetch(imageUrl!);
    if (!resp.ok) throw new Error(`Failed to download image: ${resp.status}`);
    imageBytes = new Uint8Array(await resp.arrayBuffer());
  }

  // Get dimensions from image header (no full decode needed)
  let originalWidth: number;
  let originalHeight: number;
  try {
    ({ width: originalWidth, height: originalHeight } = parseImageDimensions(imageBytes));
  } catch {
    // If header parsing fails, we need to fetch dimensions another way
    // For ImageKit URLs, try metadata
    if (imageUrl && imageUrl.includes("ik.imagekit.io")) {
      // Use a small resize to get dimensions from response
      const probeUrl = `${stripImageKitParams(imageUrl)}?tr=w-1,q-1`;
      const probeResp = await fetch(probeUrl, { method: "HEAD" });
      const w = probeResp.headers.get("x-ik-width");
      const h = probeResp.headers.get("x-ik-height");
      if (w && h) {
        originalWidth = parseInt(w);
        originalHeight = parseInt(h);
      } else {
        throw new Error("Cannot determine image dimensions");
      }
    } else {
      throw new Error("Cannot determine image dimensions from header");
    }
  }

  console.log(`[sliceEmailImage] Image dimensions: ${originalWidth}x${originalHeight}px`);

  // ── Step 2a: Compute scale factor ─────────────────────────────────────────
  const maxDim = Math.max(originalWidth, originalHeight);
  const needsResize = maxDim > MAX_AI_DIMENSION;
  const scaleFactor = needsResize ? MAX_AI_DIMENSION / maxDim : 1;
  const aiWidth = Math.round(originalWidth * scaleFactor);
  const aiHeight = Math.round(originalHeight * scaleFactor);

  console.log(`[sliceEmailImage] Scale: ${scaleFactor.toFixed(3)}, AI space: ${aiWidth}x${aiHeight}`);

  // ── Step 2: Get resized image for Vision + Claude ─────────────────────────
  let aiBase64: string;
  let aiMediaType: string;

  if (needsResize && imageUrl && imageUrl.includes("ik.imagekit.io")) {
    // Use ImageKit server-side resize (zero local CPU)
    const resizedUrl = `${stripImageKitParams(imageUrl)}?tr=h-${aiHeight},w-${aiWidth},q-80,f-jpg`;
    const resp = await fetch(resizedUrl);
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      aiBase64 = uint8ArrayToBase64(new Uint8Array(buf));
      aiMediaType = "image/jpeg";
    } else {
      aiBase64 = uint8ArrayToBase64(imageBytes);
      aiMediaType = mimeType;
    }
  } else {
    aiBase64 = uint8ArrayToBase64(imageBytes);
    aiMediaType = mimeType;
  }

  // ── Steps 2b-2c: Vision API + Edge Detection in parallel ──────────────────
  // Edge detection is delegated to a separate function (uses jpeg-js, not ImageScript)
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const [visionData, edges] = await Promise.all([
    runGoogleVision3Way(aiBase64, googleVisionApiKey, aiWidth, aiHeight),
    callDetectEdgesFunction(aiBase64, SUPABASE_URL, SERVICE_KEY),
  ]);

  console.log(`[sliceEmailImage] Vision: ${visionData.paragraphs.length} paragraphs, ${visionData.objects.length} objects, ${visionData.logos.length} logos`);
  console.log(`[sliceEmailImage] Edge detection: ${edges.length} edges`);

  // Vision data is already in AI-resized space (since we sent the resized image).
  // Edges are also in AI space.

  // ── Step 3: Claude Sonnet — semantic module detection ─────────────────────
  const modules = await askClaudeForModules({
    base64Image: aiBase64,
    mediaType: aiMediaType,
    imageW: aiWidth,
    imageH: aiHeight,
    vision: visionData,
    edges,
    anthropicApiKey,
  });

  console.log(`[sliceEmailImage] Claude proposed ${modules.length} modules`);

  // ── Step 3b: Deterministic boundary refinement ────────────────────────────
  const refinementEvents: RefinementEvent[] = [];
  const refined = refineBoundaries(modules, visionData, edges, aiHeight, refinementEvents);

  if (refinementEvents.length > 0) {
    console.log(`[sliceEmailImage] Refinement: ${refinementEvents.length} adjustments`);
    for (const evt of refinementEvents) {
      console.log(`  [refine] boundary ${evt.boundary_index}: ${evt.original_y} → ${evt.adjusted_y} (${evt.reason})`);
    }
  }

  // ── Step 3c: Scale back to original coordinates ───────────────────────────
  const originalModules = refined.map((m, i) => ({
    ...m,
    y_start: i === 0 ? 0 : Math.round(m.y_start / scaleFactor),
    y_end: i === refined.length - 1 ? originalHeight : Math.round(m.y_end / scaleFactor),
  }));

  // ── Step 4: Build output slices ───────────────────────────────────────────
  return buildSlices({
    imageUrl,
    imageBase64,
    mimeType,
    originalWidth,
    originalHeight,
    modules: originalModules,
  });
}

// ─── Call detect-edges edge function (separate worker, uses jpeg-js) ─────────

async function callDetectEdgesFunction(
  imageBase64: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<EdgeHint[]> {
  if (!supabaseUrl || !serviceKey) {
    console.warn("[sliceEmailImage] Missing SUPABASE_URL/SERVICE_KEY — skipping edge detection");
    return [];
  }

  try {
    // Detect if the image is JPEG by checking the base64 header bytes
    // JPEG starts with /9j/ in base64 (FF D8 FF). If not JPEG, skip edge detection
    // since detect-edges uses jpeg-js which only handles JPEG.
    const isJpeg = imageBase64.startsWith("/9j/") || imageBase64.startsWith("/9j+");
    if (!isJpeg) {
      console.log("[sliceEmailImage] Image is not JPEG — skipping pixel-level edge detection (jpeg-js only)");
      return [];
    }

    const resp = await fetch(`${supabaseUrl}/functions/v1/detect-edges`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imageBase64 }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[sliceEmailImage] detect-edges error: ${resp.status} ${errText}`);
      return [];
    }

    const result = await resp.json();
    return (result.edges || []).map((e: any) => ({
      y: e.y,
      strength: e.strength,
      colorAbove: e.colorAbove,
      colorBelow: e.colorBelow,
    }));
  } catch (err) {
    console.error("[sliceEmailImage] detect-edges call failed:", err);
    return [];
  }
}

// ─── Google Vision: 3 parallel calls ─────────────────────────────────────────

async function runGoogleVision3Way(
  base64: string,
  apiKey: string,
  imgW: number,
  imgH: number
): Promise<RawVisionData> {
  if (!apiKey) {
    console.warn("[sliceEmailImage] GOOGLE_CLOUD_VISION_API_KEY not set — skipping Vision");
    return { paragraphs: [], objects: [], logos: [] };
  }

  const requests = [
    { image: { content: base64 }, features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }] },
    { image: { content: base64 }, features: [{ type: "OBJECT_LOCALIZATION", maxResults: 50 }] },
    { image: { content: base64 }, features: [{ type: "LOGO_DETECTION", maxResults: 10 }] },
  ];

  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[sliceEmailImage] Google Vision error: ${resp.status} ${errText}`);
    return { paragraphs: [], objects: [], logos: [] };
  }

  const data = await resp.json();
  const responses = data.responses ?? [];

  // Parse OCR paragraphs
  const paragraphs: OcrParagraph[] = [];
  const ocrResp = responses[0];
  if (ocrResp && !ocrResp.error) {
    for (const page of ocrResp.fullTextAnnotation?.pages ?? []) {
      for (const block of page.blocks ?? []) {
        for (const paragraph of block.paragraphs ?? []) {
          const vertices = paragraph.boundingBox?.vertices ?? [];
          if (vertices.length < 4) continue;
          const xs = vertices.map((v: any) => v.x ?? 0);
          const ys = vertices.map((v: any) => v.y ?? 0);
          // Extract text from words
          let text = "";
          for (const word of paragraph.words ?? []) {
            for (const sym of word.symbols ?? []) {
              text += sym.text ?? "";
              if (sym.property?.detectedBreak?.type === "SPACE") text += " ";
            }
            text += " ";
          }
          paragraphs.push({
            yTop: Math.max(0, Math.min(...ys)),
            yBottom: Math.max(...ys),
            xLeft: Math.max(0, Math.min(...xs)),
            xRight: Math.max(...xs),
            text: text.trim(),
          });
        }
      }
    }
  }

  // Parse objects (normalized bounding poly → pixel coords)
  const objects: DetectedObject[] = [];
  const objResp = responses[1];
  if (objResp && !objResp.error) {
    for (const ann of objResp.localizedObjectAnnotations ?? []) {
      const verts = ann.boundingPoly?.normalizedVertices ?? [];
      if (verts.length < 4) continue;
      const xs = verts.map((v: any) => (v.x ?? 0) * imgW);
      const ys = verts.map((v: any) => (v.y ?? 0) * imgH);
      objects.push({
        name: ann.name ?? "unknown",
        score: ann.score ?? 0,
        yTop: Math.max(0, Math.min(...ys)),
        yBottom: Math.max(...ys),
        xLeft: Math.max(0, Math.min(...xs)),
        xRight: Math.max(...xs),
      });
    }
  }

  // Parse logos
  const logos: DetectedLogo[] = [];
  const logoResp = responses[2];
  if (logoResp && !logoResp.error) {
    for (const ann of logoResp.logoAnnotations ?? []) {
      const vertices = ann.boundingPoly?.vertices ?? [];
      if (vertices.length < 4) continue;
      const xs = vertices.map((v: any) => v.x ?? 0);
      const ys = vertices.map((v: any) => v.y ?? 0);
      logos.push({
        description: ann.description ?? "",
        yTop: Math.max(0, Math.min(...ys)),
        yBottom: Math.max(...ys),
        xLeft: Math.max(0, Math.min(...xs)),
        xRight: Math.max(...xs),
      });
    }
  }

  return { paragraphs, objects, logos };
}

// ─── Claude Sonnet — Semantic Module Detection ──────────────────────────────

async function askClaudeForModules(params: {
  base64Image: string;
  mediaType: string;
  imageW: number;
  imageH: number;
  vision: RawVisionData;
  edges: EdgeHint[];
  anthropicApiKey: string;
}): Promise<SliceDecision[]> {
  const { base64Image, mediaType, imageW, imageH, vision, edges, anthropicApiKey } = params;
  if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const systemPrompt = `You are an expert at analyzing email campaign layouts. You decompose a full-length email screenshot into semantically meaningful marketing sections (modules).

Rules:
1. A "section" is a complete marketing unit (headline → supporting copy → CTA), not a visual element.
2. Images are incidental — decorative imagery belongs to the nearest text-driven section.
3. Only 3 module types: hero, content_block, footer.
4. Target 2-5 sections total (aggressive merging).
5. CTA buttons always belong to the section above.
6. Standard section labels only: Hero Section, Value Proposition Section, Product Highlight Section, Social Proof Section, Closing Section, Footer.
7. First module starts at y_start: 0, last ends at y_end: ${imageH}. No gaps.
8. Output ONLY valid JSON. No markdown, no explanation.

Output format:
{
  "reasoning": "brief explanation",
  "modules": [
    { "y_start": 0, "y_end": 450, "module_type": "hero", "section_label": "Hero Section" },
    { "y_start": 450, "y_end": 1200, "module_type": "content_block", "section_label": "Product Highlight Section" },
    { "y_start": 1200, "y_end": ${imageH}, "module_type": "footer", "section_label": "Footer" }
  ]
}`;

  const ocrContext = vision.paragraphs.length > 0
    ? `\n\nOCR text blocks (${vision.paragraphs.length} paragraphs) — NEVER cut through these:\n${JSON.stringify(vision.paragraphs.slice(0, 60).map(p => ({ yTop: p.yTop, yBottom: p.yBottom, text: (p.text || "").substring(0, 40) })), null, 1)}`
    : "";

  const objectContext = vision.objects.length > 0
    ? `\n\nDetected objects (${vision.objects.length}):\n${JSON.stringify(vision.objects.slice(0, 30), null, 1)}`
    : "";

  const logoContext = vision.logos.length > 0
    ? `\n\nDetected logos (${vision.logos.length}):\n${JSON.stringify(vision.logos, null, 1)}`
    : "";

  const edgeContext = edges.length > 0
    ? `\n\nBackground transition edges (${edges.length} — strong horizontal color changes, good cut candidates):\n${JSON.stringify(edges.map(e => ({ y: e.y, strength: e.strength, colorAbove: `rgb(${e.colorAbove.r},${e.colorAbove.g},${e.colorAbove.b})`, colorBelow: `rgb(${e.colorBelow.r},${e.colorBelow.g},${e.colorBelow.b})` })), null, 1)}`
    : "";

  const userMessage = `Email image dimensions: ${imageW}x${imageH}px.${ocrContext}${objectContext}${logoContext}${edgeContext}

Identify the semantic sections of this email and return module boundaries as JSON.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
          { type: "text", text: userMessage },
        ],
      }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Claude API error: ${resp.status} ${errText}`);
  }

  const message = await resp.json();
  const rawText = message.content?.find((b: any) => b.type === "text")?.text?.trim() ?? "";

  let parsed: any;
  try {
    let cleaned = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    // Attempt JSON recovery if truncated — try closing open braces/brackets
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Count open vs close braces and brackets
      const openBraces = (cleaned.match(/{/g) || []).length;
      const closeBraces = (cleaned.match(/}/g) || []).length;
      const openBrackets = (cleaned.match(/\[/g) || []).length;
      const closeBrackets = (cleaned.match(/\]/g) || []).length;
      // Remove any trailing comma or partial key
      cleaned = cleaned.replace(/,\s*$/, "").replace(/,\s*"[^"]*$/, "");
      // Close any open brackets then braces
      for (let i = 0; i < openBrackets - closeBrackets; i++) cleaned += "]";
      for (let i = 0; i < openBraces - closeBraces; i++) cleaned += "}";
      parsed = JSON.parse(cleaned);
      console.warn(`[sliceEmailImage] Recovered truncated JSON (closed ${openBraces - closeBraces} braces, ${openBrackets - closeBrackets} brackets)`);
    }
  } catch (e) {
    throw new Error(`Claude returned unparseable JSON: ${rawText.substring(0, 500)}\n${e}`);
  }

  const modules: SliceDecision[] = parsed.modules ?? parsed;
  if (!Array.isArray(modules) || modules.length < 2) {
    throw new Error(`Claude returned invalid modules (expected 2+): ${rawText.substring(0, 300)}`);
  }

  for (const m of modules) {
    if (typeof m.y_start !== "number" || typeof m.y_end !== "number") {
      throw new Error(`Module missing y_start/y_end: ${JSON.stringify(m)}`);
    }
  }

  return modules;
}

// ─── Deterministic Boundary Refinement ──────────────────────────────────────

function refineBoundaries(
  modules: SliceDecision[],
  vision: RawVisionData,
  edges: EdgeHint[],
  imageH: number,
  events: RefinementEvent[]
): SliceDecision[] {
  const rawBands: ContentBand[] = [];

  for (const p of vision.paragraphs) {
    const textLower = (p.text ?? "").toLowerCase();
    const isFooterLikely = FOOTER_KEYWORDS.some(kw => textLower.includes(kw));
    rawBands.push({
      yTop: p.yTop - CONTENT_MARGIN,
      yBottom: p.yBottom + CONTENT_MARGIN,
      isFooterLikely,
    });
  }

  for (const o of vision.objects) {
    rawBands.push({ yTop: o.yTop - CONTENT_MARGIN, yBottom: o.yBottom + CONTENT_MARGIN });
  }

  for (const l of vision.logos) {
    const isSocial = SOCIAL_PLATFORMS.some(p => l.description.toLowerCase().includes(p));
    rawBands.push({
      yTop: l.yTop - CONTENT_MARGIN,
      yBottom: l.yBottom + CONTENT_MARGIN,
      isFooterLikely: isSocial,
    });
  }

  rawBands.sort((a, b) => a.yTop - b.yTop);
  const mergedBands: ContentBand[] = [];
  for (const band of rawBands) {
    const last = mergedBands[mergedBands.length - 1];
    if (last && band.yTop <= last.yBottom) {
      last.yBottom = Math.max(last.yBottom, band.yBottom);
      if (band.isFooterLikely) last.isFooterLikely = true;
    } else {
      mergedBands.push({ ...band });
    }
  }

  // Compute whitespace gaps
  const gaps: WhitespaceGap[] = [];
  for (let i = 0; i < mergedBands.length - 1; i++) {
    const gapStart = mergedBands[i].yBottom;
    const gapEnd = mergedBands[i + 1].yTop;
    if (gapEnd - gapStart >= MIN_GAP) {
      gaps.push({ gapStart, gapEnd, gapMid: Math.round((gapStart + gapEnd) / 2) });
    }
  }

  const result = modules.map(m => ({ ...m }));

  // Helper: find nearest edge
  function findNearestEdge(y: number, radius: number): number | null {
    let nearest: EdgeHint | null = null;
    let nearestDist = Infinity;
    for (const edge of edges) {
      const dist = Math.abs(edge.y - y);
      if (dist <= radius && dist < nearestDist) {
        nearest = edge;
        nearestDist = dist;
      }
    }
    return nearest ? nearest.y : null;
  }

  // Helper: find nearest gap mid
  function findNearestGapMid(y: number, radius: number): number | null {
    let nearest: WhitespaceGap | null = null;
    let nearestDist = Infinity;
    for (const gap of gaps) {
      const dist = Math.abs(gap.gapMid - y);
      if (dist <= radius && dist < nearestDist) {
        nearest = gap;
        nearestDist = dist;
      }
    }
    return nearest ? nearest.gapMid : null;
  }

  for (let i = 0; i < result.length - 1; i++) {
    const boundaryY = result[i].y_end;
    const nextModule = result[i + 1];
    const isFooterBoundary = nextModule.module_type === "footer" || nextModule.section_label === "Footer";

    let adjustedY = boundaryY;

    if (isFooterBoundary) {
      // Priority 1: Dark background transition edge within 50px
      const nearbyEdgeY = findNearestEdge(boundaryY, 50);
      if (nearbyEdgeY !== null) {
        const edge = edges.find(e => Math.abs(e.y - nearbyEdgeY) < 3);
        if (edge && edge.colorBelow.r < 60 && edge.colorBelow.g < 60 && edge.colorBelow.b < 60) {
          adjustedY = nearbyEdgeY;
          events.push({
            boundary_index: i,
            original_y: boundaryY,
            adjusted_y: adjustedY,
            reason: `Footer dark edge snap (rgb ${edge.colorBelow.r},${edge.colorBelow.g},${edge.colorBelow.b})`,
          });
        }
      }

      // Priority 2: Footer keyword midpoint
      if (adjustedY === boundaryY) {
        const footerBands = mergedBands.filter(b => b.isFooterLikely && b.yTop > boundaryY - 100);
        const lastMarketing = mergedBands.filter(b => !b.isFooterLikely && b.yBottom < boundaryY + 100).pop();
        if (footerBands.length > 0 && lastMarketing) {
          const mid = Math.round((lastMarketing.yBottom + footerBands[0].yTop) / 2);
          const nearEdge = findNearestEdge(mid, 30);
          adjustedY = nearEdge ?? mid;
          events.push({
            boundary_index: i,
            original_y: boundaryY,
            adjusted_y: adjustedY,
            reason: nearEdge ? "Footer keyword + edge snap" : "Footer keyword midpoint",
          });
        }
      }
    } else {
      // General case: check if boundary is near content
      const isNearContent = mergedBands.some(b =>
        boundaryY >= b.yTop - NEAR_CONTENT_THRESHOLD &&
        boundaryY <= b.yBottom + NEAR_CONTENT_THRESHOLD
      );

      if (isNearContent) {
        // Search for nearest gap midpoint or edge
        const gapMid = findNearestGapMid(boundaryY, BOUNDARY_SEARCH_RADIUS);
        const edgeY = findNearestEdge(boundaryY, BOUNDARY_SEARCH_RADIUS);

        // Pick the closest one that's not inside content
        let bestCandidate: number | null = null;
        let bestDist = BOUNDARY_SEARCH_RADIUS + 1;

        for (const candidate of [gapMid, edgeY]) {
          if (candidate === null) continue;
          const dist = Math.abs(candidate - boundaryY);
          if (dist < bestDist) {
            const inContent = mergedBands.some(b => candidate >= b.yTop && candidate <= b.yBottom);
            if (!inContent) {
              bestDist = dist;
              bestCandidate = candidate;
            }
          }
        }

        if (bestCandidate !== null) {
          adjustedY = bestCandidate;
          events.push({
            boundary_index: i,
            original_y: boundaryY,
            adjusted_y: adjustedY,
            reason: `Content avoidance: snapped to gap/edge at ${adjustedY}`,
          });
        }
      }
    }

    result[i].y_end = adjustedY;
    result[i + 1].y_start = adjustedY;
  }

  result[0].y_start = 0;
  result[result.length - 1].y_end = imageH;

  return result;
}

// ─── Slice construction ─────────────────────────────────────────────────────

function buildSlices(params: {
  imageUrl?: string;
  imageBase64?: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  modules: SliceDecision[];
}): EmailSlice[] {
  const { imageUrl, imageBase64, mimeType, originalWidth, originalHeight, modules } = params;
  const slices: EmailSlice[] = [];

  if (imageUrl) {
    const base = stripImageKitParams(imageUrl);

    // Full overview
    slices.push({
      index: 0,
      label: "full-overview",
      url: `${base}?tr=h-1568,fo-top,q-${IMAGEKIT_QUALITY},f-${IMAGEKIT_FORMAT}`,
      yTop: 0,
      yBottom: originalHeight,
    });

    // Module slices via ImageKit crop
    modules.forEach((m, i) => {
      const h = Math.max(1, m.y_end - m.y_start);
      slices.push({
        index: i + 1,
        label: m.section_label || m.module_type,
        url: `${base}?tr=x-0,y-${m.y_start},w-${originalWidth},h-${h},cm-extract,q-${IMAGEKIT_QUALITY},f-${IMAGEKIT_FORMAT}`,
        yTop: m.y_start,
        yBottom: m.y_end,
      });
    });
  } else {
    // Base64 mode — return data URIs with crop markers for the wrapper to resolve
    slices.push({
      index: 0,
      label: "full-overview",
      url: `data:${mimeType};base64,${imageBase64}`,
      yTop: 0,
      yBottom: originalHeight,
    });

    modules.forEach((m, i) => {
      slices.push({
        index: i + 1,
        label: m.section_label || m.module_type,
        url: `CROP:${m.y_start}:${m.y_end}`,
        yTop: m.y_start,
        yBottom: m.y_end,
      });
    });
  }

  return slices;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function stripImageKitParams(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    return u.toString();
  } catch {
    return url;
  }
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

/** Parse image dimensions from PNG or JPEG header without full decode */
function parseImageDimensions(bytes: Uint8Array): { width: number; height: number } {
  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }

  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length - 8) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      if (marker >= 0xc0 && marker <= 0xc3) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return { width, height };
      }
      const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 2 + segLen;
    }
  }

  throw new Error("Cannot parse image dimensions from header");
}
