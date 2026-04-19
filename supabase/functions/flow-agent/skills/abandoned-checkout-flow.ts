// Auto-generated from abandoned-checkout-flow.md
export default String.raw`
# Abandoned Checkout Flow Skill
**Version:** 1.0  
**Extends:** \`base-flow.md\` — all universal principles apply. This document adds abandoned checkout-specific architecture, Liquid variables, templates, and common mistakes.

---

## Overview

The abandoned checkout flow is the highest-ROI flow in a DTC email program. The purchase intent signal is explicit — this person put items in a cart and started checkout. They are not a cold lead. They are a warm buyer with a specific, known objection (or a simple distraction). Your job is to remove the friction, not introduce new persuasion.

**This flow is not a welcome sequence. Do not treat it like one.**

### Benchmarks
| Metric | Typical Range | Strong Performance |
|---|---|---|
| Flow CVR (% who complete purchase) | 5–15% | > 12% |
| Email 1 Open Rate | 45–65% | > 55% |
| Email 1 CVR alone | 3–8% | > 6% |
| Revenue per recipient | $4–$18 | > $12 |

If your client's abandoned checkout flow is below 5% CVR, the most likely culprits in order are: (1) E1 is sending too late, (2) E1 is not showing the actual cart items, (3) discount is appearing in E1 and training abandon behavior.

---

## 1. Required Inputs

Before building this flow, confirm or infer the following. Pull from brand intelligence and Klaviyo data first. Ask only for confirmed gaps.

| Input | How to Get It | Why It Matters |
|---|---|---|
| Cart recovery offer | Ask if not in brand data | Determines whether E3 exists and what it says |
| SMS availability | Klaviyo integration check | Determines if 3-email or 3-email + SMS variant |
| Subscription option | Product catalog | Determines whether E3 can use subscribe & save incentive |
| Sequence length preference | Ask if no strong default | Determines which template variant to build |
| Hero product / catalog type | Product catalog | Determines E2 social proof angle (product-specific reviews vs. brand reviews) |
| Top 1–2 checkout objections | Brand intelligence | Informs E2 objection section |
| Guarantee / return policy | Brand intelligence | Required for E1 trust block |

### Sequence Length Selection Guide
| Variant | Best For | Default? |
|---|---|---|
| 2-email minimal | High-AOV brands (> $150), premium positioning, where over-emailing is a brand risk | No |
| 3-email standard | Most DTC brands — the default recommendation | **Yes** |
| 3-email + 2 SMS | Brands with active Klaviyo SMS, AOV < $100, high urgency categories | No |
| 3-email subscription push | Brands with subscription option where subscribe & save has meaningful savings | No |

**Default to 3-email standard unless the assessment clearly points elsewhere.**

---

## 2. Flow Architecture Principles (Abandoned Checkout-Specific)

These extend and in some cases override the base-flow.md universal principles for this flow type only.

### 2.1 Email 1 Is the Money Email
The first email in this sequence will generate the majority of the flow's revenue — typically 60–75% of total flow conversions happen on E1 alone. Everything about E1 must be optimized for speed and frictionlessness.

**E1 timing rule: Send within 1 hour of abandon.** Conversion rate drops sharply after 1 hour as intent cools and competitive distraction increases. This is the most impactful single timing decision in the entire email program. Smart Sending must be **OFF** for this flow — a cart abandoned at 11:45pm still deserves E1 within the hour.

**E1's only job:** "Your cart is waiting — here's what you left." That's it. Remove every element that is not about (a) showing the specific items they abandoned and (b) getting them back to checkout.

### 2.2 Never Put a Discount in Email 1
This is the margin-preservation rule. If a customer discovers they get a discount simply by abandoning their cart and waiting for an email, they will do this every time. You are not recovering the sale — you are training a cohort of discount-conditioned buyers who will never pay full price again.

**The correct framing:**
- E1: "Your cart is waiting." No offer. Pure retrieval.
- E2: "Still thinking? Here's why thousands of people choose us." No offer. Social proof + objection handling.
- E3: "Last chance — and we'll make it worth it." Offer appears here. Framed as a one-time gesture, not a standard behavior.

If the brand has no offer at all: E3 becomes a final urgency email with scarcity-based framing (limited stock, price reminder) rather than a discount.

### 2.3 Show the Exact Cart Items in Every Email
Generic "you left something behind" emails dramatically underperform emails that show the specific items. Use \`event.extra.line_items\` to render the actual cart. This is not optional — it's the single biggest rendering mistake that kills abandoned checkout performance.

The cart items block should appear:
- In E1: Above the fold, immediately after a brief intro line. The cart is the email.
- In E2: Restated — "Still thinking about these?" — before the social proof section.
- In E3: Final render with price + urgency framing.

### 2.4 The Checkout URL Is Always the Recovery Link
Every CTA in this flow links to \`{{ event.extra.abandoned_checkout_url }}\`. Never link to the homepage. Never link to a product page. The customer's cart is pre-populated at this URL — sending them to the homepage forces them to rebuild the cart and adds friction that kills conversions.

If for any reason \`event.extra.abandoned_checkout_url\` is unavailable (rare edge case with some Shopify configurations), fall back to \`{{ event.extra.cart_url }}\`. Never fall back to the homepage.

### 2.5 Purchase Check Between Every Email
Between E1 and E2, and between E2 and E3, always add a conditional split checking for Placed Order since flow started. Someone who converts after E1 should not receive E2. This is not optional — it is required in every implementation.

Structure:
\`\`\`
[EMAIL] E1 → [DELAY 1h] → [CONDITIONAL SPLIT: Placed Order] → YES: Exit | NO: [DELAY 23h] → [EMAIL] E2
\`\`\`

Note the split comes after a short initial delay, not before — Klaviyo needs a moment for the order event to register before the split evaluates.

### 2.6 Subscription Variant Logic
If the brand sells subscriptions and the subscribe & save discount is ≥ 15% (meaningful savings), Email 3 can offer subscribe & save as the incentive instead of a flat discount. This is strategically superior because:
- It recovers the sale AND upgrades the customer to higher LTV
- The incentive is structural (they save every time) rather than one-off
- It does not train abandon-for-discount behavior

If using subscription push in E3:
- Frame it as "never worry about running out" + "save X% automatically"
- CTA goes to checkout URL with a URL parameter that pre-selects the subscription option (if Shopify + ReCharge supports it — confirm with operator)
- Include the flat discount option as a secondary CTA for customers who don't want a subscription

---

## 3. Klaviyo Liquid Variables

These are the exact variable references for abandoned checkout flows. Use them verbatim in copy specs and implementation notes.

\`\`\`liquid
{# Core checkout data #}
{{ event.extra.abandoned_checkout_url }}     → The pre-populated checkout recovery URL
{{ event.extra.subtotal_price | times: 1 | money }}  → Formatted cart subtotal (e.g., $47.00)
{{ event.extra.line_items_count }}           → Number of items in cart

{# Cart item loop — renders all abandoned products #}
{% for item in event.extra.line_items %}
  {{ item.title }}                           → Product name
  {{ item.variant_title }}                   → Variant (size, color, etc.) — may be blank
  {{ item.image }}                           → Product image URL
  {{ item.price | times: 1 | money }}        → Item price (formatted)
  {{ item.quantity }}                        → Quantity
  {{ item.line_price | times: 1 | money }}   → Line total (price × quantity)
{% endfor %}

{# Customer data #}
{{ person.first_name | default: 'there' }}   → First name with fallback
{{ person.email }}                           → Email address

{# Offer code (if used in E3) #}
{{ coupon.code }}                            → Dynamic Klaviyo coupon code (if using unique codes)
{# OR for static codes: #}
CHECKOUT15                                   → Hard-code the static offer code
\`\`\`

**Important:** Always use \`| default: 'there'\` on \`person.first_name\`. If the customer checked out as a guest and first name is blank, the fallback prevents "Hi ," as the opening. "Hi there," is imperfect but acceptable.

**Formatting money:** Klaviyo stores prices as integers in some configurations (e.g., 4700 instead of 47.00). Always pipe through \`| times: 1 | money\` to ensure correct display. If prices are already decimal-formatted in the event data, this operation is harmless.

---

## 4. Flow Templates

### Template A: Standard 3-Email (Default)

\`\`\`
FLOW: Abandoned Checkout — [Brand Name]
TRIGGER: Started Checkout (Shopify/Klaviyo integration event)
ENTRY FILTERS:
  - Not in this flow in the last 30 days
  - Has not Placed Order in the last 24 hours (prevents misfires on quick re-orders)
  - Email is not bounced
EXIT CONDITIONS:
  - Placed Order → immediate exit
  - Unsubscribed → immediate exit
SMART SENDING: OFF — This is a time-critical trigger flow. E1 must send within 1 hour regardless of time of day.
QUIET HOURS: OFF — See Smart Sending note above.
GOAL: Profile completes purchase of the items in their abandoned cart.

---

[EMAIL] — E1: Cart Recovery

  Timing: Immediately on trigger (target < 30 minutes after abandon event fires)
  Job: Show the customer exactly what they left in their cart and give them one frictionless path back to checkout.
  Subject direction: Direct and specific — reference the product by name or category if possible. Avoid generic "you forgot something" framing. Examples: "Your [Product Name] is waiting," "You left [X] in your cart," "Don't lose your [Product Name]."
  Preview text direction: Reinforce the specific product or add a soft urgency nudge ("Still available — for now"). Do not tease an offer that isn't in this email.

  Sections:
    1. Minimal Header — [Brand logo, no navigation, no social icons]
       Copy spec: Logo only. No distractions. This is a utility email — get out of the way and let the cart speak.

    2. Cart Recovery Hero — [Dynamic Product Images from cart (event.extra.line_items loop)]
       Copy spec: Brief 1–2 line opener acknowledging the abandon without guilt-tripping ("You were so close" is condescending; "Your cart is still waiting" is neutral and accurate). Render the full cart: product image, name, variant, quantity, price per item, line total. Show cart subtotal below the item list.

    3. Trust Strip — [Scrolling Benefits Banner]
       Copy spec: 3–4 trust signals relevant to checkout hesitation. Recommended: Free shipping threshold (if applicable), return policy, customer count or reviews count, satisfaction guarantee. This answers "is this legit / is this worth it?" without making claims in copy.

    4. Risk Reversal — [Guarantee Seal]
       Copy spec: One sentence on the guarantee. "Not happy? We'll make it right — no questions asked." or the brand's specific guarantee language. Place directly above the CTA.

    5. Single CTA Block
       Copy spec: One button only. "Complete My Order" or "Return to Cart." No secondary CTA. No distractions.

  CTA: "Complete My Order" → {{ event.extra.abandoned_checkout_url }}
  Dynamic:
    - {{ person.first_name | default: 'there' }}
    - {% for item in event.extra.line_items %} loop for cart items
    - {{ event.extra.subtotal_price | times: 1 | money }}
    - {{ event.extra.abandoned_checkout_url }}
  Conditional blocks: None in E1. Keep it clean.
  Notes: Do not include any offer, discount hint, or promotional language in this email. No "stay tuned for a special offer" teasing. No "here's 10% off" — that comes later only. If the brand insists on an offer in E1, push back hard using the margin-training argument.

---

[DELAY] — 1 hour
  Note: Short delay before purchase check to allow Placed Order event to register in Klaviyo.

[CONDITIONAL SPLIT] — Purchased After E1?
  Condition: Placed Order 0 times since starting this flow
  YES (placed order) → [END] — Converter Exit: enter post-purchase flow
  NO (not purchased) → continue to next delay

[DELAY] — 23 hours
  Note: Total E1→E2 gap is 24 hours. The 1-hour post-E1 split delay + this 23-hour delay = 24h from E1 send.

---

[EMAIL] — E2: Social Proof + Objection Handling

  Timing: 24 hours after E1
  Job: Address the most likely reason this person didn't complete checkout by bringing in social proof from customers who had the same hesitation and converted anyway.
  Subject direction: Shift from cart-focused to customer-proof focused. Examples: "X,000 people can't be wrong," "What changed [Product Name] shoppers' minds," "Real results from people like you." Do not repeat the "your cart is waiting" angle from E1 — this email earns its place by adding new information.
  Preview text direction: Tease the specific proof type ("4.8 stars from 2,400 reviews" or "A customer named [first name from review] had the same hesitation...")

  Sections:
    1. Minimal Header — [Brand logo]

    2. Cart Reminder Block — [Dynamic Product Images, condensed]
       Copy spec: Brief re-anchor — "Still thinking about these?" followed by a compact render of the cart items (image + name, no need for full pricing breakdown again — keep it visual, not transactional). The goal is to re-surface the specific products without making this email feel like a duplicate of E1.

    3. Social Proof — [Review Card — 2 reviews]
       Copy spec: Select 2 reviews that address the most likely purchase objections for this product. Review 1 should feel like a relatable hesitation-overcome story ("I was skeptical at first..."). Review 2 should be outcome-focused ("After 3 weeks, I noticed..."). Spec which objections to target based on brand intelligence (price, efficacy, shipping, trust in brand). Reviews must be for the specific product in the cart if catalog-specific reviews exist; otherwise use top brand-level reviews.

    4. Proof Bar — [Stat Strip]
       Copy spec: 3 quantified claims. Examples: "4.8 stars," "X,000 5-star reviews," "90-day money-back guarantee," "X% of customers repurchase." Pull from actual brand data — do not invent stats.

    5. Objection Section — [Optional: Us vs Them Split Card, or plain copy if comparison doesn't fit]
       Copy spec: Address the top 1–2 reasons someone in this category abandons checkout. Common objections: "Will this actually work for me?" (target with outcome evidence), "Is shipping going to take forever?" (address with delivery timeline), "What if I don't like it?" (reinforce guarantee). Keep this tight — 3–4 sentences, not a FAQ wall.

    6. CTA Block
       Copy spec: "See what you're getting" or "Join [X] happy customers" — bridge the social proof into the action. Slightly warmer than E1's transactional CTA.

  CTA: "Complete My Order" or "Claim Your [Product Name]" → {{ event.extra.abandoned_checkout_url }}
  Dynamic:
    - {{ person.first_name | default: 'there' }}
    - {% for item in event.extra.line_items %} condensed loop
    - {{ event.extra.abandoned_checkout_url }}
    - Review content (static copy pulled from review database, not dynamic Liquid)
  Conditional blocks:
    - If catalog has product-specific reviews for the abandoned item → show product reviews
    - If only brand-level reviews exist → show top brand reviews with product mention
  Notes: Still no offer. The offer in E3 only lands as a genuine gesture if E2 hasn't already been softening the ground with discount hints. Trust the sequence. If the brand's top objection is price, E2 can do value-stacking ("Here's everything included at $XX") — this is not the same as offering a discount.

---

[DELAY] — 1 hour
  Note: Buffer before purchase check.

[CONDITIONAL SPLIT] — Purchased After E2?
  Condition: Placed Order 0 times since starting this flow
  YES → [END] — Converter Exit: enter post-purchase flow
  NO → continue to next delay

[DELAY] — 47 hours
  Note: Total E2→E3 gap is 48 hours (1h split delay + 47h here = 48h from E2 send).

---

[EMAIL] — E3: Last Chance (+ Offer, If Applicable)

  Timing: 72 hours after E1 (48 hours after E2)
  Job: Create final urgency — either through a genuine offer or through scarcity/social proof escalation — and close the loop on this cart recovery sequence.
  Subject direction: Urgency-led. If offer: "Your [X]% off is waiting," "Last chance: [discount]," "We saved you $XX — but not forever." If no offer: "Still available — but inventory is limited," "Final reminder: your cart expires soon," "Last chance to get [Product Name] at this price." Do not be passive. This email earns the right to be direct.
  Preview text direction: Reinforce the urgency mechanism — offer expiry time, low stock, or end of sequence ("After this, your discount expires / cart clears").

  Sections:
    1. Minimal Header — [Brand logo]

    2. Cart Items — Final Render — [Dynamic Product Images]
       Copy spec: Third and final cart render. Keep brief — they've seen this. Add a line acknowledging this is the last reminder: "We don't want to keep interrupting — this is the last time we'll reach out about your cart."

    3. Offer Block (if brand uses offer) — [Promo Code Highlight Card]
       Copy spec: Introduce the offer with a soft narrative: "To say thanks for your interest — and because we genuinely want you to try this — here's something just for you." Present the code visually in the Promo Code Highlight Card. State the expiry clearly (if code expires in Klaviyo, sync the messaging — "Expires in 48 hours" requires the coupon to actually expire in 48h). One-click copy for the code is ideal on mobile.

       [If no offer — use scarcity instead]:
       Copy spec: Pull current stock level if available via Klaviyo integration or note "limited quantities available" if true. Reference the price holding: "This is the price today — we can't guarantee it tomorrow." No fake urgency — do not write "only 3 left" unless inventory data confirms this.

    4. Guarantee Seal — [Guarantee Seal]
       Copy spec: Repeat the risk reversal. In E3, this is more important than ever — the customer who's made it to the third email is still hesitating, often because of fear of a bad purchase. Make the guarantee prominent and specific.

    5. Final CTA Block
       Copy spec: "Use My Discount Now" (if offer) or "Complete My Order" (if no offer). One button. If using a code: CTA goes to checkout URL with the code pre-applied if Shopify URL parameter is supported (\`?discount=CODE\`).

  CTA: "Use My Discount Now" or "Complete My Order" → {{ event.extra.abandoned_checkout_url }}?discount={{ coupon.code }} (if code can be URL-appended)
  Dynamic:
    - {{ person.first_name | default: 'there' }}
    - {% for item in event.extra.line_items %} condensed loop
    - {{ event.extra.abandoned_checkout_url }}
    - {{ coupon.code }} — (only if using unique Klaviyo coupons)
  Conditional blocks:
    - If brand has offer → show Promo Code Highlight Card
    - If no offer → show scarcity/urgency block instead
  Notes: Confirm with operator that the coupon is configured in Klaviyo before generating copy. If unique per-person coupons (Klaviyo's dynamic coupon feature), ensure the coupon pool has sufficient codes. If static code (same for everyone), confirm it's not already visible sitewide — if it's already on the homepage, it's not exclusive and should not be presented as such.

---

[DELAY] — 1 hour

[CONDITIONAL SPLIT] — Purchased After E3?
  Condition: Placed Order 0 times since starting this flow
  YES → [END] — Converter Exit: enter post-purchase flow
  NO → [END] — Non-Converter Exit

[END] — Non-Converter Exit
  Note: Profile exits with no further action from this flow. Tag profile with Klaviyo property "abandoned_checkout_non_converter = true" and date. This populates a segment for future winback or suppression audience. Do NOT immediately enroll in a general winback flow — allow a 30-day cooling window first.

[END] — Converter Exit
  Note: Placed Order triggers post-purchase flow independently. No action needed here — Klaviyo routes to post-purchase on the order event.
\`\`\`

---

### Template B: Minimal 2-Email

**Use when:** Brand AOV is > $150, premium positioning requires restraint, or the brand explicitly wants a minimal footprint.

**Key differences from 3-email standard:**
- No E3 (no offer email)
- E1 timing: within 1 hour
- E2 timing: 48 hours (not 24) — expanded gap appropriate for considered purchases
- E2 does more heavy lifting: cart items + social proof + guarantee all in one email
- No offer at all in this variant — if the brand needs a discount to close the sale, use the 3-email standard instead

\`\`\`
FLOW: Abandoned Checkout (Minimal) — [Brand Name]
TRIGGER: Started Checkout
ENTRY FILTERS: Not in flow last 30 days | No order in last 24h | Not bounced
EXIT CONDITIONS: Placed Order | Unsubscribed
SMART SENDING: OFF
QUIET HOURS: OFF
GOAL: Recover checkout via trust and frictionlessness — no discounting.

---

[EMAIL] — E1: Cart Recovery (same spec as Template A, E1)

[DELAY] — 1 hour

[CONDITIONAL SPLIT] — Purchased After E1?
  YES → [END] — Converter Exit
  NO → continue

[DELAY] — 47 hours

[EMAIL] — E2: Complete the Picture
  Timing: 48 hours after E1
  Job: Bring together social proof, risk reversal, and a final compelling reason to complete the purchase — without urgency gimmicks or offers.
  Subject direction: Credibility-led. "The reviews speak for themselves," "What [X] customers say about [Product]," "Still here — and still the right choice."
  Preview text direction: Tease the proof quantity or a specific review hook.

  Sections:
    1. Cart Reminder (condensed)
    2. Founder or Brand Story Section — [Founder Photo Block, if founder story is strong]
       Copy spec: 3–4 sentences from the founder's perspective on why this product exists and what makes it worth the price. Not a sales pitch — an authentic reason to believe. Only use if brand intelligence supports a compelling founder narrative.
    3. Social Proof — [Review Card — 2 reviews, high-credibility]
    4. Proof Bar — [Stat Strip]
    5. Guarantee — [Guarantee Seal]
    6. Final CTA

  CTA: "Complete My Order" → {{ event.extra.abandoned_checkout_url }}
  Dynamic: Same as Template A E2.
  Notes: This email must justify a high price point without discounting. Focus on value, outcome, and trust — not urgency. If the brand has press coverage, add [Press Logo Bar] above the social proof section.

---

[DELAY] — 1 hour

[CONDITIONAL SPLIT] — Purchased After E2?
  YES → [END] — Converter Exit
  NO → [END] — Non-Converter Exit

[END] — Non-Converter Exit
  Note: Tag profile as "high_aov_non_converter" for custom segment handling. Do not use the same re-engagement cadence as lower-AOV non-converters.
\`\`\`

---

### Template C: 3-Email + SMS

**Use when:** Brand has active Klaviyo SMS, AOV < $100, high-urgency category (consumables, trend-driven products, time-sensitive inventory).

**Key differences:**
- SMS 1 sends 30 minutes after abandon (before E1) — ultra-early touch for mobile-first shoppers
- SMS 2 sends between E2 and E3 — reinforces urgency, bridges to offer
- SMS is complementary, not redundant — it must say something different from the paired email
- SMS subscribers only — never send to non-SMS-opted-in profiles

\`\`\`
FLOW: Abandoned Checkout + SMS — [Brand Name]
TRIGGER: Started Checkout
ENTRY FILTERS: Not in flow last 30 days | No order last 24h | Not bounced
EXIT CONDITIONS: Placed Order | Unsubscribed (email) | Unsubscribed from SMS
SMART SENDING: OFF
QUIET HOURS: OFF for SMS between 8am–9pm local time only — Klaviyo SMS quiet hours must be active
GOAL: Multi-channel checkout recovery.

---

[SMS] — S1: Instant Cart Ping
  Timing: 30 minutes after abandon trigger
  Content: "Hey {{ person.first_name | default: 'there' }} — you left something in your cart. Grab it before it's gone: {{ event.extra.abandoned_checkout_url }} — Reply STOP to opt out"
  Note: 160 characters max including opt-out. Test render on multiple devices. No offer — same principle as E1. This is a gentle ping, not a pitch.

[DELAY] — 30 minutes

[EMAIL] — E1: Cart Recovery (same spec as Template A E1)
  Note: SMS went out 30 minutes earlier. E1 arrives ~1 hour after abandon. Do not reference the SMS in E1.

[DELAY] — 1 hour

[CONDITIONAL SPLIT] — Purchased After E1?
  YES → [END] — Converter Exit
  NO → continue

[DELAY] — 23 hours

[EMAIL] — E2: Social Proof + Objection Handling (same spec as Template A E2)

[DELAY] — 1 hour

[CONDITIONAL SPLIT] — Purchased After E2?
  YES → [END] — Converter Exit
  NO → continue

[DELAY] — 23 hours

[SMS] — S2: Urgency Bridge
  Timing: 48 hours after initial trigger (between E2 and E3)
  Content: "Still thinking, {{ person.first_name | default: 'there' }}? We've got something for you in your inbox. Check it — {{ event.extra.abandoned_checkout_url }} — Reply STOP to opt out"
  Note: This SMS telegraphs E3's offer without revealing the code. It creates anticipation and drives opens on E3. Do not put the discount code in the SMS — keep it email-exclusive for measurability.

[DELAY] — 24 hours

[EMAIL] — E3: Last Chance + Offer (same spec as Template A E3)

[DELAY] — 1 hour

[CONDITIONAL SPLIT] — Purchased After E3?
  YES → [END] — Converter Exit
  NO → [END] — Non-Converter Exit
\`\`\`

---

### Template D: Subscription-Push Variant

**Use when:** Brand has a meaningful subscribe & save option (≥ 15% savings), subscription is core to business model, and brand prefers not to offer flat discounts that erode margin.

**Key difference:** E3 replaces a flat discount with a subscribe & save CTA as the primary offer, with flat discount as a fallback secondary CTA.

E1 and E2 are identical to Template A. Only E3 changes.

\`\`\`
[EMAIL] — E3: Subscribe & Save Offer

  Timing: 72 hours after E1
  Job: Convert the non-purchaser by reframing the value proposition — not "save 15% today" but "save 15% every time, automatically, and never run out."
  Subject direction: Subscription benefit-led. "Get [Product Name] at your price — forever," "Subscribe and save [X]% — and never run out," "The smarter way to get [Product Name]."
  Preview text direction: Quantify the savings: "At $[price] per [unit] on subscription — that's $[annual savings] saved this year."

  Sections:
    1. Cart Reminder (condensed) — [Dynamic Product Images]

    2. Subscription Value Section
       Copy spec: Frame subscribe & save as the solution to their hesitation. If price was the barrier: "What if you never paid full price for [Product Name] again?" If convenience was the barrier: "Never worry about running out — your next order ships automatically." Structure: (a) restate the problem, (b) introduce subscribe & save as the elegant fix, (c) show the math (original price vs. subscription price, annual savings).

    3. How It Works — [simple 3-step iconographic or numbered list]
       Copy spec: "1. Choose subscribe & save at checkout. 2. Set your delivery frequency. 3. Pause, skip, or cancel anytime — no penalties." Cancelation flexibility is critical — it removes the #1 subscription objection.

    4. Social Proof — [Review Card — 1 review from a subscriber]
       Copy spec: Source a review specifically from a long-term subscriber if available: "I've been subscribed for 8 months and..." This anchors the credibility of the subscription model itself, not just the product.

    5. Primary CTA — Subscribe & Save
       Copy spec: Button text: "Subscribe & Save [X]%." Links to checkout URL with subscription variant pre-selected.

    6. Secondary CTA — One-Time Purchase fallback
       Copy spec: Plain text link below the main button: "Or, buy once at full price — {{ event.extra.abandoned_checkout_url }}" — gives them an out without making it the primary path.

    7. Guarantee Seal

  CTA (primary): "Subscribe & Save [X]%" → {{ event.extra.abandoned_checkout_url }}?selling_plan=[subscription_selling_plan_id]
  CTA (secondary): "Buy once instead" → {{ event.extra.abandoned_checkout_url }}
  Dynamic:
    - All standard cart variables
    - Subscription savings percentage (static copy, pulled from brand data)
    - selling_plan parameter (confirm with operator — Shopify-specific)
  Notes: Confirm the selling_plan URL parameter is correct for this brand's Shopify/ReCharge configuration before generating copy. If the pre-select URL parameter is not available, direct to the product page with subscription option visible rather than checkout — still better than homepage.
\`\`\`

---

## 5. Design Element Recommendations by Email

### Email 1: Cart Recovery
| Section | Element | Notes |
|---|---|---|
| Cart items | Dynamic product image loop | Rendered from \`event.extra.line_items\` — not static |
| Trust signals | Scrolling Benefits Banner | Free shipping, guarantee, review count |
| Risk reversal | Guarantee Seal | Near CTA, above footer |
| CTA | Single CTA button | No competing links |

**Design principle for E1:** Minimal. Every design element should reduce friction, not add visual interest. No lifestyle photography. No brand story imagery. The product images from the cart are the hero. Get out of the way.

### Email 2: Social Proof + Objection Handling
| Section | Element | Notes |
|---|---|---|
| Cart items | Dynamic product images (condensed) | Smaller than E1 — reminder, not restatement |
| Social proof | Review Card | 2 reviews, objection-matched |
| Quantified proof | Stat Strip | 3–4 brand/product stats |
| Competitive framing | Us vs Them Split Card | Only if brand has credible comparison points |
| Press | Press Logo Bar | Only if strong press coverage exists |

**Design principle for E2:** Evidence-forward. The design system should feel authoritative — clean layout, strong typographic hierarchy, review cards that look credible. This email is doing the persuasion work that E1 didn't need to do.

### Email 3: Last Chance / Offer
| Section | Element | Notes |
|---|---|---|
| Cart items | Dynamic product images (compact) | Third render — keep small |
| Offer display | Promo Code Highlight Card | Only if discount is being used |
| Urgency | Countdown Visual | Only if offer has a real, Klaviyo-tracked expiry |
| Risk reversal | Guarantee Seal | Repeated from E1 — critical in E3 |

**Design principle for E3:** Clarity and urgency. If there's an offer, the Promo Code Highlight Card should be unmissable. If using a countdown, it must be tied to real expiry data. No fake timers. The email should feel like a closing window, not an alarm.

---

## 6. Common Mistakes

These are the implementation errors that most commonly kill abandoned checkout performance. Document them and flag proactively when generating or reviewing a flow.

### Mistake 1: Sending E1 Too Late
**The mistake:** E1 goes out 3–6 hours after abandon, or is caught by quiet hours and sends the next morning.  
**The impact:** Conversion rate on E1 drops 50%+ after the 1-hour window. The customer's intent has cooled. They've either purchased elsewhere, rationalized not buying, or simply moved on.  
**The fix:** Smart Sending = OFF. Quiet Hours = OFF. Flow is configured to fire the trigger in real time, not batched. E1 must send within 60 minutes of the Started Checkout event.

### Mistake 2: Offering a Discount in Email 1
**The mistake:** Brand or operator adds a 10–15% discount to E1 to "sweeten the deal."  
**The impact:** The brand trains customers that abandoning checkout is the correct behavior for getting a discount. Over time, a measurable cohort of customers will deliberately abandon carts to wait for the E1 discount. This behavior compounds — CVR on the flow looks strong, but full-price conversion rate and gross margin decline.  
**The fix:** Offer in E3 only, framed as a last-resort gesture. Keep E1 purely retrieval. If pushed back on, present the margin-training argument with data.

### Mistake 3: Not Showing the Specific Cart Items
**The mistake:** E1 says "You left something behind!" with a generic hero image and no product specifics.  
**The impact:** The customer doesn't see the specific thing they almost bought. The urgency is abstract. Click rates and recovery rates are significantly lower than personalized cart renderings.  
**The fix:** Always use \`{% for item in event.extra.line_items %}\` to render each abandoned product with image, name, and price. Test this rendering with real cart data before launch — confirm the Shopify-Klaviyo integration is passing line items correctly.

### Mistake 4: Using Homepage Link Instead of Checkout Recovery URL
**The mistake:** CTAs link to the brand's homepage or product page instead of \`{{ event.extra.abandoned_checkout_url }}\`.  
**The impact:** The customer's cart is not pre-populated. They have to find the product again, re-add it to cart, and start checkout from scratch. Conversion rate on this email effectively drops to near-zero because the friction is too high.  
**The fix:** Every CTA in every email in this flow uses \`{{ event.extra.abandoned_checkout_url }}\` as the destination. Verify this URL is rendering correctly in preview mode before launch.

### Mistake 5: Not Excluding People Who Purchased Between Emails
**The mistake:** Flow has no conditional splits checking for Placed Order between email sends. A customer converts after E1, then receives E2 and E3.  
**The impact:** The customer — who just bought — receives emails telling them to complete the purchase they already completed. This is a brand-damaging experience that signals the brand doesn't know them.  
**The fix:** Conditional split after every email: "Placed Order 0 times since starting this flow → YES = exit; NO = continue." Required in every implementation without exception.

### Mistake 6: Same Subject Line Angle Across All Emails
**The mistake:** All three emails use a variation of "Your cart is waiting" as the subject.  
**The impact:** The second and third subject lines get ignored because the customer pattern-matches them as "the same email again." Open rates on E2 and E3 crater. The sequence fails to build a cumulative case.  
**The fix:** Each email has a distinct subject angle:
- E1: Practical retrieval — "Your [Product Name] is waiting"
- E2: Social proof / credibility shift — "What 2,400 customers say about [Product Name]"
- E3: Urgency / offer — "Your [X]% off expires in 48 hours"
The customer should feel that each email is bringing them new information, not re-sending the same pitch.

### Mistake 7: Identical Email Design Across All Three Sends
**The mistake:** All three emails have the same layout, sections, and visual structure — only the copy changes.  
**The impact:** The sequence feels like a template blast, not a thought-out communication. The escalating urgency narrative is undermined by visual sameness.  
**The fix:** Each email has a distinct visual weight and layout per the design element recommendations in Section 5. E1 is minimal. E2 is proof-heavy. E3 is offer-focused with urgency visual cues.

### Mistake 8: Coupon Code Is Already Sitewide
**The mistake:** The "exclusive" discount code in E3 is the same code displayed on the brand's homepage popup or a widely-shared affiliate link.  
**The impact:** There is no exclusivity. The customer may have already seen the code and chosen not to use it. The "special offer" framing collapses.  
**The fix:** Before finalizing E3 copy, confirm the code is unique to this flow (or unique per-person via Klaviyo coupons). If the same code is being used sitewide, either use a different code for this flow or change the framing from "exclusive" to "just a reminder that this code still works."

---

## 7. Flow Performance Monitoring

After launching, monitor these metrics weekly for the first 30 days, then monthly.

| Metric | Watch For | Action If Off |
|---|---|---|
| E1 send delay (avg minutes from trigger to send) | Should be < 30 minutes | Check Klaviyo flow priority and processing queue |
| E1 open rate | < 40% = subject or timing issue | A/B test subject lines; verify send timing |
| E1 → purchase CVR | < 4% | E1 may be showing wrong cart items or broken checkout URL |
| E2 open rate | < 30% = E1 subject burned the sender domain or audience is small | Check deliverability; review subject angle |
| E3 code redemption rate | Very high rate (>50% of E3 recipients) may indicate cart-abandoning-for-discount behavior | Consider reducing offer amount or moving to GWP |
| Total flow CVR | < 5% = structural problem | Audit all six common mistakes above |

---

## 8. Quick-Reference Checklist

Before marking this flow as launch-ready:

- [ ] E1 timing confirmed: fires within 60 minutes of Started Checkout trigger
- [ ] Smart Sending set to OFF
- [ ] Quiet Hours set to OFF (or confirm this is acceptable to brand)
- [ ] \`event.extra.abandoned_checkout_url\` renders correctly in preview
- [ ] \`event.extra.line_items\` loop renders all cart items with image, name, price
- [ ] No discount in E1
- [ ] Conditional splits after each email checking Placed Order since flow start
- [ ] Exit condition: Placed Order → immediate exit
- [ ] Exit condition: Unsubscribed → immediate exit
- [ ] Entry filter: Not in this flow in last 30 days
- [ ] Coupon code (if used) is active in Klaviyo, not sitewide
- [ ] UTM parameters on all links
- [ ] E3 subject line is distinct from E1 and E2 angles
- [ ] Post-purchase flow is active to receive converter handoff
- [ ] Browse abandonment suppressed if active (suppress browse if in this flow)
- [ ] Test email sent with real profile data to verify all Liquid renders correctly

---

*This skill extends base-flow.md. For universal architecture principles, Klaviyo implementation rules, cross-flow strategy, and output format, refer to base-flow.md.*
`;
