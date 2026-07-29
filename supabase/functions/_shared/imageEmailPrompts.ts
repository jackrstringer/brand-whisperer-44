// Shared prompt-building for image-slice email generation.
// The whole point of this file is to keep the "design system contract"
// identical across every slice in one email, so sibling slices feel
// like they came from the same designer's hand.

export interface DesignSystem {
  palette: { role: string; hex: string }[];
  typography: {
    heading: string;
    body: string;
    weight_and_tone: string;
  };
  product_treatment: string;
  mood: string;
  mockup_style: string;
  background_treatment: string;
  brand_voice: string;
  slice_shape_language: string;
  identity_locked?: {
    cta_shape?: string;
    cta_radius_px?: number;
    cta_case?: string;
    logo_placement?: string;
    grid_columns?: number;
    corner_radius_px?: number;
  };
  voice_examples?: string[];
}

export interface SlicePlanItem {
  position: number;
  archetype_slug: string;
  aspect_ratio: string;
  headline_copy: string;
  body_copy: string;
  cta_label: string;
  cta_url: string;
  composition_brief: string;
  reference_asset_urls?: string[];
}

/** Renders the locked design system as prose to prepend to every slice prompt. */
export function renderDesignSystemPreamble(ds: DesignSystem): string {
  const palette = (ds.palette || [])
    .map((p) => `${p.role}: ${p.hex}`)
    .join(", ");
  const id = ds.identity_locked || {};
  const identityLine = [
    id.cta_shape && `CTA shape: ${id.cta_shape}`,
    id.cta_radius_px != null && `CTA corner radius: ${id.cta_radius_px}px`,
    id.cta_case && `CTA label case: ${id.cta_case}`,
    id.corner_radius_px != null && `Card/frame corner radius: ${id.corner_radius_px}px`,
    id.logo_placement && `Logo placement: ${id.logo_placement}`,
  ].filter(Boolean).join(" • ");
  const voiceLine = (ds.voice_examples || []).length > 0
    ? `VOICE EXAMPLES (match this register exactly): ${(ds.voice_examples || []).map((v) => `"${v}"`).join(" | ")}`
    : "";
  return `LOCKED VISUAL SYSTEM — every element in this image MUST obey these rules exactly so it stacks seamlessly with the other slices in this email:

PALETTE: ${palette}. Use ONLY these colors. No off-palette shades.
TYPOGRAPHY: Headings feel like "${ds.typography.heading}". Body copy feels like "${ds.typography.body}". Tone: ${ds.typography.weight_and_tone}. Text must be pixel-perfect, legible, professionally kerned.
PRODUCT TREATMENT: ${ds.product_treatment}
BACKGROUND / SURFACE: ${ds.background_treatment}
SHAPE LANGUAGE: ${ds.slice_shape_language}
MOOD: ${ds.mood}
STYLE: ${ds.mockup_style}
VOICE: ${ds.brand_voice}
${identityLine ? `IDENTITY LOCK (must obey exactly): ${identityLine}` : ""}
${voiceLine}

MOBILE-FIRST FORMAT: This slice will render at 390px wide on a phone. Compose it so it reads perfectly at that width — generous type sizes, single dominant focal point, no crowded multi-column layouts unless the archetype explicitly requires it. Assume the viewer is holding a phone.

VERTICAL COHESION (CRITICAL): This slice is one of several sibling slices that stack vertically in ONE email. Sibling slices must feel like one continuous designed piece, NOT a stack of separate posters welded together.
- Do NOT put a hard full-bleed horizontal divider or a full-width block edge at the top or bottom of this slice unless the archetype is a divider on purpose.
- Prefer INSET compositions: the visual content lives inside a padded frame, with the sibling background color continuing edge-to-edge so slices merge into each other visually. Leave breathable negative space at the top and bottom edges.
- The background color/texture at the very top edge of THIS slice must match the background color at the very bottom edge of the PREVIOUS slice (see references), and the bottom edge of THIS slice must be a natural handoff to the next slice's top.
- Think of the email as one long designed page, cut into segments — not as a slideshow of independent cards.

This is a single image slice destined to stack vertically with sibling slices in a marketing email. Design it as a complete, finished, ready-to-publish static ad — beautiful, magazine-quality, no placeholder feel. Every line of copy provided must appear in the image, spelled correctly, laid out with intention.`;
}

