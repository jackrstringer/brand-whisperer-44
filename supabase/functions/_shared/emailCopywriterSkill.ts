/**
 * Email Design Element Library — shared skill for both generation and editing.
 *
 * This is the embedded version of the user's Claude "email-copywriter" skill.
 * It teaches the model to compose emails out of named, skimmable visual blocks
 * instead of generic image+text rows.
 *
 * Every block has a slug — when emitted in HTML, the surrounding container
 * MUST carry both an HTML comment and a `data-block-type="<slug>"` attribute
 * so future edits can target the block surgically.
 *
 * Goal (always): a reader scrolling past in 5 seconds, reading no body text,
 * should still absorb ~80% of the message from the visual blocks alone.
 */

export const SKIMMABILITY_REQUIREMENT = `SKIMMABILITY REQUIREMENT (HARD RULE):
The reader must be able to scroll this email in 5 seconds, read NO body paragraphs,
and still understand ~80% of the message from the visual elements alone.
A wall of text with one image and a button is a FAIL.
Every email must include 1–3 named visual design elements from the library below,
placed so that one lives in the top half and (if multiple) one in the bottom half.
Each named block MUST be marked in the HTML so it is editable later:
  - An HTML comment immediately above the block:  <!-- block: <slug> -->
  - The outer wrapping <table> or <td> for the block carries data-block-type="<slug>".`;

export const EMAIL_DESIGN_ELEMENT_LIBRARY = `EMAIL DESIGN ELEMENT LIBRARY (named, reusable visual blocks):
These are not standard email sections. They are designer-spec visual blocks — mini
infographics, comparison cards, stat strips, social-proof cards — that make the email
skimmable. Pick the block(s) that best deliver the message. Use the EXACT slug below
in data-block-type so the block can be targeted later. Copy length per block is strict.

═════════════════════════════════════════════════════════════════════
1) COMPARISON & CONTRAST  (great for: differentiation, "why us")
═════════════════════════════════════════════════════════════════════
- us-vs-them-split-card        Side-by-side card. Left = "Regular X / Without Product",
                                Right = "[Brand] / With Product". 3–6 mirrored rows,
                                each side 3–8 words. Contrasting bg colors per column.
- before-after-photo-grid       2 same-framing photos with "Before" / "After" labels.
                                Optional 1-sentence caption (<15 words). Photos do the work.
- comparison-table              Structured comparison vs alternatives. 3–5 columns,
                                4–8 rows. Cell values are numbers / short phrases /
                                checkmarks. Brand column visually highlighted.
- feature-checklist-matrix      Grid of green checks vs red X marks vs competitor
                                categories. 3–5 columns, 5–8 rows. Brand column = all checks.
- harsh-vs-filtered-split       Two-panel card. Each side has a header + 3–5 rows
                                where each row has a short header + 1-sentence body.

═════════════════════════════════════════════════════════════════════
2) DATA & PROOF  (great for: credibility, scale, results)
═════════════════════════════════════════════════════════════════════
- stat-callout-card             ONE oversized number/percent (40–72px) + 3–8 word label.
- stat-strip                    Horizontal row of 2–4 stats (value + 2–5 word label each).
                                Functions as a visual break, not a full section.
- impact-bar-chart              3–6 horizontal % bars, brand-color fill, 2–5 word labels.
- line-graph-trend              Simple before/after or week-over-week line graph.
                                Title (3–8 words), x-axis labels, optional 1-line caption.
- nutrient-spec-breakdown       Product spec / ingredient amounts table. 4–8 rows,
                                each metric (1–4 words) + value + unit.

═════════════════════════════════════════════════════════════════════
3) PRODUCT SHOWCASE  (great for: catalog moments, variants, value)
═════════════════════════════════════════════════════════════════════
- product-variant-grid          2x2 or 2x3 grid of equal-sized product images,
                                1–3 word label per cell. Optional price per cell.
- product-feature-icon-row      3–5 small icons + 2–5 word labels in one row.
- benefit-grid-2x2              4 benefit quadrants: icon + 2–4 word label per quadrant.
- whats-in-the-box              Flat-lay style visual. 3–6 items, each with a short label.
- bundle-value-stack-card       Single card listing items + individual values
                                (struck-through) + total value (struck-through) + actual
                                price. Can flag bonus/free items.
- product-card-stack            3–4 vertically stacked feature cards. Each: bold header
                                (3–7 words) + 1–2 sentence body. Optional small icon.

═════════════════════════════════════════════════════════════════════
4) SOCIAL PROOF
═════════════════════════════════════════════════════════════════════
- review-card-single            Standalone review card: 5 stars + bold pull quote
                                (4–10 words) + 1–3 sentence body + name/credential.
- review-carousel-stack         3–5 short reviews shown as overlapping/stacked cards.
                                Each <15 words + first name only.
- ugc-photo-grid                3–6 user photos. Optional @handle or short caption (<8 words).
- press-logo-bar                Thin strip: optional "As seen in" + 3–6 publication names/logos
                                in muted/grayscale. NOT a section, an accent strip.
- numbered-callout-list         2–4 oversized numbers (#1/#2/#3, 30–48px, brand accent)
                                + bold callout (5–12 words) + optional 1-sentence body.
- social-screenshot-embed       Styled screenshot of a real tweet/IG/TikTok comment.

═════════════════════════════════════════════════════════════════════
5) MOTION & SCROLL  (use sparingly — only when reference supports it)
═════════════════════════════════════════════════════════════════════
- scrolling-text-banner         Thin high-contrast strip. Single 4–8 word phrase
                                repeated 3–4x with separators (•, ★, |).
- scrolling-benefits-banner     Same strip pattern but each repetition is a different
                                2–5 word benefit.
- animated-product-reveal       GIF placeholder + optional 1-line caption (<10 words).

═════════════════════════════════════════════════════════════════════
6) EDUCATIONAL & EXPLAINER
═════════════════════════════════════════════════════════════════════
- how-it-works-steps            Section header (2–5 words) + 3–4 steps. Each step:
                                number + 3–7 word header + optional <15 word body.
- ingredient-spotlight-circles  Row/grid of 3–5 circular images. Each: 1–3 word name
                                + 1-sentence (<12 words) body.
- did-you-know-stat-card        Single bold 5–12 word stat as headline + 1–2 sentence
                                context. Functions like a static ad.
- process-timeline              3–5 stage timeline (e.g. Week 1 → Week 4). Each stage:
                                1–4 word label + 5–15 word description. Connected by line/arrow.
- faq-myth-buster-cards         2–4 cards. Each: question or myth (5–12 words) + 1–2 sentence answer.
                                Use Q/A or Myth/Fact labels.
- routine-usage-guide           3–4 usage moments. Each: when (2–5 words) + what (1 sentence, <12 words).

═════════════════════════════════════════════════════════════════════
7) TRUST & AUTHORITY
═════════════════════════════════════════════════════════════════════
- badge-tag-strip               Row of 2–4 small credential badges (icon + 2–4 word label).
- guarantee-seal                Single prominent guarantee badge. Main text 3–8 words +
                                optional 1-sentence support. Place near a CTA.
- founder-expert-quote-card     Headshot + 1–2 sentence quote + name + credential. Card format.
- certification-callout         Header (3–8 words) + optional 1-sentence body + cert logos.

═════════════════════════════════════════════════════════════════════
8) OFFER & CONVERSION  (PROMOTIONAL ONLY — never in transactional flows)
═════════════════════════════════════════════════════════════════════
- promo-code-highlight-card     Standalone card. Offer context (5–12 words) + CODE in
                                caps as the visual hero (dashed/highlighted box) + optional fine print.
- subscription-value-card       One-time price (struck through) vs subscribe price
                                (highlighted) + savings callout + 2–4 perk lines.
- countdown-urgency-visual      Visual countdown / "almost gone" graphic. Header
                                (3–8 words) + deadline context + 2–4 word CTA.
- gift-with-purchase-card       Header + 2–4 gifts. Each gift: 3–8 word name + optional value.
                                "FREE" tags on each item.`;

