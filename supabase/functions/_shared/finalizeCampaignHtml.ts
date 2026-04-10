/**
 * Unified HTML finalization pipeline used by both generate-campaign and edit-campaign.
 * Steps: clean legacy CSS → enforce no-stacking → normalize grid images → fix inline height:auto on grid images → fix button tables.
 */
import { enforceNoStackingLayout } from "./enforceNoStackingLayout.ts";
import { normalizeGridImages, findTopLevelTrBlocks, findDirectChildTds, tdContainsNestedTable, MIN_GRID_COLUMNS, MAX_GRID_COLUMNS } from "./normalizeGridImages.ts";

/**
 * Strip legacy injected helper CSS from older versions of the system.
 */
function cleanLegacyHelperCss(html: string): string {
  return html.replace(
    /<style>\s*\/\*\s*(?:Prevent grid stacking|force-no-stack|no-stack helper)\s*\*\/[\s\S]*?<\/style>/gi,
    ""
  );
}

/**
 * Check if a <td> contains a card-style nested table (image + label).
 */
function tdContainsCardTable(tdHtml: string): boolean {
  const innerStart = tdHtml.indexOf(">") + 1;
  const inner = tdHtml.substring(innerStart);
  if (!/<table\b/i.test(inner)) return false;
  if (!/<img\b/i.test(inner)) return false;
  const tableCount = (inner.match(/<table\b/gi) || []).length;
  if (tableCount > 2) return false;
  const trCount = (inner.match(/<tr\b/gi) || []).length;
  if (trCount > 4) return false;
  const imgCount = (inner.match(/<img\b/gi) || []).length;
  if (imgCount > 2) return false;
  return true;
}

/**
 * Determine if a td is a grid image cell (simple img or card-style nested table).
 */
function isGridImageTd(td: string): boolean {
  if (!/<img\b/i.test(td)) return false;
  if (!tdContainsNestedTable(td)) return true;
  return tdContainsCardTable(td);
}

/**
 * For images inside confirmed multi-column grid rows only, replace inline `height:auto`
 * with the explicit pixel height from the `height` attribute.
 * Handles both simple grid cells and card-style nested table cells.
 */
