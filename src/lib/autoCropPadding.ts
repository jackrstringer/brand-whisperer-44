/**
 * Auto-crop utility for reference campaign images.
 *
 * Detects uniform-color padding on left / right edges (and optionally
 * top / bottom) and trims it.  Conservative by design:
 *   – Only crops when BOTH left and right padding are detected
 *   – Padding must be ≥ 3 % of image width on each side
 *   – Uses a colour-tolerance check (not exact match) to handle
 *     JPEG compression artefacts and subtle gradients
 *   – Returns the original blob untouched when no crop is needed
 */

const TOLERANCE = 28;          // max channel diff to consider "same colour"
const MIN_PAD_PCT = 0.025;     // 2.5 % of width before we crop
const SAMPLE_ROWS = 40;        // vertical samples per column scan
const EDGE_SAMPLE_DEPTH = 3;   // pixels inward to establish the "edge colour"

function colorsMatch(r1: number, g1: number, b1: number,
                     r2: number, g2: number, b2: number): boolean {
  return Math.abs(r1 - r2) <= TOLERANCE &&
         Math.abs(g1 - g2) <= TOLERANCE &&
         Math.abs(b1 - b2) <= TOLERANCE;
}

/**
 * For a given column x, sample `SAMPLE_ROWS` evenly-spaced pixels and
 * check whether they are all the same colour (within tolerance).
 * Returns true if the column is uniform.
 */
function isUniformColumn(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
): boolean {
  const step = Math.max(1, Math.floor(height / SAMPLE_ROWS));

  // Anchor colour = pixel at ~25 % height (avoids top/bottom edge artefacts)
  const anchorY = Math.floor(height * 0.25);
  const ai = (anchorY * width + x) * 4;
  const ar = data[ai], ag = data[ai + 1], ab = data[ai + 2];

  for (let y = 0; y < height; y += step) {
    const i = (y * width + x) * 4;
    if (!colorsMatch(ar, ag, ab, data[i], data[i + 1], data[i + 2])) {
      return false;
    }
  }
  return true;
}

/** Same idea but for a horizontal row (top/bottom padding). */
function isUniformRow(
  data: Uint8ClampedArray,
  width: number,
  _height: number,
  y: number,
): boolean {
  const step = Math.max(1, Math.floor(width / SAMPLE_ROWS));
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
 * Runs entirely in-browser via OffscreenCanvas / HTMLCanvasElement.
 */
export async function autoCropPadding(file: Blob): Promise<CropResult> {
  // Load bitmap
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // Draw to canvas to get pixel data
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // --- Detect LEFT padding ---
  let leftPad = 0;
  for (let x = 0; x < Math.floor(width * 0.35); x++) {
    if (isUniformColumn(data, width, height, x)) {
      leftPad = x + 1;
    } else {
      break;
    }
  }

  // --- Detect RIGHT padding ---
  let rightPad = 0;
  for (let x = width - 1; x > Math.floor(width * 0.65); x--) {
    if (isUniformColumn(data, width, height, x)) {
      rightPad = width - x;
    } else {
      break;
    }
  }

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
  // Only crop vertically if padding is > 1 % height
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