export const DESIGN_ELEMENT_USAGE_RULES = `HOW TO USE THE DESIGN ELEMENT LIBRARY:

1. PICK 1–3 BLOCKS PER EMAIL.
   - 1 block: short, focused emails (single-product spotlight, simple announcement).
   - 2 blocks: most campaigns. Place ONE in the top half (just under or in the hero)
     and ONE in the bottom half (just before the closing CTA / footer).
   - 3 blocks: heavy storytelling emails (deep dives, big launches). Never more than 3.

2. PICK BLOCKS THAT SERVE THE MESSAGE.
   - "Why us / vs alternatives" → us-vs-them-split-card, comparison-table, feature-checklist-matrix
   - "Proof / scale / results"  → stat-strip, stat-callout-card, line-graph-trend, did-you-know-stat-card
   - "Real customers love it"   → review-card-single, review-carousel-stack, ugc-photo-grid, social-screenshot-embed
   - "Trusted / legitimate"     → press-logo-bar, badge-tag-strip, certification-callout, guarantee-seal
   - "Educate / how it works"   → how-it-works-steps, ingredient-spotlight-circles, process-timeline, faq-myth-buster-cards, routine-usage-guide
   - "Catalog / variants"       → product-variant-grid, benefit-grid-2x2, product-feature-icon-row, product-card-stack
   - "Offer / urgency"          → promo-code-highlight-card, bundle-value-stack-card, subscription-value-card, countdown-urgency-visual, gift-with-purchase-card
   - "Founder voice / story"    → founder-expert-quote-card

3. TAG EVERY BLOCK IN THE HTML — REQUIRED.
   Immediately above the block, output an HTML comment with the slug:
       <!-- block: feature-checklist-matrix -->
   The outer wrapping element of the block (<table> or <td>) MUST carry:
       data-block-type="feature-checklist-matrix"
   Use the EXACT slug from the library. No paraphrasing, no spaces, lowercase-with-dashes.

4. RESPECT THE COPY LENGTHS.
   The library specifies word counts per element for a reason — they keep blocks
   skimmable. Do not write paragraphs inside a stat strip. Do not write a 25-word
   "callout" inside numbered-callout-list. Hit the spec.

5. BLOCKS AUGMENT — THEY DO NOT REPLACE — THE STANDARD STRUCTURE.
   Typical flow:  Hero → short copy → BLOCK → short copy → BLOCK → CTA → footer.
   Blocks are scroll-stoppers; the surrounding copy is connective tissue.

6. NEVER STACK TWO BLOCKS BACK-TO-BACK WITHOUT BREATHING ROOM.
   Always at least one short copy section, divider, or CTA between two blocks.`;

