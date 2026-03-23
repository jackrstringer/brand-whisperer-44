

# Self-QA Loop + Stronger Reference Adherence

## Problems

1. **Design details from references not carried through** — e.g. references show rounded corners on cards, but the generated email uses sharp boxes. The `system_prompt` extracted from brand analysis apparently didn't capture `card_radius` strongly enough, or the AI ignored it.
2. **Images with 60% empty space still getting used** — the prompt says "use smart-cropped URL or skip" but there's no enforcement. The AI picks the base URL anyway.
3. **No QA step exists** — the pipeline generates HTML and saves it immediately. There is no second pass where the AI visually audits the output against the references.

## Solution: Add a Visual Self-QA Pass

After the first generation, render the HTML to a screenshot, send it back to the AI alongside the reference images, and ask it to identify and fix any inconsistencies. This catches the exact issues described: wrong border-radius, bad image crops, mixed padding, etc.

---

## Changes

### 1. New shared utility: HTML-to-screenshot (`_shared/screenshot.ts`)

Use a headless browser service or — more practically in Deno edge functions — use the existing approach of sending the HTML itself as a "rendered" artifact. Since we can't run a browser in an edge function, we'll use a **two-pass AI approach**:

- **Pass 1**: Generate the HTML (existing flow)
- **Pass 2**: Send the generated HTML *as text* back to Claude along with all the reference images and a strict QA checklist. Ask it to audit and return a corrected version.

This is cheaper and faster than screenshotting, and Claude can reason about HTML structure directly.

### 2. Modify `generate-campaign/index.ts`

After the first generation produces `html`:

**QA Pass** — Make a second Anthropic API call:
- System prompt: a QA-specific prompt with a checklist
- User content: the reference images (same `imageBlocks`), the brand `system_prompt`, and the generated HTML
- QA checklist items:
  - Does every card/container use the brand's `card_radius`? (check the extracted value)
  - Are all images using the smart-cropped URL variant when they have excessive negative space?
  - Is image padding consistent (all full-bleed OR all padded)?
  - Does the footer exist and is it separated from content?
  - Does text alignment stay consistent within each section?
  - Do button styles match the brand extraction (border-radius, colors, padding)?
- The QA prompt instructs: "If ANY issues are found, return the corrected complete HTML. If everything passes, return the HTML unchanged."
- Use `claude-sonnet-4-20250514` for the QA pass (faster, cheaper than Opus, sufficient for auditing)

**Extract brand-specific values for the QA checklist**: Pull `card_radius`, `button border_radius`, `colors` from `profile.raw_extraction` so the QA prompt has exact numbers to check against (e.g. "card_radius should be 12px — check every container").

### 3. Strengthen the generation prompt

Add to the user content in the initial generation call:
- Explicitly inject key extracted values: "Brand card radius: {X}px — apply to ALL cards, containers, and contrast sections. Brand button radius: {Y}. Brand accent color: {Z}."
- For images: "Before using any image, consider if it has excessive empty space. If so, you MUST use the smart-cropped URL variant. If even the cropped version would look bad, skip the image entirely."

### 4. Smarter image cropping enforcement

In the asset catalog builder, also provide an "aggressive crop" variant:
- Base URL (original)
- Smart-cropped: `tr:w-600,fo-auto,c-maintain_ratio`
- Tight crop: `tr:w-600,h-400,fo-auto,c-at_max` (forces a max aspect ratio)

Tell the AI: "For lifestyle/hero images, default to the tight-crop variant unless the full image is clearly well-composed."

---

## Files Modified

1. **`supabase/functions/generate-campaign/index.ts`**
   - Add QA pass after initial generation (second API call to Claude Sonnet)
   - Inject extracted brand values (card_radius, button styles) into generation prompt
   - Add tight-crop URL variant to asset catalog
   - Use QA-corrected HTML instead of raw first-pass HTML

2. **`supabase/functions/_shared/imagekit.ts`**
   - Add a `tightCrop` preset to `applyImageKitTransform`

3. **`supabase/functions/edit-campaign/index.ts`**
   - Same QA checklist added to the edit system prompt so edits also get audited

## QA Prompt (new constant in generate-campaign)

```
You are a visual QA auditor for HTML emails.
Compare the generated email HTML against the brand reference images and rules.

CHECK EACH OF THESE — fail ANY = must fix:
1. Card/container border-radius must be {card_radius}px everywhere
2. Button border-radius must be {button_radius}
3. Images with >30% empty/negative space must use smart-cropped URLs
4. All images must have identical padding treatment (all full-bleed OR all padded)
5. Footer must exist as a separate section with unsubscribe link
6. Text alignment must be consistent within each section
7. Colors must match brand palette — no generic grays for body text
8. No reference campaign screenshots embedded as <img> tags

If issues found: return the CORRECTED complete HTML.
If all checks pass: return the HTML unchanged.
Return ONLY HTML. No commentary.
```

## Impact
- Catches rounded-corner violations before user sees them
- Eliminates images with excessive negative space
- Adds ~3-5 seconds to generation time (Sonnet QA pass) but dramatically improves first-impression quality

