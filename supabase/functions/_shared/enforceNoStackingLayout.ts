/**
 * Deterministic post-processor: strips mobile-collapse rules and injects
 * table-cell styling so multi-column layouts never stack vertically.
 */
export function enforceNoStackingLayout(html: string): string {
  if (!html) return html;

  let output = html;

  // Remove common mobile-collapse rules that force side-by-side layouts into a single column
  const collapseSelectorPattern =
    /\.(?:[a-z0-9_-]*?(?:grid|col|column|two-col|two_col|product|gift)[a-z0-9_-]*?(?:cell|col|column)?|(?:product-grid-cell|two-col-cell|gift-cell|column-cell|grid-cell))\s*\{[^}]*\}/gi;
  output = output.replace(collapseSelectorPattern, (rule) => {
    return rule
      .replace(/display\s*:\s*block\s*!important;?/gi, "")
      .replace(/width\s*:\s*100%\s*!important;?/gi, "")
      .replace(/float\s*:\s*none\s*!important;?/gi, "")
      .replace(/max-width\s*:\s*100%\s*!important;?/gi, "")
      .replace(/;\s*;/g, ";");
  });

  // Also strip any @media rules that force display:block or width:100% on td elements
  // This catches generic stacking rules the AI might add
  output = output.replace(
    /@media[^{]*\{([^}]*\{[^}]*\})*[^}]*\}/gi,
    (mediaBlock) => {
      // Remove rules inside media queries that force stacking on table cells
      return mediaBlock.replace(
        /([^{}]*)\{([^}]*)\}/g,
        (rule, selector, body) => {
          // If rule targets td or table cells and forces stacking, strip those properties
          if (/\btd\b/i.test(selector)) {
            const cleaned = body
              .replace(/display\s*:\s*block\s*!important;?/gi, "")
              .replace(/width\s*:\s*100%\s*!important;?/gi, "")
              .replace(/float\s*:\s*none\s*!important;?/gi, "")
              .replace(/;\s*;/g, ";")
              .trim();
            if (!cleaned || cleaned === ";") return "";
            return `${selector}{${cleaned}}`;
          }
          return rule;
        }
      );
    }
  );

  // Force common multi-column classes to remain side-by-side at all breakpoints
  if (/<head[^>]*>/i.test(output)) {
    output = output.replace(
      /(<head[^>]*>)/i,
      `$1<style>.product-grid-cell,.two-col-cell,.gift-cell,.column-cell,.grid-cell{display:table-cell !important;vertical-align:top !important;}.product-grid-cell,.two-col-cell,.column-cell,.grid-cell{width:auto !important;}</style>`
    );
  }

  return output;
}
