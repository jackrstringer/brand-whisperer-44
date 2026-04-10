export const KLAVIYO_BEST_PRACTICES = `
================================================================================
KLAVIYO EMAIL FLOW BEST PRACTICES — COMPLETE REFERENCE
================================================================================
This document is the authoritative knowledge base for generating Klaviyo flow
and transactional emails. Read every section before generating any email copy,
subject lines, or Liquid template code. When in doubt, this document governs.
================================================================================


════════════════════════════════════════════════════════════════════════════════
SECTION 1: FLOW TYPES — PURPOSE, TIMING, COPY, STRUCTURE
════════════════════════════════════════════════════════════════════════════════

Each flow below covers: purpose, emotional goal per step, timing, send cadence,
subject line approach, content structure, and hard rules on what to never do.

────────────────────────────────────────────────────────────────────────────────
1.1 ABANDONED CHECKOUT FLOW (3 Steps)
────────────────────────────────────────────────────────────────────────────────

PURPOSE:
Recover revenue from shoppers who added items to their cart but did not complete
purchase. This is typically the highest-ROI flow in any Klaviyo account. The
three-step sequence is designed to apply escalating persuasion without training
customers to abandon carts on purpose to get discounts.

TRIGGER: "Started Checkout" event in Klaviyo (not "Added to Cart" — that is
Browse Abandonment). Filter out anyone who has placed an order after the trigger.

---

STEP 1 — Sent 1 hour after abandonment

Emotional Goal: Gentle curiosity. The customer may have just gotten distracted.
Meet them warmly, not urgently. Make it feel like a helpful nudge from a friend,
not a brand yelling at them. Do NOT create panic or false urgency.

Timing: 1 hour after the "Started Checkout" event. Short enough that the
decision is still fresh, long enough that it does not feel invasive.

Content Structure:
  - Subject: Light, curious, personalized when possible
  - Preview text: Complement the subject — tease what's in the cart
  - Opening line: Acknowledge that life happens, no judgment
  - Cart contents block: Show every item with image, name, quantity, price
    using the Items array loop (see Section 2). This is non-negotiable — always
    render the actual cart, not a generic "you left something behind" statement
  - CTA button: "Return to Cart" or "Complete Your Order" — single, prominent
  - Footer: Standard unsubscribe link required (this is a marketing email)

What NOT to do in Step 1:
  - Never offer a discount. This trains cart abandonment behavior
  - Never say "hurry" or "running out" unless real inventory data supports it
  - Never use guilt or shame language
  - Never show a generic email without the actual cart contents rendered
  - Never use ALL CAPS in the subject line

---

STEP 2 — Sent 24 hours after abandonment

Emotional Goal: Build confidence. The customer is on the fence — they need
social proof and objection handling more than another reminder. This email should
answer the unspoken question: "Is this worth it? Will it work for me?"

Timing: 24 hours after the trigger. Long enough to not feel harassing, close
enough that the purchase window is still open.

Content Structure:
  - Subject: Reference the product or category, hint at validation
  - Preview text: Tease the social proof angle — "See what 4,800 customers say"
  - Opening section: Brief callback to the cart (1-2 lines max)
  - Cart contents block: Show again, same as Step 1 — always render the cart
  - Social proof block: 2-3 real customer reviews specifically for the abandoned
    product(s) if available, or brand-level reviews. Include star ratings, name,
    short quote. Place this BELOW the cart on Step 2.
  - Objection-handling section: Address the top 2-3 reasons someone hesitates
    (return policy, shipping speed, materials/ingredients, size guide link, etc.)
  - CTA: "Complete Your Order" — still single, still primary
  - Secondary CTA (optional): Link to FAQ or return policy

What NOT to do in Step 2:
  - Still no discount — preserve margin
  - Don't just repeat Step 1 with different words
  - Don't overwhelm with 10+ reviews — 2-3 curated ones outperform a wall of text
  - Don't bury the CTA below the fold with no visual hierarchy

---

STEP 3 — Sent 72 hours after abandonment

Emotional Goal: Urgency with dignity. This is the last-chance email. It can
include an incentive, but it must feel earned and finite — a genuine offer, not
desperation. The tone should convey: "We want you to have this. Here's something
to help you decide."

Timing: 72 hours (3 days) after the trigger event.

Content Structure:
  - Subject: Communicate the offer or last-chance framing clearly
  - Preview text: State the discount code or expiry if applicable
  - Opening: Acknowledge this is the last nudge — respect the customer's time
  - Cart contents block: Always show the cart — they need to remember what they
    wanted
  - Incentive block (if using): Discount code in large, copyable text. State the
    exact expiry (e.g., "This offer expires in 48 hours" — use a countdown if
    your template supports it). Percentage off is more compelling than dollar off
    for most AOV ranges; test both
  - Social proof: One or two lines of validation — aggregate review count or a
    single powerful testimonial
  - CTA: "Claim Your Discount" or "Complete My Order — [X]% Off"
  - Secondary: "Shop without discount" link for customers who don't need it

Whether to offer a discount:
  - Only offer a discount if your margins support it and if your brand does not
    already train discount behavior through campaigns
  - Alternatively, offer free shipping (lower perceived cost to brand, high
    perceived value to customer)
  - Consider offering social proof only (no discount) and A/B testing against
    a discount version before committing to always discounting at Step 3

What NOT to do in Step 3:
  - Don't make the discount feel like a bribe — frame it as a gift
  - Don't set a fake or rolling expiry date (trust destruction is permanent)
  - Don't skip the cart contents block
  - Don't use countdown timers unless the expiry is real and technically accurate


────────────────────────────────────────────────────────────────────────────────
1.2 WELCOME SERIES FLOW (3–5 Steps)
────────────────────────────────────────────────────────────────────────────────

PURPOSE:
The welcome series is the single most important ongoing automated sequence a
brand can build. It onboards new subscribers, delivers on whatever promise
brought them to sign up (discount, content, community), introduces the brand
story, educates on products, and moves a subscriber toward first purchase.

TRIGGER: "Subscribed to List" event (email list signup) or a segment join when
someone subscribes to a specific list. Exclude anyone who has already made a
purchase — send them to the post-purchase flow instead.

Suppress from abandon cart flows during the welcome series to avoid conflicting
messaging.

---

STEP 1 — Sent immediately (within 5 minutes of signup)

Emotional Goal: Deliver the promise. The subscriber took an action — now fulfill
it. Make them feel smart for signing up. Build immediate trust by being fast and
generous. This is NOT the time for a heavy brand pitch.

Content Structure:
  - Subject: Deliver the thing they signed up for (discount code, guide, etc.)
  - Preview text: Confirm what's coming or show the code right in the preview
  - Hero line: Welcome them warmly — use first name if collected at signup:
    "Welcome, {{ person.first_name | default: 'friend' }}"
  - Lead delivery block: If they signed up for a discount, the discount code
    should be large, prominent, and easy to copy. If they signed up for content,
    deliver or link to that content immediately
  - Brand micro-story (3-5 sentences): Why the brand exists, what it stands for.
    Keep this brief here — it gets expanded in later steps
  - What to expect section: "Over the next two weeks, we'll share [X, Y, Z]" —
    sets expectations and primes future opens
  - Single CTA: "Shop Now" or "Start Exploring" — do not overwhelm with options

What NOT to do in Step 1:
  - Never delay delivery of a promised discount or resource
  - Don't write a 1,000-word brand manifesto here — people are just saying hello
  - Don't include multiple competing CTAs
  - Don't send from a no-reply address — use a human name like hello@brand.com

---

STEP 2 — Sent 2 days after signup

Emotional Goal: Educate and intrigue. Now that the subscriber is in the door,
deepen their understanding of the hero product. Answer "what is this and why
does it work?" before they ask. This is the education email.

Content Structure:
  - Subject: Curiosity-driven, product or benefit-focused
  - Preview text: Tease the "how it works" angle or a specific surprising fact
  - Opening: Transition naturally from Step 1 — "Now that you've had a chance to
    look around..."
  - Hero product deep-dive: How it works, key ingredients or specifications,
    what makes it different from alternatives. Use visuals (product in use, not
    just product on white background). Use short paragraphs and bullet points —
    scannable is essential
  - Proof point: One specific stat, test result, or certification if available
  - CTA: Link to the product page or a "how it works" page — not yet a hard sell
  - Secondary: Link to full ingredient list / spec sheet / FAQ (lower pressure)

What NOT to do in Step 2:
  - Don't repeat the discount from Step 1 — that email did its job
  - Don't dump every product in the catalog here
  - Don't use jargon without explanation

---

STEP 3 — Sent 4 days after signup

Emotional Goal: Social belonging. Humans buy what people like them are already
buying. This email shows the subscriber that real people love this product and
that there's a community they can be part of. UGC and authentic voice dominate.

Content Structure:
  - Subject: Community or social proof angle
  - Preview text: A compelling customer quote or aggregate review number
  - Opening: "Don't just take our word for it..."
  - UGC/Review block: 3-4 customer photos or quotes with names and, if possible,
    a specific outcome ("I've been sleeping better for 3 weeks" beats "great
    product"). Star ratings add visual credibility
  - Community callout (if applicable): Instagram/TikTok handle, hashtag, number
    of community members, before/after stories
  - Specific use-case story: A mini case study or customer journey (2-3
    paragraphs) showing real-world results
  - CTA: "Join [X] happy customers" or "Shop the Collection"

What NOT to do in Step 3:
  - Don't use generic stock photos as "customer photos"
  - Don't fabricate or embellish reviews — legal and trust risk
  - Don't skip this step — social proof emails in welcome series consistently
    outperform product education emails for second-open rates

---

STEP 4 — Sent 7 days after signup

Emotional Goal: Exploration and discovery. Introduce the broader catalog without
pressure. The subscriber now knows and trusts the hero product — show them what
else is worth knowing about.

Content Structure:
  - Subject: "Our bestsellers" or "What else we make" — exploratory framing
  - Preview text: Tease a specific product they may not have seen
  - Opening: Brief, warm transition
  - Bestseller grid: 3-4 products with image, name, one-line description, and
    link. Each should have a price visible. Do not list your entire catalog
  - Cross-sell logic: If possible, surface products that complement what the
    subscriber has browsed or that are frequently bought together
  - Secondary section (optional): "Most gifted" or "Staff favorites" — human
    curation adds warmth
  - CTA: One per product card — keep it simple ("Shop [Product Name]")

What NOT to do in Step 4:
  - Don't use this as a pure promotional blast
  - Don't include more than 4-6 products — choice paralysis is real
  - Don't skip personalization if you have any behavioral data (browse history)

---

STEP 5 — Sent 14 days after signup

Emotional Goal: Conviction. The subscriber has been nurtured. If they haven't
bought yet, this is the moment to close with the best offer available. Make it
feel like a final, genuine invitation — not an ultimatum.

Content Structure:
  - Subject: Urgency or value-focused — reference the offer directly
  - Preview text: State the offer or the expiry
  - Opening: Acknowledge the journey — "You've been with us for two weeks. We
    don't want you to miss out."
  - Best offer: This is the place for your strongest incentive (highest discount,
    free shipping + discount, free gift with purchase). Make it obvious and
    prominent
  - Urgency element: Set a real expiry on the offer — 48-72 hours from send
  - Proof block: One final social proof element — aggregate review count or
    a single testimonial — to reinforce the decision
  - CTA: "Claim My Offer" — action-oriented, first-person button language
    performs well here
  - Fallback CTA: "Browse Without Discount" — for those who have already bought
    or don't need the nudge

What NOT to do in Step 5:
  - Don't make the expiry fake — use Smart Sending or a real date
  - Don't recycle the same discount you used in Step 1 without increasing value
  - Don't send this email to anyone who has already purchased — use a flow
    filter or trigger split to exclude them


────────────────────────────────────────────────────────────────────────────────
1.3 POST-PURCHASE FLOW (3 Steps)
────────────────────────────────────────────────────────────────────────────────

PURPOSE:
Convert a transactional moment (the order) into a relationship. Reduce buyer's
remorse, increase product satisfaction, generate reviews, and create the
conditions for repeat purchase. This flow is the foundation of customer LTV.

TRIGGER: "Placed Order" event in Klaviyo. Note: if you also have an order
confirmation going out from your e-commerce platform (Shopify, etc.), coordinate
to avoid duplication — either suppress the platform email or time Klaviyo's Step
1 to complement it, not compete.

---

STEP 1 — Sent immediately after order placement

Emotional Goal: Validate and excite. The customer just made a decision — your
job is to make them feel great about it before the purchase regret has a chance
to set in. This is not a cold receipt; it is a warm celebration.

Content Structure:
  - Subject: Confirmation + excitement — "It's official!" or "Your order is in!"
  - Preview text: Order number and one line of excitement ("Great choice.")
  - Hero headline: Warm, brand-voiced confirmation — not "Order #1234 Confirmed"
    but something like "You're going to love this."
  - Order summary: Items ordered with images, quantities, prices — loop the
    Items array. Include order total, shipping address, and estimated delivery
  - What happens next: Short numbered list — "1. We'll pack it with care.
    2. You'll get a shipping notification with tracking. 3. [Product] arrives."
  - Pro tip or product preview: One line that creates anticipation for using
    the product — "Most customers notice [benefit] within [timeframe]"
  - CTA: "Track My Order" (link to order status page)

What NOT to do in Step 1:
  - Don't send a plain-text receipt with no brand voice — missed opportunity
  - Don't include cross-sell or upsell here — it's too early and feels transactional
  - Don't skip the order details — customers need confirmation they can reference

---

STEP 2 — Sent 3-5 days after estimated delivery date

Emotional Goal: Empower. The customer has the product in their hands. Now
educate them on how to get the maximum value from it. This email should make
them feel like a smart, insider user — not like they're reading an instruction
manual.

Timing: Use order data to estimate delivery, or use a fixed delay of 5-7 days
from order placement if you don't have delivery data. Sending before delivery
is worse than sending a day or two late.

Content Structure:
  - Subject: Usage-focused, benefit-oriented
  - Preview text: The most useful tip or a key outcome
  - Opening: Assume they have it — "You've had [product] for a few days now..."
  - Usage tips section: 3-5 tips in a scannable format. Write these as insider
    knowledge, not user manual language. "Here's what most people get wrong..."
    is more engaging than "Step 3: Do X"
  - Video or visual walkthrough link (if available)
  - FAQ link: Link to support docs or FAQ for common questions
  - Support CTA: "Questions? Reply to this email" — encourage direct contact.
    This reduces refund requests and builds loyalty
  - Secondary CTA: Link to a community, loyalty program, or tips blog

What NOT to do in Step 2:
  - Don't send this before the product arrives
  - Don't make it a cross-sell email — that comes in Step 3
  - Don't write generic tips that apply to any product — specificity is credibility

---

STEP 3 — Sent 14-21 days after delivery

Emotional Goal: Harvest delight, plant seeds for next purchase. By now the
customer has used the product enough to have an opinion. Ask for a review while
experience is fresh, and introduce a complementary product in a natural,
non-pushy way.

Content Structure:
  - Subject: Review request — keep it humble and human ("Quick question for you")
  - Preview text: "It only takes 30 seconds" — reduce friction before the click
  - Opening: Reference the product by name — "How are you enjoying [ProductName]?"
  - Review CTA: Make it prominent. Link directly to the review form (Yotpo,
    Okendo, Judge.me, Google, etc.). Set expectations — "It takes less than a
    minute"
  - Social share CTA (optional): Invite them to share on Instagram with your
    hashtag — double-dip for UGC
  - Cross-sell section (below review CTA): "Customers who love [ProductName]
    also love..." — 1-2 complementary products with image, name, and "Shop Now"
    link. This should feel like a natural recommendation, not an ad
  - Loyalty / referral nudge (optional): If you have a referral program, this
    is a good moment — happy customers are most likely to refer

What NOT to do in Step 3:
  - Don't make the review request feel mandatory or entitled
  - Don't lead with the cross-sell — the review ask must come first
  - Don't send this to customers who have already reviewed the product


────────────────────────────────────────────────────────────────────────────────
1.4 BROWSE ABANDONMENT FLOW (2 Steps)
────────────────────────────────────────────────────────────────────────────────

PURPOSE:
Re-engage shoppers who viewed a product page but did not add to cart. Lower
purchase intent than checkout abandonment, so the tone is lighter and the ask
is gentler. Do not confuse browse abandonment with abandoned checkout — they
require different approaches and should never overlap for the same session.

TRIGGER: "Viewed Product" event. Apply a filter: only trigger if the person
has NOT started checkout in the same session. Exclude anyone who placed an order
since the trigger. Only send to subscribed profiles.

---

STEP 1 — Sent 1-4 hours after product view

Emotional Goal: Light curiosity, no pressure. They were interested enough to
look — acknowledge that without making it weird. This email should feel like a
helpful friend saying "Still thinking about it?" not a surveillance system
tracking their every move.

Content Structure:
  - Subject: Casual, friendly, reference the product category or specific item
  - Preview text: A hook about the product — a benefit or a review snippet
  - Opening: Keep it airy — "We noticed you were checking out [ProductName]..."
  - Product block: Image, name, price, brief description (2-3 lines). One
    product only — the one they viewed. If they viewed multiple products in the
    same session, show the last one or the one with highest browse time (use
    Klaviyo's event properties to determine this)
  - One key benefit or differentiator: Not a product page dump — one compelling
    reason this product is worth a second look
  - CTA: "Take Another Look" or "See [ProductName]" — low pressure, curious
  - No discount in Step 1

What NOT to do in Step 1:
  - Don't be creepy — avoid language like "We saw you looking at..." in a
    voyeuristic way. "Still thinking about [ProductName]?" is warmer
  - Don't show every product they ever viewed — show one
  - Don't send if they viewed the product for less than 10 seconds (use Klaviyo
    flow filters to check minimum engagement thresholds if possible)
  - Never send if they've already purchased the item

---

STEP 2 — Sent 48 hours after the product view

Emotional Goal: Address the hesitation. If they haven't bought after the first
nudge, there's a real objection — price, uncertainty about fit, trust. This
email delivers targeted social proof and answers the most common objection for
that product.

Content Structure:
  - Subject: Social proof angle — "Here's what [X] people are saying about
    [ProductName]"
  - Preview text: A compelling customer quote or the aggregate rating
  - Opening: Brief callback — "You've had a couple of days to think about it..."
  - Product block: Same product from Step 1, with image and link
  - Social proof block: 2-3 reviews specific to this product. Include star
    rating, customer name, brief quote. Place ABOVE the fold in Step 2
  - Top objection addressed: Return policy, size guide, ingredients, "Is this
    right for me?" quiz link — whatever is most relevant to this product
  - CTA: "Shop [ProductName]" — more direct than Step 1
  - Optional secondary: "Not sure? Browse similar styles" — gives an exit ramp

What NOT to do in Step 2:
  - Don't repeat Step 1 word for word
  - Don't offer a discount unless your welcome flow or cart abandonment flow
    already establishes that discounts are available — otherwise it devalues
    the product unpredictably
  - Don't send a third browse abandonment email — two is the limit for this
    intent level


────────────────────────────────────────────────────────────────────────────────
1.5 WINBACK FLOW (3 Steps)
────────────────────────────────────────────────────────────────────────────────

PURPOSE:
Re-engage lapsed customers who have not purchased in 90+ days. These are people
who once trusted the brand enough to buy — the goal is to rekindle that
relationship without feeling desperate or pushy. Winback is also important for
deliverability: suppressing chronically unengaged customers protects sender
reputation.

TRIGGER: Time-based. Create a segment: "Placed Order at least once AND last
order was more than 90 days ago AND has not placed an order in the last 90 days."
Refresh this segment daily and trigger the flow on segment entry.

Do NOT run this flow for customers who have been lapsed fewer than 60 days —
it will feel intrusive to people who are still relatively active.

---

STEP 1 — Sent at 90 days since last purchase

Emotional Goal: Soft, warm re-engagement. No judgment, no shame, no desperation.
The brand is simply reaching out to say: we haven't seen you in a while, we
miss you, here's what you might be missing. No discount yet — that's earned in
later steps.

Content Structure:
  - Subject: Warm, personal, low pressure — "Haven't seen you in a while..."
  - Preview text: A gentle hook — brand update or simple "we miss you"
  - Opening: Personal acknowledgment — "It's been a little while since your
    last order. We hope you're well."
  - Reference previous purchase (if data available): "Last time you tried
    [ProductName]..." — this personalizes and reminds them why they bought
  - What's been happening: Brief overview of brand news, new products, or
    improvements since they last visited (keep to 2-3 bullets)
  - Soft CTA: "See What's New" — not "Buy Now" — keep the pressure low
  - No discount yet

What NOT to do in Step 1:
  - Don't be guilt-tripping ("You forgot about us!")
  - Don't use desperation language ("We need you back!")
  - Don't offer a discount in the first touch — it trains customers to stay
    lapsed until they get a discount
  - Don't send to someone who has been lapsed less than 60 days

---

STEP 2 — Sent 15 days later (105 days since last purchase)

Emotional Goal: Novelty and FOMO. Show the customer what they've been missing.
New product launches, reformulations, best-sellers that are newly trending, or
community milestones since they last engaged. Make them feel like they're on the
outside of something worth being a part of.

Content Structure:
  - Subject: "A lot has changed since you were last here" or "New arrivals you
    haven't seen"
  - Preview text: Call out a specific new product or collection name
  - Opening: Acknowledge the gap warmly — transition from Step 1's soft touch
  - New arrivals / updates section: 2-4 products or updates that are genuinely
    new since their last order date. Use Liquid to reference their last order
    date if possible. Include images, names, brief descriptions
  - "What our community has been up to": Aggregate review count growth, a major
    milestone, a press mention, or UGC — social validation of what they've missed
  - CTA: "Explore New Arrivals" or "See What's New"
  - No discount yet — still building the case

What NOT to do in Step 2:
  - Don't show products they've already bought unless you're suggesting a refill
    or upgrade
  - Don't make this feel like a broadcast campaign — maintain the personal voice
  - Don't skip this step and jump straight to the discount

---

STEP 3 — Sent 15 days later (120 days since last purchase)

Emotional Goal: Generous, time-bound re-invitation. This is the make-or-break
email. Acknowledge the gap honestly, make a real offer, set a clear expiry.
If they don't respond after this email, suppress them from winback flows and
move them to a sunset/list-cleaning segment.

Content Structure:
  - Subject: Clear offer + acknowledgment of time passed
  - Preview text: State the discount or offer directly
  - Opening: Honest acknowledgment — "It's been a few months. We don't want to
    keep nudging you, so here's one final reason to come back."
  - Offer block: Largest reasonable offer — percentage discount, free shipping,
    free gift, or combination. Make the code prominent and copyable. Set a real
    expiry (48-72 hours is effective)
  - Why now: One compelling reason to act — new product, seasonal relevance,
    or "we've made improvements you'll notice"
  - CTA: "Come Back — [X]% Off" or "Redeem My Offer"
  - Sunset option: "If you'd rather not hear from us, you can unsubscribe below"
    — this is important for deliverability. Engaged audiences outperform large
    unengaged ones every time

Post-Step 3 action:
  If the customer does not open or click Step 3, add them to a suppression
  segment. Send one final "Are you still interested in our emails?" re-permission
  email before suppressing permanently. This protects deliverability.

What NOT to do in Step 3:
  - Don't make the discount feel like the brand is begging
  - Don't omit the unsubscribe option — suppressing unengaged contacts improves
    your deliverability for everyone else
  - Don't send a fourth winback email — at this point, respect the silence


────────────────────────────────────────────────────────────────────────────────
1.6 SHIPPING CONFIRMATION (Single Email)
────────────────────────────────────────────────────────────────────────────────

PURPOSE:
Inform the customer their order has shipped. This is a high-open-rate email
(often 60-80%) because customers are actively looking for it. Use this moment
to build excitement, reduce support tickets ("where is my order?"), and prime
the customer to have a great unboxing experience.

TRIGGER: "Fulfilled Order" event in Klaviyo, or a custom shipping event pushed
from your fulfillment system. This can also come from Klaviyo's native Shopify
integration when fulfillment status changes.

Note on transactional status: Shipping confirmation has strong transactional
characteristics — the customer needs this information. However, if sent via
Klaviyo flow to a marketing list, it is still technically a marketing email
under CAN-SPAM and GDPR and requires an unsubscribe mechanism. Truly
transactional emails sent via API (not flows) to all customers including
unsubscribed ones must be set to transactional in Klaviyo's API.

Content Structure:
  - Subject: Excitement first, tracking second — "Your [ProductName] is on its
    way!" beats "Order #1234 Shipped"
  - Preview text: Estimated delivery date and a line of excitement
  - Hero section: Big, warm confirmation headline — "It's on its way!"
  - Tracking block: Carrier name, tracking number, tracking link as a button —
    make this the most prominent element. Customers will return to this email
    repeatedly
  - Estimated delivery date: State it clearly. If dynamic, use Liquid to render
    it from shipping event data
  - Items shipped: Loop the Items array — show what's in the package with images
  - Prepare for arrival section: 1-3 tips on what to do when it arrives, how
    to store it, or what to have ready. Makes the customer feel anticipated
  - Contact CTA: "Questions about your shipment? Reply here" — reduce tickets
  - No promotions or cross-sell in this email — it dilutes the utility signal
    and annoys customers who are just looking for tracking

What NOT to do:
  - Don't lead with a cross-sell before the tracking link
  - Don't send without a working tracking link — this is a support ticket factory
  - Don't use robotic language ("Your order has been fulfilled") — use warmth
  - Don't forget to render the estimated delivery date when available


────────────────────────────────────────────────────────────────────────────────
1.7 SUBSCRIPTION WELCOME (Single Email or Short Series)
────────────────────────────────────────────────────────────────────────────────

PURPOSE:
Confirm a subscription purchase, reinforce the decision to subscribe, explain
what the customer can expect, and set them up for long-term success with the
subscription program. Subscription customers have the highest LTV — treat this
onboarding as seriously as the product itself.

TRIGGER: "Placed Order" event filtered for subscription orders, or a custom
event like "Subscription Created" from your subscription platform (Recharge,
Skio, Loop, etc.).

Content Structure:
  - Subject: Confirm and celebrate — "Your subscription is confirmed!" with
    brand warmth
  - Preview text: First shipment date or a benefit statement
  - Hero section: Warm welcome — "Welcome to the [Brand] family" or "You're in."
  - What they're getting: The subscribed product(s) with image, name, quantity,
    and frequency (every 30 days, every 60 days, etc.)
  - How it works section (3 simple steps):
      1. We'll process your payment on [billing date]
      2. Your order ships on [ship date]  
      3. It arrives at your door — sit back and enjoy
  - Billing details: Next billing date, payment method last four digits, total
    per cycle. This prevents chargebacks from confused subscribers
  - Manage your subscription CTA: Link to the subscription management portal.
    Make this prominent — customers who can self-serve cancel less frequently
    and trust the brand more
  - Perks reminder: Discount vs. one-time price, free shipping, exclusive
    subscriber content, skip or pause flexibility — remind them why subscribing
    was the smart choice
  - Contact: "Questions about your subscription? We're here." with reply link

What NOT to do:
  - Don't hide how to manage or cancel the subscription — this causes chargebacks
    and CFPB complaints, which are far more damaging than a cancel
  - Don't use vague billing language — be specific with dates and amounts
  - Don't overwhelm with cross-sell here — they just committed, let them settle in


────────────────────────────────────────────────────────────────────────────────
1.8 SUBSCRIPTION — FAILED PAYMENT & CANCELLATION WINBACK
────────────────────────────────────────────────────────────────────────────────

FAILED PAYMENT EMAIL

PURPOSE:
Recover a subscription that is about to churn due to a payment failure. The
customer is likely not aware there's an issue — approach without judgment and
make the fix as easy as possible.

TRIGGER: "Subscription Payment Failed" custom event from Recharge/Skio/Loop,
or a native integration event. Send up to 3 attempts: immediately, 3 days later,
7 days later. After 3 failures, move to cancellation winback.

Emotional Goal: Non-judgmental, helpful, clear. No shame. Cards expire, banks
flag things, it happens to everyone.

Content Structure:
  - Subject: Clear but not alarming — "Quick heads up about your subscription"
    or "Action needed: payment issue on your account"
  - Preview text: "It's a quick fix — here's how"
  - Opening: Brief, warm, non-accusatory — "Heads up — we had a small hiccup
    processing your recent subscription payment. Totally common, easy to fix."
  - What happened: One sentence — payment could not be processed. Don't
    over-explain or alarm
  - Clear CTA: "Update My Payment Info" — button links directly to the payment
    update page in their subscription portal. This should be the most prominent
    element
  - Urgency without shame: "To keep your subscription active and your next
    order on schedule, please update your payment info by [date]."
  - Reassurance: "Your subscription is still active while we wait. We'll retry
    automatically."
  - Contact: "Need help? Reply to this email" — many payment issues are solved
    by a quick conversation

Timing for retry sequence:
  - Email 1: Immediately after first failure
  - Email 2: 3 days later if still unresolved (slightly more urgent tone)
  - Email 3: 7 days later — "Last chance to keep your subscription" tone, real
    consequence language ("Your subscription will be paused on [date]")

What NOT to do:
  - Don't use shame language ("Your payment failed" as the subject is a bad start)
  - Don't bury the update CTA below the fold
  - Don't threaten account deletion in the first email
  - Don't send more than 3 emails — at that point, move on

---

SUBSCRIPTION CANCELLATION WINBACK

PURPOSE:
Re-engage a customer who has cancelled their subscription. The goal is first to
offer alternatives (pause, skip, downgrade) before accepting the cancellation,
and then — if they do cancel — to make re-subscribing frictionless in the future.

TRIGGER: "Subscription Cancelled" event. This may fire from your subscription
platform (Recharge, etc.) at the moment of cancellation.

STEP 1 — Immediately after cancellation is initiated (if your platform supports
a pre-cancellation hook, use it here — otherwise send immediately post-cancel)

Emotional Goal: Acknowledge without guilt-tripping. Offer a better path before
the door closes.

Content Structure:
  - Subject: "Before you go — have you considered this?" or "A quick question
    about your subscription"
  - Opening: "We received your cancellation request. Before it's finalized,
    we wanted to share a couple of options that might work better."
  - Alternatives section (this is the core of the email):
      - Pause option: "Not ready right now? Pause your subscription for up to
        [X] months — no charge, no commitment."
      - Frequency change: "Getting too much? Switch to every [60/90] days."
      - Product swap: "Want something different? You can swap your product."
      - Discount offer (last resort): A one-time loyalty discount to stay
  - "Still want to cancel?" — Make this easy to find. Do not hide it. Customers
    who cancel easily become the best advocates. Customers who feel trapped
    become the worst.
  - CTA hierarchy: Primary = "Pause Instead", Secondary = "Change Frequency",
    Tertiary = "Cancel Anyway"
  - Contact: "Tell us why you're leaving — your feedback makes us better"

STEP 2 — 30 days after confirmed cancellation

Emotional Goal: Keep the door open. This is not a sales email — it's a
gentle we-haven't-forgotten-you touchpoint.

Content Structure:
  - Subject: "Whenever you're ready, we'll be here"
  - Brief update: One or two new products or improvements since they cancelled
  - Re-subscribe CTA: "Come back anytime — your discount is waiting" if you
    offered one previously, or simply "Restart My Subscription" with easy link
  - No pressure, no countdown, no guilt

What NOT to do for cancellation winback:
  - Never make the cancellation process difficult — this violates consumer
    protection laws in several jurisdictions and destroys brand trust
  - Don't send 5 winback emails after cancellation — 2 is the maximum
  - Don't use guilt: "We worked so hard to make this for you..." is not
    compelling and is off-putting


════════════════════════════════════════════════════════════════════════════════
SECTION 2: LIQUID TEMPLATING BEST PRACTICES
════════════════════════════════════════════════════════════════════════════════

CRITICAL FOUNDATION — KLAVIYO USES DJANGO TEMPLATES, NOT SHOPIFY LIQUID:

Klaviyo's template engine is Django's template engine, NOT standard Shopify
Liquid. This is the #1 source of syntax errors when generating Klaviyo emails.
Django templates look similar to Liquid but have critical differences:

  WRONG (Shopify Liquid):     CORRECT (Klaviyo/Django):
  {% elsif %}             →   {% elif %}
  {% unless %}            →   {% if not %}
  {{ var | default: '' }} →   never use empty string default
  | date: '%b %d' | default →  never chain default after date

If you write Shopify Liquid syntax in a Klaviyo template, it will fail
with "Unknown tag" or "requires 2 arguments" errors.

Liquid-style variable syntax ({{ }}, {% %}) is supported, but the underlying
engine is Django. When in doubt, prefer {% if %}...{% else %}...{% endif %}
over filter chains.

Every variable rendered in an email must be written defensively — assume any
value could be missing or malformed. A single broken tag can cause an email
to render blank or expose raw variable names to the customer.

────────────────────────────────────────────────────────────────────────────────
2.1 ALWAYS USE DEFAULT FILTERS
────────────────────────────────────────────────────────────────────────────────

Every event variable and person property must have a | default: fallback.

CRITICAL — KLAVIYO DEFAULT FILTER RULES:
  1. NEVER use | default: '' (empty string). Klaviyo throws: "The default filter
     requires 2 arguments, but 1 was given." Empty string counts as 1 argument.
  2. NEVER use | default: (nothing after the colon). Same error.
  3. ALWAYS provide a meaningful non-empty fallback string.

CORRECT:
  {{ person.first_name | default: 'there' }}
  {{ event.extra.order_number | default: 'your order' }}
  {{ event.extra.shipping_address.first_name | default: 'Customer' }}
  {{ event.extra.shipping_address.last_name | default: '' }}

WAIT — for address fields where empty output is acceptable (like last name or
apt number), use a conditional instead of default:
  {% if event.extra.shipping_address.last_name %}
    {{ event.extra.shipping_address.last_name }}
  {% endif %}

WRONG (will break in Klaviyo):
  {{ event.extra.order_number | default: '' }}   ← empty string = error
  {{ person.first_name | default: }}             ← no value = error
  {{ event.extra.zip | default: '' }}            ← empty string = error

WRONG (missing default entirely):
  {{ person.first_name }}
  {{ event.extra.order_number }}

CORRECT defaults by type:
  String fields:  | default: 'your order'  (always a meaningful non-empty string)
  Name fields:    | default: 'there'  or  | default: 'Customer'
  Numeric fields: | default: 0
  Price fields:   | default: 0
  URL fields:     | default: 'https://www.yourbrand.com'
  Image URLs:     | default: 'https://cdn.yourbrand.com/fallback-product.jpg'

For URL defaults (never render a broken image or link):
  {{ event.extra.order_status_url | default: 'https://www.yourbrand.com' }}

────────────────────────────────────────────────────────────────────────────────
2.2 SAFE IMAGE RENDERING — ALWAYS PROVIDE FALLBACK
────────────────────────────────────────────────────────────────────────────────

Images without fallbacks will break in emails if the URL is empty.

CORRECT pattern:
  {% if event.ImageURL and event.ImageURL != '' %}
    <img src="{{ event.ImageURL }}" alt="{{ event.ProductName | default: 'Product' }}" 
         width="300" style="display:block; max-width:100%;" />
  {% else %}
    <img src="https://cdn.yourbrand.com/fallback-product.jpg" 
         alt="Your order" width="300" style="display:block; max-width:100%;" />
  {% endif %}

Always include:
  - width attribute (prevents layout collapse in some clients)
  - style="display:block" (prevents phantom whitespace below images)
  - alt text with a default (accessibility + broken image fallback text)

────────────────────────────────────────────────────────────────────────────────
2.3 LOOPING ITEMS ARRAYS — CART AND ORDER LINE ITEMS
────────────────────────────────────────────────────────────────────────────────

For any cart or order with multiple items, you MUST loop the Items array.
Showing only one item when someone bought three is a broken experience.

CRITICAL — SHOPIFY EVENT SCHEMA REALITY:

The Klaviyo Shopify integration stores detailed order data under event.extra, NOT
in event.Items. This is the most common source of broken templates.

  event.Items         → string array of product names ONLY: ["Product A", "Product B"]
                        Cannot be looped for images, prices, or variants.

  event.extra         → full Shopify order object with all detailed data
  event.extra.line_items → array of full line item objects with images and prices

CORRECT loop pattern for Shopify "Placed Order" (use event.extra.line_items):

  {% for line_item in event.extra.line_items %}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td width="80" valign="top">
          {% if line_item.image and line_item.image != '' %}
            <img src="{{ line_item.image }}" alt="{{ line_item.name | default: 'Item' }}" 
                 width="80" style="display:block;" />
          {% else %}
            <img src="https://cdn.yourbrand.com/fallback-product.jpg" 
                 alt="{{ line_item.name | default: 'Item' }}" width="80" style="display:block;" />
          {% endif %}
        </td>
        <td valign="top" style="padding-left:16px;">
          <p style="margin:0; font-weight:bold;">
            {{ line_item.name | default: 'Product' }}
          </p>
          {% if line_item.variant_title and line_item.variant_title != '' %}
            <p style="margin:4px 0; color:#666;">{{ line_item.variant_title }}</p>
          {% endif %}
          <p style="margin:4px 0;">
            Qty: {{ line_item.quantity | default: 1 }}
          </p>
          <p style="margin:4px 0;">
            {{ line_item.price | times: 1 | money }}
          </p>
        </td>
      </tr>
    </table>
  {% endfor %}

Other useful event.extra fields for Shopify Placed Order:
  event.extra.shipping_address.first_name
  event.extra.shipping_address.address1
  event.extra.shipping_address.city
  event.extra.order_number
  event.extra.customer.email
  event.extra.total_price
  event.extra.subtotal_price
  event.extra.total_discounts

ALWAYS inspect the raw event JSON provided in the prompt — use the actual
property paths shown there. Never assume event.Items has sub-properties.

────────────────────────────────────────────────────────────────────────────────
2.4 CONDITIONAL LOGIC FOR SINGLE VS. MULTI-ITEM ORDERS
────────────────────────────────────────────────────────────────────────────────

The copy surrounding the items block should adapt to the count:

  {% assign item_count = event.extra.line_items | size %}
  
  {% if item_count == 1 %}
    <p>Here's the item you ordered:</p>
  {% elif item_count == 2 %}
    <p>Here are the 2 items you ordered:</p>
  {% else %}
    <p>Here are all {{ item_count }} items in your order:</p>
  {% endif %}

Never hardcode "your items" or "your order" without referencing the actual count
when you have it available.

────────────────────────────────────────────────────────────────────────────────
2.5 HANDLING EMPTY ARRAYS GRACEFULLY
────────────────────────────────────────────────────────────────────────────────

Before looping, check that the array is not empty:

  {% if event.extra.line_items and event.extra.line_items != empty %}
    {% for line_item in event.extra.line_items %}
      <!-- render line_item.name, line_item.image, line_item.price, line_item.quantity -->
    {% endfor %}
  {% else %}
    <p>Your order details will appear in your account portal.</p>
  {% endif %}

An empty Items array can occur if the event was malformed or if the integration
failed to include items. Always have a graceful fallback rather than rendering
a blank section.

────────────────────────────────────────────────────────────────────────────────
2.6 CURRENCY AND PRICE FORMATTING
────────────────────────────────────────────────────────────────────────────────

Always use the | money filter for currency. This ensures consistent formatting
and respects the store's currency settings.

  {{ item.Price | times: 1 | money }}
  {{ event.OrderValue | times: 1 | money }}
  {{ event.DiscountAmount | times: 1 | money }}

The | times: 1 coerces the value to a number before applying | money, which
prevents errors if the value comes through as a string.

For percentage discounts (do not use | money):
  {{ event.DiscountPercent }}% off

For order totals with a "Total:" label:
  <strong>Order Total: {{ event.OrderValue | times: 1 | money }}</strong>

Never hardcode a currency symbol — use the | money filter which handles this
automatically for multi-currency stores.

────────────────────────────────────────────────────────────────────────────────
2.7 DATE FORMATTING
────────────────────────────────────────────────────────────────────────────────

Klaviyo supports the | date filter with strftime format strings.

Convert Unix timestamps to readable dates:
  {{ event.CreatedAt | date: '%B %d, %Y' }}
  → "January 15, 2025"

  {{ event.ShipDate | date: '%A, %B %d' }}
  → "Wednesday, January 15"

  {{ event.NextBillingDate | date: '%b %d, %Y' }}
  → "Jan 15, 2025"

Current date in email:
  {{ 'now' | date: '%B %d, %Y' }}

Estimated delivery (if you have a delivery timestamp):
  {{ event.EstimatedDeliveryDate | date: '%A, %B %d' }}

CRITICAL — NEVER chain | default: after | date:
  WRONG: {{ event.extra.processed_at | date: '%b %d' | default: 'Today' }}
  WHY: Klaviyo's | date filter returns an empty string '' when the value is nil.
       | default: then receives '' as input — Klaviyo treats '' as a provided
       value and throws "The default filter requires 2 arguments, but 1 was given".

  CORRECT — use a conditional instead:
  {% if event.extra.processed_at %}{{ event.extra.processed_at | date: '%b %d' }}{% else %}Today{% endif %}

  This rule applies to ALL chained filters that could return empty string:
  Never: | date: '...' | default: '...'
  Never: | upcase | default: '...'
  Never: | strip | default: '...'
  Always use {% if %}...{% else %}...{% endif %} when a date or transformed
  value needs a fallback.

────────────────────────────────────────────────────────────────────────────────
2.8 CHARACTER LIMITS — SUBJECT LINES AND PREVIEW TEXT
────────────────────────────────────────────────────────────────────────────────

Subject Lines:
  - Hard limit for most email clients: 60 characters
  - Mobile display limit (most common): 40-50 characters
  - Aim for 30-50 characters for optimal display across devices
  - Count characters including personalization: "{{ person.first_name | default:
    'there' }}, your cart is waiting" is ~36 chars with a short name but could
    be 50+ with a long name — plan for the longest plausible value
  - Front-load the key message: most important word within first 30 characters

Preview Text:
  - Optimal length: 85-100 characters
  - Many clients show 75-100 characters before truncating
  - If preview text is not set, Gmail and other clients pull the first visible
    text from the email body, which is usually a nav link or "View in browser"
  - Always set preview text explicitly using Klaviyo's subject/preview field or
    via a hidden preheader div in the HTML:
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
      Your preview text here, padded to avoid body text bleed through
      &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
    </div>
  - The zero-width non-joiners (&zwnj;) at the end prevent email clients from
    pulling body copy into the preview slot after the preheader text

Liquid variables in subject lines:
  {{ person.first_name | default: 'there' | truncate: 20, '' }}
  Use truncate as a safety valve on any personalization token in subject lines
  to prevent extremely long names from breaking the subject line display.

────────────────────────────────────────────────────────────────────────────────
2.9 ADDITIONAL LIQUID PATTERNS
────────────────────────────────────────────────────────────────────────────────

Capitalize first name:
  {{ person.first_name | default: 'there' | capitalize }}

Truncate long product names:
  {{ item.Name | default: 'Your item' | truncate: 50, '...' }}

Uppercase for coupon codes:
  {{ event.CouponCode | default: 'SAVE10' | upcase }}

URL encoding for dynamic links:
  {{ event.ProductURL | url_encode }}

Strip HTML from descriptions (if product descriptions contain tags):
  {{ item.Description | strip_html | truncate: 120, '...' }}

Conditional block based on person property:
  {% if person.city and person.city != '' %}
    Shipping to {{ person.city }}
  {% endif %}

Assign a variable for reuse:
  {% assign discount_pct = event.DiscountAmount | divided_by: event.OrderValue 
     | times: 100 | round %}
  You saved {{ discount_pct }}%!


════════════════════════════════════════════════════════════════════════════════
SECTION 3: SUBJECT LINE FORMULAS BY FLOW TYPE
════════════════════════════════════════════════════════════════════════════════

Subject lines are the single highest-leverage element in email performance.
A 5% improvement in open rate compounds across every subsequent metric.
Use these formulas as starting points and A/B test consistently.

────────────────────────────────────────────────────────────────────────────────
3.1 ABANDONED CHECKOUT SUBJECT LINE FORMULAS
────────────────────────────────────────────────────────────────────────────────

Step 1 (1 hour — gentle, curious):
  1. "You left something behind"
  2. "Your [ProductName] is waiting"
  3. "[FirstName], forget something?"
  4. "Still thinking it over?"
  5. "Your cart is saved — take your time"

Step 2 (24 hours — social proof, validation):
  1. "Here's what [X,000] customers say about [ProductName]"
  2. "[ProductName]: here's why people love it"
  3. "Still on the fence? Read this."
  4. "The #1 question about [ProductName] — answered"
  5. "Real talk: is [ProductName] right for you?"

Step 3 (72 hours — offer or last chance):
  1. "Last chance: your cart expires soon"
  2. "A little something to help you decide — [X]% off"
  3. "[FirstName], here's [X]% off your order"
  4. "Your cart + a surprise inside"
  5. "We'll make it easy: [X]% off, expires [day]"

────────────────────────────────────────────────────────────────────────────────
3.2 WELCOME SERIES SUBJECT LINE FORMULAS
────────────────────────────────────────────────────────────────────────────────

Step 1 (immediate — deliver the promise):
  1. "Welcome! Here's your [X]% off"
  2. "Your discount code is inside, [FirstName]"
  3. "You're in — here's what happens next"
  4. "Welcome to [Brand]. Here's your gift."
  5. "[FirstName], welcome — let's get started"

Step 2 (2 days — product education):
  1. "Here's what makes [ProductName] different"
  2. "How [ProductName] actually works"
  3. "The [ingredient/feature] everyone asks about"
  4. "Inside: everything you should know about [ProductName]"
  5. "Most people don't know this about [ProductName]"

Step 3 (4 days — social proof):
  1. "Don't take our word for it"
  2. "[X,000] five-star reviews — here's what people are saying"
  3. "Real results from real customers"
  4. "What happened after [X] days with [ProductName]"
  5. "The reviews are in. You'll want to read these."

Step 4 (7 days — bestsellers/cross-sell):
  1. "Our bestsellers — in case you missed them"
  2. "Products our customers can't live without"
  3. "New to [Brand]? Start here."
  4. "The [Brand] lineup — your cheat sheet"
  5. "What else we make (you might be surprised)"

Step 5 (14 days — conversion push):
  1. "Your [X]% off offer expires soon, [FirstName]"
  2. "Last chance to save [X]% on your first order"
  3. "[FirstName], this is our best offer — it expires [day]"
  4. "We saved the best for last: [X]% off, today only"
  5. "One final invitation — [X]% off inside"

────────────────────────────────────────────────────────────────────────────────
3.3 POST-PURCHASE SUBJECT LINE FORMULAS
────────────────────────────────────────────────────────────────────────────────

Step 1 (immediate — order confirmation):
  1. "You're going to love this. Order confirmed!"
  2. "It's official — your [ProductName] is on its way"
  3. "Order confirmed! Here's what happens next."
  4. "[FirstName], your order is in. Great choice."
  5. "We got your order! Let's celebrate."

Step 2 (after delivery — usage tips):
  1. "Get the most out of your [ProductName]"
  2. "Your [ProductName] is here — read this first"
  3. "[FirstName], a few tips from us"
  4. "The right way to use [ProductName] (most people skip step 2)"
  5. "How to get [specific result] with your [ProductName]"

Step 3 (14-21 days — review request + cross-sell):
  1. "Quick question about your [ProductName]"
  2. "How's your [ProductName] treating you?"
  3. "[FirstName], we'd love your honest opinion"
  4. "Share your experience — takes 30 seconds"
  5. "Love your [ProductName]? Tell the world."

────────────────────────────────────────────────────────────────────────────────
3.4 BROWSE ABANDONMENT SUBJECT LINE FORMULAS
────────────────────────────────────────────────────────────────────────────────

Step 1 (1-4 hours — light and casual):
  1. "Still thinking about [ProductName]?"
  2. "Spotted: [ProductName] — take another look"
  3. "You were curious about [ProductCategory]..."
  4. "[ProductName] is still available"
  5. "Don't lose track of this one"

Step 2 (48 hours — social proof):
  1. "Here's what people say about [ProductName]"
  2. "[X] reviews for [ProductName] — worth reading"
  3. "Is [ProductName] right for you? Real customers weigh in."
  4. "The verdict on [ProductName]"
  5. "Still on your mind? Here's why people love it."

────────────────────────────────────────────────────────────────────────────────
3.5 WINBACK SUBJECT LINE FORMULAS
────────────────────────────────────────────────────────────────────────────────

Step 1 (90 days — soft re-engagement):
  1. "It's been a while, [FirstName]"
  2. "We miss you — here's what you've missed"
  3. "Haven't seen you in a while..."
  4. "[FirstName], we were thinking about you"
  5. "Checking in — it's been [X] months"

Step 2 (105 days — what's new):
  1. "A lot has changed since your last order"
  2. "New arrivals we think you'll love, [FirstName]"
  3. "Since you've been gone — new from [Brand]"
  4. "You haven't seen these yet"
  5. "What's new at [Brand] this season"

Step 3 (120 days — final offer):
  1. "Come back — [X]% off, just for you"
  2. "[FirstName], one last thing before we say goodbye"
  3. "We'll make it worth your while: [X]% off"
  4. "Your welcome-back offer expires [day]"
  5. "We'd love to have you back. Here's [X]% off."

────────────────────────────────────────────────────────────────────────────────
3.6 SHIPPING CONFIRMATION SUBJECT LINE FORMULAS
────────────────────────────────────────────────────────────────────────────────

  1. "Your [ProductName] is on its way!"
  2. "It's shipped! Track your [ProductName]"
  3. "[FirstName], your order is heading your way"
  4. "Good news — your order is en route"
  5. "Your package is in transit — track it here"

────────────────────────────────────────────────────────────────────────────────
3.7 SUBSCRIPTION FLOWS SUBJECT LINE FORMULAS
────────────────────────────────────────────────────────────────────────────────

Subscription Welcome:
  1. "Your subscription is confirmed — here's what's next"
  2. "Welcome to [Plan Name] — you're all set"
  3. "Subscription confirmed! Here's your member guide."
  4. "[FirstName], you're officially a [Brand] member"
  5. "You're in! Your first shipment details inside."

Failed Payment:
  1. "Quick heads up about your [Brand] subscription"
  2. "Action needed: update your payment to keep [ProductName] coming"
  3. "Payment issue — easy fix inside"
  4. "Don't let your subscription lapse — 1 minute to fix"
  5. "Your [Brand] subscription needs attention"

Cancellation Winback:
  1. "Before you go — a couple of options"
  2. "We don't want to lose you, [FirstName]"
  3. "Your subscription: one thing to consider first"
  4. "Have you considered pausing instead?"
  5. "Whenever you're ready, we'll be here"


════════════════════════════════════════════════════════════════════════════════
SECTION 4: PREVIEW TEXT BEST PRACTICES
════════════════════════════════════════════════════════════════════════════════

────────────────────────────────────────────────────────────────────────────────
4.1 THE CARDINAL RULE
────────────────────────────────────────────────────────────────────────────────

ALWAYS write preview text. Never allow it to default to the first line of the
email body. In most email clients (Gmail, Apple Mail, Outlook), the preview text
appears next to or below the subject line in the inbox view. If it is not set,
the client pulls from the first visible text in the email body — which is almost
always navigation links, "View in browser," or boilerplate copy. This wastes
premium inbox real estate.

────────────────────────────────────────────────────────────────────────────────
4.2 THE TWO-PART HOOK
────────────────────────────────────────────────────────────────────────────────

The subject line and preview text are a team. They work together as a two-part
headline to earn the open. The preview text should not repeat the subject line —
it should extend it, add context, or create additional curiosity.

WRONG (repetition):
  Subject: "Your cart is waiting"
  Preview: "You have items in your cart waiting for you"

CORRECT (extension):
  Subject: "Your cart is waiting"
  Preview: "Your [ProductName] is still available — but we can't hold it forever"

WRONG (mismatched tone):
  Subject: "Quick question about your order"
  Preview: "BIG SALE 40% OFF THIS WEEKEND ONLY"

CORRECT (tonal consistency):
  Subject: "Quick question about your order"
  Preview: "It only takes 30 seconds — and it really helps us"

────────────────────────────────────────────────────────────────────────────────
4.3 OPTIMAL LENGTH AND TECHNICAL NOTES
────────────────────────────────────────────────────────────────────────────────

Target length: 85-100 characters. This is the sweet spot before most clients
truncate. Some clients show as few as 35 characters on mobile — front-load
the key message.

Never write preview text that ends in the middle of a sentence, as some clients
will append body copy. Instead, pad the end of the preview text with invisible
characters to prevent bleed-through:

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    {{ preheader_text }}
    &#847; &zwnj; &#847; &zwnj; &#847; &zwnj; &#847; &zwnj; &#847; &zwnj;
    &#847; &zwnj; &#847; &zwnj; &#847; &zwnj; &#847; &zwnj; &#847; &zwnj;
  </div>

────────────────────────────────────────────────────────────────────────────────
4.4 PREVIEW TEXT FORMULAS BY FLOW
────────────────────────────────────────────────────────────────────────────────

Abandoned Checkout Step 1:
  "Your [ProductName] is saved and ready — pick up where you left off"
  "[ProductName] is still in your cart. Complete checkout in 60 seconds."

Abandoned Checkout Step 2:
  "See why [X,000] customers give [ProductName] 5 stars — then decide"
  "Real reviews + your top questions answered inside"

Abandoned Checkout Step 3:
  "Use [CODE] at checkout — expires [day]. This is our only offer."
  "[X]% off your cart. Code inside. Offer ends [date]."

Welcome Step 1:
  "Your [X]% off code: [CODE] — use it on anything sitewide"
  "Code: [DISCOUNT]. Shop anytime — no minimum order required."

Post-Purchase Step 2:
  "The 3 things most [ProductName] owners wish they knew on day one"
  "How to get the best results — a quick read from our team"

Post-Purchase Step 3:
  "It takes less than a minute and means a lot to us"
  "Tell us what you think — and see what pairs well with [ProductName]"

Shipping Confirmation:
  "Arriving [day, date] — track your package with one click"
  "Your tracking number and what to expect when it arrives"


════════════════════════════════════════════════════════════════════════════════
SECTION 5: DELIVERABILITY RULES FOR TRANSACTIONAL FLOWS
════════════════════════════════════════════════════════════════════════════════

────────────────────────────────────────────────────────────────────────────────
5.1 TRANSACTIONAL VS. MARKETING — LEGAL AND TECHNICAL DISTINCTION
────────────────────────────────────────────────────────────────────────────────

In Klaviyo, emails can be classified as:
  - Transactional: Sent via the Klaviyo API with the "is_transactional: true"
    flag. These bypass Klaviyo marketing consent and can be sent to all contacts
    including those who have unsubscribed from marketing emails.
  - Marketing: All emails sent via Klaviyo flows and campaigns. These require
    consent and must include an unsubscribe mechanism.

Legal transactional emails (CAN-SPAM / GDPR compliant):
  - Order confirmation (the customer took an action, the email confirms it)
  - Shipping confirmation / tracking update
  - Failed payment notification
  - Password reset
  - Account-related alerts

Marketing emails that are flow-triggered (still require unsubscribe):
  - Abandoned checkout flow
  - Browse abandonment flow
  - Welcome series
  - Winback flow
  - Post-purchase cross-sell emails (the usage tips and review request step)
  - Subscription welcome series

IMPORTANT: Even if an email "feels transactional" (e.g., post-purchase usage
tips), if it contains marketing content or is sent only to opted-in customers
via a Klaviyo flow, it is legally a marketing email and requires an unsubscribe
link. Only use the transactional API flag for emails that are purely informational
about a transaction the customer initiated.

────────────────────────────────────────────────────────────────────────────────
5.2 DEDICATED SENDING DOMAIN / SUBDOMAIN
────────────────────────────────────────────────────────────────────────────────

Always send from a branded subdomain, not the root domain:
  - Use: mail.yourbrand.com, send.yourbrand.com, or hello.yourbrand.com
  - Do NOT use: yourbrand.com (root domain reputation is too important to risk)
  - Never use a shared sending domain from the ESP — always use a custom domain

Transactional emails (order confirmation, shipping, failed payment) should be
sent from a separate subdomain from marketing emails if possible:
  - Marketing: email.yourbrand.com
  - Transactional: notify.yourbrand.com or orders.yourbrand.com

This isolates your transactional reputation from marketing reputation.

DNS requirements:
  - SPF record on the sending subdomain
  - DKIM keys (Klaviyo provides these — must be added to DNS)
  - DMARC policy on the root domain (minimum "none" policy, ideally "quarantine"
    or "reject" once reputation is established)

────────────────────────────────────────────────────────────────────────────────
5.3 SUPPRESSION LIST BEST PRACTICES
────────────────────────────────────────────────────────────────────────────────

Global suppressions:
  - Anyone who hard bounces must be suppressed immediately (Klaviyo does this
    automatically — do not remove hard bounces from suppression)
  - Anyone who marks an email as spam must be suppressed immediately
  - Anyone who unsubscribes must be suppressed from all marketing flows

Proactive suppression (deliverability protection):
  - Create a segment: "Has not opened or clicked in the last 90 days AND has
    received at least 5 emails" — suppress from high-volume campaigns before
    running a re-engagement flow
  - Run sunset flows for unengaged contacts before suppressing permanently
  - Suppress winback contacts who do not respond after 3 emails

Suppression ≠ deletion:
  - Suppressed contacts remain in Klaviyo and can be used for reporting and
    audience matching (Facebook, Google)
  - Suppressing a contact prevents email sends but retains the profile data
  - Deletion should only occur for GDPR data erasure requests

Never import suppressed contacts back into active lists without explicit
re-permission. This is a CAN-SPAM / GDPR violation.

────────────────────────────────────────────────────────────────────────────────
5.4 LIST HYGIENE FOR FLOW PERFORMANCE
────────────────────────────────────────────────────────────────────────────────

Sending to unengaged lists hurts deliverability for all subscribers. Maintain:
  - Regular bounce handling: review soft bounce rates. Three or more consecutive
    soft bounces should trigger suppression
  - Engagement scoring: segment by open/click recency. Protect sender reputation
    by reducing send frequency to 60-90 day unengaged segments
  - Domain-level blocking: monitor if specific email domains (e.g., yahoo.com,
    outlook.com) show elevated bounce rates — this may indicate a domain-level
    block and requires immediate investigation
  - Spam complaint rate: keep below 0.1% (Google's threshold). Above 0.3% risks
    domain blocking from Gmail

────────────────────────────────────────────────────────────────────────────────
5.5 FLOW SEND SETTINGS IN KLAVIYO
────────────────────────────────────────────────────────────────────────────────

Smart Sending:
  - Enable Smart Sending on all marketing flows. This prevents a customer from
    receiving more than one marketing email in a 16-hour window (configurable)
  - Smart Sending does NOT apply to transactional emails sent via API
  - Smart Sending can cause steps to be skipped if a customer receives another
    email in the window — account for this in flow design

Time-of-day sending:
  - For behavior-triggered flows (abandoned checkout, browse abandonment),
    send immediately — the trigger is time-sensitive
  - For nurture steps (welcome series step 2+, winback), restrict sends to
    business hours in the customer's time zone when possible (10am-7pm)
  - Klaviyo allows timezone-based scheduling at the step level

Flow filters vs. trigger filters:
  - Trigger filter: Applied at the moment of trigger — determines who enters
    the flow. Example: "Has not placed order in the last 90 days"
  - Flow filter: Applied at each step send time — can remove someone from the
    flow if their state changes. Example: "Has not placed order since trigger"
  - ALWAYS add a flow filter on abandoned checkout: "Has not placed order
    since started checkout" to prevent sending after the customer has purchased


════════════════════════════════════════════════════════════════════════════════
SECTION 6: DESIGN PRINCIPLES FOR FLOW EMAILS
════════════════════════════════════════════════════════════════════════════════

────────────────────────────────────────────────────────────────────────────────
6.1 FLOW EMAILS VS. PROMOTIONAL CAMPAIGNS — THE KEY DIFFERENCE
────────────────────────────────────────────────────────────────────────────────

Flow/transactional emails should feel more personal and less "produced" than
broadcast campaigns. A customer receiving an abandoned checkout email should
feel like the brand noticed them specifically — not like they received a campaign
blast. This means:
  - Less design complexity: fewer decorative elements, more whitespace
  - Conversational copy: shorter paragraphs, contractions, first-person voice
  - Personal sending address: "hello@brand.com" or "yourname@brand.com" over
    "noreply@brand.com"
  - Occasionally: plain-text or minimal-HTML format for winback and re-engagement
    emails — these outperform heavily designed emails for re-engagement because
    they feel like a genuine personal reach-out

Broadcast campaigns can be more elaborate (hero images, promotional banners,
multiple product grids). Flows should be more direct and relationship-oriented.

────────────────────────────────────────────────────────────────────────────────
6.2 LAYOUT — SINGLE COLUMN ALWAYS PREFERRED
────────────────────────────────────────────────────────────────────────────────

For all flow emails:
  - Single column layout (600px max-width container, centered)
  - No multi-column sidebar layouts — these break on mobile and reduce focus
  - Exception: a 2-column product grid is acceptable for bestseller showcases
    in welcome step 4 and winback step 2, but keep it to 2 columns maximum

Container sizing:
  - Email max-width: 600px
  - Padding: 24-32px on each side within the container
  - Header/footer: full-width background, content constrained to 600px

────────────────────────────────────────────────────────────────────────────────
6.3 PRODUCT IMAGERY — NON-NEGOTIABLE FOR CART AND BROWSE FLOWS
────────────────────────────────────────────────────────────────────────────────

CRITICAL — TWO PRODUCT SECTIONS REQUIRE COMPLETELY DIFFERENT DATA SOURCES:

Flow emails commonly have two distinct product sections. These are NOT the same
thing and must NEVER use the same data source:

  SECTION 1 — THE TRIGGER PRODUCT (hero/main product block)
  This is the specific product the customer abandoned or viewed.
  Data source: event properties from the trigger event.
  For browse abandonment: {% catalog_lookup event.item_id as p %}
  For abandoned checkout: {% for item in event.extra.line_items %}
  This section shows THE SPECIFIC ITEM that triggered the flow.

  SECTION 2 — PRODUCT RECOMMENDATIONS (grid below the hero)
  This is a separate set of DIFFERENT products — recommendations, recently
  viewed, best sellers, or related items. NOT the same product repeated.
  Data source: Klaviyo product feed.
  {% for item in feeds.FeedName|slice:6 %}
    {% catalog_lookup item.item_id as catalog_item %}
  {% endfor %}
  This section shows DIFFERENT products from a feed, personalized per recipient.

NEVER:
  - Put the same trigger product in both sections
  - Repeat event.item_id or event.extra.line_items data in the recommendation grid
  - Hardcode product images, names, or prices in the recommendation section
  - Use event properties to populate the recommendation grid

ALWAYS:
  - Use event data ONLY for the hero/trigger product section
  - Use feeds.FeedName for ALL recommendation/grid sections below the hero
  - If no product feed is available, omit the recommendation section entirely
    rather than repeating the hero product in a grid

In abandoned checkout and browse abandonment emails, product images are
critical — they trigger the visual memory of the purchase intent.

Requirements:
  - Always render the actual product image from the event data (ImageURL)
  - Always have a fallback image (see Section 2.2)
  - Image should be large enough to be recognizable on mobile: minimum 240px
    wide, ideally 300-360px for single product, 140-160px for side-by-side
  - Use white or light background product images (not lifestyle images) for
    cart displays — clarity over aesthetics in this context
  - Always include alt text: {{ item.Name | default: 'Your item' }}

────────────────────────────────────────────────────────────────────────────────
6.4 SOCIAL PROOF PLACEMENT BY FLOW STEP
────────────────────────────────────────────────────────────────────────────────

The placement of social proof should shift across the sequence:

Step 1 of any flow: Social proof is secondary. The primary job is the hook
  (show the cart, deliver the discount, confirm the order). If social proof
  appears in Step 1, place it below the CTA — after the fold on desktop.
  Never lead with social proof when the primary action is more urgent.

Step 2 onward: Social proof moves above the fold. By Step 2, the customer
  knows what you're asking — now you need to answer "why?" Place reviews,
  star ratings, and testimonials near the top of the email body, ideally
  directly below the opening line, before the CTA.

Winback and browse abandonment: Social proof is the primary persuasion tool.
  Design these emails around the social proof block — it is the hero, not
  a supporting element.

What makes effective social proof in email:
  - Specific outcomes over vague praise: "I lost 8 pounds in 6 weeks" beats
    "Great product!"
  - Real customer names and photos (with permission) increase credibility
  - Aggregate numbers ("4.8 stars from 3,200 reviews") establish scale
  - Recent dates matter — "Reviewed last week" beats "Verified customer"

────────────────────────────────────────────────────────────────────────────────
6.5 CTA HIERARCHY — ONE PRIMARY, ONE OPTIONAL SECONDARY
────────────────────────────────────────────────────────────────────────────────

Every flow email should have exactly one primary CTA. This is the most visually
prominent button in the email and represents the single most important action
you want the recipient to take.

Rules:
  - One primary CTA button per email (full-width or centered, high contrast)
  - One optional secondary CTA (text link, lower visual weight, below primary)
  - Never have two buttons of equal visual weight — creates decision paralysis
  - Primary button should appear above the fold (within the first scroll on
    mobile — approximately within the first 400px of email content)
  - Button text should be action-oriented: verbs first
    GOOD: "Complete My Order", "Claim My Discount", "Track My Package"
    BAD: "Click Here", "Submit", "Confirm"
  - Button color should meet WCAG AA contrast against its background

CTA by flow:
  - Abandoned checkout: "Return to Cart" or "Complete My Order"
  - Welcome series: "Shop Now" / "Explore [Brand]"
  - Post-purchase step 1: "Track My Order"
  - Post-purchase step 2: "See Tips" or "Read Our Guide"
  - Post-purchase step 3: "Leave a Review"
  - Browse abandonment: "Take Another Look" (step 1), "Shop [ProductName]" (step 2)
  - Winback: "See What's New" (step 1, 2), "Claim My Offer" (step 3)
  - Shipping confirmation: "Track My Package"

────────────────────────────────────────────────────────────────────────────────
6.6 MOBILE-FIRST DESIGN
────────────────────────────────────────────────────────────────────────────────

95%+ of transactional and flow emails are opened on mobile first. Design for
mobile and verify on desktop — not the other way around.

Mobile requirements:
  - All text: minimum 16px body, 14px secondary/captions. Nothing below 14px.
  - Buttons: minimum 44px tall (Apple's recommended tap target), full-width or
    at least 200px wide
  - Images: width="100%" with max-width set — never fixed pixel widths that
    overflow mobile screens
  - Touch targets: all links should have adequate padding (12px+) — fingers
    are less precise than cursors
  - Line length: 300-480px on mobile. The 600px desktop column collapses to
    device width — verify text is readable at narrow widths

HTML email mobile media query pattern:
  @media only screen and (max-width: 600px) {
    .email-container { width: 100% !important; }
    .email-content { padding: 16px !important; }
    .product-image { width: 100% !important; height: auto !important; }
    .cta-button { width: 100% !important; text-align: center !important; }
    td[class="mobile-hide"] { display: none !important; }
  }

Testing checklist:
  - iPhone (Safari Mail) — most common email client globally
  - Gmail (iOS and Android)
  - Gmail web (desktop)
  - Outlook desktop (most restrictive — avoid CSS grid, flex, advanced CSS)
  - Dark mode rendering — check that images with transparent backgrounds
    do not become invisible in dark mode (use opaque backgrounds)


────────────────────────────────────────────────────────────────────────────────
6.7 CIRCLES, ICONS, AND GRAPHIC ELEMENTS
────────────────────────────────────────────────────────────────────────────────

CIRCLES ARE THE #1 CSS RENDERING BUG IN EMAIL:

A circle requires IDENTICAL width and height. border-radius:50% on an element
where width ≠ height produces an oval, not a circle. This is extremely common
and looks immediately broken.

CORRECT circle pattern in email (always use a fixed-size <td>):
  <td width="40" height="40" align="center" valign="middle"
      style="width:40px;height:40px;border-radius:50%;background-color:#000;">
    <svg ...>...</svg>
  </td>

NEVER use width:100% with border-radius:50% — oval result guaranteed.

CRITICAL — THE WRAPPER TABLE MUST ALSO HAVE AN EXPLICIT WIDTH:

Email clients and preview environments may inject CSS that stretches tables without
explicit width attributes to 100% of their parent container. If the table wrapping
your circle td has NO explicit width attribute, the circle td inside expands to fill
that stretched table — turning your 32x32px circle into a 120x32px oval.

WRONG (no width on wrapper table — gets stretched by email clients):
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr>
      <td width="32" height="32" style="width:32px;height:32px;border-radius:50%;">...</td>
    </tr>
  </table>

CORRECT (explicit width on wrapper table — immune to stretching):
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="32" style="width:32px;margin:0 auto;">
    <tr>
      <td width="32" height="32" style="width:32px;height:32px;border-radius:50%;">...</td>
    </tr>
  </table>

This applies to EVERY table that wraps a circular element. The width attribute
on the table AND the td AND the inline style must ALL be set to the same value.
Three matching values. No exceptions.

PROGRESS STEP INDICATORS (e.g. Order Placed → Shipping → Delivery):
  Each step circle must be wrapped in its own table with explicit width="32"
  (or whatever your circle diameter is). Without this, the circle stretches.
  Each step circle: exactly 32×32px or 40×40px — never auto width.

EXACT SVG for filled circle with checkmark (use this pattern verbatim):
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="16" fill="#1a1a1a"/>
    <polyline points="9,16 14,21 23,11" stroke="#ffffff" stroke-width="2.5"
              fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>

EXACT SVG for empty circle (inactive step):
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="15" fill="none" stroke="#cccccc" stroke-width="1.5"/>
  </svg>

NEVER use emoji for icons. NEVER use external icon font URLs. ALWAYS use inline SVG.


════════════════════════════════════════════════════════════════════════════════
SECTION 7: COMMON MISTAKES — NEVER MAKE THESE
════════════════════════════════════════════════════════════════════════════════

These are the most common, most costly mistakes in Klaviyo flow email creation.
Each one either damages deliverability, revenue, or customer relationships.
Read them and do not repeat them.

────────────────────────────────────────────────────────────────────────────────
7.1 DISCOUNTING TOO EARLY IN ABANDONED CHECKOUT
────────────────────────────────────────────────────────────────────────────────

MISTAKE: Offering a discount in Step 1 (1-hour email) of the abandoned checkout
flow.

WHY IT'S DAMAGING: Customers learn the pattern. If they see a discount every
time they abandon a cart, they will deliberately abandon carts to receive the
discount. This trains your most price-sensitive customers to never pay full
price, erodes margin permanently, and inflates your "cart abandonment" rate
artificially because you've incentivized it.

THE RULE: No discount before Step 3. Step 1 and Step 2 should recover revenue
on the strength of reminder, product imagery, and social proof. Only introduce
a discount in Step 3 if margins support it, and only with a genuine expiry.

────────────────────────────────────────────────────────────────────────────────
7.2 MISSING DEFAULT VALUES ON LIQUID VARIABLES
────────────────────────────────────────────────────────────────────────────────

MISTAKE: Writing {{ person.first_name }} or {{ event.ItemName }} without a
default filter.

WHY IT'S DAMAGING: If the property doesn't exist on a given profile or event,
Klaviyo renders nothing — leaving broken grammar like "Hi , your just arrived"
or blank blocks where product information should be. This makes the brand look
technically incompetent and erodes trust.

THE RULE: Every. Single. Variable. Must. Have. A. Default. No exceptions.
  {{ person.first_name | default: 'there' }}
  {{ event.ItemName | default: 'your item' }}
  {{ event.ImageURL | default: 'https://cdn.yourbrand.com/fallback.jpg' }}

────────────────────────────────────────────────────────────────────────────────
7.3 FAILING TO LOOP THE ITEMS ARRAY
────────────────────────────────────────────────────────────────────────────────

MISTAKE: Referencing event.Items[0] or event.Items.first to show product
information, rather than looping the full Items array.

WHY IT'S DAMAGING: A customer who ordered three products sees only one. This
is disorienting, makes the order confirmation feel incorrect, and can generate
support tickets ("Why does my email only show one item?"). It also undermines
the cart abandonment email — showing one product when three were in the cart
reduces the re-engagement value of the visual memory trigger.

THE RULE: Always loop with {% for item in event.Items %} and handle empty
array cases with a conditional check before the loop.

────────────────────────────────────────────────────────────────────────────────
7.4 HARDCODING PRICES, NAMES, OR PRODUCT DETAILS
────────────────────────────────────────────────────────────────────────────────

MISTAKE: Writing "Your Hydrating Serum ($48.00) is waiting for you" with static
values in the email template.

WHY IT'S DAMAGING: When prices change, product names are updated, or the
customer abandoned a different product, the hardcoded values are wrong. This
is embarrassing at best and misleading at worst. It also means the template
is not reusable across different products.

THE RULE: Every price, product name, image URL, and product-specific detail
must come from event properties or person properties via Liquid. Never hardcode
specific product data.

────────────────────────────────────────────────────────────────────────────────
7.5 USING THE SAME SUBJECT LINE FORMULA FOR EVERY STEP
────────────────────────────────────────────────────────────────────────────────

MISTAKE: Writing three abandoned checkout emails all with "Your cart is waiting"
variations.

WHY IT'S DAMAGING: Customers who open Step 1 and do not convert will feel like
they're getting the same email twice in Step 2 and again in Step 3. This trains
them to ignore the sequence and reduces effectiveness dramatically. Different
steps have different emotional goals — the subject lines must reflect that.

THE RULE: Each step in a sequence must have a distinctly different subject line
formula. Step 1 = curiosity, Step 2 = validation, Step 3 = urgency/offer. Never
repeat the same formula within a single flow sequence.

────────────────────────────────────────────────────────────────────────────────
7.6 TRIGGERING WINBACK TOO EARLY
────────────────────────────────────────────────────────────────────────────────

MISTAKE: Sending winback emails to customers who purchased 30 or 45 days ago.

WHY IT'S DAMAGING: A customer who bought 30 days ago is not lapsed — they are
a recent purchaser. Sending them a "We miss you" email when they just bought is
at best confusing and at worst insulting. It also burns goodwill by implying
they're not a valued customer when they've literally just given you money.

THE RULE: Winback flows should only trigger at 90+ days since last purchase.
60 days is the absolute minimum — and even that is aggressive for most product
categories. For subscription products, coordinate winback timing with the
expected purchase cycle.

────────────────────────────────────────────────────────────────────────────────
7.7 NOT PERSONALIZING WITH FIRST NAME WHEN AVAILABLE
────────────────────────────────────────────────────────────────────────────────

MISTAKE: Writing "Hello!" or "Hi there!" when you have the customer's first
name in Klaviyo.

WHY IT'S DAMAGING: Personalization demonstrably increases open rates and
engagement. First-name personalization in email feels human — its absence in
a flow email (where you definitely have the profile data) feels cold and
automated. The first name should appear in the subject line or opening line of
every flow email where you have it.

THE RULE: Always use {{ person.first_name | default: 'there' }} in the opening
line. Use it in subject lines where it fits naturally (2-3 steps per flow at
most — over-personalization also feels strange). Always have a sensible default.

────────────────────────────────────────────────────────────────────────────────
7.8 SENDING WITHOUT UNSUBSCRIBE LINKS ON MARKETING FLOWS
────────────────────────────────────────────────────────────────────────────────

MISTAKE: Omitting unsubscribe links from flow emails because they "feel
transactional."

WHY IT'S DAMAGING: CAN-SPAM requires a functional unsubscribe mechanism in all
commercial emails. GDPR requires it for all marketing communications. Klaviyo's
own Terms of Service require it. Failing to include an unsubscribe link in an
abandoned checkout or welcome series email is a legal violation, not just
a best-practice miss. Klaviyo typically adds this automatically to flow
emails — but custom HTML templates that replace the footer must include it
explicitly.

THE RULE: Every marketing flow email (abandoned checkout, browse abandonment,
welcome series, winback, post-purchase) must have a functional unsubscribe link
in the footer. Only emails sent via the transactional API to confirmed-transactional
events (order confirmation, shipping confirmation) may omit this — and even
then, it's best practice to include a preference center link.

────────────────────────────────────────────────────────────────────────────────
7.9 SENDING EMAILS BEFORE ESTIMATED DELIVERY IN POST-PURCHASE STEP 2
────────────────────────────────────────────────────────────────────────────────

MISTAKE: Sending usage tips and "how to get the best results" email 2 days
after order placement before the product has arrived.

WHY IT'S DAMAGING: A usage tips email for a product that hasn't arrived yet
is irrelevant and frustrating. The customer reads "Get the most out of your
[ProductName]" while their package is still in a warehouse in Ohio. It reads
as out-of-touch automation and damages the experience before it begins.

THE RULE: Post-purchase Step 2 must account for shipping time. Use order data
to estimate delivery and send 2-4 days after the estimated delivery date. If
delivery data is unavailable, use a conservative delay of 7-10 days from order
placement.

────────────────────────────────────────────────────────────────────────────────
7.10 OVERLAPPING FLOWS WITHOUT EXCLUSION LOGIC
────────────────────────────────────────────────────────────────────────────────

MISTAKE: Allowing a customer to be in an abandoned checkout flow AND a welcome
series flow simultaneously, or triggering a winback flow for someone currently
in an active post-purchase sequence.

WHY IT'S DAMAGING: A customer receives two emails from the brand on the same
day — one saying "You left something behind" and one saying "Welcome! Here's
10% off." These contradict each other, look disorganized, and overwhelm the
recipient. It also fragments the customer journey into incoherent messaging.

THE RULE: Build exclusion logic into every flow:
  - Welcome series: Exclude anyone currently in abandoned checkout. Suppress
    abandoned checkout during welcome series step 1-3.
  - Post-purchase: Exclude from winback flows. Someone who just bought should
    never receive a "we miss you" email.
  - Abandoned checkout: Add flow filter "Has not placed order since trigger" to
    every step.
  - Browse abandonment: Exclude anyone in active abandoned checkout — checkout
    abandonment is higher intent and should take precedence.
  Use Klaviyo's flow filters and trigger conditions to enforce these exclusions.

────────────────────────────────────────────────────────────────────────────────
7.11 USING NOREPLY SENDING ADDRESSES
────────────────────────────────────────────────────────────────────────────────

MISTAKE: Sending all flow emails from noreply@yourbrand.com.

WHY IT'S DAMAGING: "noreply" as a sender name tells customers their responses
don't matter. It closes the door on customer communication and increases spam
complaints (customers who can't reply to an email will hit "Mark as Spam"
instead). It also signals that the brand views email as a one-way broadcast,
not a communication channel.

THE RULE: Send from a human-feeling address that accepts replies:
  hello@yourbrand.com, team@yourbrand.com, or even a named address like
  sarah@yourbrand.com. Replies should be routed to your customer support inbox.
  If you cannot manage reply volume, use a support@ address with an auto-reply
  that sets expectations.

────────────────────────────────────────────────────────────────────────────────
7.12 FORGETTING TO TEST LIQUID RENDERING BEFORE LAUNCH
────────────────────────────────────────────────────────────────────────────────

MISTAKE: Publishing a Klaviyo flow without testing with real event data to verify
that all Liquid variables render correctly.

WHY IT'S DAMAGING: A broken variable in production means every triggered email
for that event has the bug. Abandoned checkout emails going out with "Hi !" and
"Your  is waiting" instead of real data can destroy campaign performance and
customer trust for every send until the issue is discovered and fixed.

THE RULE: Before publishing any flow:
  1. Use Klaviyo's Preview tab to preview with a real profile AND a real event
     (select a recent "Started Checkout" or "Placed Order" event from a real
     customer to preview against)
  2. Send a test to yourself using "Send Test" with event data populated
  3. Verify every variable renders correctly, every image loads, and every link
     points to the correct URL
  4. Check the email in at least 3 clients: Gmail, Apple Mail, and Outlook
  5. Verify mobile rendering (use Litmus, Email on Acid, or a real device)

================================================================================
SECTION 8: COMPLETE LIQUID IMPLEMENTATION SKELETONS BY FLOW TYPE
================================================================================

These are working Klaviyo Liquid patterns. Use them as the foundation for every
flow email. Never guess variable names — use exactly what is shown here.

────────────────────────────────────────────────────────────────────────────────
8.1 BROWSE ABANDONMENT — TRIGGER: Viewed Product
────────────────────────────────────────────────────────────────────────────────

EVENT SCHEMA (Viewed Product trigger):
  event.item_id            → The product ID that was viewed (use for catalog_lookup)
  event.ItemName           → Product name string (fallback if catalog_lookup fails)
  event.ImageURL           → Product image URL (fallback)
  event.URL                → Product page URL
  event.Price              → Product price (number)
  event.Categories         → Array of category strings

NOTE: Browse abandonment does NOT have event.extra.line_items. That is checkout only.

HERO PRODUCT BLOCK (Section 1 — the viewed item):
  {% catalog_lookup event.item_id as p %}
  <img src="{% if p.image_full_url %}{{ p.image_full_url }}{% else %}{{ event.ImageURL | default: 'https://via.placeholder.com/300' }}{% endif %}" width="300" />
  <p>{{ p.title | default: event.ItemName | default: 'Your item' }}</p>
  <a href="{{ p.url | default: event.URL | default: 'https://yourstore.com' }}">Shop Now</a>

RECOMMENDATION GRID (Section 2 — different products from a feed):
  {% if feeds.RecentlyViewed %}
  {% for item in feeds.RecentlyViewed|slice:4 %}
    {% catalog_lookup item.item_id as rec %}
    <td width="180">
      <a href="{{ rec.url | default: 'https://yourstore.com' }}">
        <img src="{{ rec.image_full_url | default: 'https://via.placeholder.com/180' }}" width="180" />
      </a>
      <p>{{ rec.title | default: 'Product' }}</p>
      <p>{{ rec.price | default: '' }}</p>
    </td>
  {% endfor %}
  {% endif %}

COMMON MISTAKES — BROWSE ABANDONMENT:
  WRONG: {% for item in event.extra.line_items %}  → doesn't exist in Viewed Product
  WRONG: {{ event.ProductID }}                     → use event.item_id instead
  WRONG: {{ event.extra.abandoned_checkout_url }}  → that's checkout, not browse
  WRONG: Using recommendation grid with event.item_id → that repeats the hero product
  RIGHT: {% catalog_lookup event.item_id as p %} for hero
  RIGHT: {% for item in feeds.RecentlyViewed|slice:4 %} for recommendations

────────────────────────────────────────────────────────────────────────────────
8.2 ABANDONED CHECKOUT — TRIGGER: Started Checkout
────────────────────────────────────────────────────────────────────────────────

EVENT SCHEMA (Started Checkout / Shopify):
  event.extra.line_items              → Array of cart items
  event.extra.line_items[].name       → Product name
  event.extra.line_items[].image      → Product image URL
  event.extra.line_items[].price      → Item price (string "29.00")
  event.extra.line_items[].quantity   → Quantity (integer)
  event.extra.line_items[].variant_title → Variant ("Medium / Black"), may be null
  event.extra.abandoned_checkout_url  → Link back to the checkout session
  event.extra.subtotal_price          → Subtotal string ("58.00")
  event.extra.total_price             → Total including shipping
  event.extra.total_discounts         → Discount amount ("0.00" if none)
  event.extra.shipping_address.first_name
  event.extra.shipping_address.last_name
  event.extra.email                   → Customer email from checkout

CART ITEMS BLOCK:
  {% if event.extra.line_items and event.extra.line_items != empty %}
    {% for line_item in event.extra.line_items %}
      <tr>
        <td width="80">
          {% if line_item.image and line_item.image != '' %}
            <img src="{{ line_item.image }}" width="80" />
          {% endif %}
        </td>
        <td>
          <p>{{ line_item.name | default: 'Product' }}</p>
          {% if line_item.variant_title and line_item.variant_title != '' %}
            <p>{{ line_item.variant_title }}</p>
          {% endif %}
          <p>Qty: {{ line_item.quantity | default: 1 }}</p>
          <p>{{ line_item.price | times: 1 | money }}</p>
        </td>
      </tr>
      {% if not forloop.last %}<tr><td colspan="2"><hr /></td></tr>{% endif %}
    {% endfor %}
  {% else %}
    <p>Your cart items will appear in your account.</p>
  {% endif %}

ORDER TOTALS BLOCK:
  <p>Subtotal: {{ event.extra.subtotal_price | times: 1 | money }}</p>
  {% if event.extra.total_discounts and event.extra.total_discounts != '0.00' %}
    <p>Discount: -{{ event.extra.total_discounts | times: 1 | money }}</p>
  {% endif %}

PRIMARY CTA:
  <a href="{{ event.extra.abandoned_checkout_url | default: 'https://yourstore.com/checkout' }}">Complete Your Order</a>

COMMON MISTAKES — ABANDONED CHECKOUT:
  WRONG: {% catalog_lookup event.item_id as p %} → item_id doesn't exist here
  WRONG: event.Items (top-level)                 → only string array, use event.extra.line_items
  WRONG: Showing only first item                 → always loop all line_items
  WRONG: Linking to homepage                     → always use event.extra.abandoned_checkout_url
  WRONG: Omitting the flow filter note           → comment in code that flow filter excludes purchasers

────────────────────────────────────────────────────────────────────────────────
8.3 ORDER CONFIRMATION — TRIGGER: Placed Order
────────────────────────────────────────────────────────────────────────────────

EVENT SCHEMA (Placed Order / Shopify):
  event.extra.order_number              → "1042"
  event.extra.line_items                → Array of ordered items (same as checkout)
  event.extra.subtotal_price            → Subtotal
  event.extra.total_price               → Total charged
  event.extra.total_discounts           → Discount amount
  event.extra.total_shipping_price_set.shop_money.amount → Shipping cost
  event.extra.shipping_address.first_name
  event.extra.shipping_address.last_name
  event.extra.shipping_address.address1
  event.extra.shipping_address.address2
  event.extra.shipping_address.city
  event.extra.shipping_address.province_code  → State abbreviation
  event.extra.shipping_address.zip
  event.extra.shipping_address.country
  event.extra.order_status_url          → Link to order status page
  event.extra.payment_gateway           → e.g. "shopify_payments", "paypal"

ORDER HEADER:
  <p>Order #{{ event.extra.order_number | default: 'your order' }}</p>

SHIPPING ADDRESS BLOCK:
  <p>{{ event.extra.shipping_address.first_name | default: 'Customer' }} {{ event.extra.shipping_address.last_name | default: '' }}</p>
  <p>{{ event.extra.shipping_address.address1 | default: '' }}</p>
  {% if event.extra.shipping_address.address2 and event.extra.shipping_address.address2 != '' %}
    <p>{{ event.extra.shipping_address.address2 }}</p>
  {% endif %}
  <p>{{ event.extra.shipping_address.city | default: '' }}, {{ event.extra.shipping_address.province_code | default: '' }} {{ event.extra.shipping_address.zip | default: '' }}</p>

ORDER TOTALS:
  <p>Subtotal: {{ event.extra.subtotal_price | times: 1 | money }}</p>
  {% if event.extra.total_discounts and event.extra.total_discounts != '0.00' %}
    <p>Discount: -{{ event.extra.total_discounts | times: 1 | money }}</p>
  {% endif %}
  <p>Shipping: {{ event.extra.total_shipping_price_set.shop_money.amount | times: 1 | money }}</p>
  <p><strong>Total: {{ event.extra.total_price | times: 1 | money }}</strong></p>

TRACK ORDER CTA:
  <a href="{{ event.extra.order_status_url | default: 'https://yourstore.com/account' }}">Track Your Order</a>

CRITICAL — ORDER CONFIRMATION IS TRANSACTIONAL:
  DO NOT include {{ organization.unsubscribe_link }} in order confirmations.
  Order confirmations are legally transactional. Including an unsubscribe link
  can cause deliverability issues and is unnecessary.

COMMON MISTAKES — ORDER CONFIRMATION:
  WRONG: Including unsubscribe link
  WRONG: event.Items (string array) instead of event.extra.line_items
  WRONG: Formatting price without | times: 1 | money
  WRONG: Skipping shipping address block
  WRONG: Forgetting order number in header

────────────────────────────────────────────────────────────────────────────────
8.4 SHIPPING CONFIRMATION — TRIGGER: Fulfilled Order
────────────────────────────────────────────────────────────────────────────────

EVENT SCHEMA (Fulfilled Order / Shopify):
  event.extra.order_number              → Order number
  event.extra.fulfillments              → Array of fulfillment objects
  event.extra.fulfillments[].tracking_number → Tracking number string
  event.extra.fulfillments[].tracking_url    → Carrier tracking page URL
  event.extra.fulfillments[].tracking_company → "UPS", "FedEx", "USPS", etc.
  event.extra.line_items                → Items that were shipped

TRACKING BLOCK:
  {% for fulfillment in event.extra.fulfillments %}
    {% if fulfillment.tracking_url and fulfillment.tracking_url != '' %}
      <a href="{{ fulfillment.tracking_url }}">Track Your Package</a>
      {% if fulfillment.tracking_company and fulfillment.tracking_company != '' %}
        <p>Carrier: {{ fulfillment.tracking_company }}</p>
      {% endif %}
      {% if fulfillment.tracking_number and fulfillment.tracking_number != '' %}
        <p>Tracking #: {{ fulfillment.tracking_number }}</p>
      {% endif %}
    {% else %}
      <p>Your tracking information will be available soon.</p>
    {% endif %}
  {% endfor %}

CRITICAL: Shipping confirmation is transactional. NO unsubscribe link needed.

COMMON MISTAKES — SHIPPING CONFIRMATION:
  WRONG: Accessing event.TrackingURL directly → it's inside event.extra.fulfillments[]
  WRONG: Assuming one fulfillment → always loop event.extra.fulfillments
  WRONG: Including unsubscribe link
  WRONG: Sending without a CTA → always include "Track Your Package" button

────────────────────────────────────────────────────────────────────────────────
8.5 WINBACK — TRIGGER: Time-based (no product event)
────────────────────────────────────────────────────────────────────────────────

Winback flows are triggered by PROFILE INACTIVITY, not a product event.
There is NO event.extra.line_items, NO event.item_id, NO abandoned cart URL.
Do not try to reference product event data in winback emails.

AVAILABLE DATA — WINBACK:
  person.first_name, person.last_name, person.email
  person.city, person.region (if collected)
  No event.* product properties

PRODUCT CONTENT — WINBACK:
  Use product feeds only. Never event data.
  {% for item in feeds.BestSellers|slice:4 %}
    {% catalog_lookup item.item_id as p %}
    <img src="{{ p.image_full_url | default: '' }}" />
    <p>{{ p.title | default: 'Product' }}</p>
    <a href="{{ p.url | default: 'https://yourstore.com' }}">Shop Now</a>
  {% endfor %}

COMMON MISTAKES — WINBACK:
  WRONG: Any reference to event.extra.* or event.item_id
  WRONG: Sending before 90 days of inactivity (annoys recent customers)
  WRONG: Offering a discount in email 1 (use it only in email 3 as a last resort)
  WRONG: Generic "we miss you" with no product content — always include a feed grid

────────────────────────────────────────────────────────────────────────────────
8.6 SUBSCRIPTION FLOWS — TRIGGER: Recharge/Skio Events
────────────────────────────────────────────────────────────────────────────────

Recharge and Skio use a DIFFERENT event schema from Shopify native orders.
Do not use event.extra.* for Recharge events — Recharge passes top-level properties.

RECHARGE EVENT SCHEMA (common properties):
  event.ProductName           → Subscription product name
  event.ProductImageUrl       → Product image
  event.ScheduledAt           → Next charge date (ISO string)
  event.Price                 → Subscription price
  event.ManageSubscriptionUrl → Link to manage subscription
  event.CancelSubscriptionUrl → Link to cancel
  event.OrderId               → Order ID

SUBSCRIPTION UPCOMING CHARGE BLOCK:
  <p>Your next order of {{ event.ProductName | default: 'your subscription' }} is coming up.</p>
  {% if event.ScheduledAt %}
    <p>Scheduled: {{ event.ScheduledAt | date: '%B %d, %Y' }}</p>
  {% else %}
    <p>Scheduled: soon</p>
  {% endif %}
  <p>Total: {{ event.Price | times: 1 | money }}</p>
  <a href="{{ event.ManageSubscriptionUrl | default: 'https://yourstore.com/account' }}">Manage Subscription</a>

FAILED PAYMENT BLOCK:
  <p>We had trouble processing your payment for {{ event.ProductName | default: 'your subscription' }}.</p>
  <a href="{{ event.ManageSubscriptionUrl | default: 'https://yourstore.com/account' }}">Update Payment Method</a>

================================================================================
SECTION 9: CATALOG LOOKUP COMPLETE REFERENCE
================================================================================

The catalog_lookup tag fetches full product data from Klaviyo's catalog by ID.
Use it whenever you have a product ID and need image, title, price, or URL.

SYNTAX:
  {% catalog_lookup "hardcoded_id" as catalog_item %}
  {% catalog_lookup event.item_id as catalog_item %}        {# from Viewed Product event #}
  {% catalog_lookup item.item_id as catalog_item %}          {# inside a feeds.X loop #}

AVAILABLE FIELDS AFTER LOOKUP:
  catalog_item.title                  → Product title
  catalog_item.description            → Product description
  catalog_item.url                    → Product page URL
  catalog_item.image_full_url         → Full-size product image URL
  catalog_item.image_thumbnail_url    → Thumbnail image URL
  catalog_item.price                  → Price as formatted string ("$29.00")
  catalog_item.custom_metadata.*      → Any custom fields synced to catalog
  catalog_item.categories             → Array of category objects

IMPORTANT: catalog_lookup can fail if the product ID doesn't exist in the catalog.
Always provide fallbacks for every field:
  {{ catalog_item.title | default: event.ItemName | default: 'Product' }}
  {{ catalog_item.image_full_url | default: 'https://via.placeholder.com/300' }}
  {{ catalog_item.url | default: 'https://yourstore.com' }}

================================================================================
SECTION 10: PRODUCT FEEDS COMPLETE REFERENCE
================================================================================

Product feeds provide per-recipient personalized product recommendations.
They are the ONLY way to show recommendations in a flow email.
Never hardcode product data in a section that should be a feed.

ACCESSING FEEDS:
  feeds.FeedName              → Access a feed by its exact Klaviyo name
  feeds.FeedName|slice:4      → First 4 items
  feeds.FeedName|slice:0:4    → Same as above
  feeds.FeedName|slice:2:4    → Items 3 through 6 (skip first 2)

COMMON FEED NAMES BY TYPE:
  "Best Sellers"              → Top-selling products sitewide
  "Recently Viewed"           → Products this customer recently viewed (requires Viewed Product tracking)
  "May Also Like"             → AI recommendations based on purchase/view history
  "New Arrivals"              → Recently added to catalog
  Custom names                → Whatever the brand created in Klaviyo Content > Products

FULL FEED LOOP PATTERN WITH CATALOG LOOKUP:
  {% for item in feeds.BestSellers|slice:4 %}
    {% catalog_lookup item.item_id as p %}
    <td width="175" valign="top" style="padding:8px;">
      <a href="{{ p.url | default: 'https://yourstore.com' }}">
        <img src="{{ p.image_full_url | default: 'https://via.placeholder.com/175' }}" width="175" />
      </a>
      <p style="font-weight:bold;">{{ p.title | default: 'Product' }}</p>
      <p>{{ p.price | default: '' }}</p>
      <a href="{{ p.url | default: 'https://yourstore.com' }}">Shop Now</a>
    </td>
    {% if forloop.index == 2 %}</tr><tr>{% endif %}
  {% endfor %}

GRID ROW BREAK PATTERN (for 2-column grids):
  Use forloop.index to insert </tr><tr> after every 2nd item:
  {% if forloop.index == 2 %}</tr><tr>{% endif %}  {# 2-col grid, 4 items: break after item 2 #}
  {% if forloop.index == 3 %}</tr><tr>{% endif %}  {# 3-col grid, 6 items: break after item 3 #}

IF NO FEED EXISTS, OMIT THE SECTION:
  {% if feeds.BestSellers %}
    {# render feed grid #}
  {% endif %}

================================================================================
SECTION 11: PERSON PROPERTIES COMPLETE REFERENCE
================================================================================

These are profile properties available in ALL flow and campaign emails.
They come from the customer's Klaviyo profile, not from the trigger event.

  person.first_name         → Always use | default: 'there'
  person.last_name          → Use conditionally, may be blank
  person.email              → Always available
  person.phone_number       → May be blank
  person.city               → May be blank
  person.region             → State/province, may be blank
  person.country            → May be blank
  person.zip                → May be blank
  person.organization       → Company name (B2B accounts)

PERSONALIZATION PATTERNS:
  {# Safe greeting #}
  Hi {{ person.first_name | default: 'there' }},

  {# Location-based #}
  {% if person.city and person.city != '' %}
    Shipping to {{ person.city }}.
  {% endif %}

  {# Full name safely #}
  {{ person.first_name | default: '' }} {% if person.last_name %}{{ person.last_name }}{% endif %}

================================================================================
SECTION 12: EMAIL STRUCTURE TEMPLATES BY FLOW TYPE
================================================================================

Use these as the section order blueprint for each flow type.

────────────────────────────────────────
12.1 BROWSE ABANDONMENT EMAIL 1
────────────────────────────────────────
  1. Header (logo, centered)
  2. Headline ("Still thinking about it?")
  3. Hero product block (catalog_lookup from event.item_id — image, name, price, CTA)
  4. Primary CTA button → event.URL or catalog_item.url
  5. Social proof (2-3 reviews for this product)
  6. Recommendation grid (feeds.RecentlyViewed, 4 products, 2-col) — DIFFERENT products
  7. Footer with {{ organization.unsubscribe_link }}

────────────────────────────────────────
12.2 ABANDONED CHECKOUT EMAIL 1
────────────────────────────────────────
  1. Header (logo)
  2. Personalized greeting (person.first_name)
  3. Cart items loop (event.extra.line_items — image, name, variant, qty, price)
  4. Order subtotal
  5. Primary CTA → event.extra.abandoned_checkout_url
  6. Trust signals (free shipping threshold, returns policy — static brand copy)
  7. Footer with {{ organization.unsubscribe_link }}

────────────────────────────────────────
12.3 ORDER CONFIRMATION
────────────────────────────────────────
  1. Header (logo)
  2. "Your order is confirmed" headline
  3. Order number
  4. Line items loop (event.extra.line_items)
  5. Order totals (subtotal, discount, shipping, total)
  6. Shipping address block
  7. "Track Your Order" CTA → event.extra.order_status_url
  8. Brand copy ("what happens next", expected delivery window)
  9. Footer (NO unsubscribe link — transactional)

────────────────────────────────────────
12.4 SHIPPING CONFIRMATION
────────────────────────────────────────
  1. Header (logo)
  2. Exciting headline ("Your order is on its way!")
  3. Personalized greeting (person.first_name)
  4. Tracking block (loop event.extra.fulfillments for tracking number and URL)
  5. "Track Your Package" primary CTA
  6. Items shipped (event.extra.line_items loop, compact version)
  7. Brand copy ("while you wait", product usage tips)
  8. Footer (NO unsubscribe link — transactional)

================================================================================
END OF KLAVIYO BEST PRACTICES REFERENCE
================================================================================
`;

