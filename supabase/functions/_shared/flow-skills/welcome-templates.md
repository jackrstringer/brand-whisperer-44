# Welcome Flow Templates

Proven welcome flow architectures. Select the right variant based on brand context, then
customize timing, splits, and email specs for the specific brand.

---

## Standard Welcome (With Offer)

The default welcome flow for DTC brands running a welcome discount or incentive.
5-7 emails over 10-14 days. The offer is the throughline.

```
TRIGGER: Added to List (Newsletter, Popup, Footer Signup)
ENTRY FILTERS: Has not been in flow in last 30 days, consent given
EXIT CONDITION: Placed Order

---

[EMAIL 1] — Welcome + Offer Delivery
Timing: Immediate (0-5 min after signup)
Job: Deliver the offer. First impression. Hero product front and center.
Subject direction: Welcome + offer value ("Welcome. Here's your [X]% off.")
Sections:
  1. Hero — hero product image, welcome headline, offer in subheader
  2. Short value prop — 1-2 sentences on what makes the brand different
  3. [Scrolling Benefits Banner] — 4-5 trust signals
  4. CTA — claim offer
Dynamic: {{ first_name|default:"" }} in greeting if collected
Notes: This email should feel clean and confident, not overwhelming. Don't try to
tell the whole brand story. Just: who we are, what we make, here's your deal.

---

[DELAY] — 24 hours

[CONDITIONAL SPLIT] — Placed Order?
  YES → Exit flow (or route to post-purchase flow)
  NO → Continue

[EMAIL 2] — Why We're Different
Timing: ~24 hours after E1
Job: Differentiate. Answer "why this instead of what I already use?"
Subject direction: Education/differentiation angle
Sections:
  1. Hero — insight-led headline, not product name
  2. [Us vs Them Split Card] or [Feature Checklist Matrix]
     The design element does the heavy lifting. No paragraphs needed.
  3. Short body — 1-2 sentences connecting the comparison to the reader
  4. Offer reminder — banner or text line with the welcome discount
  5. CTA
Dynamic: None typically
Notes: This is where a strong design element matters most. The comparison visual
should communicate the differentiation in 2 seconds of scrolling.

---

[DELAY] — 48 hours

[CONDITIONAL SPLIT] — Placed Order?
  YES → Exit flow
  NO → Continue

[EMAIL 3] — Social Proof
Timing: ~3 days after signup
Job: Let customers sell for you. Stack proof.
Subject direction: Review-led or "what customers are saying"
Sections:
  1. Hero — review-led headline or "Tried. Tested. Loved." framing
  2. [Review Carousel / GIF Block] or [Review Card] x2-3
  3. [Stat Strip] — rating, review count, guarantee
  4. Offer reminder
  5. CTA
Dynamic: None typically
Notes: Keep it tight. Reviews + stats + CTA. This email should feel like a wall
of proof, not an essay about why people love the product.

---

[DELAY] — 48-72 hours

[CONDITIONAL SPLIT] — Placed Order?
  YES → Exit flow
  NO → Continue

[EMAIL 4] — Education / How It Works
Timing: ~5-6 days after signup
Job: Teach. Make the product feel like an obvious fit for their routine.
Subject direction: Educational hook or "how it works"
Sections:
  1. Hero — educational angle, not salesy
  2. [How It Works (Numbered Steps)] or [Routine / Usage Guide]
  3. [Ingredient Spotlight] or [Did You Know Stat Card]
  4. Offer reminder
  5. CTA
Dynamic: None typically
Notes: By E4 the subscriber has seen the offer, the differentiation, and the proof.
Now give them the knowledge. Make the product feel inevitable, not pushed.

---

[DELAY] — 72 hours

[CONDITIONAL SPLIT] — Placed Order?
  YES → Exit flow
  NO → Continue

[EMAIL 5] — Offer Expiring / Last Chance
Timing: ~8-9 days after signup
Job: Create urgency. Close the loop on the offer.
Subject direction: Urgency/deadline ("Your [X]% off is expiring")
Sections:
  1. Hero — urgency headline, offer front and center
  2. [Countdown / Urgency Visual] or bold deadline text
  3. Short proof reminder — 1 review or stat
  4. [Guarantee Seal] — reduce purchase anxiety
  5. CTA — urgent
Dynamic: None typically
Notes: This is a closer. Clean, direct, urgent. Not the time for education or
long brand story. Offer + deadline + proof + guarantee + CTA.

---

OPTIONAL [DELAY] — 3-5 days

OPTIONAL [EMAIL 6] — Brand Story / Community (post-offer)
Timing: ~12-14 days after signup
Job: Transition non-converters into the main list relationship.
Subject direction: Brand story, mission, or community angle
Sections:
  1. Hero — brand story headline
  2. [Founder / Expert Quote Card] or brand mission content
  3. [UGC Photo Grid] — community feel
  4. Soft CTA — no discount, just "shop" or "follow us"
Dynamic: None
Notes: No offer. This email welcomes non-converters into the regular email
relationship. It says: "the discount window closed, but we're still here and
we're worth knowing." Optional — skip for brands that want a tighter flow.
```

