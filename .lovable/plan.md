

# Fix Campaign Generation Quality — Multiple Issues

## Problems Identified

1. **AI uses ALL images indiscriminately** — needs full autonomy to pick what fits the campaign goal, not a hardcoded "1 logo, 2 hero, 2 product" selection
2. **No image processing** — images with excessive negative space get used raw; ImageKit URL transformations can crop/resize on the fly
3. **No email footer** — missing unsubscribe link, brand address, social links section
4. **White bar on right side** — the email wrapper is 600px but mobile view is 375px; the email's `width:600px` inline style creates overflow in the 375px iframe
5. **Design inconsistency** — mixed alignment, gray text, center-aligned sections with left-aligned bullets — the system prompt needs stricter design cohesion rules

---

## Changes

### 1. Give AI full asset access with metadata (generate-campaign edge function)

Stop hardcoding "pick 1 logo, 2 hero shots." Instead:
- Send ALL brand assets (up to ~15) with their categories as a labeled catalog
- Let the AI decide which images serve the campaign based on the brief and goal
- Add instructions: "You are the creative director. Choose the images that best serve this campaign's story. You do not need to use all of them."

### 2. ImageKit URL transformations for smart cropping (shared imagekit.ts)

Add a utility function that appends ImageKit transformation parameters to hosted URLs:
- After uploading to ImageKit, the returned URL is a base like `https://ik.imagekit.io/xxx/image.jpg`
- Append `tr:w-600,fo-auto` for smart auto-focus cropping (removes excessive negative space)
- For images the AI marks as "hero/full-bleed": `tr:w-600,h-400,fo-auto,c-maintain_ratio`
- Expose this as a helper the generate function uses when building the asset catalog, so the AI gets pre-transformed URLs

The AI prompt will also instruct: "If an image has excessive empty space, use ImageKit URL transformations by appending `/tr:w-600,h-400,fo-auto,c-maintain_ratio` to crop it intelligently."

### 3. Add footer requirements to the system prompt (generate-campaign)

Add to `UNIVERSAL_EMAIL_RULES`:
```
FOOTER (required on every email):
- Must include: brand name, unsubscribe link placeholder, address placeholder
- Style: small text (11-12px), muted color, centered, generous top padding
- Unsubscribe link text: "Unsubscribe" — use href="#unsubscribe" as placeholder
- Optional: social media icon row above the footer text
- The footer is a SEPARATE section from the main content — never merge it with the last content block
```

### 4. Fix white bar / mobile rendering (generate-campaign system prompt)

Update the `STRUCTURE` section of `UNIVERSAL_EMAIL_RULES`:
- Change from `width=600 style='max-width:600px; width:600px;'` to `width="100%" style="max-width:600px; width:100%;"`
- This makes the email fluid within the 375px iframe viewport — no overflow, no white bar
- Add: "The outermost wrapper table must be `width='100%'` with `max-width:600px` and `margin:0 auto`. Never use a fixed `width:600px` on the wrapper."

### 5. Stricter design cohesion rules (generate-campaign system prompt)

Add to `UNIVERSAL_EMAIL_RULES`:
```
DESIGN COHESION:
- ALL text alignment within a section must be consistent — if a section is center-aligned, ALL elements in it (headlines, body text, bullets, sub-text) must be centered
- Never use raw gray (#999 or similar) body text — use the brand's text color or a slightly muted version of it
- Bullet points or benefit lists in a centered layout must themselves be centered (use centered pill/chip design, not left-aligned bullets)
- Every section must feel "designed" — no default-looking text dumps
- Maintain a clear visual hierarchy: headline → supporting text → CTA, with consistent spacing
```

### 6. Remove the "no overlay" instruction from prompt

The current prompt says to use absolute positioning for text overlays or skip the image. Since the user said no overlays right now, change this to: "If an image has excessive negative space that would look awkward, use ImageKit smart cropping by appending transformation parameters to the URL, or skip the image entirely. Do NOT overlay text on images."

---

## Files Modified

1. **`supabase/functions/generate-campaign/index.ts`** — Updated system prompt (footer, fluid width, design cohesion, overlay removal), send all assets with full catalog, ImageKit transform hints in prompt
2. **`supabase/functions/_shared/imagekit.ts`** — Add `applyImageKitTransform(url, options)` helper that appends `tr:` params to ImageKit URLs
3. **`supabase/functions/edit-campaign/index.ts`** — Same prompt fixes (footer, fluid width, design cohesion) in the edit system message

### Deployment
- Redeploy `generate-campaign` and `edit-campaign` edge functions after changes

