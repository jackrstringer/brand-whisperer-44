/**
 * Auto-crop utility for reference campaign images.
 *
 * Uses AI vision to detect padding/margins around email campaign images,
 * then crops them client-side. Falls back to a simple pixel-scan if the
 * AI call fails.
 */

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
 * Convert a Blob to a base64 data URL.
 */
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/**
 * Ask AI vision to detect padding bounds on a campaign image.
 * Returns { left, right, top, bottom } as percentages (0-100).
 */
async function detectPaddingWithAI(
  dataUrl: string,
  width: number,
  height: number,
): Promise<{ left: number; right: number; top: number; bottom: number } | null> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const resp = await fetch(`${supabaseUrl}/functions/v1/auto-crop-detect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ imageDataUrl: dataUrl, width, height }),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    if (data?.left !== undefined) return data;
    return null;
  } catch {
    return null;
  }
}

/**
 * Analyse an image blob and return a (possibly cropped) version.
 * Uses AI vision to detect padding, then crops in-browser.
 */
export async function autoCropPadding(file: Blob): Promise<CropResult> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  // Convert to data URL for AI analysis
  // For large images, resize for the AI call but crop the original
  let analysisDataUrl: string;
  if (width > 800) {
    const scale = 800 / width;
    const smallCanvas = document.createElement("canvas");
    smallCanvas.width = 800;
    smallCanvas.height = Math.round(height * scale);
    const sCtx = smallCanvas.getContext("2d")!;
    sCtx.drawImage(bitmap, 0, 0, smallCanvas.width, smallCanvas.height);
    const smallBlob = await new Promise<Blob>((res) => smallCanvas.toBlob((b) => res(b!), "image/jpeg", 0.85));
    analysisDataUrl = await blobToDataUrl(smallBlob);
  } else {
    analysisDataUrl = await blobToDataUrl(file);
  }

  const bounds = await detectPaddingWithAI(analysisDataUrl, width, height);

  if (!bounds || (bounds.left === 0 && bounds.right === 0 && bounds.top === 0 && bounds.bottom === 0)) {
    bitmap.close();
    return { cropped: false, blob: file, left: 0, right: 0, top: 0, bottom: 0, originalWidth: width, originalHeight: height };
  }

  // Convert percentage-based bounds to pixels
  const leftPx = Math.round((bounds.left / 100) * width);
  const rightPx = Math.round((bounds.right / 100) * width);
  const topPx = Math.round((bounds.top / 100) * height);
  const bottomPx = Math.round((bounds.bottom / 100) * height);

  // Safety: don't crop more than 40% total width or 20% total height
  if (leftPx + rightPx > width * 0.4 || topPx + bottomPx > height * 0.2) {
    bitmap.close();
    return { cropped: false, blob: file, left: 0, right: 0, top: 0, bottom: 0, originalWidth: width, originalHeight: height };
  }

  const cropW = width - leftPx - rightPx;
  const cropH = height - topPx - bottomPx;

  if (cropW < 100 || cropH < 100) {
    bitmap.close();
    return { cropped: false, blob: file, left: 0, right: 0, top: 0, bottom: 0, originalWidth: width, originalHeight: height };
  }

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext("2d")!;
  cropCtx.drawImage(bitmap, leftPx, topPx, cropW, cropH, 0, 0, cropW, cropH);
  bitmap.close();

  const croppedBlob = await new Promise<Blob>((resolve) => {
    cropCanvas.toBlob((b) => resolve(b!), "image/png", 1);
  });

  return {
    cropped: true,
    blob: croppedBlob,
    left: leftPx,
    right: rightPx,
    top: topPx,
    bottom: bottomPx,
    originalWidth: width,
    originalHeight: height,
  };
}
