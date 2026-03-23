

# Fix Logo, Default Viewport, Button Width, and Body Copy Size

## Problems Identified

1. **Logo getting messed up** — The asset catalog sends all images with categories but doesn't give specific instructions for logo handling. Logos need special treatment: they should be displayed at a reasonable max-width (120-180px), centered, and NEVER stretched to full width or cropped.

2. **Default viewport settings wrong** — Currently defaults to 431px render / 431px viewport. Change to 470px / 470px / 100% zoom.

3. **Buttons stretching to full page width** — The mobile `@media` rule in `UNIVERSAL_EMAIL_RULES` says "Buttons: full-width or auto" which causes the AI to make buttons `width:100%`. In real email clients (Klaviyo on mobile/desktop), the media query may not fire the same way, creating a mismatch. The rule should say buttons should be `auto` width with generous padding — NOT full-width.

4. **Body copy too small** — The current rule says "Body text minimum 15px" which is borderline for mobile. Should be minimum 16px, with a recommendation of 16-18px for optimal mobile readability.

## Additional Bug: Brand Values Not Extracted Correctly

The code reads `rawExtraction?.card_radius` but the actual structure is `rawExtraction?.spacing?.card_radius` and `rawExtraction?.buttons?.border_radius`. This means the QA pass is always using the fallback defaults ("12" and "100") instead of the actual brand values. Must fix the nested path access.

---

## Changes

### 1. `src/pages/CampaignEditor.tsx` — Change defaults

- Line 54: `renderWidth` default from 431 → 470
- Line 55: `viewportWidth` default from 431 → 470
- Line 56: `screenZoom` stays at 100

### 2. `supabase/functions/generate-campaign/index.ts`

**Fix brand value extraction (line 124-130):**
```
card_radius: rawExtraction?.spacing?.card_radius ?? "12"
button_radius: rawExtraction?.buttons?.border_radius ?? "100px"
accent_color: rawExtraction?.colors?.accent ?? ""
text_color: rawExtraction?.colors?.text_primary ?? ""
background_color: rawExtraction?.colors?.canvas ?? ""
```

**Fix UNIVERSAL_EMAIL_RULES:**
- MOBILE section: Change "Buttons: minimum 44px tall, full-width or auto" → "Buttons: minimum 44px tall, auto width with generous horizontal padding (32-48px). NEVER full-width — buttons should look the same in the preview as they do in real email clients."
- BUTTONS section: Remove hardcoded "border-radius:100px" — replace with "use the brand's button border-radius value"
- Body text minimum: Change from 15px → 16px, add "Recommended: 16-18px for body paragraphs on mobile"

**Add logo-specific rules to IMAGE RULES section:**
- "LOGO HANDLING: Images categorized as 'logo' must be displayed at max-width:150px (or similar reasonable size), centered, with padding above and below. NEVER stretch a logo to full width. NEVER crop a logo. If a dark-mode-safe variant exists, use it."

**Add to asset catalog format:** When building the catalog string, prefix logo entries with a note: `[logo — display at max-width 150px, centered, DO NOT stretch or crop]`

### 3. `supabase/functions/edit-campaign/index.ts`

Apply the same button and body text rule changes to its system prompt to keep edits consistent.

---

## Files Modified

1. **`src/pages/CampaignEditor.tsx`** — Default render/viewport to 470px
2. **`supabase/functions/generate-campaign/index.ts`** — Fix nested brand value paths, logo rules, button width rules, body text minimums
3. **`supabase/functions/edit-campaign/index.ts`** — Same prompt rule updates

