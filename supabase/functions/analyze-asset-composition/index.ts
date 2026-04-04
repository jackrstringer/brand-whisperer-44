import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NormalizedBBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface AvoidRegion {
  label: string;
  normalized_bbox: NormalizedBBox;
  confidence: number;
}

interface SafeTextZone {
  region: string;
  grid_position: [number, number];
  luminance: number;
  edge_density: "low" | "medium" | "high";
  text_color: "white" | "dark";
  confidence: number;
}

const AVOID_LABELS = new Set([
  "Face", "Person", "Human face", "Human eye", "Eye", "Mouth", "Teeth", "Nose",
  "Human nose", "Human mouth", "Human head", "Hair", "Lip",
  "Bottle", "Container", "Device", "Wand", "Cosmetics", "Product",
  "Electronic device", "Mobile phone", "Skin care",
]);

const GRID_COLS = 4;
const GRID_ROWS = 3;

const REGION_NAMES: Record<string, string> = {
  "0,0": "top-left", "1,0": "top-center-left", "2,0": "top-center-right", "3,0": "top-right",
  "0,1": "middle-left", "1,1": "middle-center-left", "2,1": "middle-center-right", "3,1": "middle-right",
  "0,2": "bottom-left", "1,2": "bottom-center-left", "2,2": "bottom-center-right", "3,2": "bottom-right",
};

function bboxOverlapsCell(
  bbox: NormalizedBBox,
  col: number,
  row: number,
): boolean {
  const cellLeft = col / GRID_COLS;
  const cellRight = (col + 1) / GRID_COLS;
  const cellTop = row / GRID_ROWS;
  const cellBottom = (row + 1) / GRID_ROWS;
  return !(bbox.right < cellLeft || bbox.left > cellRight || bbox.bottom < cellTop || bbox.top > cellBottom);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageUrl, assetId } = await req.json();
    if (!imageUrl || !assetId) {
      return new Response(JSON.stringify({ error: "imageUrl and assetId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const VISION_API_KEY = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!VISION_API_KEY) throw new Error("GOOGLE_CLOUD_VISION_API_KEY not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch image bytes once, reuse for both analyses
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) throw new Error(`Failed to fetch image: ${imgResp.status}`);
    const imgBytes = new Uint8Array(await imgResp.arrayBuffer());

    // Base64 encode for Vision API
    let base64 = "";
    const chunkSize = 8192;
    for (let i = 0; i < imgBytes.length; i += chunkSize) {
      base64 += String.fromCharCode(...imgBytes.subarray(i, i + chunkSize));
    }
    base64 = btoa(base64);

    // Run both analyses in parallel
    const [visionResult, gridResult] = await Promise.all([
      // 1. Google Cloud Vision — OBJECT_LOCALIZATION
      (async (): Promise<AvoidRegion[]> => {
        try {
          const resp = await fetch(
            `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requests: [{
                  image: { content: base64 },
                  features: [{ type: "OBJECT_LOCALIZATION", maxResults: 20 }],
                }],
              }),
            },
          );
          if (!resp.ok) {
            console.error("Vision API error:", resp.status, await resp.text());
            return [];
          }
          const data = await resp.json();
          const objects = data.responses?.[0]?.localizedObjectAnnotations || [];
          const regions: AvoidRegion[] = [];
          for (const obj of objects) {
            if (!AVOID_LABELS.has(obj.name)) continue;
            const verts = obj.boundingPoly?.normalizedVertices;
            if (!verts || verts.length < 4) continue;
            const xs = verts.map((v: any) => v.x ?? 0);
            const ys = verts.map((v: any) => v.y ?? 0);
            regions.push({
              label: obj.name,
              normalized_bbox: {
                left: Math.min(...xs),
                top: Math.min(...ys),
                right: Math.max(...xs),
                bottom: Math.max(...ys),
              },
              confidence: Math.round((obj.score ?? 0) * 100) / 100,
            });
          }
          return regions;
        } catch (err) {
          console.error("Vision API error:", err);
          return [];
        }
      })(),

      // 2. Brightness & edge density grid via AI vision
      (async (): Promise<{ luminance: number; edgeDensity: number }[]> => {
        try {
          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [{
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Analyze this image by dividing it into a 4-column × 3-row grid (12 cells). Number cells left-to-right, top-to-bottom (0-11).

For each cell estimate:
1. Average luminance (0-255 scale). Dark areas ~0-80, mid-tone ~80-180, light ~180-255.
2. Edge density: how busy/detailed the cell is. 0.0 = flat solid color, 1.0 = extremely detailed/textured.

Return ONLY a JSON array of 12 objects in order: [{"luminance": N, "edge_density": N}, ...]
No markdown fences. Just the JSON array.`,
                  },
                  {
                    type: "image_url",
                    image_url: { url: imageUrl },
                  },
                ],
              }],
            }),
          });

          if (!resp.ok) {
            console.error("Grid analysis error:", resp.status);
            return [];
          }

          const data = await resp.json();
          const content = (data.choices?.[0]?.message?.content || "").trim();
          const cleaned = content.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed) && parsed.length === 12) {
            return parsed.map((c: any) => ({
              luminance: Math.round(Number(c.luminance) || 128),
              edgeDensity: Math.round((Number(c.edge_density) || 0.5) * 100) / 100,
            }));
          }
          return [];
        } catch (err) {
          console.error("Grid analysis error:", err);
          return [];
        }
      })(),
    ]);

    // Build safe text zones from grid analysis
    const safeTextZones: SafeTextZone[] = [];
    if (gridResult.length === 12) {
      // Calculate 30th percentile of edge density
      const sortedEdges = [...gridResult.map(c => c.edgeDensity)].sort((a, b) => a - b);
      const p30Index = Math.floor(sortedEdges.length * 0.3);
      const edgeThreshold = sortedEdges[p30Index];

      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const idx = row * GRID_COLS + col;
          const cell = gridResult[idx];
          const isLowEdge = cell.edgeDensity <= edgeThreshold;
          const hasContrast = cell.luminance < 100 || cell.luminance > 160;

          if (isLowEdge && hasContrast) {
            const textColor = cell.luminance < 100 ? "white" : "dark";
            // Confidence based on how clearly it qualifies
            const edgeScore = 1 - (cell.edgeDensity / Math.max(edgeThreshold * 2, 0.01));
            const contrastScore = cell.luminance < 100
              ? (100 - cell.luminance) / 100
              : (cell.luminance - 160) / 95;
            const confidence = Math.round(Math.min(1, (edgeScore * 0.5 + contrastScore * 0.5)) * 100) / 100;

            safeTextZones.push({
              region: REGION_NAMES[`${col},${row}`] || `cell-${col}-${row}`,
              grid_position: [col, row],
              luminance: cell.luminance,
              edge_density: cell.edgeDensity <= 0.2 ? "low" : cell.edgeDensity <= 0.5 ? "medium" : "high",
              text_color: textColor,
              confidence: Math.max(0.1, confidence),
            });
          }
        }
      }
    }

    // Determine has_safe_overlay_zone
    const has_safe_overlay_zone = safeTextZones.some(zone => {
      const [col, row] = zone.grid_position;
      return !visionResult.some(region => bboxOverlapsCell(region.normalized_bbox, col, row));
    });

    const compositionData = {
      avoid_regions: visionResult,
      safe_text_zones: safeTextZones,
      has_safe_overlay_zone,
    };

    // Store in DB
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await supabase
      .from("brand_assets")
      .update({ composition_data: compositionData })
      .eq("id", assetId);

    return new Response(JSON.stringify(compositionData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("analyze-asset-composition error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
