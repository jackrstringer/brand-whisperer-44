import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractGoogleFonts(html: string): string[] {
  const fonts: Set<string> = new Set();
  const linkRegex = /href=["']https?:\/\/fonts\.googleapis\.com\/css2?\?([^"']+)["']/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const params = match[1];
    const familyMatches = params.matchAll(/family=([^&:]+)/g);
    for (const fm of familyMatches) {
      const name = decodeURIComponent(fm[1]).replace(/\+/g, " ").split(":")[0].trim();
      if (name) fonts.add(name);
    }
  }

  const importRegex = /@import\s+url\(['"]?https?:\/\/fonts\.googleapis\.com\/css2?\?([^'")]+\s)+['"]?\)/gi;
  while ((match = importRegex.exec(html)) !== null) {
    const params = match[1];
    const familyMatches = params.matchAll(/family=([^&:]+)/g);
    for (const fm of familyMatches) {
      const name = decodeURIComponent(fm[1]).replace(/\+/g, " ").split(":")[0].trim();
      if (name) fonts.add(name);
    }
  }

  return Array.from(fonts);
}

function extractFontFamilies(css: string): string[] {
  const fonts: Set<string> = new Set();
  const regex = /font-family\s*:\s*([^;}]+)/gi;
  let match;
  while ((match = regex.exec(css)) !== null) {
    const families = match[1].split(",").map(f =>
      f.trim().replace(/^['"]|['"]$/g, "").trim()
    );
    for (const f of families) {
      if (f && !["inherit", "initial", "unset", "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI"].includes(f)) {
        fonts.add(f);
      }
    }
  }
  return Array.from(fonts);
}

function extractColors(css: string): string[] {
  const colors: Set<string> = new Set();
  const hexRegex = /#([0-9a-fA-F]{3,8})\b/g;
  let match;
  while ((match = hexRegex.exec(css)) !== null) {
    let hex = match[0].toUpperCase();
    if (hex.length === 4) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    colors.add(hex);
  }
  return Array.from(colors);
}

function extractCSSVariables(css: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const regex = /--([\w-]+)\s*:\s*([^;}\n]+)/g;
  let match;
  while ((match = regex.exec(css)) !== null) {
    const name = `--${match[1].trim()}`;
    const value = match[2].trim();
    if (value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl") || /font|color|bg|background|accent|primary|brand/i.test(name)) {
      vars[name] = value;
    }
  }
  return vars;
}

async function fetchStylesheetContent(url: string, baseUrl: string): Promise<string> {
  try {
    const fullUrl = url.startsWith("http") ? url : new URL(url, baseUrl).href;
    const resp = await fetch(fullUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandAnalyzer/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return "";
    return await resp.text();
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize URL: add https:// if no protocol present
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    console.log(`[extract-website-fonts] Fetching: ${url}`);

    const browserHeaders = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      "Cache-Control": "max-age=0",
    };

    let resp: Response | null = null;
    let fetchError: string | null = null;
    try {
      resp = await fetch(url, { headers: browserHeaders, signal: AbortSignal.timeout(12000), redirect: "follow" });
    } catch (e) {
      fetchError = (e as Error).message;
    }

    if (!resp || !resp.ok) {
      const status = resp?.status ?? 0;
      console.warn(`[extract-website-fonts] Fetch blocked (status=${status} err=${fetchError}). Returning empty extraction so pipeline continues.`);
      return new Response(JSON.stringify({
        confirmed_properties: {
          fonts_from_css: [],
          google_fonts_detected: [],
          colors_from_css: [],
          css_variables: {},
        },
        source: "website",
        warning: `Website fetch failed (status=${status}${fetchError ? `, error=${fetchError}` : ""}). Site likely blocks automated requests; proceeding without CSS extraction.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const html = await resp.text();
    const googleFonts = extractGoogleFonts(html);

    const styleBlocks: string[] = [];
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let match;
    while ((match = styleRegex.exec(html)) !== null) {
      styleBlocks.push(match[1]);
    }

    const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi;
    const cssUrls: string[] = [];
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      if (!href.includes("fonts.googleapis.com")) {
        cssUrls.push(href);
      }
    }

    const externalCSS = await Promise.all(
      cssUrls.slice(0, 5).map(u => fetchStylesheetContent(u, url))
    );

    const allCSS = [...styleBlocks, ...externalCSS].join("\n");
    const fontsFromCSS = extractFontFamilies(allCSS);
    const colorsFromCSS = extractColors(allCSS);
    const cssVariables = extractCSSVariables(allCSS);
    const inlineFonts = extractFontFamilies(html);
    const allFonts = [...new Set([...fontsFromCSS, ...inlineFonts])];

    return new Response(JSON.stringify({
      confirmed_properties: {
        fonts_from_css: allFonts,
        google_fonts_detected: googleFonts,
        colors_from_css: colorsFromCSS.slice(0, 30),
        css_variables: cssVariables,
      },
      source: "website",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[extract-website-fonts] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
