// Auto-generated from winback-flow.md
export default String.raw`
# SKILL: Winback Flow
**System:** Klaviyo Email Flow Builder — DTC Brand Architecture
**Version:** 1.0
**Scope:** Time-based re-engagement of lapsed customers → purchase, or graceful exit

---

## What This Flow Does

A winback flow targets customers who have bought from the brand in the past but have gone quiet — no purchases, and often no email engagement — for 60 to 180 days. The job is to revive the relationship before it's lost permanently.

Unlike acquisition or abandonment flows, winback speaks to someone who already knows the brand. They chose you before. Something happened: they ran out and didn't reorder, life got busy, they moved on, or they found something else. The flow's job is to answer the implicit question: "Is there still a reason for me to come back?"

The flow does this in three beats:

1. **Soft re-engagement** — acknowledge the gap, show what's new, earn the re-click without a discount. Tests whether the relationship is still alive organically.
2. **Incentive introduction** — if organic re-engagement didn't work, introduce a discount or gift to reduce the barrier to repurchase. Not a bribe — a reward for coming back.
3. **Last chance / permission to leave** — final push. If they've still not engaged, give them a graceful out. This protects deliverability AND demonstrates brand confidence. A brand secure enough to offer an unsubscribe is a brand that respects the customer's time.

A well-built winback flow recovers 5–15% of lapsed customers who would otherwise churn permanently, and cleans the list of unengaged contacts who harm deliverability.

---

## Critical Distinction: No Product Event Data

Winback is triggered by a **time condition**, not a product event. This means:

- There is **no \`event.item_id\`** — no product was viewed, added to cart, or purchased in this trigger
- There is **no \`event.extra.line_items\`** — no order data is available
- There is **no \`event.*\` product property of any kind** to reference in winback emails

All product content in winback comes from:
- **\`feeds.BestSellers\`** — the brand's current best-selling products
- **\`feeds.NewArrivals\`** — new products launched since the customer last purchased
- **\`feeds.MayAlsoLike\`** — AI-based recommendations (if configured)
- **Static brand copy** — evergreen product or brand storytelling

If you attempt to use \`event.extra.line_items\` or any \`event.*\` product property in a winback flow, it will render blank or error. Do not do it.

---

## Available Data Reference

\`\`\`liquid
{# Person-level data — all that's reliably available #}
person.first_name                 → | default: 'there'
person.email
person.$last_opened_email         → last email open date (Klaviyo internal property)
person.$last_clicked_email        → last email click date
person.total_order_count          → lifetime order count
person.total_order_value          → lifetime spend (if synced from Shopify)
person.last_order_date            → date of last purchase (if synced)

{# Product feeds — the only source of product content in winback #}
feeds.BestSellers                 → brand's top-selling products grid
feeds.NewArrivals                 → new products this customer hasn't seen
feeds.MayAlsoLike                 → AI-powered recommendations (if configured)

{# Promo codes — dynamic generation #}
{% coupon_code 'WINBACK10' %}     → generates unique coupon from Klaviyo coupon integration
                                    Use Klaviyo's dynamic coupon feature, not static codes

{# Usage examples #}
{{ person.first_name | default: 'there' }}
{{ feeds.BestSellers | limit: 4 }}
{{ feeds.NewArrivals | limit: 4 }}
{% coupon_code 'WINBACK10' %}
\`\`\`

**Important on coupon codes:** Never use a single static code (like WINBACK10 hardcoded in the email) — it gets shared on discount code sites within hours and destroys margin. Use Klaviyo's dynamic coupon integration with a coupon pool so every email renders a unique, one-time-use code.

---

## Required Inputs (Gather Before Building)

| Input | Why It Matters | Default If Unknown |
|---|---|---|
| Product purchase frequency (high vs. low) | Determines trigger timing — supplements reorder in 30 days, furniture doesn't | 90 days |
| Does brand discount? | Premium/luxury brands never discount → use Template 3 (no-discount) | Yes |
| Discount amount / type | % off vs. $ off vs. gift with purchase. Confirm with brand. | 10% off |
| Coupon pool configured in Klaviyo? | Required for dynamic unique codes | Must set up before launch |
| New products / arrivals to feature? | If brand hasn't launched anything new, "what's new" angle is weak | Use BestSellers as fallback |
| Does brand want a sunset sequence? | For brands focused on deliverability, append sunset after E3 | Optional |
| Brand voice: warm vs. formal? | Affects whether "permission to leave" framing in E3 is casual or professional | Warm |
| Historical coupon redemption rate? | Helps decide if the incentive in E2 needs to be stronger (higher discount vs. GWP) | Unknown |

---

## Trigger Timing: Choosing the Right Lapse Window

The trigger for winback is "time since last purchase" — a Klaviyo metric trigger or a segment-based trigger. Choose the window based on the brand's replenishment cycle:

| Window | When to Use | Example Product Types |
|---|---|---|
| **60 days** | High-frequency consumables used daily. A customer who hasn't reordered in 60 days is already churning — they should have reordered by now. | Daily supplements, skincare, protein powder, coffee, pet food |
| **90 days** | Standard DTC. Most brands. Covers quarterly reorder cadence. | Most supplements, beauty, personal care, household |
| **180 days** | Low-frequency products. Infrequent purchase is normal — customers might only buy 1–2x/year. | Apparel, home goods, seasonal items, gifting |

**Implementation options in Klaviyo:**
1. **Metric trigger:** Trigger: "Has placed order at least once" → Entry filter: "Has not placed order in last [X] days." Add delay of [X] days from last order date. (Use if brand's tech stack supports it)
2. **Segment-based trigger:** Create a segment "Lapsed customers (no purchase in 90+ days)" and set flow to trigger when someone joins that segment. Simpler to implement.
3. **Profile property trigger:** If brand syncs \`last_order_date\` to Klaviyo profiles, use a date-based trigger when \`last_order_date\` is exactly [X] days ago.

**Confirm with brand which implementation method matches their Klaviyo/Shopify setup.**

---

## Architecture Principles (Non-Negotiable)

### Never open with a discount
The most common winback mistake is leading with a discount in E1. The logic seems sound — offer a deal to get them back. But the effect is the opposite of what brands want:
- It trains lapsed customers that going dormant results in a discount. You are teaching them to churn on purpose.
- It immediately signals that the brand is desperate rather than confident
- It squeezes margin on customers who might have come back organically

**The correct sequence: organic re-engagement first → discount as a secondary intervention if organic fails.**

### "What's new" is the single most powerful winback content angle
The gap since last purchase means there's genuine news. New products, new formulas, new collections, new proof, a brand story that has developed. A customer who fell off often didn't leave because they stopped liking the brand — they got distracted. Showing them what's evolved is the most natural reason to come back.

### Permission to leave is a feature, not a failure
E3's "permission to leave" option — offering an easy unsubscribe or preference update — seems counterintuitive. But it does four things:
1. Signals brand confidence and respect for the customer
2. Catches genuinely interested customers who re-engage when given the choice (the paradox of choice effect)
3. Removes perpetually unengaged contacts from your list — improving deliverability metrics
4. Legally and reputationally protects the brand from spam complaints

### Cadence discipline
- 14 days between each email is standard. This is long enough to not feel aggressive, short enough to close the re-engagement loop within 30–42 days.
- For aggressive cadence (Template 2): 7 days between emails. Only if the brand has high churn risk and needs faster decisions.
- Never send all 3 emails in the same week. That's harassment, not winback.

---

## Template 1: Standard 3-Email (Most DTC Brands)

**Best for:** 90-day lapse window, brands that offer discounts, moderate-frequency products

\`\`\`
FLOW: Winback — [Brand]
TRIGGER: Customer joins "Lapsed [90]+ days" segment (or metric trigger: last purchase ≥ 90 days ago)
ENTRY FILTERS:
  - Has placed at least 1 order (is a customer, not a prospect)
  - Has not placed an order in the last [90] days
  - Is not in an active post-purchase flow
  - Is not suppressed / unsubscribed
EXIT CONDITIONS:
  - Placed Order → exit immediately (they converted — stop winback)
  - Profile unsubscribes → Klaviyo handles automatically
SMART SENDING: ON for all emails

---
[EMAIL 1] — Soft Re-Engagement (No Discount)
Timing: Day 0 (trigger date — when lapse condition is met)
Job: Acknowledge the time gap naturally, show what's new or what's still great, earn an organic click without any incentive.
Subject direction: Warm and natural, not needy. "It's been a while, [first_name]" or "We've missed you — here's what you've missed" or "A lot has changed at [Brand]"
Pre-header: "New products, same [brand promise] — take a look."
Sections:
  1. Personal, warm header
     Copy spec: "Hey {{ person.first_name | default: 'there' }} — it's been a minute." Casual acknowledgment of the gap. Not guilting, not sycophantic. Just honest. 2–3 sentences max. Include a genuine brand story beat — what's changed, what's new, why now is a good time to come back. This should feel like a message from a friend, not a marketing department.
  2. What's new — NewArrivals product feed
     Copy spec: "Here's what's landed since you were last here." 4-product grid from feeds.NewArrivals. If feeds.NewArrivals returns < 2 products (brand hasn't launched much), swap to feeds.BestSellers with label "Our most-loved right now." Each product: image, name, short 1-line benefit, price, "Shop →" link.
     Design element: Product Variant Grid (4-up, 2-column mobile, from feeds.NewArrivals or BestSellers)
  3. Scrolling Benefits Banner / brand proof strip
     Copy spec: 3–4 brand proof points. Not product-specific — brand-level. Examples: "X,000+ happy customers" | "[Years] in business" | "[Award or press mention]" | "[Key differentiator]." Reminds them why they bought in the first place.
     Design element: Scrolling Benefits Banner (horizontal or stacked 3-column)
  4. Brand story moment (optional, but powerful for story-led brands)
     Copy spec: 1 short paragraph about what the brand has been up to. A product launch, a milestone, a mission story beat. "This year we [X]. We thought you'd want to know." Makes the brand feel alive and evolving, not static.
  5. Soft CTA
     Copy spec: "Browse what's new →" or "See what's changed →" linking to brand's website or new arrivals collection. No urgency. No discount. No pressure.
Dynamic:
  - {{ person.first_name | default: 'there' }}
  - feeds.NewArrivals (4 products, fallback to feeds.BestSellers)
Notes:
  - This email should have zero discount language — not even a hint that a discount is coming
  - Subject line A/B test: name-personalized vs. "what you missed" framing
  - If brand has a strong founder story or has had notable press: use E1 as a brand story moment, not a product email. Some lapsed customers respond better to "why we exist" than "here's what we sell."

---
[DELAY] — 14 days

---
[CONDITIONAL SPLIT] — Did E1 convert?
  Condition: Has placed order since E1 sent
  YES → EXIT FLOW
  NO → continue to E2

---
[EMAIL 2] — Incentive Offer
Timing: Day 14
Job: Introduce a discount or GWP for customers who didn't re-engage organically. Make coming back easy and rewarding.
Subject direction: Offer-led but still warm. "A little something to welcome you back" or "We'd love to have you back — here's [X]% off" or "Your exclusive offer inside, [first_name]"
Pre-header: "[Discount amount] off your next order — just because."
Sections:
  1. Warm transition + offer reveal
     Copy spec: "Since you haven't had a chance to come back yet, we wanted to make it easy." Lead with the offer clearly: "[X]% off your next order" or "A free [gift] with your next purchase." Don't bury the incentive.
  2. Promo Code Highlight Card
     Copy spec: Prominent, centered code block. "Your code: {{ coupon_code }}" with code in large text. "Use at checkout — expires in [7 days]." Create real urgency by actually expiring the code (set expiry on the coupon pool in Klaviyo/Shopify).
     Design element: Promo Code Highlight Card (prominent, bordered, clear CTA)
  3. BestSellers product grid
     Copy spec: 4 products from feeds.BestSellers. "Our favorites — and now [X]% off with your code." Product grid with images, names, prices with discount indicator.
     Design element: Product Variant Grid (4-up, feeds.BestSellers)
  4. Review Card (brand confidence signal)
     Copy spec: 2–3 recent strong reviews. Pick reviews that speak to "I came back" or "I should have ordered sooner" if possible. Peer validation of the re-purchase decision.
     Design element: Review Card (2–3 cards)
  5. Bundle/Value Stack Card (if brand has bundles or GWP)
     Copy spec: "Or go all in — our [Bundle Name] gives you [X value] for [price], with your discount applied." Shows the full value stack. Makes the offer feel even more compelling.
     Design element: Bundle/Value Stack Card (if applicable)
  6. Expiry reminder
     Copy spec: "This offer expires in [X days]. We mean it." Genuine urgency.
Dynamic:
  - {{ person.first_name | default: 'there' }}
  - {% coupon_code 'WINBACK10' %} (replace 'WINBACK10' with brand's coupon pool name)
  - feeds.BestSellers (4 products)
Notes:
  - Coupon pool MUST be configured before launch — confirm with brand
  - Coupon expiry should be 5–7 days from send date for maximum urgency with fair time window
  - GWP (gift with purchase) alternative: some brands prefer a gift to a percentage off. Both work — test with brand's historical data if available.
  - For subscription brands: offer can be "first re-subscription order free" or "free shipping forever on subscription" instead of a generic discount

---
[DELAY] — 14 days

---
[CONDITIONAL SPLIT] — Did E2 convert?
  Condition: Has placed order since E2 sent
  YES → EXIT FLOW
  NO → continue to E3

---
[EMAIL 3] — Last Chance / Permission to Leave
Timing: Day 28
Job: Final push on the offer (if still valid) combined with a genuine permission-to-leave option. Close the loop, protect deliverability, and exit with brand dignity.
Subject direction: Final-chance energy, but not desperate. "Last chance — [X]% off expires tomorrow" or "Is this goodbye, [first_name]?" or "We'll keep it simple"
Pre-header: "Your offer expires soon — or tell us how to reach you better."
Sections:
  1. Honest, confident opener
     Copy spec: "We've reached out a couple of times and haven't heard from you — totally okay. But before we stop emailing, we wanted to try one more time." Direct and respectful. Not guilting. Not panicking.
  2. Countdown/Urgency Visual — offer expiring
     Copy spec: "Your [X]% off offer expires [date/tomorrow]." Use a real date. If coupon has already expired from E2: generate a new coupon with a fresh 3-day expiry for E3. The final-chance framing requires a live offer to be effective.
     Design element: Countdown/Urgency Visual (if tech supports real-time countdown) or simple expiry date text block
  3. Guarantee Seal
     Copy spec: "Still not sure? There's no risk — [X]-day money-back guarantee, no questions asked." Remove every remaining friction point. This is the last shot.
     Design element: Guarantee Seal
  4. Permission to Leave section
     Copy spec: "If we're not the right fit right now, no hard feelings. You can update your email preferences or unsubscribe below — and we'll respect that completely." Link to preference center (Klaviyo profile update URL). This is NOT the standard unsubscribe footer — it's an in-email, human-voiced option. It should feel like a genuine choice, not a legal requirement.
  5. Final CTA
     Copy spec: "Grab your [X]% off →" linking to brand's website with coupon pre-applied if possible.
Dynamic:
  - {{ person.first_name | default: 'there' }}
  - {% coupon_code 'WINBACK10_FINAL' %} (separate coupon pool for E3, new expiry)
  - Offer expiry date (static or dynamic)
Notes:
  - After E3 sends with no conversion or engagement: move customer to sunset sequence (see below) OR suppress from marketing sends
  - The "permission to leave" copy is critical — have it reviewed by a human. It should sound like a real person wrote it, not a marketing automation.
  - If brand objects to the permission-to-leave framing: remind them that unengaged contacts hurt deliverability scores, and graceful exits are better than spam complaints.

---
\`\`\`

---

## Template 2: Aggressive 2-Email (High Churn Risk Brands)

**Best for:** Brands with short customer lifetime expectation, subscription brands where churn is immediate and expensive, high-competition categories where customers switch fast

**Philosophy:** Compress the sequence. 7-day gap instead of 14. No organic re-engagement phase — skip straight to the offer. Prioritize recovery speed over relationship nuance.

\`\`\`
FLOW: Winback Aggressive — [Brand]
TRIGGER: Same as Template 1 (60-day lapse for high-frequency brands)
EXIT CONDITIONS: Placed Order → exit
SMART SENDING: ON

---
[EMAIL 1] — Re-Engagement + Offer Combined
Timing: Day 0
Job: One email that acknowledges the gap AND leads with an offer. Efficient for customers who have high churn likelihood.
Subject direction: Offer-forward. "You haven't been back in a while — here's [X]% off" or "Come back + save [X]%"
Sections:
  1. Brief warm opener + offer reveal (combined)
     Copy spec: "Hey [first_name] — it's been [~X weeks/months] since your last order. We'd love to have you back. Here's [X]% off to make it easy."
  2. Promo Code Highlight Card
     (Same as Template 1 E2 section 2)
  3. BestSellers grid (feeds.BestSellers, 4 products)
  4. Review Card (2–3 reviews)
  5. Guarantee Seal
  6. Expiry: 7 days from send

---
[DELAY] — 7 days

---
[CONDITIONAL SPLIT] — converted?
  YES → exit
  NO → E2

---
[EMAIL 2] — Final Push
Timing: Day 7
(Same architecture as Template 1 E3 — last chance, permission to leave, countdown)
Notes: Expiry is genuine — the E1 code is now actually expired. E2 may issue a new code (same value or slightly higher for max effort).
\`\`\`

---

## Template 3: Premium 3-Email (No Discount — Brand-Story and New Products Only)

**Best for:** Premium or luxury brands that never discount, brands where discounting devalues brand equity, brands with a strong editorial/lifestyle identity

**Philosophy:** For brands that don't discount, the winback incentive is brand evolution, not price reduction. The flow makes the case that the brand has gotten even better since they last shopped — and that's reason enough to come back.

\`\`\`
FLOW: Winback Premium — [Brand]
TRIGGER: 90-day lapse (or 180-day for low-frequency premium)
EXIT CONDITIONS: Placed Order → exit
SMART SENDING: ON

---
[EMAIL 1] — "We've Evolved" Brand Story
Timing: Day 0
Job: Show the brand has grown, launched something new, or deepened its mission. Give the lapsed customer a genuine reason to care again.
Subject direction: Brand-led. "What we've been up to" or "A lot has changed at [Brand] — take a look" or "New from [Brand] — we think you'll love it"
Sections:
  1. Founder/brand letter
     Copy spec: 3–4 paragraphs. Genuine voice. What the brand has been working on, what's changed, what's coming. No product pushing — this is relationship, not retail. "We've spent the last [X months] doing [X]. We're proud of it, and we thought you should see it."
  2. NewArrivals product grid (feeds.NewArrivals, 4 products)
     Copy spec: "Here's what's new." Clean grid. Let the products speak.
  3. Press or award mention (if applicable)
     Copy spec: "Recently featured in [Publication]" or "[Award] winner [Year]." Third-party validation without sounding like a press release.
  4. Soft CTA
     Copy spec: "See everything new →" No urgency. Brand confidence.

---
[DELAY] — 14 days
[CONDITIONAL SPLIT] → converted? YES exit / NO → E2

---
[EMAIL 2] — Product Deep Dive + Social Proof
Timing: Day 14
Job: Go deeper on one hero product or collection with rich storytelling and proof.
Subject direction: "The [Product] — in case you haven't tried it yet" or "Our best-reviewed product right now"
Sections:
  1. Single product hero (manually selected by brand — best-seller or new hero)
     Copy spec: Full product story. Ingredients or materials, why it exists, who it's for, what it does. Reads like an editorial piece.
  2. Review Card (3–4 reviews for this product, curated for quality)
  3. BestSellers grid (feeds.BestSellers, 4 products)
  4. Brand statement closer
     Copy spec: 1–2 sentences of brand positioning. "This is what we stand for. We hope it brings you back." Assured. Not desperate.
  5. CTA: "Shop the collection →"

---
[DELAY] — 14 days
[CONDITIONAL SPLIT] → converted? YES exit / NO → E3

---
[EMAIL 3] — Permission to Leave (Premium version)
Timing: Day 28
Sections:
  1. Short, graceful closer
     Copy spec: "We've reached out a few times and haven't heard from you — and that's okay. If you'd like to update how we contact you, here's the link to your preferences. If you're ready to come back, we'll be here." 3 sentences. Extremely clean and respectful.
  2. Guarantee Seal (minimal version)
     Copy spec: "[X]-day guarantee." One line.
  3. Preference update link
     (In-email, human-voiced — same as Template 1 E3)
Notes:
  - No discount in any of these emails.
  - If brand insists on an incentive: offer exclusive early access, a complimentary product sample with next order, or a VIP consultation/personalization service — value-adds that feel premium rather than price-cutting.
\`\`\`

---

## Template 4: With Sunset Sequence (Full List Hygiene Architecture)

**Best for:** Brands that care about deliverability, high-volume senders, brands with large lapsed segments that are dragging open rates down

**Append this after any of the 3 templates above.** The sunset sequence kicks in when the full winback flow (3 emails) results in zero engagement.

\`\`\`
[After winback E3, if no engagement (no opens, no clicks, no purchases):]

---
[DELAY] — 3 days

---
[EMAIL — Sunset: Engagement Check]
Timing: 3 days after winback E3
Job: One final check-in asking if they want to remain subscribed. Framed as a service, not a punishment.
Subject direction: Hyper-direct. "Should we keep emailing you?" or "Still want to hear from [Brand]?"
Pre-header: "A quick yes or no — we'll respect either answer."
Sections:
  1. The ask
     Copy spec: "We've sent a few emails and haven't seen you in a while. Before we remove you from our list, we wanted to give you one last chance to say yes — or no. No hard feelings either way."
  2. Two CTAs
     - "Yes, keep me subscribed" → links to a confirmation page (or Klaviyo profile update URL with a success parameter). When clicked, the profile gets a property "sunset_confirmed = true" which keeps them in marketing flows.
     - "No, remove me" → links to Klaviyo unsubscribe page OR Preference Center. Clean exit.
  3. Fallback
     Copy spec: "If we don't hear from you in [7] days, we'll remove you from our marketing emails automatically. You can always resubscribe at [brand.com/subscribe]."
Dynamic:
  - {{ person.first_name | default: 'there' }}

---
[DELAY] — 7 days

---
[CONDITIONAL SPLIT] — Did they click "Yes, keep me subscribed"?
  Condition: Profile property "sunset_confirmed" = true OR has clicked/opened in last 7 days
  YES → EXIT FLOW (they've re-engaged — they remain on the list in normal marketing)
  NO → Auto-suppress from Klaviyo marketing sends (set profile property "suppressed_winback = true" OR suppress the email address in Klaviyo)

---
Notes on sunset sequence implementation:
  - The "Yes keep me subscribed" click must trigger a Klaviyo profile update (property "sunset_confirmed" = true or "marketing_status" = "confirmed"). This requires a landing page or webhook. Confirm with brand's dev setup.
  - Auto-suppression on the NO path: use Klaviyo's Update Profile Property action to set an "is_suppressed" property, then use a segment exclusion in all future campaigns. OR use Klaviyo's built-in "mark as unengaged" suppression.
  - Suppressed profiles should NOT be deleted from Klaviyo — they may be re-targeted via paid social custom audiences. Suppression = marketing email only.
  - Track the sunset sequence conversion rate separately from the winback flow conversion rate. They are different KPIs.
\`\`\`

---

## Design Element Recommendations (Full Reference)

### E1 — Soft Re-Engagement
| Section | Design Element | Notes |
|---|---|---|
| Product feed | Product Variant Grid (4-up) | feeds.NewArrivals or BestSellers. If NewArrivals < 2 products, use BestSellers |
| Brand proof | Scrolling Benefits Banner | Brand-level stats and differentiators, not product-specific |
| Brand story | Editorial text block | Optional. Powerful for story-led brands. Founder-voice copy. |

### E2 — Incentive Offer
| Section | Design Element | Notes |
|---|---|---|
| Offer reveal | Promo Code Highlight Card | Dynamic coupon. Large code. Expiry date. Prominent. |
| Product grid | Product Variant Grid (4-up) | feeds.BestSellers — show what their discount applies to |
| Social proof | Review Card (2–3 cards) | Reviews that validate the repurchase decision |
| GWP option | Bundle/Value Stack Card | If offering gift vs. discount — show the bundle value |

### E3 — Last Chance / Permission to Leave
| Section | Design Element | Notes |
|---|---|---|
| Urgency | Countdown/Urgency Visual | Only if offer has a real expiry date. Never fake urgency. |
| Risk removal | Guarantee Seal | High-impact. Always include in E3. |
| Permission section | Text block (human-voiced) | Not a standard unsubscribe footer — in-email, conversational |

---

## Winback Segmentation: Who Gets Which Template

Use profile data to route customers into the right winback variant:

\`\`\`
[CONDITIONAL SPLIT at flow entry] — Based on profile properties

Condition 1: person.total_order_count ≥ 3 AND person.total_order_value ≥ $XXX (high-LTV customer)
  → Route to Template 1 (Standard) with higher discount in E2 (15% vs. 10%)
  → Or: Route to Template 3 (Premium) — high-LTV customers often don't need discounts

Condition 2: person.total_order_count = 1 (one-time buyer who lapsed)
  → Route to Template 2 (Aggressive) — lower investment in longer sequence for one-time buyers

Condition 3: person.last_order_date < [365 days ago] (deeply lapsed — over a year)
  → Consider skipping to sunset sequence directly. Very cold contacts rarely convert.
  → Or: send a single email re-introduction before the full winback sequence.

Default: Template 1 (Standard 3-email)
\`\`\`

---

## Coupon Architecture for Winback

Winback is one of the highest-risk flows for coupon abuse. Follow these rules:

| Rule | Why | Implementation |
|---|---|---|
| Always use dynamic unique codes | Static codes get shared publicly within hours | Klaviyo coupon pools — configure a new pool for winback |
| Set real expiry dates | Urgency only works if the deadline is real | 5–7 days from send date on E2 code |
| Use a separate coupon pool for E2 and E3 | Allows different expiry settings and tracking | Create "WINBACK_E2" and "WINBACK_E3" pools |
| Track redemption rate by email | Tells you where in the flow customers are deciding | Use UTM parameters on CTA links + Klaviyo revenue attribution |
| Don't stack winback discount with site-wide sale | Double-discounting is a margin killer | Add flow filter: exclude customers when a sale is running (or pause flow during sales) |

---

## Performance Benchmarks (Goal-Setting Reference)

| Metric | Expected Range | Notes |
|---|---|---|
| E1 Open Rate | 25–40% | Deliverability-sensitive — lapsed contacts have lower open rates |
| E1 CVR (organic) | 2–6% | If this is above 5%, the brand has strong loyalty |
| E2 Open Rate | 20–35% | |
| E2 CVR (with offer) | 4–10% | Offer-gated email should outperform organic |
| E3 Open Rate | 15–25% | |
| E3 CVR | 2–5% | |
| Overall winback CVR | 8–18% | Across 3 emails — 10% is a strong benchmark |
| Sunset sequence re-confirmation rate | 5–15% | Of non-converting winback recipients who click "keep me subscribed" |

**If E1 CVR is below 1%:** The lapse window may be too long — the contacts are too cold. Consider reducing from 90 days to 60 days.

**If E2 CVR is below E1 CVR:** The discount amount may be too low, or the coupon redemption flow (checkout experience with the code) has friction. Test with a higher discount or a GWP offer.

**If overall flow CVR is below 5%:** Audit list hygiene. Winback flows lose effectiveness when run on a base of very old or cold contacts. The flow works best when it catches customers in the 60–180 day window — not 365+ days.

---

## Common Mistakes to Avoid

| Mistake | Why It Fails | Fix |
|---|---|---|
| Leading E1 with a discount | Trains customers to go dormant intentionally to earn a discount. Destroys margin over time. | E1 has zero discount language. Test organic engagement first. |
| Referencing \`event.*\` product properties | There is no product event in winback. Renders blank or errors. | All product content comes from feeds (BestSellers, NewArrivals). |
| Using a static coupon code | Shared publicly within hours of sending to a large list. | Always use Klaviyo dynamic coupon pools. |
| No exit condition on purchase | Customer buys from E1, then gets E2 discount offer anyway. Wastes margin. | "Placed Order" exit condition is mandatory. |
| Skipping the "permission to leave" in E3 | Unengaged contacts stay on list, hurting deliverability. Brands spend money emailing people who will never buy. | Always include E3 permission section. It is good for business. |
| Sending winback to customers who have already been sunset-suppressed | Re-suppressed customers get added back into the flow. | Flow entry filter: exclude profiles with \`suppressed_winback = true\` property. |
| Same winback offer as the general promotions | Customers who get 20% off in campaigns don't need a "special" 10% winback offer. | Winback discount should equal or exceed the best offer customers see in general campaigns. |
| Running winback during a site-wide sale | Discount stacking, confused attribution, and diluted offer value. | Pause winback flow during sale events, or add a flow filter to exclude customers who've received a sale email. |
| Sending to one-time buyers the same way as loyal multi-purchasers | One-time buyers have lower LTV investment. Don't burn premium offers on them first. | Segment at entry: one-time vs. repeat buyers. Route to different templates or different discount tiers. |

---

## QA Checklist Before Launch

- [ ] Trigger confirmed: segment-based or metric-based — correct lapse window for brand's replenishment cycle?
- [ ] Entry filter: "Has placed at least 1 order" is set (to exclude prospects from entering)?
- [ ] Entry filter: "Has NOT placed order in last [X] days" is set?
- [ ] Exit condition: "Placed Order" fires and removes customer from flow immediately?
- [ ] E1 has ZERO discount language — confirmed?
- [ ] Coupon pool configured in Klaviyo for E2 (and E3 if different)?
- [ ] Coupon codes are confirmed as dynamic/unique (not static)?
- [ ] Coupon expiry date set correctly on the Klaviyo coupon pool?
- [ ] feeds.BestSellers and/or feeds.NewArrivals are configured and returning products?
- [ ] \`{% coupon_code %}\` Liquid tag tested with a preview profile?
- [ ] "Permission to Leave" section copy reviewed by a human — sounds authentic?
- [ ] Preference center URL correct for the brand's Klaviyo account?
- [ ] Sunset sequence (if included): "Yes keep me subscribed" click triggers a profile property update?
- [ ] Sunset suppression logic confirmed with brand's Klaviyo admin?
- [ ] Flow is paused during any planned brand-wide sale events?
- [ ] Smart Sending ON for all emails?
- [ ] UTM parameters on all CTA links for revenue attribution?
`;
