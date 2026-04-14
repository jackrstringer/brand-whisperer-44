// supabase/functions/_shared/sliceEmailImage.ts
// Agent 1 — Slicer: Content-aware email image slicing.
// Full pipeline: Google Vision (3 parallel calls) + pixel-level edge detection +
// Claude Sonnet semantic boundary detection + deterministic refinement.
// Called by slice-reference and slice-image-on-demand.

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
  colorAbove: [number, number, number];
  colorBelow: [number, number, number];
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

// Edge detection constants
const EDGE_THRESH = 35;
const EDGE_MIN_STRIPS = 2;
const EDGE_MERGE_DIST = 4;
const EDGE_MIN_SPACE = 25;
const EDGE_MAX = 30;

// Refinement constants
const CONTENT_MARGIN = 8;
const MIN_GAP = 20;
const BOUNDARY_SEARCH_RADIUS = 160;
const NEAR_CONTENT_THRESHOLD = 12;

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

  // ── Step 1: Get original image bytes and dimensions ────────────────────────
  let imageBytes: Uint8Array;
  if (imageBase64) {
    imageBytes = base64ToUint8Array(imageBase64);
  } else {
    const resp = await fetch(imageUrl!);
    if (!resp.ok) throw new Error(`Failed to download image: ${resp.status}`);
    imageBytes = new Uint8Array(await resp.arrayBuffer());
  }

  // Get dimensions from the image — use ImageKit metadata if available, else decode header
  let originalWidth: number;
  let originalHeight: number;

  if (imageUrl && imageUrl.includes("ik.imagekit.io")) {
    // Use ImageKit metadata endpoint for dimensions without decoding
    try {
      const metaUrl = `${stripImageKitParams(imageUrl)}?tr=md-true`;
      const metaResp = await fetch(metaUrl, { method: "HEAD" });
      const w = metaResp.headers.get("x-ik-width");
      const h = metaResp.headers.get("x-ik-height");
      if (w && h) {
        originalWidth = parseInt(w);
        originalHeight = parseInt(h);
      } else {
        // Fallback: decode PNG/JPEG header
        ({ width: originalWidth, height: originalHeight } = parseImageDimensions(imageBytes));
      }
    } catch {
      ({ width: originalWidth, height: originalHeight } = parseImageDimensions(imageBytes));
    }
  } else {
    ({ width: originalWidth, height: originalHeight } = parseImageDimensions(imageBytes));
  }

  console.log(`[sliceEmailImage] Image dimensions: ${originalWidth}x${originalHeight}px`);

  // ── Step 2a: Compute scale factor for AI coordinate space ──────────────────
  const maxDim = Math.max(originalWidth, originalHeight);
  const needsResize = maxDim > MAX_AI_DIMENSION;
  const scaleFactor = needsResize ? MAX_AI_DIMENSION / maxDim : 1;
  const aiWidth = Math.floor(originalWidth * scaleFactor);
  const aiHeight = Math.floor(originalHeight * scaleFactor);

  console.log(`[sliceEmailImage] Scale factor: ${scaleFactor.toFixed(3)}, AI space: ${aiWidth}x${aiHeight}`);

  // ── Step 2b-2c: Run Vision API (3 calls) + edge detection in parallel ──────
  // Get resized image for edge detection + Claude
  let resizedBase64: string;
  let resizedMediaType: string;

  if (needsResize && imageUrl && imageUrl.includes("ik.imagekit.io")) {
    const resizedUrl = `${stripImageKitParams(imageUrl)}?tr=h-${aiHeight},w-${aiWidth},q-80,f-jpg`;
    const resp = await fetch(resizedUrl);
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      resizedBase64 = uint8ArrayToBase64(new Uint8Array(buf));
      resizedMediaType = "image/jpeg";
    } else {
      resizedBase64 = uint8ArrayToBase64(imageBytes);
      resizedMediaType = mimeType;
    }
  } else {
    resizedBase64 = uint8ArrayToBase64(imageBytes);
    resizedMediaType = needsResize ? mimeType : mimeType;
  }

  const visionBase64 = uint8ArrayToBase64(imageBytes);

  const [visionData, edges] = await Promise.all([
    runGoogleVision3Way(visionBase64, googleVisionApiKey, originalWidth, originalHeight),
    detectEdgesFromImage(imageBytes, originalWidth, originalHeight),
  ]);

  console.log(`[sliceEmailImage] Vision: ${visionData.paragraphs.length} paragraphs, ${visionData.objects.length} objects, ${visionData.logos.length} logos`);
  console.log(`[sliceEmailImage] Edge detection: ${edges.length} edges`);

  // ── Step 2d: Scale all coordinates into AI space ───────────────────────────
  const scaledVision = scaleVisionData(visionData, scaleFactor);
  const scaledEdges = edges.map(e => ({
    ...e,
    y: Math.floor(e.y * scaleFactor),
  }));

  // ── Step 3: Claude Sonnet — semantic module detection ──────────────────────
  const modules = await askClaudeForModules({
    base64Image: resizedBase64,
    mediaType: resizedMediaType,
    imageW: aiWidth,
    imageH: aiHeight,
    vision: scaledVision,
    edges: scaledEdges,
    anthropicApiKey,
  });

  console.log(`[sliceEmailImage] Claude proposed ${modules.length} modules`);

  // ── Step 3b: Deterministic boundary refinement ─────────────────────────────
  const refinementEvents: RefinementEvent[] = [];
  const refined = refineBoundaries(modules, scaledVision, scaledEdges, aiHeight, refinementEvents);

  if (refinementEvents.length > 0) {
    console.log(`[sliceEmailImage] Refinement: ${refinementEvents.length} adjustments`);
    for (const evt of refinementEvents) {
      console.log(`  [refine] boundary ${evt.boundary_index}: ${evt.original_y} → ${evt.adjusted_y} (${evt.reason})`);
    }
  }

  // ── Step 3c: Scale back to original coordinates ────────────────────────────
  const originalModules = refined.map((m, i) => ({
    ...m,
    y_start: i === 0 ? 0 : Math.round(m.y_start / scaleFactor),
    y_end: i === refined.length - 1 ? originalHeight : Math.round(m.y_end / scaleFactor),
  }));

  // ── Step 4: Build output slices using ImageKit crop URLs ───────────────────
  return buildSlices({
    imageUrl,
    imageBase64,
    mimeType,
    originalWidth,
    originalHeight,
    modules: originalModules,
  });
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
          paragraphs.push({
            yTop: Math.max(0, Math.min(...ys)),
            yBottom: Math.max(...ys),
            xLeft: Math.max(0, Math.min(...xs)),
            xRight: Math.max(...xs),
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

// ─── Pixel-Level Edge Detection ──────────────────────────────────────────────

async function detectEdgesFromImage(
  imageBytes: Uint8Array,
  width: number,
  height: number,
): Promise<EdgeHint[]> {
  // Decode the image to get pixel data — use ImageScript
  const { Image } = await import("https://deno.land/x/imagescript@1.3.0/mod.ts");
  let decoded;
  try {
    decoded = await Image.decode(imageBytes);
  } catch (e) {
    console.warn(`[sliceEmailImage] Edge detection: could not decode image: ${e}`);
    return [];
  }

  const w = decoded.width;
  const h = decoded.height;

  // Define three vertical strips: left gutter, center, right gutter
  const strips = [
    { start: Math.floor(w * 0.00), end: Math.floor(w * 0.12) }, // left 0-12%
    { start: Math.floor(w * 0.44), end: Math.floor(w * 0.56) }, // center 44-56%
    { start: Math.floor(w * 0.88), end: Math.floor(w * 1.00) }, // right 88-100%
  ];

  // For each row, compute average RGB per strip
  function getRowStripColors(y: number): Array<[number, number, number]> {
    return strips.map(strip => {
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let x = strip.start; x < strip.end; x += 2) {
        const rgba = decoded.getPixelAt(x + 1, y + 1);
        if (!rgba) continue;
        rSum += (rgba >> 24) & 0xff;
        gSum += (rgba >> 16) & 0xff;
        bSum += (rgba >> 8) & 0xff;
        count++;
      }
      if (count === 0) return [0, 0, 0] as [number, number, number];
      return [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)] as [number, number, number];
    });
  }

  function colorDist(a: [number, number, number], b: [number, number, number]): number {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  }

  // Scan rows for color transitions
  const rawEdges: Array<{ y: number; strength: number; colorAbove: [number, number, number]; colorBelow: [number, number, number] }> = [];

  let prevColors = getRowStripColors(0);

  for (let y = 1; y < h; y++) {
    const currColors = getRowStripColors(y);
    const dists = strips.map((_, i) => colorDist(prevColors[i], currColors[i]));

    // Check: both gutters exceed threshold, or at least 2 of 3 strips
    const leftExceeds = dists[0] >= EDGE_THRESH;
    const rightExceeds = dists[2] >= EDGE_THRESH;
    const exceedCount = dists.filter(d => d >= EDGE_THRESH).length;

    if ((leftExceeds && rightExceeds) || exceedCount >= EDGE_MIN_STRIPS) {
      const maxDist = Math.max(...dists);
      // Average color above/below from center strip
      rawEdges.push({
        y,
        strength: maxDist,
        colorAbove: prevColors[1],
        colorBelow: currColors[1],
      });
    }

    prevColors = currColors;
  }

  // Merge edges within EDGE_MERGE_DIST, keeping strongest
  const merged: typeof rawEdges = [];
  for (const edge of rawEdges) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(edge.y - last.y) <= EDGE_MERGE_DIST) {
      if (edge.strength > last.strength) {
        merged[merged.length - 1] = edge;
      }
    } else {
      merged.push(edge);
    }
  }

  // Enforce minimum spacing
  const spaced: typeof rawEdges = [];
  for (const edge of merged) {
    const last = spaced[spaced.length - 1];
    if (!last || Math.abs(edge.y - last.y) >= EDGE_MIN_SPACE) {
      spaced.push(edge);
    } else if (edge.strength > last.strength) {
      spaced[spaced.length - 1] = edge;
    }
  }

  // Keep top EDGE_MAX by strength, then re-sort by Y
  const sorted = [...spaced].sort((a, b) => b.strength - a.strength).slice(0, EDGE_MAX);
  sorted.sort((a, b) => a.y - b.y);

  return sorted.map(e => ({
    y: e.y,
    strength: Math.round(e.strength),
    colorAbove: e.colorAbove,
    colorBelow: e.colorBelow,
  }));
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
  "reasoning": "brief explanation of slicing decisions",
  "modules": [
    { "y_start": 0, "y_end": 450, "module_type": "hero", "section_label": "Hero Section" },
    { "y_start": 450, "y_end": 1200, "module_type": "content_block", "section_label": "Product Highlight Section" },
    { "y_start": 1200, "y_end": ${imageH}, "module_type": "footer", "section_label": "Footer" }
  ]
}`;

  // Build structured context
  const ocrContext = vision.paragraphs.length > 0
    ? `\n\nOCR text blocks (${vision.paragraphs.length} paragraphs) — NEVER cut through these:\n${JSON.stringify(vision.paragraphs.slice(0, 60), null, 1)}`
    : "";

  const objectContext = vision.objects.length > 0
    ? `\n\nDetected objects (${vision.objects.length}):\n${JSON.stringify(vision.objects.slice(0, 30), null, 1)}`
    : "";

  const logoContext = vision.logos.length > 0
    ? `\n\nDetected logos (${vision.logos.length}):\n${JSON.stringify(vision.logos, null, 1)}`
    : "";

  const edgeContext = edges.length > 0
    ? `\n\nBackground transition edges (${edges.length} — these are strong horizontal color changes, good cut candidates):\n${JSON.stringify(edges.map(e => ({ y: e.y, strength: e.strength, colorAbove: `rgb(${e.colorAbove.join(",")})`, colorBelow: `rgb(${e.colorBelow.join(",")})` })), null, 1)}`
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
      max_tokens: 2048,
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
    const cleaned = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Claude returned unparseable JSON: ${rawText.substring(0, 500)}\n${e}`);
  }

  const modules: SliceDecision[] = parsed.modules ?? parsed;
  if (!Array.isArray(modules) || modules.length < 2) {
    throw new Error(`Claude returned invalid modules (expected 2+): ${rawText.substring(0, 300)}`);
  }

  // Validate structure
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
  // Build content bands from OCR, objects, logos
  const rawBands: ContentBand[] = [];

  for (const p of vision.paragraphs) {
    const text = (p as any).text?.toLowerCase() ?? "";
    const isFooter = /unsubscribe|privacy|terms|©|copyright/.test(text);
    rawBands.push({
      yTop: p.yTop - CONTENT_MARGIN,
      yBottom: p.yBottom + CONTENT_MARGIN,
      isFooterLikely: isFooter,
    });
  }

  for (const o of vision.objects) {
    rawBands.push({ yTop: o.yTop - CONTENT_MARGIN, yBottom: o.yBottom + CONTENT_MARGIN });
  }

  // Social media logos are footer-likely
  const socialKeywords = /facebook|instagram|twitter|tiktok|youtube|pinterest|linkedin/i;
  for (const l of vision.logos) {
    rawBands.push({
      yTop: l.yTop - CONTENT_MARGIN,
      yBottom: l.yBottom + CONTENT_MARGIN,
      isFooterLikely: socialKeywords.test(l.description),
    });
  }

  // Merge overlapping bands
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

  // Clone modules for refinement
  const result = modules.map(m => ({ ...m }));

  // Validate each inter-module boundary
  for (let i = 0; i < result.length - 1; i++) {
    const boundaryY = result[i].y_end;
    const nextModule = result[i + 1];

    // Check if this is a footer boundary
    const isFooterBoundary = nextModule.module_type === "footer" || nextModule.section_label === "Footer";

    let adjustedY = boundaryY;

    if (isFooterBoundary) {
      // Priority 1: Look for full-bleed dark edge within 50px
      const nearbyDarkEdge = edges.find(e =>
        Math.abs(e.y - boundaryY) <= 50 &&
        e.colorBelow[0] < 60 && e.colorBelow[1] < 60 && e.colorBelow[2] < 60
      );

      if (nearbyDarkEdge) {
        adjustedY = nearbyDarkEdge.y;
        events.push({
          boundary_index: i,
          original_y: boundaryY,
          adjusted_y: adjustedY,
          reason: `Footer dark edge snap (rgb ${nearbyDarkEdge.colorBelow.join(",")})`,
        });
      } else {
        // Priority 2: Footer keyword detection — find midpoint between last marketing and first footer content
        const footerBands = mergedBands.filter(b => b.isFooterLikely && b.yTop > boundaryY - 100);
        const lastMarketing = mergedBands.filter(b => !b.isFooterLikely && b.yBottom < boundaryY + 100).pop();

        if (footerBands.length > 0 && lastMarketing) {
          const mid = Math.round((lastMarketing.yBottom + footerBands[0].yTop) / 2);
          // Optionally snap to nearby edge within 30px
          const nearEdge = edges.find(e => Math.abs(e.y - mid) <= 30);
          adjustedY = nearEdge ? nearEdge.y : mid;
          events.push({
            boundary_index: i,
            original_y: boundaryY,
            adjusted_y: adjustedY,
            reason: nearEdge ? "Footer keyword + edge snap" : "Footer keyword midpoint",
          });
        }
      }
    } else {
      // General case: check if boundary falls near content
      const isNearContent = mergedBands.some(b =>
        boundaryY >= b.yTop - NEAR_CONTENT_THRESHOLD &&
        boundaryY <= b.yBottom + NEAR_CONTENT_THRESHOLD
      );

      if (isNearContent) {
        // Search within radius for nearest gap midpoint or edge not near content
        let bestCandidate: number | null = null;
        let bestDist = BOUNDARY_SEARCH_RADIUS + 1;

        // Check gaps
        for (const gap of gaps) {
          const dist = Math.abs(gap.gapMid - boundaryY);
          if (dist <= BOUNDARY_SEARCH_RADIUS && dist < bestDist) {
            bestDist = dist;
            bestCandidate = gap.gapMid;
          }
        }

        // Check edges not near content
        for (const edge of edges) {
          const dist = Math.abs(edge.y - boundaryY);
          if (dist <= BOUNDARY_SEARCH_RADIUS && dist < bestDist) {
            const edgeNearContent = mergedBands.some(b =>
              edge.y >= b.yTop && edge.y <= b.yBottom
            );
            if (!edgeNearContent) {
              bestDist = dist;
              bestCandidate = edge.y;
            }
          }
        }

        if (bestCandidate !== null) {
          adjustedY = bestCandidate;
          events.push({
            boundary_index: i,
            original_y: boundaryY,
            adjusted_y: adjustedY,
            reason: `Content avoidance: snapped to ${bestDist <= 5 ? "edge" : "gap"} at ${adjustedY}`,
          });
        }
      }
    }

    // Apply adjustment
    result[i].y_end = adjustedY;
    result[i + 1].y_start = adjustedY;
  }

  // Safety: force first to 0, last to imageH
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

    // Full overview (capped at 1568px for Anthropic)
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
    // Base64 mode — return data URIs
    slices.push({
      index: 0,
      label: "full-overview",
      url: `data:${mimeType};base64,${imageBase64}`,
      yTop: 0,
      yBottom: originalHeight,
    });

    // For base64 mode, decode and crop with ImageScript (deferred to caller if needed)
    modules.forEach((m, i) => {
      slices.push({
        index: i + 1,
        label: m.section_label || m.module_type,
        url: `data:${mimeType};base64,CROP_NEEDED:${m.y_start}:${m.y_end}`,
        yTop: m.y_start,
        yBottom: m.y_end,
      });
    });
  }

  return slices;
}