---

## Welcome (No Offer)

For brands that don't discount, or premium brands where offers dilute positioning.
4-5 emails over 10-12 days. Brand story and education carry the weight.

```
TRIGGER: Added to List
ENTRY FILTERS: Has not been in flow in last 30 days
EXIT CONDITION: Placed Order

---

[EMAIL 1] — Welcome + Brand Introduction
Timing: Immediate
Job: Warm welcome. Introduce the brand and hero product.
Sections:
  1. Hero — brand-led headline, product image
  2. Short brand story — 2-3 sentences max
  3. [Product Feature Icon Row] or [Benefit Grid]
  4. CTA — explore / shop

---

[DELAY] — 48 hours

[EMAIL 2] — Education / Problem-Solution
Timing: ~2 days
Job: Build the case. Why this product category matters.
Sections:
  1. Hero — insight headline
  2. [Did You Know Stat Card]
  3. Short educational body — 2-3 sentences
  4. [Ingredient Spotlight] or [How It Works]
  5. CTA

---

[DELAY] — 72 hours

[EMAIL 3] — Social Proof
Timing: ~5 days
Job: Proof stacking. Let customers do the selling.
Sections:
  1. Hero — review-led
  2. [Review Carousel / GIF Block]
  3. [Stat Strip]
  4. CTA

---

[DELAY] — 72 hours

[EMAIL 4] — Founder Story or Mission
Timing: ~8 days
Job: Emotional connection. Why this brand exists.
Sections:
  1. Hero — founder or mission headline
  2. [Founder / Expert Quote Card]
  3. Short mission copy
  4. [UGC Photo Grid] or community content
  5. CTA

---

OPTIONAL [DELAY] — 72 hours

OPTIONAL [EMAIL 5] — Best-Sellers or Product Range
Timing: ~11 days
Job: Show the full range. Give non-converters a reason to browse.
Sections:
  1. Hero — collection headline
  2. [Product Variant Grid] — 4-6 products
  3. [Guarantee Seal]
  4. CTA
```

---

## Welcome + Subscription Push

For brands with a subscription/refill model. The welcome offer is tied to subscribing.
5-6 emails. Adds subscription value framing and savings math.

