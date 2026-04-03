/**
 * Targeted post-processor: prevents multi-column layouts from stacking
 * vertically by injecting a focused CSS rule for table cells.
 *
 * Unlike the previous version, this does NOT:
 * - Strip ALL mobile-responsive media queries
 * - Inject class-based styles that depend on specific AI-generated class names
 *
 * Instead it injects a single targeted rule that forces table cells to
 * remain side-by-side, which is the desired behavior for email grids.
 */
export function enforceNoStackingLayout(html: string): string {
  if (!html) return html;

  let output = html;

  // Only strip media query rules that explicitly force td to display:block
  // (the most common mobile-stacking pattern in email HTML)
  output = output.replace(
    /@media[^{]*\{([\s\S]*?)\}\s*\}/gi,
    (mediaBlock) => {
      return mediaBlock.replace(
        /([^{}]*)\{([^}]*)\}/g,
        (rule, selector, body) => {
          // If rule targets td elements and forces stacking, strip those properties
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

  // Strip display:inline-block from table elements used as grid columns
  // (align="left" + display:inline-block is a common but broken pattern)
  output = output.replace(
    /<table\b([^>]*)\balign\s*=\s*["']?left["']?([^>]*)>/gi,
    (match, before, after) => {
      if (/display\s*:\s*inline-block/i.test(match)) {
        return match.replace(/display\s*:\s*inline-block\s*;?/gi, "");
      }
      return match;
    }
  );

  // Inject a targeted rule that keeps table cells side-by-side
  // Uses !important on display to override any remaining mobile rules
  if (/<head[^>]*>/i.test(output)) {
    const noStackStyle = `<style>
/* Prevent grid stacking */
table td[width] { display: table-cell !important; vertical-align: top !important; }
</style>`;
    output = output.replace(/(<head[^>]*>)/i, `$1${noStackStyle}`);
  }

  return output;
}
