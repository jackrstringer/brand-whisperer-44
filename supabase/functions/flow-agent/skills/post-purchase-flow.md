# SKILL: Post-Purchase Flow
**System:** Klaviyo Email Flow Builder — DTC Brand Architecture
**Version:** 1.0
**Scope:** Placed Order trigger → onboarding, education, review, cross-sell

---

## What This Flow Does

The post-purchase flow is the highest-leverage automation in a DTC brand's Klaviyo account. Unlike acquisition flows, it speaks to someone who has already trusted you with money. That trust is fragile in the first 72 hours and compounding by day 30. The job of this flow is to:

1. **Confirm and reassure** — eliminate buyer's remorse immediately with a warm, human order confirmation
2. **Bridge the gap** — keep the customer engaged and anticipating delivery (dead air between purchase and delivery is where doubt grows)
3. **Educate and activate** — once the product arrives, teach them how to get the best results. Customers who see results come back. Customers who don't know how to use the product return it or ghost.
4. **Capture social proof** — request a review at the exact moment they're most likely to be satisfied
5. **Cross-sell or upgrade** — once they're a happy customer, introduce what's next (complementary products, subscription conversion, bundle)

A well-built post-purchase flow increases LTV, reduces refund/chargeback rates, and turns one-time buyers into brand advocates.

---

## Required Inputs (Gather Before Building)

Before architecting this flow, confirm the following with the brand:

| Input | Why It Matters | Default If Unknown |
|---|---|---|
| Product purchased (or SKU range) | Determines education complexity and copy direction | Assume hero/best-seller |
| Does brand have a subscription option? | If yes, E3 or E4 should convert OTP → subscriber | No |
| Usage complexity (simple vs. complex) | High complexity (supplements, skincare, devices) need more education emails | Medium |
| Expected delivery window | Dictates when E2 fires — usage tips should never land before the product | 5–7 business days |
| Review platform | Okendo, Loox, Yotpo, Junip — each has a different deep link format for review requests | Platform TBD |
| Cross-sell products | What's the natural second purchase? Bundle? Complementary SKU? | Brand's #2 best-seller |
| Is this a consumable? | Consumables need a replenishment reminder at the expected reorder interval | No |
| Replenishment interval | For consumables — 30, 60, 90 days? | 30 days |
| High-AOV / luxury brand? | Changes tone — less selling, more relationship. No pushy cross-sell. | No |

---

## Liquid Variables Reference

```liquid
{# Order-level data #}
event.extra.order_number                      → order number (e.g. #10234)
event.extra.total_price                       → order total (format as currency)
event.extra.order_status_url                  → tracking / order status link
event.extra.shipping_address.first_name       → shipping name (may differ from account)
event.extra.line_items                        → array of all items in order
event.extra.line_items[0].name                → first product name
event.extra.line_items[0].image               → first product image URL
event.extra.line_items[0].price               → first product price
event.extra.line_items[0].quantity            → quantity of first product

{# Person-level data #}
person.first_name                             → | default: 'there'
person.email

{# Usage in copy #}
{{ person.first_name | default: 'there' }}
{{ event.extra.order_number }}
{{ event.extra.order_status_url }}
{{ event.extra.line_items[0].name }}
{{ event.extra.line_items[0].image }}
{{ event.extra.total_price | money }}
```

**Important:** `event.extra.line_items` is an array. Use `[0]` for the first (and often only) item. For multi-item orders, you can loop with `{% for item in event.extra.line_items %}`. Never assume index `[1]` exists.

---

## Architecture Principles (Non-Negotiable)

### Timing logic
- **E1 (order confirm) → immediate.** This is time-sensitive and transactional. It must beat the Shopify/WooCommerce default confirmation. Set to send within minutes of the Placed Order event.
- **E2 (usage tips / delivery) → fires AFTER estimated delivery.** This is the most common mistake in post-purchase flows. Never send usage instructions to someone who doesn't have the product yet. Use brand's actual delivery window + 1 day buffer. Default: Day 7 from order.
- **E3 (review request) → 7–14 days after delivery.** Minimum 7 days so they've actually used it. Maximum 14 days before their enthusiasm peaks and fades. Default: Day 14 from order.
- **E4 (cross-sell) → after review request.** Cross-selling before the customer has reviewed/validated their purchase feels pushy. Let the review request land first.