```
TRIGGER: Added to List
ENTRY FILTERS: Has not been in flow in last 30 days
EXIT CONDITION: Placed Order (subscription OR one-time)

---

[EMAIL 1] — Welcome + Subscribe & Save Offer
Timing: Immediate
Job: Deliver the subscription offer. Frame the value.
Sections:
  1. Hero — welcome headline, subscription offer in subheader
  2. [Subscription Value Card] — one-time vs subscribe price comparison
  3. [Scrolling Benefits Banner]
  4. CTA — subscribe

---

[DELAY] — 24 hours

[CONDITIONAL SPLIT] — Placed Order?
  YES → Exit flow
  NO → Continue

[EMAIL 2] — Why Subscribe
Timing: ~24 hours
Job: Make the subscription feel like the smart choice.
Sections:
  1. Hero — subscription benefit headline
  2. [Bundle / Value Stack Card] — everything they get with subscription
     (product + free gifts + savings + free shipping)
  3. Short body — convenience angle, "never run out"
  4. CTA — subscribe

---

[DELAY] — 48 hours

[CONDITIONAL SPLIT] — Placed Order?
  YES → Exit flow
  NO → Continue

[EMAIL 3] — Social Proof
Timing: ~3 days
Job: Reviews, but specifically from subscribers when possible.
Sections:
  1. Hero — review-led
  2. [Review Card] x2-3 — prioritize reviews mentioning subscription/refills
  3. [Stat Strip]
  4. Offer reminder
  5. CTA

---

[DELAY] — 72 hours

[CONDITIONAL SPLIT] — Placed Order?
  YES → Exit flow
  NO → Continue

[EMAIL 4] — Education / How It Works
Timing: ~6 days
Same as Standard Welcome E4

---

[DELAY] — 72 hours

[CONDITIONAL SPLIT] — Placed Order?
  YES → Exit flow
  NO → Continue

[EMAIL 5] — Last Chance + OTP Fallback
Timing: ~9 days
Job: Final push for subscription, but offer OTP as a fallback.
Sections:
  1. Hero — urgency headline, subscription offer
  2. [Countdown / Urgency Visual]
  3. Short body — "not ready to subscribe? Try a single order at [X]% off"
  4. [Guarantee Seal]
  5. Dual CTA — "Subscribe & Save" (primary) + "Try Once" (secondary)

[CONDITIONAL SPLIT] — Placed Order?
  YES → Exit flow
  NO → Flow ends, subscriber enters main list
```

---

## Welcome with SMS

Dual-channel welcome. SMS touchpoints woven between emails. SMS is short, punchy,
and action-oriented. Emails carry the story and proof.

```
TRIGGER: Added to List (with SMS consent)
ENTRY FILTERS: Has not been in flow in last 30 days, email + SMS consent
EXIT CONDITION: Placed Order

---

[EMAIL 1] — Welcome + Offer Delivery
Timing: Immediate
Same as Standard Welcome E1

---

[DELAY] — 4-6 hours

[SMS 1] — Offer Reminder
Timing: Same day as E1, afternoon
Content: Hey {{ first_name|default:"" }}! Your [X]% off code is ready: [CODE].
Shop now: [link]
Notes: Short, direct, code + link. Under 160 chars if possible.

---

[DELAY] — 20-24 hours (from SMS 1)

[CONDITIONAL SPLIT] — Placed Order?
  YES → Exit
  NO → Continue

[EMAIL 2] — Why We're Different
Same as Standard Welcome E2

---

[DELAY] — 48 hours

[CONDITIONAL SPLIT] — Placed Order?
  YES → Exit
  NO → Continue

[EMAIL 3] — Social Proof
Same as Standard Welcome E3

---

[DELAY] — 24 hours

[SMS 2] — Proof Nudge
Timing: Day after E3
Content: Real talk — [review count]+ people switched to [Brand] and aren't going
back. See why: [link]
Notes: Social proof in SMS. Link to reviews page or product page.

---

[DELAY] — 48-72 hours

[EMAIL 4] — Education / How It Works
Same as Standard Welcome E4

---

[DELAY] — 72 hours

[EMAIL 5] — Last Chance
Same as Standard Welcome E5

---

[DELAY] — 4-6 hours

[SMS 3] — Final Urgency
Timing: Same day as E5, later
Content: Last call — your [X]% off expires tonight. Don't miss it: [link]
Notes: Pure urgency. Short. Link to cart or product page.
```

---

## Minimal Welcome

3 emails for brands with tight margins, small catalogs, or simple products.
Covers the essentials in a compressed arc.

