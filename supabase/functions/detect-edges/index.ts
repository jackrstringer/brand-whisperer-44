// supabase/functions/detect-edges/index.ts
// Lightweight pixel-level horizontal edge detection using jpeg-js.
// Separated into its own function for CPU isolation.
// Matches the proven implementation from Brand DNA Studio.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { decode as decodeJpeg } from "npm:jpeg-js@0.4.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface StripRegion { startPercent: number; endPercent: number; name: string; }

const EDGE_STRIPS: StripRegion[] = [
  { startPercent: 0.00, endPercent: 0.12, name: 'left_gutter' },
  { startPercent: 0.44, endPercent: 0.56, name: 'center' },
  { startPercent: 0.88, endPercent: 1.00, name: 'right_gutter' },
];

function getStripAvgColor(pixels: Uint8Array, y: number, w: number, s: number, e: number) {
  let r = 0, g = 0, b = 0, n = 0;
  const row = y * w * 4;
  for (let x = s; x < e; x++) {
    const i = row + x * 4;
    r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; n++;
  }
  return n > 0
    ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
    : { r: 0, g: 0, b: 0 };
}

function colorDist(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64 } = await req.json();
    if (!imageBase64) throw new Error('imageBase64 is required');

    console.log("Detecting horizontal color edges...");

    const THRESH = 35, MIN_STRIPS = 2, MERGE_DIST = 4, MIN_SPACE = 25, MAX = 30;

    const bin = atob(imageBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const img = decodeJpeg(bytes, { useTArray: true });
    const px = new Uint8Array(img.data), w = img.width, h = img.height;
    console.log(`Decoded: ${w}×${h}`);

    const strips = EDGE_STRIPS.map(s => ({
      ...s,
      sx: Math.floor(w * s.startPercent),
      ex: Math.floor(w * s.endPercent),
    }));
    const prev = strips.map(s => getStripAvgColor(px, 0, w, s.sx, s.ex));

    interface RE {
      y: number; sc: number; ld: number; rd: number;
      ca: { r: number; g: number; b: number };
      cb: { r: number; g: number; b: number };
    }
    const raw: RE[] = [];

    for (let y = 1; y < h; y++) {
      const cur = strips.map(s => getStripAvgColor(px, y, w, s.sx, s.ex));
      const d = cur.map((c, i) => colorDist(prev[i], c));
      const mc = d.filter(v => v > THRESH).length;
      if ((d[0] > THRESH && d[2] > THRESH) || mc >= MIN_STRIPS) {
        raw.push({
          y, sc: mc, ld: d[0], rd: d[2],
          ca: {
            r: Math.round((prev[0].r + prev[2].r) / 2),
            g: Math.round((prev[0].g + prev[2].g) / 2),
            b: Math.round((prev[0].b + prev[2].b) / 2),
          },
          cb: {
            r: Math.round((cur[0].r + cur[2].r) / 2),
            g: Math.round((cur[0].g + cur[2].g) / 2),
            b: Math.round((cur[0].b + cur[2].b) / 2),
          },
        });
      }
      cur.forEach((c, i) => { prev[i] = c; });
    }
    console.log(`Raw edges: ${raw.length}`);

    // Merge nearby
    const merged: RE[] = [];
    let grp: RE[] = [];
    const strongest = (g: RE[]) =>
      g.reduce((b, e) => (e.sc * 1000 + e.ld + e.rd) > (b.sc * 1000 + b.ld + b.rd) ? e : b);
    for (const e of raw) {
      if (!grp.length) grp.push(e);
      else if (e.y - grp[grp.length - 1].y <= MERGE_DIST) grp.push(e);
      else { merged.push(strongest(grp)); grp = [e]; }
    }
    if (grp.length) merged.push(strongest(grp));

    // Min spacing
    const spaced: RE[] = [];
    for (const e of merged) {
      if (!spaced.length || e.y - spaced[spaced.length - 1].y >= MIN_SPACE) spaced.push(e);
      else {
        const p = spaced[spaced.length - 1];
        if ((e.sc * 1000 + e.ld + e.rd) > (p.sc * 1000 + p.ld + p.rd)) spaced[spaced.length - 1] = e;
      }
    }

    const edges = spaced
      .map(e => ({
        y: e.y,
        strength: Math.min((e.ld + e.rd) / 200, 1),
        colorAbove: e.ca,
        colorBelow: e.cb,
      }))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, MAX)
      .sort((a, b) => a.y - b.y);

    console.log(`Final: ${edges.length} edges`);
    return new Response(JSON.stringify({ edges, width: w, height: h }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('detect-edges error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
