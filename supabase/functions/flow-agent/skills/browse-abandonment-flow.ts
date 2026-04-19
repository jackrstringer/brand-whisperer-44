// Auto-generated from browse-abandonment-flow.md
export default String.raw`
# SKILL: Browse Abandonment Flow
**System:** Klaviyo Email Flow Builder — DTC Brand Architecture
**Version:** 1.0
**Scope:** Viewed Product trigger → re-engagement, social proof, soft conversion

---

## What This Flow Does

Browse abandonment targets people who showed buying intent by viewing a product page but didn't add to cart or complete a purchase. It is the lowest-intent abandonment trigger in the DTC email stack — sitting below abandoned checkout (cart intent) and above general welcome / nurture sequences (no product intent at all).

Because the intent signal is weaker, the strategy must be softer. The goal of this flow is not to pressure someone into buying — it is to:

1. **Stay top of mind** — gently surface the product they showed interest in, before they forget about it
2. **Address hesitation** — they looked but didn't buy. Something stopped them. Common reasons: price hesitation, unsure if it's right for them, distraction, comparison shopping. The flow's job is to remove those friction points.
3. **Build trust with proof** — social proof (reviews, stats, guarantees) is the single most effective tool for a browse abandonment sequence
4. **Show alternatives** — if they didn't love that specific product, show related products they might prefer

Browse abandonment is a volume play. Open rates are moderate, not high. Keep these emails short, elegant, and friction-free. Two emails max for most brands.

---

## Critical Distinction: Browse vs. Checkout Abandonment

This is the most important thing to understand before building this flow:

| | Browse Abandonment | Abandoned Checkout |
|---|---|---|
| **Trigger** | Viewed Product | Started Checkout |
| **Intent level** | Low-medium | High |
| **Available data** | Product ID from event (no cart) | Cart items + checkout URL |
| **Product Liquid** | \`{% catalog_lookup event.item_id as p %}\` | \`event.extra.line_items[0].name\` |
| **Urgency level** | Low — soft curiosity frame | High — cart/items waiting |
| **Email count** | 1–2 max | 3–4 (higher intent warrants more follow-up) |
| **Discount** | Rarely needed | Sometimes appropriate in E3 |

**Never use \`event.extra.line_items\` in a browse abandonment flow.** This event data does not exist for the Viewed Product trigger. Using it will render blank content or break the email entirely. All product data must come from a catalog lookup using \`event.item_id\`.

---

## Required Inputs (Gather Before Building)

| Input | Why It Matters | Default If Unknown |
|---|---|---|
| Brand's product catalog integrated in Klaviyo? | Required for catalog_lookup to work. Must be synced via Shopify, custom feed, or catalog API. | Confirm before building |
| Product feeds available? (RecentlyViewed, BestSellers) | Determines whether to show a product recommendation section | Assume BestSellers available |
| Brand's price point / AOV | Higher AOV = less aggressive sequence. Premium brands use single email only. | Medium |
| Is brand running abandoned checkout flow? | Must confirm suppression logic to avoid overlap | Yes (assumed) |
| Review platform? | Determines whether E2 can dynamically pull reviews for the viewed product | Static reviews if no platform |
| Discount strategy? | Browse abandonment rarely needs a discount. Confirm with brand whether they want to test one in E2. | No discount |

---

## Liquid Variables Reference

\`\`\`liquid
{# Event-level data — from Viewed Product trigger #}
event.item_id                     → Shopify/catalog product ID for the viewed product
event.ItemName                    → product name (direct from event, may be less formatted than catalog)
event.ImageURL                    → product image URL (direct from event)
event.URL                         → product page URL (use as CTA link)

{# Catalog lookup — REQUIRED for full product data #}
{% catalog_lookup event.item_id as p %}
p.title                           → product title from catalog
p.image_full_url                  → full-size product image URL from catalog
p.url                             → product page URL from catalog (prefer over event.URL)
p.price                           → product price
p.description                     → product description (often truncated — use wisely)
p.custom_metadata.key             → any custom catalog fields (variant info, category, etc.)

{# Person-level data #}
person.first_name                 → | default: 'there'
person.email

{# Feed-based product recommendations #}
feeds.RecentlyViewed              → other products this person has viewed (if feed configured)
feeds.BestSellers                 → brand's best-selling products (safe fallback)
feeds.MayAlsoLike                 → AI-powered recommendations based on viewing history

{# Full usage example #}
{% catalog_lookup event.item_id as p %}
{{ p.title }}
{{ p.price | money }}
<a href="{{ p.url }}">Shop Now</a>
<img src="{{ p.image_full_url }}" />
\`\`\`

**Fallback pattern:** Always use a fallback for catalog lookups in case the product is no longer in the catalog (sold out, delisted, etc.):
\`\`\`liquid
{% catalog_lookup event.item_id as p %}
{% if p %}
  <h2>{{ p.title }}</h2>
{% else %}
  <h2>{{ event.ItemName }}</h2>
{% endif %}
\`\`\`

---

## Suppression Rules (Critical — Build These First)

Browse abandonment overlaps with other flows. If you don't build suppression correctly, customers will receive conflicting or redundant emails. Implement ALL of the following:

| Suppression Condition | Why | Implementation |
|---|---|---|
| Added to Cart (same session or after view) | They escalated to cart intent — enter abandoned checkout flow instead | Flow filter: exclude anyone who has triggered "Added to Cart" event within last 30 days for same product. OR: use a 1-hour delay on E1 and suppress if Added to Cart fires during delay window. |
| Started Checkout | Even higher intent — already in checkout abandonment | Flow filter: exclude "Started Checkout" within last 30 days |
| Placed Order for this product | They converted — no need to browse-abandon them | Flow filter: exclude "Placed Order" containing this product ID. Use metric filter on \`event.item_id\` matching the purchase. |
| Already in abandoned checkout flow | Sending both = brand looks uncoordinated | Confirm checkout abandonment flow has Smart Sending enabled and/or suppress at segment level |
| Unsubscribed / suppressed profile | Standard Klaviyo handling | Klaviyo manages automatically |

**The safest architecture:** Add a 1–4 hour delay before E1 fires. During this window, if any of the above events fire, the delay catches them before the email sends and suppression logic kicks in.

---

## Architecture Principles

### Timing
- **E1 fires 1–4 hours after the Viewed Product event.** Not immediately — waiting 1–2 hours feels natural and gives space for the suppression window to catch cart adders. Not longer than 4 hours — the product is still in their mental window.
- **E2 fires 24–48 hours after E1** (if they haven't clicked, added to cart, or purchased). 24 hours is the sweet spot for most brands. 48 hours if brand prefers a lighter-touch cadence.

### Tone and framing
- **E1 is about curiosity and the product, not urgency.** "You were checking out [Product] — here's more about it" outperforms "Don't let [Product] sell out!" for browse abandonment. The person didn't commit to a cart; pressure is premature.
- **E2 is about proof.** If E1 didn't convert them, they likely need more confidence. E2 leads with social proof: reviews, stats, and guarantees. The guarantee/seal is especially effective here — it removes the purchase risk.
- **Never start with a discount for browse abandonment.** Unlike abandoned checkout (where the cart is close), a browse abandonment discount trains customers to browse without buying and wait for the offer. If brand insists: put it in E2, never E1.

### Email count
- **2 emails is the standard.** Browse intent is lower than cart intent — a 3-email sequence feels aggressive for someone who just viewed a page.
- **1 email only for high-AOV / premium brands.** Chasing a browser with multiple emails is inconsistent with a luxury brand posture.
- **Never more than 2 emails** for browse abandonment. If 2 emails haven't converted them, they're either not ready or not interested. Let them enter a nurture sequence instead.

### Product recommendation section
- If the viewed product didn't resonate, alternatives might. A \`feeds.RecentlyViewed\` grid (4 products) below the hero product is highly effective for multi-SKU brands.
- For single-SKU brands: skip the product grid. Use brand testimonials or education content in the space instead.
- Always show the viewed product first (via catalog_lookup), then related/recommended below.

---

## Template 1: Standard 2-Email (Most DTC Brands)

**Best for:** Multi-SKU brands, any price point except luxury/high-AOV single SKU

\`\`\`
FLOW: Browse Abandonment — [Brand]
TRIGGER: Viewed Product
ENTRY FILTERS:
  - Exclude: has placed order in last 30 days for this product (event.item_id match)
  - Exclude: has started checkout in last 7 days
  - Exclude: profile is in active abandoned checkout flow
  - Exclude: Klaviyo suppressed / unsubscribed
EXIT CONDITIONS:
  - Added to Cart → exit (entered checkout flow)
  - Started Checkout → exit
  - Placed Order → exit
SMART SENDING: ON for both emails

---
[DELAY] — 2 hours
(Suppression window: if they Add to Cart or Start Checkout during this delay, Klaviyo's flow exit conditions catch them before E1 fires)

---
[EMAIL 1] — The Product Re-Surface
Timing: 2 hours after Viewed Product event
Job: Gently resurface the product they viewed, address curiosity, and create a natural reason to click through.
Subject direction: Curiosity framing, not urgency. "Still thinking about [p.title]?" or "You were looking at this..." or "Here's what to know about [p.title]"
Pre-header: "A few things that might help you decide."
Sections:
  1. Hero: Viewed product (catalog_lookup)
     Copy spec:
       - Product image: {{ p.image_full_url }} (full-width or square, depending on template)
       - Product title: {{ p.title }}
       - Product price: {{ p.price | money }}
       - 1–2 sentence product description or key benefit line (pull from p.description or write static brand-specific copy)
       - CTA: "Take another look →" linking to {{ p.url }}
     Design element: Product Hero Card (full-bleed image, title, price, CTA)
  2. Why people love it — mini social proof strip
     Copy spec: 2–3 short testimonial pulls or a stat. "4.8 stars across 2,400+ reviews." Or 2 short review quotes (3–5 words each). Compact. Shows the product has a following.
     Design element: Stat Strip (e.g., ★ 4.8 / 2,400+ reviews / 98% would recommend)
  3. Key benefit callouts (3 bullets or icons)
     Copy spec: 3 short benefit lines specific to this product. Not generic — specific to what makes this product different. "No [common problem]." "Works in [timeframe]." "Made with [key differentiator]."
     Design element: Scrolling Benefits Banner or inline icon-text bullet row
  4. Product recommendation grid — "You might also like"
     Copy spec: 4-product grid pulled from feeds.RecentlyViewed (if available) or feeds.BestSellers (fallback). Label: "While you're here — our most-loved right now" or "Customers who viewed this also loved:"
     Design element: Product Variant Grid (4-up, 2-column on mobile)
  5. Soft CTA footer
     Copy spec: "Questions before you buy? Reply to this email — we respond within [X hours]." Humanizes the brand. Reduces the unknown-risk hesitation.
Dynamic:
  {% catalog_lookup event.item_id as p %}
  - {{ person.first_name | default: 'there' }}
  - {{ p.title }}
  - {{ p.image_full_url }}
  - {{ p.price | money }}
  - {{ p.url }}
  - feeds.RecentlyViewed (4 products, fallback to feeds.BestSellers)
Notes:
  - Always wrap catalog_lookup in an if/else fallback (see Liquid reference above)
  - If the product feed (RecentlyViewed) isn't configured for this brand: remove section 4 and expand section 2 with more reviews
  - Subject line A/B test recommendation: curiosity angle ("Still thinking about X?") vs. benefit angle ("Here's why 2,000+ people love [Product]")

---
[DELAY] — 24 hours

---
[CONDITIONAL SPLIT] — Did they engage / convert?
  Condition: Has clicked a link in E1 OR has Added to Cart OR has Placed Order since E1 sent
  YES → EXIT FLOW (they're engaged — let checkout or purchase flow handle them)
  NO → send E2

---
[EMAIL 2] — Social Proof & Confidence Builder
Timing: 26 hours after Viewed Product event (24h delay + 2h from trigger)
Job: Close the confidence gap with in-depth social proof and a risk-removal guarantee.
Subject direction: Proof-led. "Here's what [X] customers say about [p.title]" or "Still on the fence? Read this." or "Why [Brand] has [X] five-star reviews"
Pre-header: "Real customers, real results — plus our [X]-day guarantee."
Sections:
  1. Re-surface the product (compact, not full hero)
     Copy spec: Smaller product card. "You were looking at this." Product image, title, price, and direct link. Single row — this email is about proof, not re-introducing the product.
     Design element: Compact Product Card (smaller than E1 hero)
  2. Review Card (3–4 reviews specific to this product)
     Copy spec: Pull 3–4 reviews from review platform (or handpick best reviews for static version). Include: star rating, reviewer name (first name + last initial), review headline, 2–3 sentences of review body. Focus on reviews that address common hesitations (efficacy, value, ease of use, results timeline).
     Design element: Review Card (individual cards, not carousel — carousel has low engagement on mobile)
  3. Stat Strip
     Copy spec: 3 trust stats. Examples: "★ 4.8 average rating" | "10,000+ happy customers" | "X% saw results in Y weeks." Specific numbers always outperform vague claims. Pull real stats from brand.
     Design element: Stat Strip (3-column icon + number + label)
  4. Guarantee Seal
     Copy spec: "[X]-day money-back guarantee. If you're not completely satisfied, we'll make it right — no questions asked." This single section meaningfully increases conversion by removing purchase risk. Show the guarantee badge/seal prominently.
     Design element: Guarantee Seal (badge or callout box with border)
  5. CTA — back to product
     Copy spec: "Ready to try it? →" or "Get [Product] →" linking to {{ p.url }}. One CTA, centered, clear.
  6. (Optional) Urgency signal — only if real
     Copy spec: ONLY include if the product is actually low stock or a time-limited run. "Only [X] left in stock." Never manufacture false urgency — it destroys trust for sophisticated DTC buyers. If no real urgency exists: remove this section entirely.
Dynamic:
  {% catalog_lookup event.item_id as p %}
  - {{ person.first_name | default: 'there' }}
  - {{ p.title }}
  - {{ p.url }}
  - Static reviews (or platform-pulled if integration supports it)
Notes:
  - After E2 sends with no conversion: let the person exit this flow naturally
  - Do NOT add a third email. They've had their chance. Move them to general marketing/nurture.
  - If brand wants to add a discount at this stage: A/B test E2 with vs. without 10% offer. Hypothesis: social proof alone may convert as well as discount, without training discount behavior. Measure with statistical significance.

---
\`\`\`

---

## Template 2: Single Email (High-AOV / Premium Brands)

**Best for:** $100+ AOV, luxury or premium brand positioning, brands where persistence feels off-brand

**Philosophy:** For premium brands, one thoughtful email is the right move. A follow-up browse abandonment email signals desperation — inconsistent with the brand's positioned confidence. One email, beautifully executed, does the job.

\`\`\`
FLOW: Browse Abandonment — [Brand] (Premium)
TRIGGER: Viewed Product
ENTRY FILTERS: Same suppression logic as Template 1
EXIT CONDITIONS: Added to Cart, Started Checkout, Placed Order → exit
SMART SENDING: ON

---
[DELAY] — 3–4 hours
(Longer delay than standard — premium brands don't chase)

---
[EMAIL 1] — The Thoughtful Re-Surface
Timing: 3–4 hours after Viewed Product
Job: Elegantly remind them of the product with brand storytelling, social proof, and a frictionless return path.
Subject direction: Brand-confident, not anxious. "A closer look at [p.title]" or "The [Product] — in case you wanted more detail" or "For when you're ready"
Pre-header: "A few things worth knowing."
Sections:
  1. Product hero (full editorial image if brand has it, catalog fallback)
     Copy spec: Lead with the product at its most beautiful. Minimal copy. Product name. 1 sentence of brand-level copy — not a feature list. "The [Product] is [X because of Y]." Aspirational, assured.
     Design element: Full-bleed Product Hero Card
  2. Brand story / product origin (2–3 sentences)
     Copy spec: Why this product exists. What problem it was built to solve. What makes it different from anything else. Not bullet points — flowing prose. 3 sentences max.
  3. Review Card (2 reviews — curated, editorial quality)
     Copy spec: 2 longer, detailed reviews (not 5-word clips). Reviews that speak to quality, longevity, or transformation. Premium positioning requires proof that speaks to premium outcomes.
     Design element: Review Card (2-up, refined styling — no star emoji spam)
  4. Guarantee Seal
     Copy spec: Clean, minimal. "[X]-day guarantee, no questions." One line. More is less.
  5. CTA
     Copy spec: "Learn more →" or simply the product name as the link. Never "BUY NOW." Soft CTA. They know they can buy — make it easy, don't push.
Dynamic:
  {% catalog_lookup event.item_id as p %}
  - {{ p.title }}
  - {{ p.image_full_url }}
  - {{ p.url }}
Notes:
  - No product feed / recommendation grid in premium template. Showing a grid of other products is too commercial.
  - No urgency language — ever.
  - No discount.
  - No follow-up email after this one.

---
\`\`\`

---

## Template 3: With Product Feed (Multi-SKU / Discovery-Oriented Brands)

**Best for:** Brands with large catalogs (10+ SKUs), lifestyle brands where browsing and discovery is core to the shopping experience (apparel, home, beauty)

**Modification to Standard 2-Email:** E1 includes a prominent RecentlyViewed product feed to acknowledge that the customer was browsing broadly, not just looking at one product. Positions the brand as the curator.

\`\`\`
FLOW: Browse Abandonment + Feed — [Brand]
TRIGGER: Viewed Product
(Same suppression, exit conditions, Smart Sending as Template 1)

---
[DELAY] — 2 hours

---
[EMAIL 1] — Browse Session Re-Engagement
Timing: 2 hours after Viewed Product
Job: Surface the specific viewed product AND acknowledge their broader browsing session with a curated product feed.
Subject direction: Discovery framing. "A few things from your recent browse" or "Picking up where you left off" or "You've got good taste — here's what caught your eye"
Pre-header: "Your recently viewed + a few you might have missed."
Sections:
  1. Compact hero: primary viewed product
     Copy spec: Smaller hero than Template 1 — 50% height. This email acknowledges multiple products. Product image, title, price, benefit line, CTA. Don't over-develop this section.
     Design element: Compact Product Card
  2. Recently Viewed feed — "Continue browsing"
     Copy spec: "Here's everything you were looking at:" — 4-product grid from feeds.RecentlyViewed. Each product: image, name, price, "View →" link. Clean grid layout.
     Design element: Product Variant Grid (4-up, 2-column mobile, from feeds.RecentlyViewed)
  3. BestSellers feed — "Trending right now" (if RecentlyViewed is sparse)
     Copy spec: "In case you missed anything — our most-loved products right now." 4-product grid from feeds.BestSellers. Show only if RecentlyViewed feed returns < 3 products.
     Design element: Product Variant Grid (4-up, fallback from feeds.BestSellers)
  4. Stat Strip or Review pull
     Copy spec: Trust anchor. "★ 4.8 stars | 10,000+ orders | [Benefit claim]." 3 columns.
     Design element: Stat Strip
  5. Soft close
     Copy spec: "Have questions? We're here — just reply to this email." Humanizes.
Dynamic:
  {% catalog_lookup event.item_id as p %}
  - {{ p.title }}
  - {{ p.image_full_url }}
  - {{ p.url }}
  - feeds.RecentlyViewed (4 products)
  - feeds.BestSellers (4 products, conditional fallback)
Notes:
  - If feeds.RecentlyViewed is not configured for the brand, this template degrades to Template 1 (viewed product + BestSellers grid)
  - For apparel brands: add a "Shop by collection" link section after the product grids. Apparel browsers often respond to collection-level navigation better than individual product focus.

---
[DELAY] — 24 hours
[CONDITIONAL SPLIT] — engaged / converted?
  YES → exit
  NO → send E2 (same as Template 1 E2)

---
[EMAIL 2] — Social Proof & Guarantee
(Same as Template 1 E2)
\`\`\`

---

## Design Element Recommendations (Full Reference)

### E1 — Product Re-Surface
| Section | Design Element | Notes |
|---|---|---|
| Primary product | Product Hero Card (catalog_lookup) | Full product details from catalog — image, title, price, CTA |
| Social proof strip | Stat Strip | 3 stats — review count, star rating, customer count or result metric |
| Benefits | Scrolling Benefits Banner | 3–5 short product benefits. Can be a static icon-row on simpler templates. |
| Related products | Product Variant Grid | feeds.RecentlyViewed, 4-up. Fallback to feeds.BestSellers. |

### E2 — Proof & Confidence
| Section | Design Element | Notes |
|---|---|---|
| Product re-surface | Compact Product Card | Smaller than E1. Reminder, not reintroduction. |
| Customer reviews | Review Card (3–4 cards) | Individual cards preferred over carousel. Mobile-optimized. |
| Trust stats | Stat Strip | Same as E1 or updated with different metrics |
| Risk removal | Guarantee Seal | High-impact section. Never bury it. Prominent placement. |

---

## Flow Filters vs. Exit Conditions: Know the Difference

| | Flow Filters | Exit Conditions / Metric Triggers |
|---|---|---|
| **When they run** | At entry — determine if person enters the flow | During flow — check continuously while person is waiting |
| **Use for** | Excluding people who should never enter (recent purchasers, active checkout abandonments) | Removing people who convert or escalate while in the flow (added to cart, placed order) |
| **In Klaviyo** | Set on the flow trigger | Set as "Exit Conditions and Filters" on the flow |

**For browse abandonment, you need both:**
- Flow filters to prevent wrong-person entry
- Exit conditions to pull people out if they add to cart or buy during the delay window

---

## Performance Benchmarks (Use as Goal-Setting Reference)

| Metric | Expected Range | Notes |
|---|---|---|
| E1 Open Rate | 35–50% | Higher than average due to behavioral relevance |
| E1 Click Rate | 8–15% | Decreases with catalog complexity |
| E1 CVR | 3–8% | Highly variable by price point and product type |
| E2 Open Rate | 25–40% | Drop-off from E1 is expected |
| E2 CVR | 2–5% | Proof-led emails convert well when reviews are strong |
| Overall flow CVR | 5–12% | Aggregate across E1 + E2 |

**If E1 CVR is below 2%:** Audit the catalog_lookup rendering — blank product content dramatically drops performance. Also test subject lines (curiosity vs. proof angle).

**If E2 CVR is below E1 CVR by more than 50%:** Consider removing E2 for this brand. Some brands over-trigger browse abandonment follow-ups and train their customers to ignore them.

---

## Common Mistakes to Avoid

| Mistake | Why It Fails | Fix |
|---|---|---|
| Using \`event.extra.line_items\` in browse abandonment | This event property doesn't exist for Viewed Product trigger. Renders empty. | Always use \`{% catalog_lookup event.item_id as p %}\` |
| Sending E1 immediately (0 delay) | Feels surveillance-level aggressive. Opens complaint rate increases. | Minimum 1-hour delay. 2 hours is standard. |
| 3+ emails for browse abandonment | Over-pursuing low-intent behavior. Unsubscribe rate climbs. | Max 2 emails. 1 for premium. |
| Using urgency language in E1 | Browser hasn't signaled urgency-level intent. Pressure = friction. | Reserve urgency for abandoned checkout and cart recovery. |
| Not setting exit conditions | Customer buys, then continues receiving browse abandonment emails. Brand looks out of sync. | Exit conditions are mandatory. Add to cart, started checkout, placed order — all exit. |
| Showing a generic product grid instead of the actual viewed product | Misses the behavioral relevance that makes this flow work. | Always lead with catalog_lookup of the specific viewed product. |
| Applying this flow to everyone who views a page, including existing customers mid-order | Post-purchase customers re-browsing get inappropriate browse abandonment emails. | Add flow filter: exclude profiles that have placed an order in the last 30 days. |
| No fallback for catalog_lookup | If product is out of stock or delisted, the email breaks. | Always use \`{% if p %}...{% else %}...{% endif %}\` fallback. |

---

## QA Checklist Before Launch

- [ ] Catalog feed (Shopify/custom) is integrated and synced in Klaviyo?
- [ ] \`{% catalog_lookup event.item_id as p %}\` tested with a real Viewed Product event profile?
- [ ] Fallback content renders correctly when catalog_lookup returns empty?
- [ ] E1 delay is set to 1–4 hours (not 0)?
- [ ] Flow filters exclude recent purchasers of the same product?
- [ ] Exit conditions configured: Added to Cart, Started Checkout, Placed Order?
- [ ] Overlap with abandoned checkout flow is confirmed non-duplicate (Smart Sending ON)?
- [ ] feeds.RecentlyViewed or feeds.BestSellers feed is configured and tested?
- [ ] Mobile preview: product images render correctly from catalog_lookup URLs?
- [ ] Subject line A/B test configured for E1?
- [ ] Review platform integration tested (if dynamic reviews in E2)?
- [ ] Suppression list for active checkout abandonment flow applied?
`;