// ─── Scale vision data into AI coordinate space ─────────────────────────────

function scaleVisionData(data: RawVisionData, factor: number): RawVisionData {
  if (factor === 1) return data;
  return {
    paragraphs: data.paragraphs.map(p => ({
      ...p,
      yTop: Math.floor(p.yTop * factor),
      yBottom: Math.floor(p.yBottom * factor),
      xLeft: Math.floor(p.xLeft * factor),
      xRight: Math.floor(p.xRight * factor),
    })),
    objects: data.objects.map(o => ({
      ...o,
      yTop: Math.floor(o.yTop * factor),
      yBottom: Math.floor(o.yBottom * factor),
      xLeft: Math.floor(o.xLeft * factor),
      xRight: Math.floor(o.xRight * factor),
    })),
    logos: data.logos.map(l => ({
      ...l,
      yTop: Math.floor(l.yTop * factor),
      yBottom: Math.floor(l.yBottom * factor),
      xLeft: Math.floor(l.xLeft * factor),
      xRight: Math.floor(l.xRight * factor),
    })),
  };
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
  // PNG: bytes 16-23 contain width and height as 4-byte big-endian
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
    return { width, height };
  }

  // JPEG: scan for SOF markers
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset < bytes.length - 8) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      // SOF0-SOF3
      if (marker >= 0xc0 && marker <= 0xc3) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return { width, height };
      }
      const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 2 + segLen;
    }
  }

  // Fallback: try to decode with ImageScript (will be caught by caller)
  throw new Error("Cannot parse image dimensions from header — unsupported format");
}
