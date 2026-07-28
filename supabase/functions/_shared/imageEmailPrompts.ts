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
}

/** Renders the locked design system as prose to prepend to every slice prompt. */
export function renderDesignSystemPreamble(ds: DesignSystem): string {
  const palette = (ds.palette || [])
    .map((p) => `${p.role}: ${p.hex}`)
    .join(", ");
  return `LOCKED VISUAL SYSTEM — every element in this image MUST obey these rules exactly so it stacks seamlessly with the other slices in this email:

PALETTE: ${palette}. Use ONLY these colors. No off-palette shades.
TYPOGRAPHY: Headings feel like "${ds.typography.heading}". Body copy feels like "${ds.typography.body}". Tone: ${ds.typography.weight_and_tone}. Text must be pixel-perfect, legible, professionally kerned.
PRODUCT TREATMENT: ${ds.product_treatment}
BACKGROUND / SURFACE: ${ds.background_treatment}
SHAPE LANGUAGE: ${ds.slice_shape_language}
MOOD: ${ds.mood}
STYLE: ${ds.mockup_style}
VOICE: ${ds.brand_voice}

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
    ? `\n\nVISUAL CONTINUITY: The following image URLs are the prior slices in this same email. Match their palette, type treatment, product handling, background, mood, and shape language EXACTLY. Do NOT drift stylistically. This image must look like it came out of the same design file as those references.\n${priorSliceUrls.map((u, i) => `Reference ${i + 1}: ${u}`).join("\n")}`
    : "";

  return `${preamble}

BRAND: ${brandName}${industry ? ` (${industry})` : ""}${productContext ? `\nPRODUCT CONTEXT: ${productContext}` : ""}

SLICE TYPE: ${slice.archetype_slug}
ASPECT RATIO: ${slice.aspect_ratio}

COMPOSITION BRIEF: ${archetypeTemplate}
SPECIFIC INTENT FOR THIS SLICE: ${slice.composition_brief}

COPY TO INCLUDE (verbatim, spelled correctly, well-typeset):
${copyBlock || "(no text — pure imagery)"}${referenceLine}

HARD RULES:
- Deliver a complete, finished marketing image. No mockup chrome, no watermarks, no placeholder text.
- ALL copy above appears in the image itself, baked in. Do not add extra copy that wasn't provided.
- Fill the frame edge-to-edge for the ${slice.aspect_ratio} aspect ratio.
- Every text character must be perfectly legible and correctly spelled.
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
    "slice_shape_language": "<how sections divide: wavy cutouts, hard geometric bands, floating cards, etc.>"
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
      "composition_brief": "<one-to-two sentence brief describing what the image shows and how it advances the email>"
    }
  ]
}

Pick 3–7 slices total. First slice is always an opener (hero_*), last is either a closer (cta_*) or a footer (util_footer). Slice order must feel like a real email: open, prove, sell, close. Use archetype slugs verbatim from the list provided.`;