/**
 * Deterministic post-processor that finds multi-image grid rows and normalizes
 * image dimensions based on the email layout width and column count.
 *
 * Calculates correct per-slot width from the email viewport (470px) and column count.
 * Derives gutter from actual td padding/styles rather than assuming a fixed 10px.
 */

const EMAIL_WIDTH = 470;

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
 * Extract gutter/padding from a <td> tag's inline styles and attributes.
 * Returns total horizontal padding (left + right) in px.
 */
function extractTdHorizontalPadding(tdTag: string): number {
  // Check for padding in inline style
  const styleMatch = tdTag.match(/style\s*=\s*"([^"]*)"/i);
  if (styleMatch) {
    const style = styleMatch[1];

    // Check padding shorthand: padding: Tpx Rpx Bpx Lpx or padding: Vpx Hpx
    const paddingShorthand = style.match(/(?:^|;\s*)padding\s*:\s*(\d+)(?:px)?\s+(\d+)(?:px)?(?:\s+(\d+)(?:px)?\s+(\d+)(?:px)?)?/i);
    if (paddingShorthand) {
      if (paddingShorthand[4]) {
        // 4-value: T R B L
        return parseInt(paddingShorthand[2]) + parseInt(paddingShorthand[4]);
      } else {
        // 2-value: V H
        return parseInt(paddingShorthand[2]) * 2;
      }
    }

    // Check individual padding-left/right
    const pLeft = style.match(/padding-left\s*:\s*(\d+)/i);
    const pRight = style.match(/padding-right\s*:\s*(\d+)/i);
    if (pLeft || pRight) {
      return (pLeft ? parseInt(pLeft[1]) : 0) + (pRight ? parseInt(pRight[1]) : 0);
    }
  }

  return 0; // default: no padding
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
    const tdWithImg = [...trFull.matchAll(/<td[^>]*>[\s\S]*?<\/td>/gi)].filter(
      (m) => /<img\b/i.test(m[0])
    );
    if (tdWithImg.length < 2) continue; // not a multi-column grid row

    const columns = tdWithImg.length;

    // Extract all img tags from this row
    const imgTags = [...trFull.matchAll(/<img\b[^>]*>/gi)];
    if (imgTags.length < 2) continue;

    const images = imgTags.map((m) => parseImgTag(m[0]));

    // Derive gutter from td padding
    let totalHorizontalPadding = 0;
    for (const tdMatch of tdWithImg) {
      totalHorizontalPadding += extractTdHorizontalPadding(tdMatch[0]);
    }
    // If no explicit padding, estimate a small default gap
    const estimatedGap = totalHorizontalPadding > 0 ? totalHorizontalPadding : (columns - 1) * 10;

    // Calculate what the correct slot width SHOULD be
    const calculatedSlotWidth = Math.floor(
      (EMAIL_WIDTH - estimatedGap) / columns
    );

    // Determine target dimensions
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

    // Determine target height
    let targetW = calculatedSlotWidth;
    let targetH: number;

    if (allHeightsConsistent && existingHeights.length > 0) {
      const refWidth = existingWidths[0] || targetW;
      const aspectRatio = existingHeights[0] / refWidth;
      targetH = Math.round(targetW * aspectRatio);
    } else if (existingHeights.length > 0 && existingWidths.length > 0) {
      const aspectRatio = existingHeights[0] / (existingWidths[0] || targetW);
      targetH = Math.round(targetW * aspectRatio);
    } else {
      // Default to square for grids
      targetH = targetW;
    }

    // Clamp height to reasonable bounds
    targetH = Math.max(100, Math.min(targetH, 600));

    console.log(
      `[normalizeGridImages] Grid row: ${columns} columns, gap=${estimatedGap}px → ${targetW}×${targetH}px per slot`
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

      // Update inline style width/height if present — use FIXED pixel heights, never auto
      normalizedTag = normalizedTag.replace(
        /width:\s*\d+px/gi,
        `width:${targetW}px`
      );
      normalizedTag = normalizedTag.replace(
        /max-width:\s*\d+px/gi,
        `max-width:${targetW}px`
      );
      normalizedTag = normalizedTag.replace(
        /height:\s*\d+px/gi,
        `height:${targetH}px`
      );
      // Replace height:auto with fixed height — this is THE critical fix
      normalizedTag = normalizedTag.replace(
        /height:\s*auto/gi,
        `height:${targetH}px`
      );

      // Add object-fit:cover if not present for proper fill behavior
      if (!/object-fit/i.test(normalizedTag) && /style\s*=\s*"/i.test(normalizedTag)) {
        normalizedTag = normalizedTag.replace(
          /style\s*=\s*"/i,
          'style="object-fit:cover; '
        );
      }

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