export const TRANSACTIONAL_BLOCK_RESTRICTIONS = `TRANSACTIONAL FLOW RESTRICTION:
This is a transactional email (order/shipping/refund/subscription confirmation).
The following promotional-only blocks are FORBIDDEN — do not include them, do not
tag anything with their slugs:
  - promo-code-highlight-card
  - subscription-value-card
  - countdown-urgency-visual
  - gift-with-purchase-card
  - scrolling-text-banner
  - scrolling-benefits-banner
  - bundle-value-stack-card
Trust / proof / "what you ordered" style blocks are still fine if the reference
clearly uses them (e.g. guarantee-seal, badge-tag-strip, review-card-single).`;

/** Slug list for downstream validators / UI chips. */
export const DESIGN_BLOCK_SLUGS = [
  // comparison
  "us-vs-them-split-card", "before-after-photo-grid", "comparison-table",
  "feature-checklist-matrix", "harsh-vs-filtered-split",
  // data
  "stat-callout-card", "stat-strip", "impact-bar-chart",
  "line-graph-trend", "nutrient-spec-breakdown",
  // product
  "product-variant-grid", "product-feature-icon-row", "benefit-grid-2x2",
  "whats-in-the-box", "bundle-value-stack-card", "product-card-stack",
  // social
  "review-card-single", "review-carousel-stack", "ugc-photo-grid",
  "press-logo-bar", "numbered-callout-list", "social-screenshot-embed",
  // motion
  "scrolling-text-banner", "scrolling-benefits-banner", "animated-product-reveal",
  // educational
  "how-it-works-steps", "ingredient-spotlight-circles", "did-you-know-stat-card",
  "process-timeline", "faq-myth-buster-cards", "routine-usage-guide",
  // trust
  "badge-tag-strip", "guarantee-seal", "founder-expert-quote-card", "certification-callout",
  // offer
  "promo-code-highlight-card", "subscription-value-card", "countdown-urgency-visual",
  "gift-with-purchase-card",
] as const;

export const PROMO_ONLY_SLUGS = new Set([
  "promo-code-highlight-card",
  "subscription-value-card",
  "countdown-urgency-visual",
  "gift-with-purchase-card",
  "scrolling-text-banner",
  "scrolling-benefits-banner",
  "bundle-value-stack-card",
]);

/** Returns the full prompt block to inject into UNIVERSAL_EMAIL_RULES / REFERENCE_MODE_SYSTEM. */
export function emailCopywriterPromptBlock(opts?: { isTransactional?: boolean }): string {
  const transactional = opts?.isTransactional
    ? `\n\n${TRANSACTIONAL_BLOCK_RESTRICTIONS}`
    : "";
  return `\n\n${SKIMMABILITY_REQUIREMENT}\n\n${EMAIL_DESIGN_ELEMENT_LIBRARY}\n\n${DESIGN_ELEMENT_USAGE_RULES}${transactional}`;
}

/** Compact version for ideation prompts where token budget is tighter. */
export const DESIGN_ELEMENT_LIBRARY_COMPACT = `EMAIL DESIGN ELEMENT LIBRARY (compact reference for ideation):
Pick 1–3 named visual blocks per email so a reader can absorb ~80% of the message
from the visuals alone. Use exact slugs.

Comparison/contrast:  us-vs-them-split-card · before-after-photo-grid · comparison-table · feature-checklist-matrix · harsh-vs-filtered-split
Data/proof:           stat-callout-card · stat-strip · impact-bar-chart · line-graph-trend · nutrient-spec-breakdown · did-you-know-stat-card
Product showcase:     product-variant-grid · product-feature-icon-row · benefit-grid-2x2 · whats-in-the-box · bundle-value-stack-card · product-card-stack
Social proof:         review-card-single · review-carousel-stack · ugc-photo-grid · press-logo-bar · numbered-callout-list · social-screenshot-embed
Motion:               scrolling-text-banner · scrolling-benefits-banner · animated-product-reveal
Educational:          how-it-works-steps · ingredient-spotlight-circles · process-timeline · faq-myth-buster-cards · routine-usage-guide
Trust/authority:      badge-tag-strip · guarantee-seal · founder-expert-quote-card · certification-callout
Offer (promo only):   promo-code-highlight-card · subscription-value-card · countdown-urgency-visual · gift-with-purchase-card`;