/**
 * Slimmed-down Liquid reference for flow email generation.
 * Includes only Sections 2, 9-12 with corrected catalog syntax.
 */
export const KLAVIYO_FLOW_LIQUID_REFERENCE = `
════════════════════════════════════════════════════════════════════════════════
LIQUID TEMPLATING REFERENCE FOR FLOW EMAILS
════════════════════════════════════════════════════════════════════════════════

════════════════════════════════════════════════════════════════════════════════
FILTER SYNTAX — ZERO TOLERANCE RULE
════════════════════════════════════════════════════════════════════════════════

Klaviyo filters use Django syntax. The #1 rule: NO SPACES around pipes or after colons.

  CORRECT: {{ person.first_name|default:'there' }}
  WRONG:   {{ person.first_name | default: 'there' }}

  CORRECT: {{ event.extra.processed_at|date:'M d' }}
  WRONG:   {{ event.extra.processed_at | date: '%b %d' }}

Every | must touch the variable/filter on both sides. Every : must touch the argument.
If you add spaces, Klaviyo will throw: "Could not parse the remainder"

Date filters use Django format characters, NOT Python strftime:
  F = full month name, M = abbreviated month, d = zero-padded day,
  j = day without padding, Y = 4-digit year, g = 12-hour, i = minutes, A = AM/PM

  CORRECT: {{ var|date:'M d, Y' }}     → "Jan 15, 2025"
  WRONG:   {{ var|date:'%b %d, %Y' }}  → parse error

CRITICAL — KLAVIYO USES DJANGO TEMPLATES, NOT SHOPIFY LIQUID:

Klaviyo's template engine is Django-based. Key differences from Shopify Liquid:

  WRONG (Shopify Liquid):     CORRECT (Klaviyo/Django):
  {% elsif %}             →   {% elif %}
  {% unless %}            →   {% if not %}
  {{ var|default:'' }}    →   NEVER use empty string default

If you write Shopify Liquid syntax, Klaviyo will throw "Unknown tag" errors.

────────────────────────────────────────────────────────────────────────────────
DEFAULT FILTERS — MANDATORY ON EVERY VARIABLE
────────────────────────────────────────────────────────────────────────────────

CRITICAL — KLAVIYO DEFAULT FILTER RULES:
  1. NEVER use |default:'' (empty string). Klaviyo throws: "The default filter
     requires 2 arguments, but 1 was given." Empty string = 1 argument.
  2. NEVER use |default: (nothing after colon). Same error.
  3. ALWAYS provide a meaningful non-empty fallback string.

CORRECT:
  {{ person.first_name|default:'there' }}
  {{ event.extra.order_number|default:'your order' }}

WRONG:
  {{ event.extra.order_number|default:'' }}   ← empty string = error
  {{ person.first_name|default: }}            ← no value = error
  {{ person.first_name }}                     ← missing default entirely

Defaults by type:
  String fields:  |default:'your order'
  Name fields:    |default:'there' or |default:'Customer'
  Numeric fields: |default:0
  Price fields:   |default:0
  URL fields:     |default:'https://www.yourbrand.com'
  Image URLs:     |default:'https://cdn.yourbrand.com/fallback-product.jpg'

────────────────────────────────────────────────────────────────────────────────
SAFE IMAGE RENDERING
────────────────────────────────────────────────────────────────────────────────

  {% if event.ImageURL and event.ImageURL != '' %}
    <img src="{{ event.ImageURL }}" alt="{{ event.ProductName|default:'Product' }}"
         width="300" style="display:block; max-width:100%;" />
  {% else %}
    <img src="https://cdn.yourbrand.com/fallback-product.jpg"
         alt="Your order" width="300" style="display:block; max-width:100%;" />
  {% endif %}

Always include: width attribute, style="display:block", alt text with default.

────────────────────────────────────────────────────────────────────────────────
LOOPING ITEMS ARRAYS
────────────────────────────────────────────────────────────────────────────────

IMPORTANT: The correct loop path depends on the trigger type. Do NOT assume
event.extra.line_items exists — check the real event JSON provided to you.

  event.Items         → string array of product names ONLY. Cannot loop for images/prices.
  event.extra.line_items → full line item objects (Shopify Placed Order / Started Checkout)

Generic loop pattern (adapt the path to match the real JSON):
  {% for line_item in event.extra.line_items %}
    <td>
      {% if line_item.image and line_item.image != '' %}
        <img src="{{ line_item.image }}" alt="{{ line_item.name|default:'Item' }}" width="80" />
      {% endif %}
      <p>{{ line_item.name|default:'Product' }}</p>
      <p>Qty: {{ line_item.quantity|default:1 }}</p>
      <p>{{ line_item.price|times:1|money }}</p>
    </td>
  {% endfor %}

────────────────────────────────────────────────────────────────────────────────
CURRENCY AND PRICE FORMATTING
────────────────────────────────────────────────────────────────────────────────

  {{ item.Price|times:1|money }}
  {{ event.OrderValue|times:1|money }}
  The |times:1 coerces to number before |money.

────────────────────────────────────────────────────────────────────────────────
DATE FORMATTING
────────────────────────────────────────────────────────────────────────────────

  {{ event.CreatedAt|date:'F d, Y' }}  → "January 15, 2025"

CRITICAL — NEVER chain |default: after |date:
  WRONG: {{ event.extra.processed_at|date:'M d'|default:'Today' }}
  CORRECT:
  {% if event.extra.processed_at %}{{ event.extra.processed_at|date:'M d' }}{% else %}Today{% endif %}

────────────────────────────────────────────────────────────────────────────────
SUBJECT LINE AND PREVIEW TEXT LIMITS
────────────────────────────────────────────────────────────────────────────────

Subject: 30-50 chars optimal. Hard limit: 60.
Preview text: 85-100 chars. Always set explicitly.

  {{ person.first_name|default:'there'|truncate:20,'' }}

────────────────────────────────────────────────────────────────────────────────
ADDITIONAL LIQUID PATTERNS
────────────────────────────────────────────────────────────────────────────────

  {{ person.first_name|default:'there'|capitalize }}
  {{ item.Name|default:'Your item'|truncate:50,'...' }}
  {{ event.CouponCode|default:'SAVE10'|upcase }}

  {% if person.city and person.city != '' %}
    Shipping to {{ person.city }}
  {% endif %}


════════════════════════════════════════════════════════════════════════════════
CATALOG LOOKUP REFERENCE
════════════════════════════════════════════════════════════════════════════════

The catalog tag fetches full product data from Klaviyo's catalog by ID.
Use it when you have a product ID and need image, title, price, or URL.

SYNTAX (block tag, NOT a single-line tag):
  {% catalog event.item_id %}
    {{ catalog_item.title|default:'Product' }}
    {{ catalog_item.featured_image.full.src|default:'https://via.placeholder.com/300' }}
    {{ catalog_item.url|default:'https://yourstore.com' }}
    {% currency_format catalog_item.metadata|lookup:"$price" %}
  {% endcatalog %}

WRONG SYNTAX (do NOT use):
  {% catalog_lookup event.item_id as catalog_item %}   ← WRONG, this does not exist

AVAILABLE FIELDS INSIDE {% catalog %}...{% endcatalog %}:
  catalog_item.title                          → Product title
  catalog_item.description                    → Product description
  catalog_item.url                            → Product page URL
  catalog_item.featured_image.full.src        → Full-size product image URL
  catalog_item.featured_image.thumbnail.src   → Thumbnail image URL
  catalog_item.metadata|lookup:"$price"       → Use with {% currency_format %} for price
  catalog_item.categories                     → Array of category objects

Always provide fallbacks:
  {{ catalog_item.title|default:event.ItemName|default:'Product' }}
  {{ catalog_item.featured_image.full.src|default:'https://via.placeholder.com/300' }}


════════════════════════════════════════════════════════════════════════════════
PRODUCT FEEDS REFERENCE
════════════════════════════════════════════════════════════════════════════════

Product feeds provide per-recipient personalized product recommendations.
They are the ONLY way to show recommendations in a flow email.
Never hardcode product data in a section that should be a feed.

ACCESSING FEEDS:
  feeds.FeedName              → Access a feed by its exact Klaviyo name
  feeds.FeedName|slice:4      → First 4 items
  feeds.FeedName|slice:0:4    → Same as above

COMMON FEED NAMES:
  "Best Sellers", "Recently Viewed", "May Also Like", "New Arrivals"

FULL FEED LOOP PATTERN:
  {% for item in feeds.BestSellers|slice:4 %}
    {% catalog item.item_id %}
    <td width="175" valign="top" style="padding:8px;">
      <a href="{{ catalog_item.url|default:'https://yourstore.com' }}">
        <img src="{{ catalog_item.featured_image.full.src|default:'https://via.placeholder.com/175' }}" width="175" />
      </a>
      <p style="font-weight:bold;">{{ catalog_item.title|default:'Product' }}</p>
      <p>{% currency_format catalog_item.metadata|lookup:"$price" %}</p>
      <a href="{{ catalog_item.url|default:'https://yourstore.com' }}">Shop Now</a>
    </td>
    {% endcatalog %}
    {% if forloop.index == 2 %}</tr><tr>{% endif %}
  {% endfor %}

GRID ROW BREAK PATTERN:
  {% if forloop.index == 2 %}</tr><tr>{% endif %}  {# 2-col grid #}
  {% if forloop.index == 3 %}</tr><tr>{% endif %}  {# 3-col grid #}

IF NO FEED EXISTS, OMIT THE SECTION:
  {% if feeds.BestSellers %}
    {# render feed grid #}
  {% endif %}


════════════════════════════════════════════════════════════════════════════════
PERSON PROPERTIES REFERENCE
════════════════════════════════════════════════════════════════════════════════

Profile properties available in ALL flow and campaign emails:

  person.first_name         → Always use |default:'there'
  person.last_name          → Use conditionally, may be blank
  person.email              → Always available
  person.phone_number       → May be blank
  person.city               → May be blank
  person.region             → State/province
  person.country            → May be blank
  person.zip                → May be blank
  person.organization       → Company name (B2B)

PERSONALIZATION PATTERNS:
  Hi {{ person.first_name|default:'there' }},

  {% if person.city and person.city != '' %}
    Shipping to {{ person.city }}.
  {% endif %}

  {{ person.first_name|default:'Friend' }} {% if person.last_name %}{{ person.last_name }}{% endif %}


════════════════════════════════════════════════════════════════════════════════
EMAIL STRUCTURE TEMPLATES BY FLOW TYPE
════════════════════════════════════════════════════════════════════════════════

Use these as the section order blueprint for each flow type.

BROWSE ABANDONMENT EMAIL 1:
  1. Header (logo, centered)
  2. Headline ("Still thinking about it?")
  3. Hero product block ({% catalog event.item_id %}...{% endcatalog %} — image, name, price, CTA)
  4. Primary CTA button → event.URL or catalog_item.url
  5. Social proof (2-3 reviews)
  6. Recommendation grid (feeds.RecentlyViewed, 4 products, 2-col) — DIFFERENT products
  7. Footer with {{ organization.unsubscribe_link }}

ABANDONED CHECKOUT EMAIL 1:
  1. Header (logo)
  2. Personalized greeting (person.first_name)
  3. Cart items loop (event.extra.line_items or event.Items — check real JSON)
  4. Order subtotal
  5. Primary CTA → event.extra.abandoned_checkout_url
  6. Trust signals (free shipping threshold, returns policy — static brand copy)
  7. Footer with {{ organization.unsubscribe_link }}

ORDER CONFIRMATION:
  1. Header (logo)
  2. "Your order is confirmed" headline
  3. Order number
  4. Line items loop (event.extra.line_items)
  5. Order totals (subtotal, discount, shipping, total)
  6. Shipping address block
  7. "Track Your Order" CTA → event.extra.order_status_url
  8. Brand copy ("what happens next", expected delivery window)
  9. Footer (NO unsubscribe link — transactional)

SHIPPING CONFIRMATION:
  1. Header (logo)
  2. Exciting headline ("Your order is on its way!")
  3. Personalized greeting (person.first_name)
  4. Tracking block (loop event.extra.fulfillments for tracking number and URL)
  5. "Track Your Package" primary CTA
  6. Items shipped (event.extra.line_items loop, compact version)
  7. Brand copy ("while you wait", product usage tips)
  8. Footer (NO unsubscribe link — transactional)
`;
