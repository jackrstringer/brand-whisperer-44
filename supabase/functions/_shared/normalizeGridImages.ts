/**
 * Deterministic post-processor that finds multi-image grid rows and normalizes
 * image dimensions based on the email layout width and column count.
 *
 * Instead of blindly copying the first image's dimensions, it calculates
 * the correct per-slot width from the email viewport (470px) and column count.
 */

const EMAIL_WIDTH = 470;
const DEFAULT_GAP = 10;

interface ParsedImage {
  tag: string;
  width: number | null;
  height: number | null;
  hasImageKitTransform: boolean;
  isImageKit: boolean;
}

function parseImgTag(imgTag: string): ParsedImage {
  const attrs = imgTag;
  const wMatch =
    attrs.match(/\bwidth\s*=\s*["']?(\d+)/i) || attrs.match(/\bw-(\d+)/);
  const hMatch =
    attrs.match(/\bheight\s*=\s*["']?(\d+)/i) || attrs.match(/\bh-(\d+)/);
  const isImageKit = /ik\.imagekit\.io/i.test(imgTag);
  const hasImageKitTransform = isImageKit && /[?&]tr=/i.test(imgTag);

  return {
    tag: imgTag,
    width: wMatch ? parseInt(wMatch[1]) : null,
    height: hMatch ? parseInt(hMatch[1]) : null,
    hasImageKitTransform,
    isImageKit,
  };
}

/**
 * Find <tr> blocks while handling nested tables properly.
 * Uses a depth-tracking approach instead of a non-greedy regex.
 */
function findTopLevelTrBlocks(html: string): { full: string; start: number }[] {
  const results: { full: string; start: number }[] = [];
  const trOpenRegex = /<tr\b[^>]*>/gi;
  let match;

  while ((match = trOpenRegex.exec(html)) !== null) {
    const startIdx = match.index;
    let depth = 1;
    let i = startIdx + match[0].length;

    while (i < html.length && depth > 0) {
      const nextOpen = html.indexOf("<tr", i);
      const nextClose = html.indexOf("</tr>", i);

      if (nextClose === -1) break; // malformed

      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Check it's actually a <tr tag, not <track or similar
        if (/^<tr[\s>]/i.test(html.substring(nextOpen, nextOpen + 5))) {
          depth++;
        }
        i = nextOpen + 3;
      } else {
        depth--;
        if (depth === 0) {
          const full = html.substring(startIdx, nextClose + 5);
          results.push({ full, start: startIdx });
        }
        i = nextClose + 5;
      }
    }
  }

  return results;
}

export function normalizeGridImages(html: string): string {
  if (!html) return html;

  const trBlocks = findTopLevelTrBlocks(html);
  let result = html;

  for (const { full: trFull } of trBlocks) {
    // Find direct <td> children with images (skip nested tables' tds)
    // Simple approach: find <td> blocks at the top level of this <tr>
    const tdWithImg = [...trFull.matchAll(/<td[^>]*>[\s\S]*?<\/td>/gi)].filter(
      (m) => /<img\b/i.test(m[0])
    );
    if (tdWithImg.length < 2) continue; // not a multi-column grid row

    const columns = tdWithImg.length;

    // Extract all img tags from this row
    const imgTags = [...trFull.matchAll(/<img\b[^>]*>/gi)];
    if (imgTags.length < 2) continue;

    const images = imgTags.map((m) => parseImgTag(m[0]));

    // Calculate what the correct slot width SHOULD be
    const calculatedSlotWidth = Math.floor(
      (EMAIL_WIDTH - (columns - 1) * DEFAULT_GAP) / columns
    );

    // Determine target dimensions
    // Use calculated width. For height: check if images have consistent heights
    const existingHeights = images
      .map((img) => img.height)
      .filter((h): h is number => h !== null && h > 0);
    const existingWidths = images
      .map((img) => img.width)
      .filter((w): w is number => w !== null && w > 0);

    // Check if all images already have consistent, reasonable dimensions
    const allHaveCorrectWidth =
      existingWidths.length === images.length &&
      existingWidths.every(
        (w) => Math.abs(w - calculatedSlotWidth) < 30 // within 30px tolerance
      );
    const allHaveHeight = existingHeights.length === images.length;
    const allHeightsConsistent =
      allHaveHeight &&
      existingHeights.every(
        (h) => Math.abs(h - existingHeights[0]) < 20 // within 20px tolerance
      );
    const allHaveTransforms = images.every(
      (img) => !img.isImageKit || img.hasImageKitTransform
    );

    // If everything looks correct already, skip this row
    if (allHaveCorrectWidth && allHeightsConsistent && allHaveTransforms) {
      continue;
    }

    // Determine target height:
    // 1. If most images have a consistent height, use that
    // 2. If the first image has a height, derive aspect ratio from it
    // 3. Default to square (1:1)
    let targetW = calculatedSlotWidth;
    let targetH: number;

    if (allHeightsConsistent && existingHeights.length > 0) {
      // Scale the existing height proportionally if width needs adjusting
      const refWidth = existingWidths[0] || targetW;
      const aspectRatio = existingHeights[0] / refWidth;
      targetH = Math.round(targetW * aspectRatio);
    } else if (existingHeights.length > 0 && existingWidths.length > 0) {
      // Use first image's aspect ratio
      const aspectRatio = existingHeights[0] / (existingWidths[0] || targetW);
      targetH = Math.round(targetW * aspectRatio);
    } else {
      // Default to square for grids
      targetH = targetW;
    }

    // Clamp height to reasonable bounds
    targetH = Math.max(100, Math.min(targetH, 600));

    console.log(
      `[normalizeGridImages] Grid row: ${columns} columns → ${targetW}×${targetH}px per slot`
    );

    // Normalize all img tags in this row
    let normalizedTr = trFull;
    for (const img of images) {
      if (
        img.width === targetW &&
        img.height === targetH &&
        (!img.isImageKit || img.hasImageKitTransform)
      ) {
        continue;
      }

      let normalizedTag = img.tag;

      // Update or add width attribute
      if (/\bwidth\s*=/i.test(normalizedTag)) {
        normalizedTag = normalizedTag.replace(
          /\bwidth\s*=\s*["']?\d+["']?/i,
          `width="${targetW}"`
        );
      } else {
        normalizedTag = normalizedTag.replace(
          /<img\b/i,
          `<img width="${targetW}"`
        );
      }

      // Update or add height attribute
      if (/\bheight\s*=/i.test(normalizedTag)) {
        normalizedTag = normalizedTag.replace(
          /\bheight\s*=\s*["']?\d+["']?/i,
          `height="${targetH}"`
        );
      } else {
        normalizedTag = normalizedTag.replace(
          /<img\b/i,
          `<img height="${targetH}"`
        );
      }

      // Update ImageKit transform
      if (img.isImageKit) {
        if (/[?&]tr=/i.test(normalizedTag)) {
          normalizedTag = normalizedTag.replace(
            /(\?|&)tr=[^"'\s&]*/gi,
            `$1tr=w-${targetW},h-${targetH},fo-auto`
          );
        } else {
          normalizedTag = normalizedTag.replace(
            /(ik\.imagekit\.io[^"'\s?]*)/gi,
            `$1?tr=w-${targetW},h-${targetH},fo-auto`
          );
        }

        // Handle path-based format
        normalizedTag = normalizedTag.replace(
          /(ik\.imagekit\.io\/[^/]+\/)tr:[^/]+\//gi,
          `$1tr:w-${targetW},h-${targetH},fo-auto/`
        );
      }

      // Update inline style width/height if present
      normalizedTag = normalizedTag.replace(
        /width:\s*\d+px/gi,
        `width:${targetW}px`
      );
      normalizedTag = normalizedTag.replace(
        /height:\s*\d+px/gi,
        `height:${targetH}px`
      );
      // Replace height:auto with fixed height
      normalizedTag = normalizedTag.replace(
        /height:\s*auto/gi,
        `height:${targetH}px`
      );

      normalizedTr = normalizedTr.replace(img.tag, normalizedTag);
    }

    // Normalize <td> container widths in this grid row
    for (const tdMatch of tdWithImg) {
      const tdFull = tdMatch[0];
      if (!normalizedTr.includes(tdFull)) continue;
      let normalizedTd = tdFull;
      if (/\bwidth\s*=/i.test(normalizedTd)) {
        normalizedTd = normalizedTd.replace(
          /\bwidth\s*=\s*["']?\d+["']?/i,
          `width="${targetW}"`
        );
      }
      normalizedTd = normalizedTd.replace(
        /width:\s*\d+px/gi,
        `width:${targetW}px`
      );
      normalizedTr = normalizedTr.replace(tdFull, normalizedTd);
    }

    result = result.replace(trFull, normalizedTr);
  }

  return result;
}
