/**
 * Deterministic post-processor that finds multi-image grid rows and normalizes
 * image dimensions based on the email layout width and column count.
 *
 * Uses depth-aware parsing to only process direct child <td> cells of a <tr>,
 * preventing wrapper rows from being misidentified as grids.
 */

const EMAIL_WIDTH = 390;
const MIN_GRID_SLOT_WIDTH = 100; // Safety: abort if computed width is unreasonably small
const MAX_GRID_COLUMNS = 4; // Safety: real email grids are 2-4 columns
const MIN_GRID_COLUMNS = 2;

interface ParsedImage {
  tag: string;
  width: number | null;
  height: number | null;
  hasImageKitTransform: boolean;
  isImageKit: boolean;
}

function parseImgTag(imgTag: string): ParsedImage {
  const wMatch =
    imgTag.match(/\bwidth\s*=\s*["']?(\d+)/i) || imgTag.match(/\bw-(\d+)/);
  const hMatch =
    imgTag.match(/\bheight\s*=\s*["']?(\d+)/i) || imgTag.match(/\bh-(\d+)/);
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
 * Extract horizontal padding from a <td> tag's inline styles.
 */
function extractTdHorizontalPadding(tdTag: string): number {
  const styleMatch = tdTag.match(/style\s*=\s*"([^"]*)"/i);
  if (styleMatch) {
    const style = styleMatch[1];
    const paddingShorthand = style.match(
      /(?:^|;\s*)padding\s*:\s*(\d+)(?:px)?\s+(\d+)(?:px)?(?:\s+(\d+)(?:px)?\s+(\d+)(?:px)?)?/i
    );
    if (paddingShorthand) {
      if (paddingShorthand[4]) {
        return parseInt(paddingShorthand[2]) + parseInt(paddingShorthand[4]);
      } else {
        return parseInt(paddingShorthand[2]) * 2;
      }
    }
    const pLeft = style.match(/padding-left\s*:\s*(\d+)/i);
    const pRight = style.match(/padding-right\s*:\s*(\d+)/i);
    if (pLeft || pRight) {
      return (pLeft ? parseInt(pLeft[1]) : 0) + (pRight ? parseInt(pRight[1]) : 0);
    }
  }
  return 0;
}

/**
 * Depth-aware: find the direct child <td> elements of a <tr> block.
 * Skips any <td> that is inside a nested <table>.
 */
function findDirectChildTds(trInnerHtml: string): string[] {
  const results: string[] = [];
  let i = 0;
  let tableDepth = 0;

  while (i < trInnerHtml.length) {
    // Track nested table depth
    const nextTableOpen = trInnerHtml.indexOf("<table", i);
    const nextTableClose = trInnerHtml.indexOf("</table", i);
    const nextTdOpen = trInnerHtml.indexOf("<td", i);

    // Find the earliest tag
    const candidates = [
      { type: "table-open", idx: nextTableOpen },
      { type: "table-close", idx: nextTableClose },
      { type: "td-open", idx: nextTdOpen },
    ].filter((c) => c.idx !== -1).sort((a, b) => a.idx - b.idx);

    if (candidates.length === 0) break;

    const next = candidates[0];

    if (next.type === "table-open") {
      tableDepth++;
      i = next.idx + 6;
    } else if (next.type === "table-close") {
      tableDepth = Math.max(0, tableDepth - 1);
      i = next.idx + 8;
    } else if (next.type === "td-open") {
      if (tableDepth === 0) {
        // This is a direct child <td> — extract the full <td>...</td> block
        const tdStart = next.idx;
        // Find the matching </td>, tracking nested td depth
        let tdDepth = 1;
        let j = tdStart;
        // Skip past the opening <td...> tag
        const openTagEnd = trInnerHtml.indexOf(">", tdStart);
        if (openTagEnd === -1) { i = tdStart + 3; continue; }
        j = openTagEnd + 1;

        while (j < trInnerHtml.length && tdDepth > 0) {
          const nextTdO = trInnerHtml.indexOf("<td", j);
          const nextTdC = trInnerHtml.indexOf("</td>", j);

          if (nextTdC === -1) break;

          if (nextTdO !== -1 && nextTdO < nextTdC) {
            tdDepth++;
            j = nextTdO + 3;
          } else {
            tdDepth--;
            if (tdDepth === 0) {
              const tdFull = trInnerHtml.substring(tdStart, nextTdC + 5);
              results.push(tdFull);
            }
            j = nextTdC + 5;
          }
        }
        i = j;
      } else {
        // <td> inside a nested table — skip
        i = next.idx + 3;
      }
    } else {
      i++;
    }
  }

  return results;
}

/**
 * Check if a <td> contains a nested <table> (meaning it's a layout wrapper, not a grid cell).
 */
function tdContainsNestedTable(tdHtml: string): boolean {
  // Look for <table inside the td content (after the opening <td> tag)
  const innerStart = tdHtml.indexOf(">") + 1;
  const inner = tdHtml.substring(innerStart);
  return /<table\b/i.test(inner);
}

/**
 * Find <tr> blocks using depth-tracking.
 */
function findTopLevelTrBlocks(html: string): { full: string; start: number; innerHtml: string }[] {
  const results: { full: string; start: number; innerHtml: string }[] = [];
  const trOpenRegex = /<tr\b[^>]*>/gi;
  let match;

  while ((match = trOpenRegex.exec(html)) !== null) {
    const startIdx = match.index;
    const openTagEnd = startIdx + match[0].length;
    let depth = 1;
    let i = openTagEnd;

    while (i < html.length && depth > 0) {
      const nextOpen = html.indexOf("<tr", i);
      const nextClose = html.indexOf("</tr>", i);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        if (/^<tr[\s>]/i.test(html.substring(nextOpen, nextOpen + 5))) {
          depth++;
        }
        i = nextOpen + 3;
      } else {
        depth--;
        if (depth === 0) {
          const full = html.substring(startIdx, nextClose + 5);
          const innerHtml = html.substring(openTagEnd, nextClose);
          results.push({ full, start: startIdx, innerHtml });
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

  for (const { full: trFull, innerHtml } of trBlocks) {
    // Use depth-aware parsing to find only DIRECT child <td> elements
    const directTds = findDirectChildTds(innerHtml);

    // Filter to only <td>s that contain an <img> tag AND do not contain nested tables
    const imageTds = directTds.filter(
      (td) => /<img\b/i.test(td) && !tdContainsNestedTable(td)
    );

    // Must be a real grid: 2-4 direct image cells, no nested tables
    if (imageTds.length < MIN_GRID_COLUMNS || imageTds.length > MAX_GRID_COLUMNS) {
      continue;
    }

    const columns = imageTds.length;

    // Extract img tags only from the direct image cells (not from nested content)
    const images: ParsedImage[] = [];
    for (const td of imageTds) {
      const imgMatch = td.match(/<img\b[^>]*>/i);
      if (imgMatch) {
        images.push(parseImgTag(imgMatch[0]));
      }
    }

    if (images.length < MIN_GRID_COLUMNS) continue;

    // Derive gutter from td padding
    let totalHorizontalPadding = 0;
    for (const td of imageTds) {
      totalHorizontalPadding += extractTdHorizontalPadding(td);
    }
    const estimatedGap =
      totalHorizontalPadding > 0
        ? totalHorizontalPadding
        : (columns - 1) * 10;

    // Calculate slot width
    const calculatedSlotWidth = Math.floor(
      (EMAIL_WIDTH - estimatedGap) / columns
    );

    // SAFETY GUARD: If computed width is implausibly small, skip this row entirely
    if (calculatedSlotWidth < MIN_GRID_SLOT_WIDTH) {
      console.warn(
        `[normalizeGridImages] Skipping row: computed slot width ${calculatedSlotWidth}px is below safety threshold ${MIN_GRID_SLOT_WIDTH}px (columns=${columns}, gap=${estimatedGap})`
      );
      continue;
    }

    // Check if all images already have consistent, reasonable dimensions
    const existingWidths = images
      .map((img) => img.width)
      .filter((w): w is number => w !== null && w > 0);
    const existingHeights = images
      .map((img) => img.height)
      .filter((h): h is number => h !== null && h > 0);

    const allHaveCorrectWidth =
      existingWidths.length === images.length &&
      existingWidths.every((w) => Math.abs(w - calculatedSlotWidth) < 30);
    const allHaveHeight = existingHeights.length === images.length;
    const allHeightsConsistent =
      allHaveHeight &&
      existingHeights.every((h) => Math.abs(h - existingHeights[0]) < 20);
    const allHaveTransforms = images.every(
      (img) => !img.isImageKit || img.hasImageKitTransform
    );

    if (allHaveCorrectWidth && allHeightsConsistent && allHaveTransforms) {
      continue;
    }

    // Determine target dimensions
    let targetW = calculatedSlotWidth;
    let targetH: number;

    // Only use existing dimensions if they're reasonable (not logo-sized)
    const validHeights = existingHeights.filter((h) => h > MIN_GRID_SLOT_WIDTH);
    const validWidths = existingWidths.filter((w) => w > MIN_GRID_SLOT_WIDTH);

    if (validHeights.length > 0 && validWidths.length > 0) {
      const aspectRatio = validHeights[0] / validWidths[0];
      targetH = Math.round(targetW * aspectRatio);
    } else {
      // Default to square for grids when no reasonable reference exists
      targetH = targetW;
    }

    // Clamp height to reasonable bounds
    targetH = Math.max(MIN_GRID_SLOT_WIDTH, Math.min(targetH, 600));

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
        normalizedTag = normalizedTag.replace(/<img\b/i, `<img width="${targetW}"`);
      }

      // Update or add height attribute
      if (/\bheight\s*=/i.test(normalizedTag)) {
        normalizedTag = normalizedTag.replace(
          /\bheight\s*=\s*["']?\d+["']?/i,
          `height="${targetH}"`
        );
      } else {
        normalizedTag = normalizedTag.replace(/<img\b/i, `<img height="${targetH}"`);
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
        normalizedTag = normalizedTag.replace(
          /(ik\.imagekit\.io\/[^/]+\/)tr:[^/]+\//gi,
          `$1tr:w-${targetW},h-${targetH},fo-auto/`
        );
      }

      // Update inline style dimensions — fixed pixel heights, never auto
      normalizedTag = normalizedTag.replace(/width:\s*\d+px/gi, `width:${targetW}px`);
      normalizedTag = normalizedTag.replace(/max-width:\s*\d+px/gi, `max-width:${targetW}px`);
      normalizedTag = normalizedTag.replace(/height:\s*\d+px/gi, `height:${targetH}px`);
      normalizedTag = normalizedTag.replace(/height:\s*auto/gi, `height:${targetH}px`);

      // Add object-fit:cover if not present
      if (!/object-fit/i.test(normalizedTag) && /style\s*=\s*"/i.test(normalizedTag)) {
        normalizedTag = normalizedTag.replace(
          /style\s*=\s*"/i,
          'style="object-fit:cover; '
        );
      }

      normalizedTr = normalizedTr.replace(img.tag, normalizedTag);
    }

    // Normalize <td> container widths in this grid row
    for (const tdFull of imageTds) {
      if (!normalizedTr.includes(tdFull)) continue;
      let normalizedTd = tdFull;
      if (/\bwidth\s*=/i.test(normalizedTd)) {
        normalizedTd = normalizedTd.replace(
          /\bwidth\s*=\s*["']?\d+["']?/i,
          `width="${targetW}"`
        );
      }
      normalizedTd = normalizedTd.replace(/width:\s*\d+px/gi, `width:${targetW}px`);
      normalizedTr = normalizedTr.replace(tdFull, normalizedTd);
    }

    result = result.replace(trFull, normalizedTr);
  }

  return result;
}

// Re-export the direct child td finder for use by finalizeCampaignHtml
export { findTopLevelTrBlocks, findDirectChildTds, tdContainsNestedTable, MIN_GRID_COLUMNS, MAX_GRID_COLUMNS };