```
TRIGGER: Added to List
ENTRY FILTERS: Standard
EXIT CONDITION: Placed Order

---

[EMAIL 1] — Welcome + Offer + Value Prop
Timing: Immediate
Job: Everything in one. Welcome, offer, why you're different.
Sections:
  1. Hero — welcome + offer
  2. [Feature Checklist Matrix] or [Us vs Them Split Card]
  3. [Scrolling Benefits Banner]
  4. CTA

---

[DELAY] — 3 days

[CONDITIONAL SPLIT] — Placed Order?
  YES → Exit
  NO → Continue

[EMAIL 2] — Social Proof + Education
Timing: ~3 days
Job: Proof and education combined.
Sections:
  1. Hero — review-led or educational
  2. [Review Card] x2
  3. [Ingredient Spotlight] or [How It Works]
  4. Offer reminder
  5. CTA

---

[DELAY] — 4 days

[CONDITIONAL SPLIT] — Placed Order?
  YES → Exit
  NO → Continue

[EMAIL 3] — Last Chance
Timing: ~7 days
Job: Close the loop.
Sections:
  1. Hero — urgency
  2. [Countdown / Urgency Visual]
  3. [Guarantee Seal]
  4. CTA
```

---

## Product-Specific Welcome

Different paths based on which product or collection the subscriber entered through.
The trigger or signup source determines which branch they enter.

```
TRIGGER: Added to List (with source/product tag)
ENTRY FILTERS: Standard
EXIT CONDITION: Placed Order

---

[EMAIL 1] — Welcome + Offer (Universal)
Timing: Immediate
Job: Same for all paths. Welcome, offer, brand intro.
Sections: Same as Standard Welcome E1

---

[DELAY] — 24 hours

[CONDITIONAL SPLIT] — Split on signup source or product interest
  Product A → Product A path
  Product B → Product B path
  General / Unknown → Default path (Standard Welcome E2-E5)

---

PRODUCT A PATH:

[EMAIL 2A] — Why Product A
Timing: ~24 hours after E1
Job: Deep dive on Product A specifically.
Sections:
  1. Hero — Product A headline
  2. [Us vs Them Split Card] — Product A vs alternatives
  3. Product A feature/ingredient content
  4. Offer reminder
  5. CTA — specific to Product A

[DELAY] — 48 hours
[CONDITIONAL SPLIT] — Placed Order? YES → Exit, NO → Continue

[EMAIL 3A] — Product A Social Proof
Timing: ~3 days
Job: Reviews specifically about Product A.
Sections:
  1. Hero — review-led for Product A
  2. [Review Card] x2-3 — Product A reviews
  3. Offer reminder
  4. CTA

[DELAY] — 72 hours
[CONDITIONAL SPLIT] — Placed Order? YES → Exit, NO → Merge to E5 Last Chance

---

PRODUCT B PATH:

[EMAIL 2B] — Why Product B
(Same structure as 2A but for Product B)

[EMAIL 3B] — Product B Social Proof
(Same structure as 3A but for Product B)

[DELAY] → Merge to E5 Last Chance

---

MERGED:

[EMAIL 5] — Last Chance (Universal)
Same as Standard Welcome E5
```

---

## Customization Guide

These templates are starting points. Customize based on:

**Brand with strong founder story:** Add a founder email (use Founder / Expert Quote Card)
after the social proof email.

**Brand with a quiz/diagnostic:** Add a quiz CTA email early (E2 or E3 position) that
routes to the quiz. Use Quiz Highlight Block design element.

**Brand with a hero ingredient or mechanism:** Add an education-heavy email with
Ingredient Spotlight and Did You Know Stat Card design elements.

**Brand with strong UGC:** Replace or augment the social proof email with a UGC Photo Grid
design element.

**Brand with multiple product lines:** Use the Product-Specific variant with splits based
on signup source, quiz result, or initial browse behavior.

**Brand with a strong "us vs them" story:** Lead E2 with the Us vs Them Split Card or
Feature Checklist Matrix. Make the comparison visual the hero of that email.

**High-AOV / luxury brands:** Longer delays between emails (48-72h minimum). More
education, less urgency. Consider the No Offer variant. Founder/expert credibility matters
more than review volume.

**Consumable / replenishment brands:** Use the Subscription Push variant. Frame the
subscription as convenience + savings, not commitment.
