import { supabase } from "@/integrations/supabase/client";

export type BrandSetupSource =
  | "website"
  | "past_campaigns"
  | "brand_deck"
  | "product_mockups"
  | "image_assets"
  | "misc_references"
  | "figma";

export type BrandAssetCategory = "logo" | "product_imagery" | "hero_shots" | "lifestyle";

interface PersistBrandSetupInputsParams {
  brandId: string;
  userId: string;
  brandName: string;
  industry: string;
  websiteUrl: string;
  figmaUrl: string;
  selectedSources: BrandSetupSource[];
  referenceFilesByCategory: Record<string, File[]>;
  assetFilesByCategory: Record<BrandAssetCategory, File[]>;
}

interface PersistBrandSetupInputsResult {
  extractionSources: string[];
  referenceFileUrls: string[];
  referenceFileCategories: Record<string, string[]>;
  referenceImageUrls: string[];
}

const IMAGE_FILE_RE = /\.(jpg|jpeg|png|webp)$/i;

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

async function uploadCategorizedFiles(
  bucket: "brand-references" | "brand-assets",
  userId: string,
  brandId: string,
  rootFolder: string,
  filesByCategory: Record<string, File[]>,
) {
  const entries = await Promise.all(
    Object.entries(filesByCategory).map(async ([category, files]) => {
      const urls = await Promise.all(
        files.map(async (file, index) => {
          const path = `${userId}/${brandId}/${rootFolder}/${category}/${String(index).padStart(2, "0")}-${sanitizeFilename(file.name)}`;
          const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
          if (error) throw error;
          return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
        }),
      );

      return [category, urls] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<string, string[]>;
}

export function getExtractionSources(selectedSources: BrandSetupSource[]) {
  const sources = ["screenshots"];
  if (selectedSources.includes("website")) sources.push("website");
  if (selectedSources.includes("figma")) sources.push("figma");
  return sources;
}

export function isImageFile(file: File) {
  return IMAGE_FILE_RE.test(file.name);
}

export function isImageUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    return IMAGE_FILE_RE.test(pathname);
  } catch {
    return IMAGE_FILE_RE.test(url);
  }
}

export async function persistBrandSetupInputs({
  brandId,
  userId,
  brandName,
  industry,
  websiteUrl,
  figmaUrl,
  selectedSources,
  referenceFilesByCategory,
  assetFilesByCategory,
}: PersistBrandSetupInputsParams): Promise<PersistBrandSetupInputsResult> {
  const extractionSources = getExtractionSources(selectedSources);

  const [referenceFileCategories, assetFileCategories] = await Promise.all([
    uploadCategorizedFiles("brand-references", userId, brandId, "references", referenceFilesByCategory),
    uploadCategorizedFiles("brand-assets", userId, brandId, "assets", assetFilesByCategory),
  ]);

  const referenceFileUrls = Object.values(referenceFileCategories).flat();
  const referenceImageUrls = referenceFileUrls.filter(isImageUrl);

  const { error: brandUpdateError } = await supabase
    .from("brands")
    .update({
      name: brandName,
      industry: industry || null,
      website_url: websiteUrl || null,
      figma_url: figmaUrl || null,
      source_types: selectedSources,
    } as any)
    .eq("id", brandId);

  if (brandUpdateError) throw brandUpdateError;

  const { data: existingProfile, error: profileLookupError } = await supabase
    .from("brand_profiles")
    .select("id")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (profileLookupError) throw profileLookupError;

  const profilePayload = {
    brand_id: brandId,
    reference_image_urls: referenceFileUrls,
    reference_image_categories: referenceFileCategories,
    extraction_sources: extractionSources,
    processing_error: null,
  } as any;

  if (existingProfile?.id) {
    const { error: profileUpdateError } = await supabase
      .from("brand_profiles")
      .update(profilePayload)
      .eq("brand_id", brandId);

    if (profileUpdateError) throw profileUpdateError;
  } else {
    const { error: profileInsertError } = await supabase.from("brand_profiles").insert(profilePayload);
    if (profileInsertError) throw profileInsertError;
  }

  const assetRows = Object.entries(assetFileCategories).flatMap(([category, urls]) =>
    urls.map((url, index) => ({
      brand_id: brandId,
      category,
      url,
      filename: assetFilesByCategory[category as BrandAssetCategory]?.[index]?.name ?? null,
    })),
  );

  const { error: deleteAssetsError } = await supabase.from("brand_assets").delete().eq("brand_id", brandId);
  if (deleteAssetsError) throw deleteAssetsError;

  if (assetRows.length > 0) {
    const { error: insertAssetsError } = await supabase.from("brand_assets").insert(assetRows as any);
    if (insertAssetsError) throw insertAssetsError;
  }

  return {
    extractionSources,
    referenceFileUrls,
    referenceFileCategories,
    referenceImageUrls,
  };
}