function fixGridImageInlineHeights(html: string): string {
  const trBlocks = findTopLevelTrBlocks(html);
  let result = html;

  for (const { full: trFull, innerHtml } of trBlocks) {
    const directTds = findDirectChildTds(innerHtml);
    const imageTds = directTds.filter(isGridImageTd);

    // Only process confirmed grid rows (2-4 direct image cells)
    if (imageTds.length < MIN_GRID_COLUMNS || imageTds.length > MAX_GRID_COLUMNS) {
      continue;
    }

    // Fix each img in this confirmed grid row
    let fixedTr = trFull;
    for (const td of imageTds) {
      const imgMatch = td.match(/<img\b[^>]*>/gi);
      if (!imgMatch) continue;

      for (const imgTag of imgMatch) {
        const heightAttr = imgTag.match(/\bheight\s*=\s*["']?(\d+)/i);
        if (!heightAttr) continue;

        const h = heightAttr[1];
        let fixed = imgTag;

        // Replace height:auto with height:Xpx in inline style
        fixed = fixed.replace(/height\s*:\s*auto/gi, `height:${h}px`);

        // Fix max-width to match width attribute if present
        const widthAttr = imgTag.match(/\bwidth\s*=\s*["']?(\d+)/i);
        if (widthAttr) {
          const w = widthAttr[1];
          fixed = fixed.replace(/max-width\s*:\s*\d+px/gi, `max-width:${w}px`);
        }

        // Add object-fit:cover for consistent fill behavior
        if (!/object-fit/i.test(fixed)) {
          fixed = fixed.replace(/style\s*=\s*"/i, 'style="object-fit:cover; ');
        }

        if (fixed !== imgTag) {
          fixedTr = fixedTr.replace(imgTag, fixed);
        }
      }
    }

    if (fixedTr !== trFull) {
      result = result.replace(trFull, fixedTr);
    }
  }

  return result;
}

/**
 * Find CTA button wrapper tables (single-row, single-cell with background-color and an <a>)
 * and ensure they shrink-wrap via margin:0 auto instead of stretching full-width.
 */
function fixButtonTableWidth(html: string): string {
  return html.replace(
    /<table\b([^>]*)>\s*<tr>\s*<td\b([^>]*background-color[^>]*)>[\s\S]*?<a\b[^>]*>[\s\S]*?<\/a>[\s\S]*?<\/td>\s*<\/tr>\s*<\/table>/gi,
    (match, tableAttrs) => {
      if (/margin\s*:\s*0\s*auto/i.test(tableAttrs)) return match;
      
      if (/style\s*=/i.test(tableAttrs)) {
        return match.replace(
          /(<table\b[^>]*style\s*=\s*["'])/i,
          '$1margin:0 auto; '
        );
      } else {
        return match.replace(
          /(<table\b)/i,
          '$1 style="margin:0 auto;"'
        );
      }
    }
  );
}

/**
 * Force equal-width columns in grid rows where the AI generated asymmetric widths.
 * Detects grid rows (2-4 direct td children with images) and ensures all tds
 * have the same width attribute.
 */
function forceEqualGridColumns(html: string): string {
  const EMAIL_WIDTH = 390;
  const trBlocks = findTopLevelTrBlocks(html);
  let result = html;

  for (const { full: trFull, innerHtml } of trBlocks) {
    const directTds = findDirectChildTds(innerHtml);
    const imageTds = directTds.filter(isGridImageTd);

    if (imageTds.length < MIN_GRID_COLUMNS || imageTds.length > MAX_GRID_COLUMNS) {
      continue;
    }

    // Extract current widths from td opening tags
    const tdWidths = imageTds.map(td => {
      const m = td.match(/^<td\b[^>]*>/i);
      if (!m) return null;
      const wAttr = m[0].match(/\bwidth\s*=\s*["']?(\d+)/i);
      return wAttr ? parseInt(wAttr[1]) : null;
    });

    // Check if widths are already equal (or all missing)
    const definedWidths = tdWidths.filter((w): w is number => w !== null);
    if (definedWidths.length === 0) continue; // No widths to fix

    const allEqual = definedWidths.every(w => Math.abs(w - definedWidths[0]) < 10);
    if (allEqual && definedWidths.length === imageTds.length) continue; // Already equal

    // Calculate correct equal width
    const columns = imageTds.length;
    const gutter = (columns - 1) * 4;
    const equalWidth = Math.floor((EMAIL_WIDTH - gutter) / columns);

    console.log(`[forceEqualGridColumns] Fixing asymmetric grid: ${columns} columns, widths were [${definedWidths.join(',')}] → ${equalWidth}px each`);

    let fixedTr = trFull;
    for (const td of imageTds) {
      const tdOpenMatch = td.match(/^<td\b[^>]*>/i);
      if (!tdOpenMatch) continue;

      let tdOpen = tdOpenMatch[0];
      const originalTdOpen = tdOpen;

      // Fix width attribute
      if (/\bwidth\s*=\s*["']?\d+/i.test(tdOpen)) {
        tdOpen = tdOpen.replace(/\bwidth\s*=\s*["']?\d+["']?/i, `width="${equalWidth}"`);
      } else {
        tdOpen = tdOpen.replace(/<td\b/i, `<td width="${equalWidth}"`);
      }

      // Fix inline style width
      tdOpen = tdOpen.replace(/width:\s*\d+px/gi, `width:${equalWidth}px`);
      // Fix percentage widths
      tdOpen = tdOpen.replace(/width:\s*\d+%/gi, `width:${equalWidth}px`);

      if (tdOpen !== originalTdOpen) {
        fixedTr = fixedTr.replace(originalTdOpen, tdOpen);
      }
    }

    if (fixedTr !== trFull) {
      result = result.replace(trFull, fixedTr);
    }
  }

  return result;
}

/**
 * Convert percentage widths on <td> elements to explicit pixel values.
 * AI frequently generates width="50%" or width="33%" despite rules.
 */
function convertPercentageWidthsToPixels(html: string): string {
  const EMAIL_WIDTH = 390;
  const PERCENT_MAP: Record<string, number> = {
    "50%": Math.floor(EMAIL_WIDTH / 2),
    "33%": Math.floor(EMAIL_WIDTH / 3),
    "34%": Math.floor(EMAIL_WIDTH / 3),
    "25%": Math.floor(EMAIL_WIDTH / 4),
  };

  let result = html;
  // Fix width="50%" attribute on td elements
  result = result.replace(
    /(<td\b[^>]*)\bwidth\s*=\s*["']?(\d+%?)["']?/gi,
    (match, prefix, widthVal) => {
      const px = PERCENT_MAP[widthVal];
      if (px) {
        return `${prefix}width="${px}"`;
      }
      return match;
    }
  );
  // Fix width:50% in inline styles on td elements
  result = result.replace(
    /(<td\b[^>]*style\s*=\s*["'][^"']*)width\s*:\s*(\d+)%/gi,
    (match, prefix, pct) => {
      const px = PERCENT_MAP[`${pct}%`];
      if (px) {
        return `${prefix}width:${px}px`;
      }
      return match;
    }
  );
  return result;
}

/**
 * Inject overflow-x:hidden guardrail into generated HTML to prevent
 * any content from ever exceeding the viewport width.
 */
function injectOverflowGuardrail(html: string): string {
  const guardrailCSS = `<style>html,body{overflow-x:hidden;max-width:100%;}</style>`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/(<head[^>]*>)/i, `$1${guardrailCSS}`);
  }
  // No <head> tag — prepend
  return guardrailCSS + html;
}

/**
 * Remove nonsensical $0.00 strikethrough pricing patterns from generated HTML.
 * Catches patterns like <del>$0.00</del> or <s>$0.00</s> followed by a real price.
 */
function stripZeroPricing(html: string): string {
  // Remove <del>$0.00</del> or <s>$0.00</s> patterns
  return html.replace(
    /<(del|s)\b[^>]*>\s*\$0(\.00)?\s*<\/\1>/gi,
    ""
  );
}

export function finalizeCampaignHtml(html: string): string {
  if (!html) return html;

  let result = html;

  // Step 1: Clean any legacy helper CSS from prior generations
  result = cleanLegacyHelperCss(result);

  // Step 2: Enforce no-stacking for grid layouts
  result = enforceNoStackingLayout(result);

  // Step 3: Convert percentage widths to pixels before grid processing
  result = convertPercentageWidthsToPixels(result);

  // Step 4: Force equal-width columns in asymmetric grids
  result = forceEqualGridColumns(result);

  // Step 5: Normalize grid image dimensions (geometry-driven, depth-aware)
  result = normalizeGridImages(result);

  // Step 6: Fix inline height:auto that contradicts height attributes on grid images only
  result = fixGridImageInlineHeights(result);

  // Step 7: Fix CTA button wrapper tables stretching full-width
  result = fixButtonTableWidth(result);

  // Step 8: Strip nonsensical $0 pricing
  result = stripZeroPricing(result);

  // Step 9: Inject overflow-x guardrail (always last)
  result = injectOverflowGuardrail(result);

  return result;
}
