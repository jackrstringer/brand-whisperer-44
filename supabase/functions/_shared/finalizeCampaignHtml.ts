/**
 * Unified HTML finalization pipeline used by both generate-campaign and edit-campaign.
 * Steps: clean legacy CSS → enforce no-stacking → normalize grid images → fix inline height:auto on grid images.
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
 * For images inside confirmed multi-column grid rows only, replace inline `height:auto`
 * with the explicit pixel height from the `height` attribute.
 * Uses the same depth-aware parsing as normalizeGridImages to avoid corrupting non-grid images.
 */
function fixGridImageInlineHeights(html: string): string {
  const trBlocks = findTopLevelTrBlocks(html);
  let result = html;

  for (const { full: trFull, innerHtml } of trBlocks) {
    // Use depth-aware parsing — same logic as normalizeGridImages
    const directTds = findDirectChildTds(innerHtml);
    const imageTds = directTds.filter(
      (td) => /<img\b/i.test(td) && !tdContainsNestedTable(td)
    );

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

export function finalizeCampaignHtml(html: string): string {
  if (!html) return html;

  let result = html;

  // Step 1: Clean any legacy helper CSS from prior generations
  result = cleanLegacyHelperCss(result);

  // Step 2: Enforce no-stacking for grid layouts
  result = enforceNoStackingLayout(result);

  // Step 3: Normalize grid image dimensions (geometry-driven, depth-aware)
  result = normalizeGridImages(result);

  // Step 4: Fix inline height:auto that contradicts height attributes on grid images only
  result = fixGridImageInlineHeights(result);

  return result;
}
