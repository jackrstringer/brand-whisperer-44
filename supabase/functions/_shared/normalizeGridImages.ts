/**
 * Deterministic post-processor that finds multi-image grid rows (<tr> with 2+ <td> containing <img>)
 * and normalizes all images within each row to identical dimensions + ImageKit transforms.
 * This ensures grids always have uniform image proportions regardless of AI output quality.
 */
export function normalizeGridImages(html: string): string {
  if (!html) return html;

  // Find all <tr> elements that contain multiple <td> elements with images
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let result = html;

  const trMatches: { full: string; content: string }[] = [];
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    trMatches.push({ full: trMatch[0], content: trMatch[1] });
  }

  for (const { full: trFull, content: trContent } of trMatches) {
    // Count <td> elements with images in this row
    const tdWithImg = [...trContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].filter(
      (m) => /<img\b/i.test(m[0])
    );
    if (tdWithImg.length < 2) continue; // not a grid row

    // Extract all img tags from this row
    const imgTags = [...trContent.matchAll(/<img\b([^>]*?)>/gi)];
    if (imgTags.length < 2) continue;

    // Parse width/height from each img tag
    const dimensions = imgTags.map((imgMatch) => {
      const attrs = imgMatch[1];
      const wMatch =
        attrs.match(/\bwidth\s*=\s*["']?(\d+)/i) || attrs.match(/w-(\d+)/);
      const hMatch =
        attrs.match(/\bheight\s*=\s*["']?(\d+)/i) || attrs.match(/h-(\d+)/);
      return {
        width: wMatch ? parseInt(wMatch[1]) : null,
        height: hMatch ? parseInt(hMatch[1]) : null,
        tag: imgMatch[0],
      };
    });

    // Find widths and heights
    const widths = dimensions.map((d) => d.width).filter(Boolean) as number[];
    const heights = dimensions.map((d) => d.height).filter(Boolean) as number[];

    if (widths.length === 0) continue;

    // Use the first image's dimensions as the canonical size
    const targetW = widths[0];
    const targetH = heights[0] || widths[0]; // default square if no height

    // Check if all images already have matching dimensions AND no height:auto lurking
    const allMatch =
      dimensions.every((d) => d.width === targetW || d.width === null) &&
      dimensions.every((d) => d.height === targetH || d.height === null);
    const hasHeightAuto = /height\s*:\s*auto/i.test(trFull);
    if (allMatch && !hasHeightAuto && widths.length === dimensions.length && heights.length === dimensions.length) continue;

    console.log(
      `[normalizeGridImages] Found mismatched grid row: widths=[${widths}] heights=[${heights}] → normalizing to ${targetW}×${targetH}`
    );

    // Normalize all img tags in this row to the target dimensions
    let normalizedTr = trFull;
    for (const dim of dimensions) {
      if (dim.width === targetW && dim.height === targetH) continue;

      let normalizedTag = dim.tag;

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

      // Update ImageKit transform — query param format: ?tr=...
      if (/ik\.imagekit\.io/i.test(normalizedTag)) {
        if (/[?&]tr=/i.test(normalizedTag)) {
          normalizedTag = normalizedTag.replace(
            /(\?|&)tr=[^"'\s&]*/gi,
            `$1tr=w-${targetW},h-${targetH},fo-auto`
          );
        } else {
          // Add ?tr= to ImageKit URL
          normalizedTag = normalizedTag.replace(
            /(ik\.imagekit\.io[^"'\s?]*)/gi,
            `$1?tr=w-${targetW},h-${targetH},fo-auto`
          );
        }

        // Handle path-based format: /tr:w-X,h-Y,.../
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

      normalizedTr = normalizedTr.replace(dim.tag, normalizedTag);
    }

    // Also normalize <td> container widths in this grid row
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
