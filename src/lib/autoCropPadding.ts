/**
 * Auto-crop utility for reference campaign images.
 *
 * Email campaign screenshots from major ESPs consistently add ~5.9% padding
 * on each side. We use AI vision to detect WHETHER padding exists (binary),
 * then apply the standard 5.9% crop from left and right.
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
 * Ask AI: does this campaign image have uniform padding on left and right?
 * Returns true/false.
 */
async function hasPadding(dataUrl: string): Promise<boolean> {
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
 * Analyse an image blob. If AI detects side padding, crop 5.9% from each side.
 */
export async function autoCropPadding(file: Blob): Promise<CropResult> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // Build a smaller version for AI analysis
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

  const detected = await hasPadding(analysisDataUrl);

  if (!detected) {
    bitmap.close();
    return { cropped: false, blob: file, left: 0, right: 0, top: 0, bottom: 0, originalWidth: width, originalHeight: height };
  }

  const padPx = Math.round(width * (STANDARD_PAD_PCT / 100));
  const cropW = width - padPx * 2;

  if (cropW < 100) {
    bitmap.close();
    return { cropped: false, blob: file, left: 0, right: 0, top: 0, bottom: 0, originalWidth: width, originalHeight: height };
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