/** Composes the full prompt for a single slice. */
export function buildSlicePrompt(args: {
  designSystem: DesignSystem;
  archetypeTemplate: string;
  slice: SlicePlanItem;
  brandName: string;
  industry?: string;
  productContext?: string;
  priorSliceUrls?: string[];
}): string {
  const { designSystem, archetypeTemplate, slice, brandName, industry, productContext, priorSliceUrls } = args;
  const preamble = renderDesignSystemPreamble(designSystem);

  const copyBlock = [
    slice.headline_copy && `HEADLINE (must appear exactly): "${slice.headline_copy}"`,
    slice.body_copy && `SUPPORTING COPY (must appear exactly): "${slice.body_copy}"`,
    slice.cta_label && `CTA BUTTON LABEL (render as a real button in the image): "${slice.cta_label}"`,
  ].filter(Boolean).join("\n");

  const referenceLine = priorSliceUrls && priorSliceUrls.length > 0
    ? `\n\nVISUAL CONTINUITY: The following image URLs are the prior slices in this same email. Match their palette, type treatment, product handling, background, mood, and shape language EXACTLY. Do NOT drift stylistically. The top edge of THIS slice must visually merge into the bottom edge of the last prior slice — same background, same shape language, same margins.\n${priorSliceUrls.map((u, i) => `Prior slice ${i + 1}: ${u}`).join("\n")}`
    : "";

  const brandAssetLine = slice.reference_asset_urls && slice.reference_asset_urls.length > 0
    ? `\n\nBRAND ASSETS TO USE (these are the ACTUAL products, packaging, logos, and imagery for this brand — do NOT invent or hallucinate new packaging, models, or products; reproduce EXACTLY what is shown in these references):\n${slice.reference_asset_urls.map((u, i) => `Asset ${i + 1}: ${u}`).join("\n")}\n\nHARD RULE: If this slice depicts the product, the packaging shape, label, typography, color, and proportions MUST match the asset references above. If a logo appears, it MUST be the exact logo shown in the references — do not redraw or reinterpret it.`
    : "";

  return `${preamble}

BRAND: ${brandName}${industry ? ` (${industry})` : ""}${productContext ? `\nPRODUCT CONTEXT: ${productContext}` : ""}

SLICE TYPE: ${slice.archetype_slug}
ASPECT RATIO: ${slice.aspect_ratio}

COMPOSITION BRIEF: ${archetypeTemplate}
SPECIFIC INTENT FOR THIS SLICE: ${slice.composition_brief}

COPY TO INCLUDE (verbatim, spelled correctly, well-typeset):
${copyBlock || "(no text — pure imagery)"}${brandAssetLine}${referenceLine}

HARD RULES:
- Deliver a complete, finished marketing image. No mockup chrome, no watermarks, no placeholder text.
- ALL copy above appears in the image itself, baked in. Do not add extra copy that wasn't provided.
- Fill the frame edge-to-edge for the ${slice.aspect_ratio} aspect ratio.
- Every text character must be perfectly legible and correctly spelled.
- Never invent product packaging, logos, or brand marks. If provided, use the brand assets above as ground truth.
- Compose for a 390px-wide mobile viewport. Type must be large enough to read on a phone.
- Respect vertical cohesion: this slice must visually merge with its neighbors, not sit as an isolated card with hard edges.
- This is one of several sibling slices for the same email — visual consistency with the locked system above is non-negotiable.`;
}

/** Maps an aspect ratio string like "4:5" to a GPT Image 2 size string.
 *  GPT Image 2 supports: 1024x1024 (1:1), 1024x1536 (2:3), 1536x1024 (3:2), and auto. */
export function aspectRatioToImageSize(ratio: string): string {
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h) return "1024x1024";
  const r = w / h;
  if (r >= 1.4) return "1536x1024"; // wide (2:1, 3:2, 3:1, etc.)
  if (r <= 0.7) return "1024x1536"; // tall (4:5, 3:4, 2:3)
  return "1024x1024"; // roughly square
}

