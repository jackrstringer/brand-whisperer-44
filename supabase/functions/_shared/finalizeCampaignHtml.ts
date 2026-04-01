/**
 * Unified HTML finalization pipeline used by both generate-campaign and edit-campaign.
 * Steps: clean legacy CSS → enforce no-stacking → normalize grid images → fix inline height:auto on grid images.
 */
import { enforceNoStackingLayout } from "./enforceNoStackingLayout.ts";
import { normalizeGridImages } from "./normalizeGridImages.ts";

/**
 * Strip legacy injected helper CSS from older versions of the system.
 */
function cleanLegacyHelperCss(html: string): string {
  // Remove old injected <style> blocks that contain our fingerprint comments
  return html.replace(
    /<style>\s*\/\*\s*(?:Prevent grid stacking|force-no-stack|no-stack helper)\s*\*\/[\s\S]*?<\/style>/gi,
    ""
  );
}

/**
 * For images inside multi-column grid rows, replace inline `height:auto`
 * with the explicit pixel height from the `height` attribute.
 * This is the KEY fix: the normalizer sets correct height attributes,
 * but `style="...height:auto..."` overrides them in the browser.
 */
function fixGridImageInlineHeights(html: string): string {
  // Find <tr> rows with multiple <td> containing images
  const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

  return html.replace(trRegex, (trBlock) => {
    // Count <td> with <img> inside
    const tdWithImg = [...trBlock.matchAll(/<td[^>]*>[\s\S]*?<\/td>/gi)].filter(
      (m) => /<img\b/i.test(m[0])
    );
    if (tdWithImg.length < 2) return trBlock; // not a grid row

    // For each img in this grid row, fix the inline height:auto to match the height attribute
    return trBlock.replace(/<img\b[^>]*>/gi, (imgTag) => {
      const heightAttr = imgTag.match(/\bheight\s*=\s*["']?(\d+)/i);
      if (!heightAttr) return imgTag; // no height attribute to enforce

      const h = heightAttr[1];

      // Replace height:auto with height:Xpx in inline style
      let fixed = imgTag.replace(/height\s*:\s*auto/gi, `height:${h}px`);

      // Also fix max-width to match width attribute if present
      const widthAttr = imgTag.match(/\bwidth\s*=\s*["']?(\d+)/i);
      if (widthAttr) {
        const w = widthAttr[1];
        fixed = fixed.replace(
          /max-width\s*:\s*\d+px/gi,
          `max-width:${w}px`
        );
      }

      // Add object-fit:cover for consistent fill behavior
      if (!/object-fit/i.test(fixed)) {
        fixed = fixed.replace(
          /style\s*=\s*"/i,
          'style="object-fit:cover; '
        );
      }

      return fixed;
    });
  });
}

export function finalizeCampaignHtml(html: string): string {
  if (!html) return html;

  let result = html;

  // Step 1: Clean any legacy helper CSS from prior generations
  result = cleanLegacyHelperCss(result);

  // Step 2: Enforce no-stacking for grid layouts
  result = enforceNoStackingLayout(result);

  // Step 3: Normalize grid image dimensions (geometry-driven)
  result = normalizeGridImages(result);

  // Step 4: Fix inline height:auto that contradicts height attributes on grid images
  result = fixGridImageInlineHeights(result);

  return result;
}