### Transactional email rules
E1 is functionally transactional (confirms the customer's order). In Klaviyo, you can suppress the unsubscribe footer for transactional emails, but confirm with brand's legal/compliance. For brands in EU/UK, keep the footer.

### Education depth scales with product complexity
- **Simple product** (candle, tote bag, basic supplement with one SKU): 1 education section in E2, no need for a dedicated education email
- **Complex product** (multi-step skincare routine, high-potency supplement, device with setup): needs a dedicated how-to-get-results email with step-by-step content. May justify a 6-email architecture.
- **Subscription product**: the education email also subtly primes the customer for why they'll want to come back regularly — which sets up the subscription pitch

### Review request timing and platform
- Never ask for a review before 7 days post-delivery. The customer needs time to experience the product.
- The review request email should show **existing reviews first** — social proof from other customers normalizes the review-writing behavior and sets the expectation for what a good review looks like
- Deep link directly to the review form on the platform (Okendo, Loox, Yotpo, Junip each have brand-specific review request URL formats). Confirm with brand before building.

### Cross-sell principles
- Cross-sell should feel like a **recommendation**, not a sale. Frame it as "customers who bought X also love Y"
- If the brand has a bundle, position the cross-sell as the "complete the kit" / "get the full system" angle
- If subscription brand: the cross-sell email may double as the subscription conversion email — "Lock in your next supply and save 15%"
- For high-AOV / luxury brands: skip the hard cross-sell. Instead, nurture the relationship with brand storytelling, VIP status messaging, or an exclusive loyalty offer

---

## Template 1: Standard 4-Email (Most DTC Brands)

**Best for:** Single SKU or simple product line, no subscription, moderate usage complexity

```
FLOW: Post-Purchase — [Brand]
TRIGGER: Placed Order
ENTRY FILTERS: None (all purchasers)
EXIT CONDITIONS: Refund Processed → exit (suppress remaining emails)
SMART SENDING: OFF for E1 (transactional). ON for E2–E4.

---
[EMAIL 1] — Order Confirmation
Timing: Immediately (0 min delay)
Job: Confirm the order, eliminate buyer's remorse, build anticipation for delivery.
Subject direction: Warm, specific to product. "Your [Product Name] is on its way 🎉" or "Order confirmed — here's what happens next"
Sections:
  1. Hero: Personalized header + order confirmation message
     Copy spec: "Hey {{ person.first_name | default: 'there' }}, your order is confirmed. We're already on it." Warm and human, not robotic. Brand voice fully on.
  2. Order summary table (dynamic line items)
     Copy spec: Show product name, image, quantity, price, order number, total. Use event.extra.line_items loop. Include estimated delivery window.
  3. Shipping address display
     Copy spec: Confirm where it's going. Include event.extra.shipping_address. Reassures customer their address was captured correctly.
  4. Order tracking CTA
     Copy spec: "Track your order →" linking to event.extra.order_status_url. Bold and prominent.
  5. What happens next (How It Works — 3-step version)
     Copy spec: Step 1: We pack your order. Step 2: It ships. Step 3: You get results. Keeps the customer engaged during the wait period.
  6. Footer: contact email, social links
     Copy spec: "Questions? Reply to this email or contact us at [support@brand.com]." Humanizes the brand.
Dynamic:
  - {{ person.first_name | default: 'there' }}
  - {{ event.extra.order_number }}
  - {% for item in event.extra.line_items %}{{ item.name }}{% endfor %}
  - {{ event.extra.total_price | money }}
  - {{ event.extra.order_status_url }}
Notes:
  - Smart Sending OFF — this must reach every buyer regardless of contact preferences
  - If transactional email suppression is active on account, confirm with brand whether E1 should use transactional or marketing designation
  - Do NOT include promotional content or cross-sell in E1 — it cheapens the confirmation moment

---
[DELAY] — 7 days (adjust to brand's actual delivery window + 1 day buffer)
(If brand's delivery window is 3–5 days: use 6-day delay. If 7–10 days: use 11-day delay)

---
[EMAIL 2] — Usage & Results Guide
Timing: Day 7 from order (post-estimated-delivery)
Job: Teach the customer how to get the best results from their product before doubt or misuse causes a return.
Subject direction: Practical, helpful. "Getting the most out of your [Product Name]" or "Here's how to see real results with [Product]"
Sections:
  1. Hero: Product image + warm welcome-back header
     Copy spec: "It should be arriving right about now. Here's everything you need to know to get started." Reference the product by name (event.extra.line_items[0].name if dynamic, or static if single-SKU brand).
  2. How It Works (numbered steps — 3 to 5 steps)
     Copy spec: Step-by-step usage guide. Practical and specific. Not generic. Include timing (morning vs. evening), quantity, frequency, what to expect in week 1 vs. week 4 for supplements/skincare. Match the complexity to the product.
  3. Ingredient Spotlight (for supplement/skincare/functional brands)
     Copy spec: Highlight 1–2 key ingredients and why they work. Builds belief in the product. Reduces returns from customers who don't understand what they bought. Skip this section for non-functional products (apparel, homeware, etc.)
  4. Pro Tip callout box
     Copy spec: One specific, actionable tip that most customers don't know. Makes the email feel exclusive and valuable. Example: "Most people see better results when they take [Product] with [specific food/drink/habit]."
  5. CTA: Shop / Restock link (soft)
     Copy spec: Subtle — "When you're ready for your next supply, we've got you." Link to product page. No urgency here.
Dynamic:
  - {{ person.first_name | default: 'there' }}
  - {{ event.extra.line_items[0].name }}
  - {{ event.extra.line_items[0].image }}
Notes:
  - If brand has more than 3–4 SKUs with meaningfully different usage instructions, this email should branch by product purchased (use conditional splits on line_items[0].name or product category tag)
  - Keep it practical. No selling. The whole email is a value add.
  - For complex products: consider splitting this into E2 (delivery/unboxing) and E3 (deep education). See 6-email template.

---
[DELAY] — 7 days

---
[EMAIL 3] — Review Request
Timing: Day 14 from order (7 days post-estimated-delivery)
Job: Capture a review from a happy customer at the peak of their satisfaction window.
Subject direction: Conversational and personal. "Quick question, {{ first_name }}" or "How's [Product Name] treating you?" or "Your opinion matters to us"
Sections:
  1. Personal opener
     Copy spec: "It's been a couple weeks since your [Product Name] arrived. We'd love to know what you think." Casual tone. No pressure.
  2. Review Card (existing reviews from platform)
     Copy spec: Show 2–3 existing customer reviews (pulled from review platform via RSS/feed integration or hardcoded best reviews). Context: "Here's what other customers are saying — we'd love to add yours." Normalizes the review-writing behavior.
  3. Star rating graphic / CTA
     Copy spec: Clear, prominent call to action. "Leave a review →" linking directly to the review submission form on the brand's review platform. Stars graphic increases clicks vs. text-only CTA.
  4. What if you're not 100% happy?
     Copy spec: "If anything isn't right, reply to this email and we'll make it right." Catch unhappy customers before they go to Google/social to complain. This line alone prevents bad reviews.
Dynamic:
  - {{ person.first_name | default: 'there' }}
  - {{ event.extra.line_items[0].name }}
Notes:
  - Deep link format varies by platform:
    - Okendo: https://reviews.okendo.io/submit-review?product_id=[ID]
    - Loox: https://[brand].loox.io/write-review?product_handle=[handle]
    - Yotpo: direct link to product page with review modal anchor
    - Junip: https://junip.co/r/[store-hash]?product_id=[ID]
  - Confirm correct platform and URL format with brand before launch
  - If brand has NO review platform: change this email to a "How's it going?" check-in email with a simple reply CTA

---
[DELAY] — 7 days

---
[EMAIL 4] — Cross-Sell / Next Step
Timing: Day 21 from order
Job: Convert the happy, validated customer into a repeat buyer by introducing the logical next purchase.
Subject direction: Recommendation framing, not selling. "Customers who love [Product] usually grab this next" or "Complete your [brand] routine"
Sections:
  1. Transition header
     Copy spec: "Now that you're [X weeks] in and getting results, a lot of our customers add [Cross-Sell Product] to the mix." Frame it as a natural evolution, not an upsell.
  2. Product Variant Grid (cross-sell product(s))
     Copy spec: Show 1–3 cross-sell products with name, image, short benefit line, price. For single cross-sell: hero product card. For multiple: 2-up or 3-up grid.
  3. Bundle/Value Stack Card (if bundle exists)
     Copy spec: "Get [Product A] + [Product B] together and save [X]%" with total value vs. bundle price. Clear savings math.
  4. Subscription Value Card (if subscription brand)
     Copy spec: "Never run out. Subscribe and save [X]% — cancel anytime." Include the monthly savings amount in dollars. Make the math obvious. CTA: "Switch to subscribe & save →"
  5. Social proof closer
     Copy spec: 1 testimonial from a customer who uses both products together, or a general brand trust signal.
Dynamic:
  - {{ person.first_name | default: 'there' }}
Notes:
  - If this is a single-SKU brand with no natural cross-sell: convert E4 into a loyalty/referral email — "Share with a friend and earn [reward]"
  - For subscription brands: this email may move to E3 position if subscription conversion is higher priority than review request. Check brand's business goals.
  - For high-AOV / luxury brands: see Template 4 instead — do not send a product grid cross-sell

---
```

---

## Template 2: Extended 6-Email (Complex Product / Supplement / Device)

**Best for:** High-education products (supplements, skincare, devices), brands where misuse causes returns, subscription brands where LTV depends on habit formation

```
FLOW: Post-Purchase Extended — [Brand]
TRIGGER: Placed Order
ENTRY FILTERS: None
EXIT CONDITIONS: Refund Processed → exit
SMART SENDING: OFF for E1. ON for E2–E6.

---
[EMAIL 1] — Order Confirmation
Timing: Immediately
(Same architecture as Template 1 E1 — see above)

---
[DELAY] — [delivery window] days

---
[EMAIL 2] — Delivery + Unboxing
Timing: Day 6–7 (arrival day)
Job: Welcome the product into their home, validate the purchase decision, and prime them for success.
Subject direction: "It's here! Here's your quick start guide" or "Your [Product] just landed — start here"
Sections:
  1. Celebratory hero: "It's arrived!"
     Copy spec: High-energy, personal. "Your [Product] is officially in your hands — this is the start of something good." One strong aspirational line about the transformation ahead.
  2. Unboxing checklist / What's in the box
     Copy spec: "Here's everything in your order:" — list all components, especially for products with multiple parts (device + accessories, multi-product routine kit, etc.). Reduces support tickets about missing items.
  3. Quick Start (How It Works — 3 steps)
     Copy spec: The fastest path to first use. "Here's how to get started in the next 10 minutes." Barrier removal.
  4. CTA: Link to full usage guide (brand's website or app)
     Copy spec: "Read the full guide →" or "Watch the setup video →" Link to brand's knowledge base, YouTube tutorial, or onboarding page.
Dynamic:
  - {{ person.first_name | default: 'there' }}
  - {{ event.extra.line_items[0].name }}

---
[DELAY] — 3 days

---
[EMAIL 3] — Deep Education / Results Guide
Timing: Day 10
Job: Go deeper on education — ingredients, science, protocol, what to expect week by week.
Subject direction: "The science behind [Product]" or "Here's why [Product] works (and how to maximize it)"
Sections:
  1. Education hero
     Copy spec: "You've had [Product] for a few days now. Here's everything you need to know to get the best results." Sets up the educational value of the email.
  2. Ingredient Spotlight (2–3 key ingredients)
     Copy spec: For each ingredient: name, what it does, why the brand chose it, what the research says. Build belief in the formula. This is the email that turns skeptics into advocates.
  3. Week-by-week expectations
     Copy spec: "Week 1: [what to notice]. Week 4: [what to notice]. Week 8: [full results visible]." Sets realistic expectations and reduces churn from impatient customers who expect immediate results.
  4. Common mistakes to avoid
     Copy spec: 2–3 common mistakes (wrong timing, wrong dose, skipping days). Prevents misuse. Also a great trust signal — you're being honest about the failure modes.
  5. Community / social proof
     Copy spec: "You're in good company — [X,000] customers are on the same journey." Link to brand community, Facebook group, Instagram, or UGC hashtag.
Dynamic:
  - {{ person.first_name | default: 'there' }}

---
[DELAY] — 4 days

---
[EMAIL 4] — Subscription Conversion (If subscription brand — else skip to E5)
Timing: Day 14
Job: Convert one-time purchaser to subscriber using savings math and habit framing.
Subject direction: "Never run out of [Product]" or "Lock in your supply — and save [X]%"
Sections:
  1. Habit acknowledgment header
     Copy spec: "You're [X days] in. This is exactly when most customers start thinking about what happens when they run out." Creates mild urgency without being pushy.
  2. Subscription Value Card
     Copy spec: Side-by-side comparison: One-time price: $XX.XX vs. Subscribe & Save: $XX.XX (save $X.XX per order). Make the math visible. Frame it as "the smarter way to buy" not "save money."
  3. Subscription benefits list
     Copy spec: ✓ Never run out ✓ Save [X]% every order ✓ Skip or cancel anytime ✓ Free shipping (if applicable). Keep it short and clean.
  4. CTA: "Switch to subscribe & save →"
     Copy spec: One CTA. Links directly to the subscription signup page (ReCharge, Skio, Bold, Stay.ai — confirm platform). Pre-populate the product where possible.
  5. Objection closer
     Copy spec: "No commitment. Skip, pause, or cancel anytime — no questions asked." Removes the #1 objection to subscriptions.
Dynamic:
  - {{ person.first_name | default: 'there' }}
Notes:
  - This email can be removed from the flow if brand is subscription-only (all purchases are already subscriptions)
  - If conversion rate is low: A/B test with a softer "Would you like to set up automatic refills?" framing vs. the discount angle

---
[CONDITIONAL SPLIT] — Has converted to subscriber?
  Condition: Profile has property "is_subscriber" = true OR has "Active Subscriber" segment membership
  YES → skip E5 (already subscribed), continue to E6
  NO → continue to E5

---
[DELAY] — 7 days

---
[EMAIL 5] — Review Request
Timing: Day 21 (or Day 14 if no subscription email)
(Same architecture as Template 1 E3 — see above)
Notes: At this point the customer has had the product for ~2 weeks. Review window is ideal.

---
[DELAY] — 7 days

---
[EMAIL 6] — Cross-Sell / Complete the Routine
Timing: Day 28
(Same architecture as Template 1 E4 — see above)
Notes: For complex/routine products, frame the cross-sell as "completing the system" or "the next step in your routine" rather than an unrelated upsell.

---
```

---

## Template 3: Consumable / Refill Brand (Adds Replenishment Reminder)

**Best for:** Supplements, coffee, skincare consumables, pet food, household consumables — any product where the customer needs to reorder to maintain results

**Modification to Standard 4-Email:** Add E5 as a replenishment reminder at the expected reorder interval.

```
[After Template 1 E4, add:]

---
[DELAY] — [replenishment interval - 21 days]
(If product lasts 30 days and last email was Day 21: delay is 9 days, making E5 land on Day 30)
(If product lasts 60 days and last email was Day 21: delay is 39 days, making E5 land on Day 60)

---
[EMAIL 5] — Replenishment Reminder
Timing: [Replenishment interval] days from order
Job: Prompt the customer to reorder before they run out, when they are most likely to reorder.
Subject direction: "Running low on [Product]?" or "Time to restock — your supply is almost out" or "Don't let [Result] slip away"
Sections:
  1. Awareness header
     Copy spec: "Your [Product] supply is probably getting low right about now." Empathetic, not pushy. "Most customers reorder at this point."
  2. Results reinforcement
     Copy spec: Brief reminder of the progress/results they've been getting. "You've been [using Product] for [X] weeks — don't let that momentum stall." One line. Emotional hook.
  3. Reorder CTA with product card
     Copy spec: Product image, name, price, "Reorder now →" CTA. Clean and simple. Remove friction.
  4. Subscription offer (if not already subscribed)
     Copy spec: "Set it and forget it — subscribe and save [X]% so you never run out." Link to subscription page.
  5. Social proof anchor
     Copy spec: "Join [X] customers who reorder every [interval]." Or one testimonial about the long-term transformation.
Dynamic:
  - {{ person.first_name | default: 'there' }}
Notes:
  - This email can be triggered by a separate flow (Repeat Purchase flow) rather than appended to post-purchase, depending on the brand's flow architecture
  - For subscription brands: suppress this email for active subscribers — they don't need a reorder reminder
  - Recommended: A/B test subject lines. "Running low?" performs well. Pure urgency ("Last chance to reorder") performs poorly for consumables.
```

---

## Template 4: High-AOV / Luxury (Relationship-First, Less Selling)

**Best for:** Premium brands ($100+ AOV), luxury DTC, brands where the customer relationship IS the brand experience

**Philosophy shift:** For luxury brands, the post-purchase flow is less about converting the next purchase and more about making the customer feel like they joined something. Over-selling after a luxury purchase breaks the spell.

```
FLOW: Post-Purchase Luxury — [Brand]
TRIGGER: Placed Order
ENTRY FILTERS: None
EXIT CONDITIONS: Refund Processed → exit
SMART SENDING: OFF for E1. ON for E2–E3.

---
[EMAIL 1] — Order Confirmation
Timing: Immediately
Notes: Same structure as Template 1 E1 — but copy direction is more elevated. No cheery emojis. Clean design. "Your order has been received" not "It's on its way!!! 🎉". Brand voice is calm, assured, premium.

---
[DELAY] — [delivery window] + 1 day

---
[EMAIL 2] — Brand Story / Experience Email
Timing: Day 7–8
Job: Welcome the customer into the brand world. Tell the story behind the product. Build emotional connection that justifies the AOV.
Subject direction: "The story behind your [Product]" or "This is what we make — and why"
Sections:
  1. Craft or origin story
     Copy spec: 3–4 paragraphs of genuine brand storytelling. Why this product exists, what problem the founder was solving, what makes the formula / material / craft different. This should read like an article, not a marketing email.
  2. Ingredient Spotlight or Material Story
     Copy spec: For product brands: "Here's what's inside and why it matters." For fashion/home: "Here's how this is made and who made it." Specificity = credibility.
  3. How It Works (usage, care, best practices)
     Copy spec: Practical and specific. But framed as insider knowledge, not a manual. "Here's how we recommend using it."
  4. Brand community signal
     Copy spec: Instagram, brand editorial, or content hub. "Follow along →" or "See how others are using it →". No hard CTA to buy anything.
Dynamic:
  - {{ person.first_name | default: 'there' }}

---
[DELAY] — 10 days

---
[EMAIL 3] — Review / Relationship Check-In
Timing: Day 18
Job: Invite feedback and make the customer feel personally cared for.
Subject direction: "How is [Product] treating you, [first_name]?" or "We'd love your thoughts"
Sections:
  1. Personal, conversational opener
     Copy spec: "It's been a couple of weeks. We'd genuinely love to know how you're finding [Product]." No pressure language. Feels like a message from a founder.
  2. Review CTA (soft)
     Copy spec: "If you have a moment, sharing your experience helps others find us — and means a lot to our team." Simple CTA. No star graphic or high-conversion tricks — keep it refined.
  3. Concierge offer
     Copy spec: "If anything isn't exactly right, reply here and we'll make it right. That's a promise." Establishes white-glove service expectations.
Notes:
  - No cross-sell or product grid in E3 for luxury brands
  - If brand has a VIP/loyalty program: E3 is a good place to introduce it ("Based on your purchase, you're now eligible for our [Program Name]")
  - If brand has gifting or replenishment cadence: soft-mention it here as a service, not a sale

---
```

---

## Design Element Recommendations (Full Reference)

### E1 — Order Confirmation
| Section | Design Element | Notes |
|---|---|---|
| Order summary | Order Details Table (dynamic) | Loop through line_items. Show image, name, qty, price. |
| Shipping confirmation | Shipping Address Display | Reassurance component. Shows address formatted. |
| Next steps | How It Works (3-step) | "We pack → We ship → You unbox" narrative |
| Tracking | CTA Button | Prominent. Links to event.extra.order_status_url |

### E2 — Usage / Education
| Section | Design Element | Notes |
|---|---|---|
| How to use | How It Works (numbered, 3–5 steps) | Core section. Specific to product type. |
| Key ingredients | Ingredient Spotlight | For functional products only |
| Pro tip | Callout Box (accent color) | One insider tip. Short. |
| Community proof | UGC Photo Grid (optional) | 4-image grid of customers using the product |

### E3 — Review Request
| Section | Design Element | Notes |
|---|---|---|
| Existing reviews | Review Card (2–3 cards) | Normalizes writing a review |
| CTA | Star Rating Graphic + Button | High-click visual element |
| Safety net | "Not happy?" text block | Catches unhappy customers |

### E4 — Cross-Sell
| Section | Design Element | Notes |
|---|---|---|
| Product recommendation | Product Variant Grid | 1–3 products. Clean grid. |
| Bundle option | Bundle/Value Stack Card | If bundle exists. Shows savings math. |
| Subscription | Subscription Value Card | If subscription brand. |
| Social proof | Review Carousel or single Review Card | Validates the cross-sell product |

---

## Suppression & Exit Conditions

| Condition | Action |
|---|---|
| Refund Processed event fires | Exit flow immediately. Do not send E2–E4. |
| Customer initiates chargeback | Exit flow. Flag for CS team. |
| Customer is already a subscriber (for subscription email) | Skip subscription conversion email via conditional split |
| Customer has purchased the cross-sell product before | Skip E4 or swap product in grid (requires profile property or segment) |
| Customer unsubscribes | Klaviyo handles automatically — they exit all flows |

---

## Common Mistakes to Avoid

| Mistake | Why It Fails | Fix |
|---|---|---|
| Sending E2 (usage tips) too early | Customer gets advice for a product they don't have yet. Creates confusion and distrust. | Set delay to delivery window + 1 day buffer. |
| Sending E3 (review request) before 7 days post-delivery | Customer hasn't formed an opinion yet. Forces a 3-star review at best. | Hard minimum: 7 days from estimated delivery date. |
| Making E4 (cross-sell) feel like a sales email | Breaks the goodwill built over E1–E3. Customer feels used. | Lead with the recommendation framing. Show one relevant product, not a store. |
| Not personalizing with the product they bought | Generic post-purchase emails feel robotic. Miss the opportunity to build trust. | Always reference event.extra.line_items[0].name at minimum. |
| Skipping the order confirmation or making it transactional-robot | Anxiety window opens between purchase and confirmation. Where buyer's remorse is born. | E1 must be warm, fast, and human. It's the most-opened email in the whole flow. |
| Sending cross-sell before review request | Customer hasn't validated their purchase yet. Cross-sell lands on a skeptic. | Always review → cross-sell, never the reverse. |
| Including a discount in E1 or E2 | Trains customers to expect discounts. Damages brand perceived value. | Post-purchase is NOT where you discount. Use goodwill, education, and relationship. |
| Complex product with zero education emails | Customer doesn't know how to use it. Returns it or loses faith. | Match education depth to product complexity. |

---

## QA Checklist Before Launch

- [ ] E1 delay is 0 minutes (or < 5 minutes) — confirmed?
- [ ] E2 delay accounts for actual delivery window — not a generic 3-day delay?
- [ ] E3 review request fires minimum 7 days after estimated delivery?
- [ ] All Liquid variables previewed in Klaviyo with a real order profile?
- [ ] event.extra.order_status_url resolves correctly for brand's platform?
- [ ] Review platform deep link confirmed and tested?
- [ ] Subscription email (if applicable) has correct platform URL?
- [ ] Refund exit condition configured on the flow?
- [ ] Smart Sending is OFF for E1, ON for E2–E4?
- [ ] E1 confirmed to beat Shopify's default order confirmation (or Shopify confirmation is disabled)?
- [ ] Cross-sell product is live and in stock?
- [ ] Mobile preview checked for order table (tables break on mobile — use stacked design)?
