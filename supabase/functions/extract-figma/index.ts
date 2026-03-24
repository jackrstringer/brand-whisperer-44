import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function figmaColorToHex(color: { r: number; g: number; b: number }): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}

interface TextNode {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  italic: boolean;
  lineHeightPx?: number;
  letterSpacing?: number;
  textContent: string;
}

interface ColorEntry {
  hex: string;
  count: number;
  contexts: string[];
}

function traverseNodes(
  node: any,
  textNodes: TextNode[],
  colorMap: Map<string, ColorEntry>,
  radii: number[],
  spacings: { padding: number[]; gaps: number[] },
  depth = 0
) {
  if (!node) return;

  // Text nodes
  if (node.type === "TEXT" && node.style) {
    const s = node.style;
    textNodes.push({
      fontFamily: s.fontFamily || "Unknown",
      fontWeight: s.fontWeight || 400,
      fontSize: s.fontSize || 14,
      italic: s.italic === true,
      lineHeightPx: s.lineHeightPx,
      letterSpacing: s.letterSpacing,
      textContent: (node.characters || "").slice(0, 200),
    });
  }

  // Color fills
  if (node.fills && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (fill.type === "SOLID" && fill.color && fill.visible !== false) {
        const hex = figmaColorToHex(fill.color);
        const existing = colorMap.get(hex);
        const context = node.type || "unknown";
        if (existing) {
          existing.count++;
          if (!existing.contexts.includes(context)) existing.contexts.push(context);
        } else {
          colorMap.set(hex, { hex, count: 1, contexts: [context] });
        }
      }
    }
  }

  // Strokes
  if (node.strokes && Array.isArray(node.strokes)) {
    for (const stroke of node.strokes) {
      if (stroke.type === "SOLID" && stroke.color && stroke.visible !== false) {
        const hex = figmaColorToHex(stroke.color);
        const existing = colorMap.get(hex);
        if (existing) {
          existing.count++;
          if (!existing.contexts.includes("STROKE")) existing.contexts.push("STROKE");
        } else {
          colorMap.set(hex, { hex, count: 1, contexts: ["STROKE"] });
        }
      }
    }
  }

  // Border radius
  if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
    radii.push(node.cornerRadius);
  }

  // Auto-layout padding/spacing
  if (node.paddingLeft != null) spacings.padding.push(node.paddingLeft);
  if (node.paddingRight != null) spacings.padding.push(node.paddingRight);
  if (node.paddingTop != null) spacings.padding.push(node.paddingTop);
  if (node.paddingBottom != null) spacings.padding.push(node.paddingBottom);
  if (node.itemSpacing != null) spacings.gaps.push(node.itemSpacing);

  // Recurse children
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      traverseNodes(child, textNodes, colorMap, radii, spacings, depth + 1);
    }
  }
}

function categorizeFont(textNodes: TextNode[]): { headline: any; body: any } | null {
  if (textNodes.length === 0) return null;

  // Group by font family
  const fontGroups = new Map<string, { sizes: number[]; weights: Set<number>; italicUsed: boolean }>();
  for (const tn of textNodes) {
    const key = tn.fontFamily;
    if (!fontGroups.has(key)) {
      fontGroups.set(key, { sizes: [], weights: new Set(), italicUsed: false });
    }
    const g = fontGroups.get(key)!;
    g.sizes.push(tn.fontSize);
    g.weights.add(tn.fontWeight);
    if (tn.italic) g.italicUsed = true;
  }

  // Find the font used at the largest average size (headline) vs the most common font (body)
  let headlineFont = "";
  let headlineAvgSize = 0;
  let bodyFont = "";
  let bodyCount = 0;

  for (const [family, data] of fontGroups) {
    const avg = data.sizes.reduce((a, b) => a + b, 0) / data.sizes.length;
    if (avg > headlineAvgSize) {
      headlineAvgSize = avg;
      headlineFont = family;
    }
    if (data.sizes.length > bodyCount) {
      bodyCount = data.sizes.length;
      bodyFont = family;
    }
  }

  // If same font, try to differentiate by weight
  if (headlineFont === bodyFont && fontGroups.size > 1) {
    for (const [family] of fontGroups) {
      if (family !== headlineFont) {
        bodyFont = family;
        break;
      }
    }
  }

  const hGroup = fontGroups.get(headlineFont);
  const bGroup = fontGroups.get(bodyFont);

  return {
    headline: {
      family: headlineFont,
      weights: hGroup ? Array.from(hGroup.weights).sort() : [],
      italic_used: hGroup?.italicUsed ?? false,
    },
    body: {
      family: bodyFont,
      weights: bGroup ? Array.from(bGroup.weights).sort() : [],
      italic_used: bGroup?.italicUsed ?? false,
    },
  };
}

