/**
 * Auto-crop utility for reference campaign images.
 *
 * Email campaign screenshots from major ESPs consistently add ~5.9% padding
 * on each side. We use a pixel-sampling heuristic first (fast), then fall back
 * to AI vision if ambiguous. When padding is detected, we apply the standard
 * 5.9% crop from left and right.
 */

const STANDARD_PAD_PCT = 5.9; // 59px at 1000px width

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

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/**
 * Fast pixel-sampling heuristic: check if the leftmost and rightmost ~5% columns
 * are a uniform-ish color (low variance). Returns true if padding is very likely.
 */
function pixelSampleDetectPadding(canvas: HTMLCanvasElement, width: number, height: number): boolean | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const stripWidth = Math.max(4, Math.floor(width * 0.03)); // sample 3% from each edge
  const sampleRows = 10; // sample 10 evenly-spaced rows
  const rowStep = Math.max(1, Math.floor(height / sampleRows));

  function getEdgeColors(x: number, stripW: number): number[][] {
    const colors: number[][] = [];
    for (let row = 0; row < height; row += rowStep) {
      const data = ctx!.getImageData(x, row, stripW, 1).data;
      // Average the strip
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2];
      }
      const px = stripW;
      colors.push([r / px, g / px, b / px]);
    }
    return colors;
  }

  function isUniform(colors: number[][]): boolean {
    if (colors.length < 3) return false;
    const avg = [0, 0, 0];
    for (const c of colors) { avg[0] += c[0]; avg[1] += c[1]; avg[2] += c[2]; }
    avg[0] /= colors.length; avg[1] /= colors.length; avg[2] /= colors.length;

    let maxDiff = 0;
    for (const c of colors) {
      const diff = Math.abs(c[0] - avg[0]) + Math.abs(c[1] - avg[1]) + Math.abs(c[2] - avg[2]);
      maxDiff = Math.max(maxDiff, diff);
    }
    return maxDiff < 30; // tolerate small variation (gradients, compression)
  }

  const leftColors = getEdgeColors(0, stripWidth);
  const rightColors = getEdgeColors(width - stripWidth, stripWidth);

  const leftUniform = isUniform(leftColors);
  const rightUniform = isUniform(rightColors);

  if (leftUniform && rightUniform) return true;
  return null; // ambiguous — defer to AI
}

/**
 * Ask AI: does this campaign image have side padding?
 */
async function hasPaddingAI(dataUrl: string): Promise<boolean> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const resp = await fetch(`${supabaseUrl}/functions/v1/auto-crop-detect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ imageDataUrl: dataUrl }),
    });

    if (!resp.ok) return false;
    const data = await resp.json();
    return data?.hasPadding === true;
  } catch {
    return false;
  }
}

/**
 * Analyse an image blob. If padding detected, crop 5.9% from each side.
 */
export async function autoCropPadding(file: Blob): Promise<CropResult> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  const noCrop: CropResult = { cropped: false, blob: file, left: 0, right: 0, top: 0, bottom: 0, originalWidth: width, originalHeight: height };

  // Draw full image to canvas for pixel sampling
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = width;
  fullCanvas.height = height;
  fullCanvas.getContext("2d")!.drawImage(bitmap, 0, 0);

  // Step 1: Fast pixel heuristic
  const pixelResult = pixelSampleDetectPadding(fullCanvas, width, height);

  let detected = false;

  if (pixelResult === true) {
    // Pixel sampling says yes — trust it, skip AI
    detected = true;
    console.log("[autoCropPadding] Pixel heuristic detected padding, skipping AI");
  } else {
    // Ambiguous — ask AI
    let analysisDataUrl: string;
    if (width > 600) {
      const scale = 600 / width;
      const c = document.createElement("canvas");
      c.width = 600;
      c.height = Math.round(height * scale);
      c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
      const smallBlob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.8));
      analysisDataUrl = await blobToDataUrl(smallBlob);
    } else {
      analysisDataUrl = await blobToDataUrl(file);
    }
    detected = await hasPaddingAI(analysisDataUrl);
    console.log(`[autoCropPadding] AI detection result: ${detected}`);
  }

  if (!detected) {
    bitmap.close();
    return noCrop;
  }

  const padPx = Math.round(width * (STANDARD_PAD_PCT / 100));
  const cropW = width - padPx * 2;

  if (cropW < 100) {
    bitmap.close();
    return noCrop;
  }

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropW;
  cropCanvas.height = height;
  cropCanvas.getContext("2d")!.drawImage(bitmap, padPx, 0, cropW, height, 0, 0, cropW, height);
  bitmap.close();

  const croppedBlob = await new Promise<Blob>((resolve) => {
    cropCanvas.toBlob((b) => resolve(b!), "image/png", 1);
  });

  return {
    cropped: true,
    blob: croppedBlob,
    left: padPx,
    right: padPx,
    top: 0,
    bottom: 0,
    originalWidth: width,
    originalHeight: height,
  };
}
