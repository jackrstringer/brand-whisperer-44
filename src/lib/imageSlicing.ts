import { supabase } from "@/integrations/supabase/client";

/**
 * Slice a single image URL into vertical chunks that stay under Anthropic's 5MB base64 limit.
 * Returns array of base64 JPEG data URLs (without the data: prefix) and metadata.
 */
export function sliceImageFromUrl(
  url: string,
  maxSliceHeight = 1300,
  maxWidth = 600,
): Promise<Array<{ blob: Blob; sliceIndex: number; totalSlices: number }>> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = Math.round(height * ratio);
      }
      const totalSlices = Math.max(1, Math.ceil(height / maxSliceHeight));
      const sliceHeight = Math.ceil(height / totalSlices);
      const promises: Promise<{ blob: Blob; sliceIndex: number; totalSlices: number }>[] = [];

      for (let i = 0; i < totalSlices; i++) {
        const sy = i * sliceHeight;
        const sh = Math.min(sliceHeight, height - sy);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = sh;
        const ctx = canvas.getContext("2d")!;
        const origRatio = img.naturalWidth / width;
        ctx.drawImage(img, 0, sy * origRatio, img.naturalWidth, sh * origRatio, 0, 0, width, sh);

        promises.push(
          new Promise((res, rej) => {
            canvas.toBlob(
              (blob) => {
                if (blob) res({ blob, sliceIndex: i, totalSlices });
                else rej(new Error("Failed to create blob"));
              },
              "image/jpeg",
              0.85,
            );
          }),
        );
      }

      Promise.all(promises).then(resolve).catch(reject);
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

/**
 * Slice all reference images and upload slices to Supabase storage.
 * Returns array of public URLs for all slices.
 */
export async function sliceAndUploadReferenceImages(
  userId: string,
  brandId: string,
  imageUrls: string[],
): Promise<string[]> {
  const allSliceUrls: string[] = [];

  for (let imgIdx = 0; imgIdx < imageUrls.length; imgIdx++) {
    try {
      const slices = await sliceImageFromUrl(imageUrls[imgIdx]);
      for (const slice of slices) {
        const path = `${userId}/${brandId}/slices/${imgIdx}-${slice.sliceIndex}.jpg`;
        const { error } = await supabase.storage.from("brand-references").upload(path, slice.blob, {
          contentType: "image/jpeg",
          upsert: true,
        });
        if (!error) {
          const { data: urlData } = supabase.storage.from("brand-references").getPublicUrl(path);
          allSliceUrls.push(urlData.publicUrl);
        }
      }
    } catch (e) {
      console.warn(`Failed to slice image ${imgIdx}:`, e);
    }
  }

  return allSliceUrls;
}

/**
 * Save slice URLs to the brand profile.
 */
export async function saveSliceUrls(brandId: string, sliceUrls: string[]) {
  await supabase
    .from("brand_profiles")
    .update({ reference_slice_urls: sliceUrls } as any)
    .eq("brand_id", brandId);
}