function mostCommon(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const counts = new Map<number, number>();
  for (const v of arr) counts.set(v, (counts.get(v) || 0) + 1);
  let best = arr[0];
  let bestCount = 0;
  for (const [val, count] of counts) {
    if (count > bestCount) { best = val; bestCount = count; }
  }
  return best;
}

function uniqueSorted(arr: number[]): number[] {
  return [...new Set(arr)].sort((a, b) => a - b);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { figma_url, figma_token } = await req.json();
    if (!figma_url || !figma_token) {
      return new Response(JSON.stringify({ error: "figma_url and figma_token are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse file key and optional node ID from URL
    const fileKeyMatch = figma_url.match(/(?:file|design)\/([a-zA-Z0-9]+)/);
    if (!fileKeyMatch) {
      return new Response(JSON.stringify({ error: "Invalid Figma URL -- could not extract file key" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fileKey = fileKeyMatch[1];

    // Extract node ID (formats: node-id=123:456 or node-id=123-456)
    const nodeIdMatch = figma_url.match(/node-id=([^&]+)/);
    let nodeId = nodeIdMatch ? decodeURIComponent(nodeIdMatch[1]).replace(/-/g, ":") : null;

    let apiUrl: string;
    if (nodeId) {
      apiUrl = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`;
    } else {
      // Fetch full file but limit depth to avoid huge payloads
      apiUrl = `https://api.figma.com/v1/files/${fileKey}?depth=5`;
    }

    console.log(`[extract-figma] Fetching: ${apiUrl}`);

    const figmaResp = await fetch(apiUrl, {
      headers: { "X-Figma-Token": figma_token },
    });

    if (!figmaResp.ok) {
      const errText = await figmaResp.text();
      return new Response(JSON.stringify({ error: `Figma API error: ${figmaResp.status} - ${errText}` }), {
        status: figmaResp.status === 403 ? 403 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const figmaData = await figmaResp.json();

    // Get the root node to traverse
    let rootNode: any;
    if (nodeId && figmaData.nodes) {
      const nodeKey = Object.keys(figmaData.nodes)[0];
      rootNode = figmaData.nodes[nodeKey]?.document;
    } else {
      rootNode = figmaData.document;
    }

    if (!rootNode) {
      return new Response(JSON.stringify({ error: "Could not find document in Figma response" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Traverse
    const textNodes: TextNode[] = [];
    const colorMap = new Map<string, ColorEntry>();
    const radii: number[] = [];
    const spacings = { padding: [] as number[], gaps: [] as number[] };

    traverseNodes(rootNode, textNodes, colorMap, radii, spacings);

    console.log(`[extract-figma] Found ${textNodes.length} text nodes, ${colorMap.size} unique colors, ${radii.length} radii`);

    // Build confirmed properties
    const fonts = categorizeFont(textNodes);

    // Sort colors by frequency
    const allColors = Array.from(colorMap.values()).sort((a, b) => b.count - a.count);

    // Identify color roles heuristically
    const colorsByContext: Record<string, string[]> = {};
    for (const c of allColors) {
      for (const ctx of c.contexts) {
        if (!colorsByContext[ctx]) colorsByContext[ctx] = [];
        colorsByContext[ctx].push(c.hex);
      }
    }

    // Primary accent = most used non-white, non-black color
    const nonBWColors = allColors.filter(c =>
      c.hex !== "#FFFFFF" && c.hex !== "#000000" && c.hex !== "#FEFEFE" && c.hex !== "#010101"
    );
    const primaryAccent = nonBWColors[0]?.hex || null;

    const confirmedProperties = {
      fonts: fonts || undefined,
      colors: {
        primary_accent: primaryAccent,
        all_colors_found: allColors.slice(0, 20).map(c => c.hex),
        colors_by_frequency: allColors.slice(0, 10).map(c => ({ hex: c.hex, count: c.count, contexts: c.contexts })),
      },
      buttons: {
        border_radius: mostCommon(radii),
        font_weight: fonts?.body?.weights?.includes(700) ? 700 : (fonts?.body?.weights?.[fonts.body.weights.length - 1] || 700),
        font_style: "normal" as const,
      },
      spacing: {
        common_padding: uniqueSorted(spacings.padding).slice(0, 6),
        common_gaps: uniqueSorted(spacings.gaps).slice(0, 6),
        most_common_padding: mostCommon(spacings.padding),
      },
    };

    // Sample text nodes for voice analysis
    const rawTextSample = textNodes
      .filter(t => t.textContent.length > 10)
      .slice(0, 20)
      .map(t => ({ content: t.textContent, fontSize: t.fontSize, fontFamily: t.fontFamily, fontWeight: t.fontWeight }));

    return new Response(JSON.stringify({
      confirmed_properties: confirmedProperties,
      source: "figma",
      raw_text_nodes_sample: rawTextSample,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[extract-figma] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
