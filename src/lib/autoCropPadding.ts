/**
 * Auto-crop utility for reference campaign images.
 *
 * Detects uniform-color padding on left / right edges (and optionally
 * top / bottom) and trims it.  Conservative by design:
 *   – Only crops when BOTH left and right padding are detected
 *   – Padding must be ≥ 2 % of image width on each side
 *   – Uses a per-row scan approach: for each sampled row, measure
 *     how far the edge color extends inward, then take the minimum
 *   – Returns the original blob untouched when no crop is needed
 */

const TOLERANCE = 30;          // max channel diff to consider "same colour"
const MIN_PAD_PCT = 0.02;     // 2 % of width before we crop
const SAMPLE_COUNT = 60;      // number of rows/cols to sample

function colorsMatch(r1: number, g1: number, b1: number,
                     r2: number, g2: number, b2: number): boolean {
  return Math.abs(r1 - r2) <= TOLERANCE &&
         Math.abs(g1 - g2) <= TOLERANCE &&
         Math.abs(b1 - b2) <= TOLERANCE;
}

/**
 * For a given row y, measure how many pixels from the left edge share the
 * same colour (within tolerance). Returns the padding width for that row.
 * Stops scanning beyond maxScan pixels.
 */
function measureRowLeftPad(
  data: Uint8ClampedArray, width: number, y: number, maxScan: number,
): number {
  const base = y * width * 4;
  const r0 = data[base], g0 = data[base + 1], b0 = data[base + 2];

  // Skip rows that start with very varied content (not padding)
  // Quick check: compare pixel 0 with pixel 2
  if (maxScan < 3) return 0;
  const i2 = base + 2 * 4;
  if (!colorsMatch(r0, g0, b0, data[i2], data[i2 + 1], data[i2 + 2])) return 0;

  let pad = 0;
  for (let x = 1; x < maxScan; x++) {
    const i = base + x * 4;
    if (colorsMatch(r0, g0, b0, data[i], data[i + 1], data[i + 2])) {
      pad = x;
    } else {
      break;
    }
  }
  return pad;
}

function measureRowRightPad(
  data: Uint8ClampedArray, width: number, y: number, maxScan: number,
): number {
  const rightEdge = width - 1;
  const base0 = (y * width + rightEdge) * 4;
  const r0 = data[base0], g0 = data[base0 + 1], b0 = data[base0 + 2];

  if (maxScan < 3) return 0;
  const i2 = (y * width + rightEdge - 2) * 4;
  if (!colorsMatch(r0, g0, b0, data[i2], data[i2 + 1], data[i2 + 2])) return 0;

  let pad = 0;
  for (let x = rightEdge - 1; x > rightEdge - maxScan; x--) {
    const i = (y * width + x) * 4;
    if (colorsMatch(r0, g0, b0, data[i], data[i + 1], data[i + 2])) {
      pad = rightEdge - x;
    } else {
      break;
    }
  }
  return pad;
}

/** Same idea but for a horizontal row (top/bottom padding). */
function isUniformRow(
  data: Uint8ClampedArray,
  width: number,
  _height: number,
  y: number,
): boolean {
  const step = Math.max(1, Math.floor(width / SAMPLE_COUNT));
  const anchorX = Math.floor(width * 0.25);
  const ai = (y * width + anchorX) * 4;
  const ar = data[ai], ag = data[ai + 1], ab = data[ai + 2];

  for (let x = 0; x < width; x += step) {
    const i = (y * width + x) * 4;
    if (!colorsMatch(ar, ag, ab, data[i], data[i + 1], data[i + 2])) {
      return false;
    }
  }
  return true;
}

export interface CropResult {
  cropped: boolean;
  blob: Blob;
  left: number;
  right: number;
  top: number;
  bottom: number;
  originalWidth: number;
  originalHeight: number;
}

/**
 * Analyse an image blob and return a (possibly cropped) version.
 * Runs entirely in-browser via HTMLCanvasElement.
 *
 * Strategy for left/right: sample many rows, measure padding on each,
 * take the MINIMUM across all sampled rows. This handles emails where
 * different sections have different background colors in the padding strip.
 */
export async function autoCropPadding(file: Blob): Promise<CropResult> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // --- Detect LEFT / RIGHT padding via per-row scanning ---
  const maxHScan = Math.floor(width * 0.35);
  const rowStep = Math.max(1, Math.floor(height / SAMPLE_COUNT));

  let minLeft = Infinity;
  let minRight = Infinity;
  let leftSamples = 0;
  let rightSamples = 0;

  for (let y = rowStep; y < height - rowStep; y += rowStep) {
    const lp = measureRowLeftPad(data, width, y, maxHScan);
    const rp = measureRowRightPad(data, width, y, maxHScan);

    // Only count rows that have some padding (skip rows where content extends to edge)
    if (lp > 0) {
      minLeft = Math.min(minLeft, lp);
      leftSamples++;
    }
    if (rp > 0) {
      minRight = Math.min(minRight, rp);
      rightSamples++;
    }
  }

  // Require at least 70% of sampled rows to show padding
  const totalSamples = Math.floor((height - 2 * rowStep) / rowStep);
  const minRowRatio = 0.7;

  const leftPad = leftSamples >= totalSamples * minRowRatio ? (minLeft === Infinity ? 0 : minLeft) : 0;
  const rightPad = rightSamples >= totalSamples * minRowRatio ? (minRight === Infinity ? 0 : minRight) : 0;

  // --- Detect TOP padding ---
  let topPad = 0;
  for (let y = 0; y < Math.floor(height * 0.15); y++) {
    if (isUniformRow(data, width, height, y)) {
      topPad = y + 1;
    } else {
      break;
    }
  }

  // --- Detect BOTTOM padding ---
  let bottomPad = 0;
  for (let y = height - 1; y > Math.floor(height * 0.85); y--) {
    if (isUniformRow(data, width, height, y)) {
      bottomPad = height - y;
    } else {
      break;
    }
  }

  const minHPad = Math.floor(width * MIN_PAD_PCT);

  // Only crop horizontally if BOTH sides have padding above threshold
  const cropH = leftPad >= minHPad && rightPad >= minHPad;
  const minVPad = Math.floor(height * 0.01);
  const cropTop = topPad >= minVPad;
  const cropBottom = bottomPad >= minVPad;

  const finalLeft = cropH ? leftPad : 0;
  const finalRight = cropH ? rightPad : 0;
  const finalTop = cropTop ? topPad : 0;
  const finalBottom = cropBottom ? bottomPad : 0;

  const noCrop = finalLeft === 0 && finalRight === 0 && finalTop === 0 && finalBottom === 0;

  if (noCrop) {
    bitmap.close();
    return { cropped: false, blob: file as Blob, left: 0, right: 0, top: 0, bottom: 0, originalWidth: width, originalHeight: height };
  }

  // Perform crop
  const cropX = finalLeft;
  const cropY = finalTop;
  const cropW = width - finalLeft - finalRight;
  const cropH2 = height - finalTop - finalBottom;

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropW;
  cropCanvas.height = cropH2;
  const cropCtx = cropCanvas.getContext("2d")!;
  cropCtx.drawImage(bitmap, cropX, cropY, cropW, cropH2, 0, 0, cropW, cropH2);
  bitmap.close();

  const croppedBlob = await new Promise<Blob>((resolve) => {
    cropCanvas.toBlob((b) => resolve(b!), "image/png", 1);
  });

  return {
    cropped: true,
    blob: croppedBlob,
    left: finalLeft,
    right: finalRight,
    top: finalTop,
    bottom: finalBottom,
    originalWidth: width,
    originalHeight: height,
  };
}
