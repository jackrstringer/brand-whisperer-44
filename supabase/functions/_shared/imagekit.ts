const IMAGEKIT_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";

const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

const IMG_SRC_REGEX = /<img\b[^>]*?\bsrc=(["'])(.*?)\1/gi;
const CSS_URL_REGEX = /url\((["']?)(https?:\/\/[^)"']+)\1\)/gi;

function normalizeImageSource(rawSource: string): string | null {
  const src = rawSource.trim();
  if (!src || src.startsWith("data:") || src.startsWith("cid:")) return null;
  if (src.startsWith("//")) return `https:${src}`;
  if (/^https?:\/\//i.test(src)) return src;
  return null;
}

function inferFileExtension(contentType: string | null, sourceUrl: string): string {
  if (contentType) {
    const mime = contentType.split(";")[0].trim().toLowerCase();
    if (IMAGE_EXTENSION_BY_MIME[mime]) return IMAGE_EXTENSION_BY_MIME[mime];
  }

  try {
    const pathname = new URL(sourceUrl).pathname;
    const maybeExt = pathname.split(".").pop()?.toLowerCase();
    if (maybeExt && /^[a-z0-9]{2,5}$/.test(maybeExt)) return maybeExt;
  } catch {
    // fallback below
  }

  return "png";
}

/**
 * Append ImageKit URL transformation parameters to a hosted ImageKit URL.
 * Only works on ik.imagekit.io URLs — returns the original URL unchanged for others.
 */
export function applyImageKitTransform(
  url: string,
  options: {
    width?: number;
    height?: number;
    focus?: string; // e.g. "auto" for smart cropping
    crop?: string; // e.g. "maintain_ratio"
  } = {},
): string {
  if (!/^https:\/\/ik\.imagekit\.io\//i.test(url)) return url;

  const parts: string[] = [];
  if (options.width) parts.push(`w-${options.width}`);
  if (options.height) parts.push(`h-${options.height}`);
  if (options.focus) parts.push(`fo-${options.focus}`);
  if (options.crop) parts.push(`c-${options.crop}`);

  if (parts.length === 0) return url;

  const trString = `tr:${parts.join(",")}`;

  // Insert transformation before the filename in the URL path
  // e.g. https://ik.imagekit.io/abc/folder/file.jpg -> https://ik.imagekit.io/abc/folder/tr:w-600/file.jpg
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/");
  const filename = pathParts.pop();
  pathParts.push(trString, filename!);
  urlObj.pathname = pathParts.join("/");

  return urlObj.toString();
}

async function uploadToImageKit(params: {
  bytes: ArrayBuffer;
  fileName: string;
  contentType: string | null;
  imagekitPrivateKey: string;
  folder: string;
}): Promise<string | null> {
  const formData = new FormData();
  formData.append("file", new Blob([params.bytes], { type: params.contentType ?? "application/octet-stream" }));
  formData.append("fileName", params.fileName);
  formData.append("folder", params.folder);
  formData.append("useUniqueFileName", "true");

  const uploadResponse = await fetch(IMAGEKIT_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${params.imagekitPrivateKey}:`)}`,
    },
    body: formData,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.warn(`ImageKit upload failed (${uploadResponse.status}): ${errorText}`);
    return null;
  }

  const uploadResult = await uploadResponse.json();
  return uploadResult?.url ?? null;
}

export async function rehostHtmlImagesWithImageKit(
  html: string,
  options: {
    campaignId: string;
    imagekitPrivateKey: string;
    folder?: string;
    fallbackImageUrls?: string[];
  },
): Promise<string> {
  if (!html) return html;

  const discoveredSources = new Set<string>();

  for (const match of html.matchAll(IMG_SRC_REGEX)) {
    if (match[2]) discoveredSources.add(match[2]);
  }

  for (const match of html.matchAll(CSS_URL_REGEX)) {
    if (match[2]) discoveredSources.add(match[2]);
  }

  if (discoveredSources.size === 0) return html;

  let rewrittenHtml = html;
  let imageIndex = 0;
  let fallbackIndex = 0;
  const folder = options.folder ?? "/campaign-studio/generated";
  const fallbackImageUrls = (options.fallbackImageUrls ?? [])
    .map((url) => normalizeImageSource(url))
    .filter((url): url is string => Boolean(url));

  for (const source of discoveredSources) {
    const normalizedSource = normalizeImageSource(source);
    if (!normalizedSource) continue;
    if (/^https:\/\/ik\.imagekit\.io\//i.test(normalizedSource)) continue;

    const applyFallback = () => {
      if (fallbackImageUrls.length === 0) return;
      const fallbackUrl = fallbackImageUrls[fallbackIndex % fallbackImageUrls.length];
      fallbackIndex += 1;
      rewrittenHtml = rewrittenHtml.split(source).join(fallbackUrl);
    };

    try {
      const imageResponse = await fetch(normalizedSource);
      if (!imageResponse.ok) {
        console.warn(`Image fetch failed (${imageResponse.status}) for: ${normalizedSource}`);
        applyFallback();
        continue;
      }

      const bytes = await imageResponse.arrayBuffer();
      const contentType = imageResponse.headers.get("content-type");
      const extension = inferFileExtension(contentType, normalizedSource);
      imageIndex += 1;

      const hostedUrl = await uploadToImageKit({
        bytes,
        contentType,
        imagekitPrivateKey: options.imagekitPrivateKey,
        fileName: `campaign-${options.campaignId}-${Date.now()}-${imageIndex}.${extension}`,
        folder,
      });

      if (!hostedUrl) {
        applyFallback();
        continue;
      }
      rewrittenHtml = rewrittenHtml.split(source).join(hostedUrl);
    } catch (error) {
      console.warn(`Image re-hosting failed for ${normalizedSource}:`, error);
      applyFallback();
    }
  }

  return rewrittenHtml;
}