/** JSON schema description for the planner's structured output. */
export const PLANNER_OUTPUT_INSTRUCTIONS = `Return a single JSON object with this exact shape (no markdown, no commentary):

{
  "design_system": {
    "palette": [
      { "role": "background", "hex": "#RRGGBB" },
      { "role": "primary", "hex": "#RRGGBB" },
      { "role": "accent", "hex": "#RRGGBB" },
      { "role": "text", "hex": "#RRGGBB" }
    ],
    "typography": {
      "heading": "<vivid description of heading type, e.g. 'oversized condensed sans-serif in all-caps, tight tracking, extra-bold weight'>",
      "body": "<vivid description of body type>",
      "weight_and_tone": "<one sentence on tone>"
    },
    "product_treatment": "<one detailed sentence on how the product is depicted (angle, lighting, backdrop, mockup style)>",
    "mood": "<one vivid sensory description of overall mood>",
    "mockup_style": "<e.g. 'editorial magazine spread', 'candy-colored 3D render', 'photorealistic lifestyle', 'collage cutout'>",
    "background_treatment": "<solid color / gradient / textured / photographic — describe specifically>",
    "brand_voice": "<one-line copywriting tone>",
    "slice_shape_language": "<how sections divide: wavy cutouts, hard geometric bands, floating cards, etc.>",
    "identity_locked": {
      "cta_shape": "<one of: pill / rounded-rect / hard-rect / underline-only>",
      "cta_radius_px": <integer 0-48>,
      "cta_case": "<one of: TITLE / UPPERCASE / sentence>",
      "logo_placement": "<one of: top-center / top-left>",
      "grid_columns": <1 or 2>,
      "corner_radius_px": <integer 0-48 — the radius used on all cards/frames>"
    },
    "voice_examples": ["<verbatim example headline in-voice>", "<verbatim example headline in-voice>", "<verbatim example body sentence in-voice>"]
  },
  "slices": [
    {
      "position": 1,
      "archetype_slug": "<one of the provided archetype slugs>",
      "aspect_ratio": "4:5",
      "headline_copy": "<exact copy to bake into image>",
      "body_copy": "<exact copy, or empty string>",
      "cta_label": "<exact CTA label, or empty string>",
      "cta_url": "<full https URL the entire slice image should link to>",
      "composition_brief": "<one-to-two sentence brief describing what the image shows and how it advances the email>",
      "reference_asset_urls": ["<exact URLs from the BRAND ASSET LIBRARY or REFERENCE CAMPAIGN sections that this slice should visually reproduce — logos, product shots, lifestyle imagery. Leave empty array if this slice is pure typography or abstract.>"]
    }
  ]
}

HARD PLANNING RULES:
1. LOGO HEADER FIRST: Slice 1 MUST be a compact logo/header band (use archetype 'util_footer' repurposed for header only if no better header archetype exists — otherwise use a tight custom composition). Aspect ratio 5:1 or 4:1. It must contain ONLY the brand logo centered on the brand's primary background color — no other elements. The reference_asset_urls for slice 1 MUST include the brand logo URL from the BRAND ASSET LIBRARY (category: logo).
2. Slice 2 is the opener/hero (use a hero_* archetype).
3. Pick 4–7 slices total after the logo header. Slice order: logo → open → prove → sell → close.
4. MOBILE-FIRST: prefer tall aspect ratios (4:5, 3:4, 1:1) over wide ones. Wide ratios (3:2, 2:1, 3:1) should only be used for offer banners, footers, or CTA bands.
5. USE THE PROVIDED ASSETS: For every slice that depicts a product, the reference_asset_urls MUST include at least one exact URL from the BRAND ASSET LIBRARY, PRODUCT ASSETS, or PINNED ASSETS sections above. NEVER invent a product from scratch. If no product asset exists for a needed use, fall back to lifestyle or typographic slices.
6. USE THE REFERENCE CAMPAIGNS as structural and stylistic inspiration for the design_system fields (palette, mood, shape language) — study them before locking the system.
7. Every headline_copy, body_copy, cta_label field must be REAL, publishable marketing copy — not descriptions or placeholders. If the brief provides copy, use it verbatim. Otherwise write it fresh in the brand's voice.
8. Use archetype slugs verbatim from the list provided.
9. COPY CEILINGS (hard limits — trim if longer): headline_copy ≤ 60 chars, body_copy ≤ 180 chars, cta_label ≤ 22 chars. Long copy destroys mobile legibility in a baked image.
10. IDENTITY LOCK: every slice with a CTA must use the identity_locked.cta_shape, cta_radius_px, and cta_case exactly. Every slice with a card/frame must use identity_locked.corner_radius_px. This is what makes the campaign feel like one designer's hand.
11. VOICE LOCK: voice_examples define the copywriting register. Every headline_copy and body_copy must sound like it could sit next to those examples — same rhythm, same vocabulary level, same punctuation habits.
12. CAMPAIGN COMPLETENESS CHECKLIST (verify before returning): (a) logo header exists as slice 1, (b) at least one hero opener, (c) at least one proof/benefit slice, (d) at least one CTA-bearing slice with cta_url set, (e) all product-depicting slices reference a real asset URL. If ANY check fails, revise the plan before returning.`;