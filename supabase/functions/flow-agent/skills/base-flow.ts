// Auto-generated from base-flow.md
export default String.raw`
# Base Flow Skill
**Version:** 1.0  
**Role:** Foundation reference for all Klaviyo flow-specific skills  
**Scope:** Every flow skill (welcome, abandoned checkout, post-purchase, winback, browse abandonment, etc.) inherits from this document. Do not generate any flow without running through the frameworks below.

---

## 1. Pre-Build Assessment Framework

Before recommending or building any flow, you must assess the following dimensions. Pull from brand intelligence context first. Only surface questions for gaps that cannot be inferred.

### 1.1 Existing Flow Inventory
Pull from Klaviyo integration data. Build a map of:
- **Active flows** — name, trigger, number of emails, estimated revenue attribution
- **Draft/disabled flows** — note whether they're worth activating or rebuilding
- **Gaps** — which standard flows are missing (welcome, abandoned checkout, post-purchase, winback, browse abandonment, replenishment)

**Decision rule:** If a flow already exists, assess performance before rebuilding. If CVR is strong, extend or optimize. If CVR is weak relative to benchmarks, flag for replacement. If the flow is foundational (abandoned checkout, welcome) and has no emails or is broken, replace without hesitation.

**Benchmarks (use for gap analysis):**
| Flow | Avg Placed Order Rate | Flag Threshold |
|---|---|---|
| Welcome | 3–8% | < 2% |
| Abandoned Checkout | 5–15% | < 4% |
| Browse Abandonment | 1–4% | < 1% |
| Post-Purchase | 10–25% repeat purchase | < 8% |
| Winback | 5–12% | < 3% |

### 1.2 Sales Model
Determine from brand intelligence: subscription-first, one-time purchase, or hybrid (offers both).

- **Subscription-first:** Flows should bias toward subscribe & save CTAs. Welcome flow should emphasize subscription benefits. Winback flows should address churn reasons.
- **One-time purchase:** Flows optimize for first and repeat purchase. Upsell logic is "add another SKU," not "upgrade to subscription."
- **Hybrid:** Segment-aware logic required. Use conditional splits to serve subscription-relevant copy to subscribers and replenishment-relevant copy to one-time buyers.

### 1.3 Catalog Depth
Determine from product catalog data.

| Type | Definition | Flow Implication |
|---|---|---|
| Single SKU | One hero product, possibly variants | All flows anchor to one product; differentiate by benefit angle per email |
| Focused | 2–6 products, clear hero | Post-purchase upsell targets the 1–2 logical next products |
| Multi-product | 7–30 products with categories | Personalization via browse/purchase data; post-purchase branches by category |
| Retail | 30+ SKUs | Flow personalization is essential; use dynamic blocks and category splits |

### 1.4 Average Order Value (AOV)
Pull from Klaviyo performance data or brand intelligence.

| AOV Range | Urgency Strategy | Offer Strategy |
|---|---|---|
| < $40 | Aggressive urgency, short sequence | Discount acceptable (margin permits) |
| $40–$100 | Moderate urgency | GWP or free shipping preferred over % discount |
| $100–$250 | Lower urgency, higher trust | Social proof and risk reversal over discount |
| > $250 | Patience, credibility, white-glove framing | Rarely discount; use consultative or value-stacking approach |

### 1.5 Proof Asset Inventory
Before writing any social proof blocks, assess what exists:

- **Reviews:** Source (Yotpo, Okendo, Stamped, Trustpilot, etc.), count, average rating, whether reviews are product-specific or general
- **UGC:** Creator content, customer photos/videos, tagged social content
- **Press:** Publications that have covered the brand (pull from brand intelligence)
- **Certifications:** Third-party certifications (NSF, USDA Organic, Leaping Bunny, B Corp, etc.)
- **Stats:** Any quantified claims (e.g., "92% of customers repurchase within 60 days")
- **Founder story:** Is there a compelling origin narrative?

**If proof assets are thin:** Flag this to the operator. Flows can still work, but avoid spec'ing Review Cards without real reviews to populate them. Use founder story and benefit-stacking instead.

### 1.6 Offer Structure
Determine what, if any, offer this brand uses across flows.

| Offer Type | Notes |
|---|---|
| Percentage discount (e.g., 15% off) | Most common. Note whether it's gated by signup or flow-specific. |
| Fixed amount (e.g., $10 off) | Typically higher-AOV brands. |
| Gift with purchase (GWP) | Premium brands. Emphasize the gift, not the savings. |
| Free shipping | Works when shipping cost is the real friction. Confirm threshold. |
| Free trial / sample | SaaS-adjacent or complex product. |
| No offer | Some brands (premium, viral, cult) deliberately avoid discounting. Flows rely entirely on copy and proof. |

**If no offer:** Flows must work harder on social proof, risk reversal (guarantee, free returns), urgency from scarcity (not price), and benefit specificity. Do not invent offers that don't exist.

**If discount exists:** Confirm exact code, expiry logic, and whether it's already exposed on the website (if it's sitewide, don't treat it as exclusive).

### 1.7 SMS Integration
Determine whether the brand uses Klaviyo SMS (or another SMS platform like Attentive, Postscript).

- **Klaviyo SMS active:** Flows can include SMS nodes on the same timeline. SMS should add urgency without being redundant — don't repeat the email subject in the SMS.
- **No SMS:** Build email-only flows. Note SMS as a future enhancement opportunity.
- **Third-party SMS:** Flag that SMS nodes in Klaviyo may not be available. Build email-only; note SMS separately.

---

## 2. Clarifying Questions Framework

### 2.1 The Rule: Infer First, Ask Second

Before asking any question, check brand intelligence. If it's answerable from:
- Brand research context → do not ask
- Klaviyo integration data → do not ask
- Product catalog → do not ask
- Previous conversation in this session → do not ask

Only ask about things that are:
1. Not present in any data source
2. High-stakes enough that guessing wrong would break the flow (wrong offer code, wrong hero product, wrong trigger)
3. Ambiguous even with available data

### 2.2 The 3-Question Cap
Never surface more than **3 questions at once**. If you have more than 3 unknowns, rank by impact and ask the top 3 first. Subsequent rounds of questions (if needed) are unlocked only after the user answers the first batch.

### 2.3 Always Confirm These (if not explicit in data)
These three things must be confirmed before building — either from data or directly:

1. **Offer details** — exact code or offer type for this flow (or explicit confirmation of no offer)
2. **Hero product** — which product or product line this flow is centered on
3. **Replacement intent** — if an existing flow covers this trigger, confirm whether to replace or extend it

### 2.4 Never Ask These
- Brand name, website, or category (from brand intelligence)
- AOV range (from Klaviyo data)
- Existing flows (from Klaviyo integration)
- Review count or rating (from proof asset inventory)
- Whether they use Klaviyo (they do — that's this system's context)
- Product pricing (from product catalog)

### 2.5 Question Framing
Format clarifying questions as a numbered list with brief context for why each is needed. Example:

> Before I build this flow, I need to confirm three things I couldn't determine from your brand data:
>
> 1. **Offer code:** I can see you've referenced a 15% welcome discount in your brand notes, but I don't have the exact code. What's the Klaviyo coupon code for this flow?
> 2. **Hero product:** Your catalog has 8 SKUs. For this welcome flow, should I anchor the sequence to [Product A] or keep it catalog-wide?
> 3. **Existing flow:** There's a welcome flow in Klaviyo now with 2 emails and a 1.2% CVR. Do you want me to replace it entirely, or build a net-new version to A/B test?

---

## 3. Universal Flow Output Format

Every flow skill outputs a structured skeleton in this exact format. Consistency matters — the downstream copywriter and platform export both parse this structure.

\`\`\`
FLOW: [Flow Name] — [Brand Name]
TRIGGER: [Klaviyo trigger event]
ENTRY FILTERS: [profile/flow filter conditions to enter this flow]
EXIT CONDITIONS: [what removes someone — always includes Placed Order + Unsubscribe]
SMART SENDING: [ON or OFF] — [one-line reason]
QUIET HOURS: [recommended on/off, hours]
GOAL: [single sentence — what does conversion look like for this flow]

---

[NODE TYPE] — [Label]

[DELAY] — X hours / X days
  Note: [optional — explain timing rationale if non-obvious]

[EMAIL] — [Email Number]: [Short Name]
  Timing: [relative to trigger or previous email]
  Job: [One sentence. What is this email's single purpose?]
  Subject direction: [The psychological angle. Not the subject line itself — the strategic approach.]
  Preview text direction: [How it supports/extends the subject]
  Sections:
    1. [Section Name] — [Design element from library, if applicable]
       Copy spec: [2–4 sentences on what this section says and why]
    2. [Section Name] — [Design element]
       Copy spec: [...]
    3. [Section Name] — [Design element]
       Copy spec: [...]
    [Continue as needed]
  CTA: [Button text and destination URL or variable]
  Dynamic: [List all Klaviyo personalization variables used in this email]
  Conditional blocks: [Any logic inside the email — e.g., show/hide based on profile property]
  Notes: [Any implementation flags, edge cases, or design callouts]

[CONDITIONAL SPLIT] — [Split Label]
  Condition: [Exact split logic]
  YES → [Next node label]
  NO → [Next node label]

[SMS] — [Purpose label]
  Timing: [relative to previous node]
  Content: [Full message text, max 160 characters. Include opt-out language placeholder.]
  Link: [URL or variable]
  Note: [Any Klaviyo SMS implementation notes]

[END] — [Label, e.g., "Non-Converter Exit" or "Flow Complete"]
  Note: [Where this profile goes next, if part of cross-flow strategy]
\`\`\`

### Format Rules
- Every node must have a type in brackets: \`[EMAIL]\`, \`[DELAY]\`, \`[CONDITIONAL SPLIT]\`, \`[SMS]\`, \`[END]\`
- Every email must have: Job, Subject direction, at least 2 Sections with Copy specs, CTA, Dynamic variables
- Design element names must match the library exactly (e.g., "Review Card," not "review section" or "testimonial block")
- Conditional splits must state the exact Klaviyo logic (not vague — "has purchased" is wrong; "Placed Order since flow start" is right)
- Use \`→\` for split branches, never arrows spelled out

---

## 4. Architecture Principles (Universal)

These apply to every flow regardless of type or brand. Flow-specific skills may add principles but cannot contradict these.

### 4.1 One Email, One Job
Each email has a single conversion purpose. A welcome email that tries to introduce the brand, show social proof, explain product benefits, AND present an offer is doing four jobs badly. Structure the sequence so each email owns one angle completely.

**The test:** Can you describe this email's job in one sentence without using "and"? If not, split it.

### 4.2 The Sequence Tells a Story
The arc of a flow is a narrative. Map it before speccing individual emails:

| Act | Narrative Function | Email Position |
|---|---|---|
| Opening | Create context, establish relevance | E1 |
| Rising interest | Build desire, introduce proof | E2 |
| Objection handling | Address hesitation, reduce risk | E2–E3 |
| Escalation | Urgency, stakes, final push | E3–E4 |
| Resolution | Convert or gracefully exit | Final email |

A list of pitches is not a story. If every email says "buy this, it's great," the sequence has no arc.

### 4.3 Split on Purchase Behavior Only
The only split that matters in a conversion flow is: **did they buy?**

Engagement splits (opened, clicked) are unreliable in Klaviyo due to Apple MPP and click attribution noise. Never build "if opened → branch A, if not opened → branch B" logic. Always use:
- **Placed Order since flow started** (primary conversion check)
- **Has property X** (subscription status, VIP tier, product purchased) — for product/offer personalization only, not as engagement gate

### 4.4 Design Elements Are Structural
Design elements from the library are not decoration — they carry persuasion weight. Spec them precisely:

- **Review Card:** Use for specific, outcome-focused reviews. Spec 2–3 target reviews by theme (e.g., "reviews that mention fast shipping" or "reviews from customers who were skeptical first").
- **Stat Strip:** Use for quantified social proof. Always pair with source attribution.
- **Us vs Them Split Card:** Use only when the competitor comparison is credible and legally sound. Never fabricate comparison claims.
- **Scrolling Benefits Banner:** Use for trust signals (free shipping, guarantee, reviews count). Place near the first CTA.
- **Guarantee Seal:** Use when the brand has a strong guarantee. Place near purchase CTAs.
- **Promo Code Highlight Card:** Visually isolates the discount code. Use when a code is present — do not bury codes in body copy.
- **Countdown Visual:** Use only when there is a real expiry. Never use fake countdown timers. Tie to actual Klaviyo coupon expiry logic.

### 4.5 Always Plan the Non-Converter Ending
Every flow must have a defined exit for people who never convert. Options:
- **Suppress and move on:** Profile exits cleanly, no further action
- **Feed to next flow:** Profile moves into winback or re-engagement sequence
- **Tag for segment:** Profile receives a Klaviyo property for future segmentation

Always specify which. "Flow ends" is not an acceptable non-converter exit.

### 4.6 Offer Placement Logic
If the brand uses an offer in a flow:
- **The offer is present in every email** — do not hide it until the last email. The job of the offer is to reduce friction; removing it from early emails adds friction.
- **Exception — abandoned checkout:** Email 1 never contains a discount (see abandoned-checkout-flow.md for rationale). Offer appears in E3 only.
- **The offer is not the headline** in every email — it's in the footer or secondary CTA until it becomes the main message in the final urgency email.

### 4.7 Timing Architecture
\`\`\`
Flow start → E1: ≤ 1 hour (for trigger-based) or immediately
E1 → E2: 24 hours
E2 → E3: 48–72 hours
E3 → E4: 3–5 days
E4 → End: 5–7 days
\`\`\`

**Compression at the start, expansion at the end.** Early emails are time-sensitive (cart is fresh, intent is hot). Later emails are persistence plays — give them breathing room or you become noise.

For post-purchase and winback flows: space differently. See flow-specific skills.

### 4.8 Smart Sending Rules
| Flow Type | Smart Sending | Reason |
|---|---|---|
| Welcome | OFF | Triggered by signup. Time-critical. Smart sending can delay E1 past the intent window. |
| Abandoned Checkout | OFF | Time-critical. An abandoned cart at 11pm needs E1 within the hour, not after quiet hours. |
| Browse Abandonment | OFF | Same logic as abandoned checkout. |
| Post-Purchase | ON | Not time-critical. Quiet hours protect the brand-customer relationship. |
| Winback | ON | Long-game play. No urgency window to protect. |
| Replenishment | ON | Predictable timing. Respect user preferences. |

---

## 5. Klaviyo Implementation Rules

### 5.1 Required Flow Filters (All Flows)
Every flow must include these entry filters or exit conditions:

| Requirement | Type | Logic |
|---|---|---|
| Deduplication | Flow filter | Not in this flow in the last X days (set appropriate window) |
| Purchase exit | Exit condition | Placed Order → immediately exits |
| Unsubscribe exit | Exit condition | Unsubscribed from list → immediately exits |
| Bounce suppression | Entry filter | Email bounced is false |
| Suppression list check | Entry filter | Not in global suppression segment |

### 5.2 Flow Filters vs Profile Filters

**Profile filters** evaluate properties on the Klaviyo profile object (static or slowly-changing data):
- \`person.properties.subscription_status\` = "active"
- \`person.$city\` = "New York"
- Profile is in segment "VIP Buyers"

Profile filters are checked **at the moment the email sends** — the profile's current state, not their state at flow entry.

**Flow filters** evaluate whether a certain event occurred **during this flow session** (since the person entered the flow):
- Placed Order since starting this flow
- Clicked Email since starting this flow

Use flow filters for the purchase exit check between emails — otherwise a person who bought on Day 1 but hasn't exited will still receive Day 3's follow-up.

**The critical distinction:** "Has Placed Order at least once" (profile filter) is very different from "Placed Order since starting this flow" (flow filter). The former excludes all repeat customers from abandonment follow-ups. Always use the flow filter for mid-sequence purchase checks.

### 5.3 Conditional Split Syntax (Exact)
For purchase checks:
\`\`\`
What someone has done (or not done):
  Placed Order → 0 times → since starting this flow
\`\`\`

For subscription status:
\`\`\`
Properties about someone:
  subscription_status → equals → active
\`\`\`

For segment membership:
\`\`\`
If someone is in or not in a list or segment:
  [Segment name] → is in
\`\`\`

### 5.4 Overlapping Flow Suppression
Flows that share an audience will compete. Manage this explicitly:

| Flow Pair | Risk | Resolution |
|---|---|---|
| Welcome + Browse Abandonment | New subscriber browses immediately → enters both | Suppress browse abandonment for profiles in welcome flow |
| Welcome + Abandoned Checkout | New subscriber abandons checkout → enters both | Let abandoned checkout fire (higher intent); suppress welcome E2+ if checkout converts |
| Browse Abandonment + Abandoned Checkout | Browse session escalates to checkout → both fire | Abandoned checkout takes priority; exit browse abandonment on checkout start event |
| Post-Purchase + Winback | Purchase during winback → enters post-purchase | Post-purchase suppresses winback; exit winback on Placed Order |

**Implementation:** Use Klaviyo flow filter "Not in flow [flow name]" on lower-priority flows. The higher-intent trigger always wins.

---

## 6. Cross-Flow Strategy

Flows are not isolated sequences. A complete email program is a network where profiles move predictably between flows based on behavior. Map this before building individual flows.

### 6.1 The Standard Flow Network

\`\`\`
[ACQUISITION / SIGNUP]
        ↓
[WELCOME FLOW]
  ├── Purchases → [POST-PURCHASE FLOW — E-Series 1]
  └── Doesn't purchase in 90d → [WINBACK FLOW]

[SITE ACTIVITY — no signup required]
[BROWSE ABANDONMENT]
  ├── Adds to cart → exits, enters [ABANDONED CHECKOUT]
  └── Doesn't convert → [END or retarget segment]

[CART / CHECKOUT ACTIVITY]
[ABANDONED CHECKOUT]
  ├── Purchases → [POST-PURCHASE FLOW]
  └── Doesn't purchase → [END or winback after 90d]

[POST-PURCHASE]
  ├── Repeat purchase within window → [POST-PURCHASE FLOW — E-Series 2 or VIP]
  └── No repeat purchase after X days → [WINBACK FLOW]

[WINBACK FLOW]
  ├── Re-engages → [POST-PURCHASE or Welcome-equivalent]
  └── No response → [Sunset / Suppression]
\`\`\`

### 6.2 Flow Handoff Logic

**Welcome → Post-Purchase:**
If a profile places their first order during the welcome flow, trigger the post-purchase flow immediately. Use the Placed Order event as the post-purchase trigger — Klaviyo will start the post-purchase sequence for all Placed Order events, including those that occur while someone is in welcome.

**Welcome → Winback:**
Tag non-converters at welcome flow end (or after 90 days with no purchase event). A Klaviyo segment of "Subscribed > 90 days ago, 0 orders, not in welcome flow" feeds the winback trigger.

**Browse Abandonment → Abandoned Checkout:**
When someone adds to cart, the Started Checkout or Added to Cart event fires. Use this to exit them from Browse Abandonment (flow filter: Started Checkout since starting flow → exit). Abandoned Checkout fires on its own trigger.

**Abandoned Checkout → Post-Purchase:**
Placed Order exits abandoned checkout. Post-purchase is triggered independently by the same Placed Order event.

**Post-Purchase → Winback:**
Set a time-based winback trigger: profile has placed exactly X orders, most recent order was > Y days ago. Match the winback window to the product's repurchase cycle (consumable = 60–90d, durable = 180–365d).

### 6.3 Priority Hierarchy
When a profile qualifies for multiple flows simultaneously, use this priority order:

1. **Abandoned Checkout** (highest intent — money on the table)
2. **Post-Purchase** (relationship protection)
3. **Browse Abandonment** (high intent)
4. **Welcome** (foundational)
5. **Winback** (lowest priority — they haven't bought yet or in a long time)

Higher-priority flows suppress lower-priority flows via flow filters. Do not let a winback email send to someone who just abandoned checkout.

---

## 7. After Generating the Flow Skeleton

### 7.1 Approval Gate
The skeleton is a proposal, not a build order. Before proceeding to copy generation:
- Present the full skeleton in the standard format (Section 3)
- Flag any assumptions made (offer details inferred, hero product selected, existing flow being replaced)
- Explicitly request approval: "Approve this architecture, or tell me what to change"

Do not generate full email copy until the skeleton is approved.

### 7.2 Copy Generation Pipeline
Once approved, each \`[EMAIL]\` node in the skeleton feeds into the copywriter as a discrete brief. The copywriter receives:
- The email's Job (one sentence)
- Subject direction + Preview text direction
- Section-by-section specs with copy guidance
- CTA text and destination
- Dynamic variables in use
- Brand voice profile (from brand intelligence)
- Proof assets relevant to this email's job

All emails in the flow are generated simultaneously, not sequentially. The platform batches the copywriter requests.

### 7.3 Design Handoff
Design elements are resolved by the email design system against the email design element library. Operators do not need to specify design — the library names in the skeleton are sufficient for the design system to inject the correct blocks with brand theming applied.

### 7.4 Export Options
After generation, two export paths are available:

**Download HTMLs:**
- All email nodes rendered as production HTML files
- Named by flow + email number (e.g., \`welcome-e1.html\`, \`welcome-e2.html\`)
- Includes all Klaviyo Liquid variables un-rendered (ready to paste into Klaviyo template editor)

**Push to Klaviyo:**
- Creates the flow in Klaviyo with correct trigger and entry filters
- Adds all email nodes with rendered HTML content
- Sets delay nodes and conditional splits
- Assigns flow filters and exit conditions
- Flow is created in **Draft** status — operator must manually activate after QA

### 7.5 QA Checklist (Pre-Activation)
Before activating any pushed flow, the operator should verify:
- [ ] Trigger event fires correctly in test environment
- [ ] Entry filters exclude the right profiles (send test profiles through)
- [ ] All Liquid variables render without errors (use Klaviyo preview with real profile data)
- [ ] Conditional splits route correctly
- [ ] Exit conditions are set (Placed Order, Unsubscribe)
- [ ] Smart sending setting matches spec
- [ ] UTM parameters on all links
- [ ] Offer code is active in Klaviyo and set to single-use if required
- [ ] No overlap with existing active flows (check suppression logic)

---

## 8. Reference: Design Element Library (Quick Index)

Use these names exactly when speccing sections. Full specs in the design element library.

| Element Name | Primary Use Case |
|---|---|
| Review Card | Social proof in body — 1 to 3 reviews with star rating and reviewer name |
| Stat Strip | Quantified proof — 3–4 stats in a horizontal band |
| Us vs Them Split Card | Competitive differentiation — side-by-side comparison table |
| Scrolling Benefits Banner | Trust signals near CTA — animated horizontal ticker |
| Guarantee Seal | Risk reversal — circular badge, typically near CTA or footer |
| Promo Code Highlight Card | Offer visibility — visually isolated code block |
| Countdown Visual | Urgency — timer tied to real expiry logic |
| Hero Product Card | Single product feature — image, name, key benefit, CTA |
| Bundle Visual | Multi-product showcase — grouped product imagery |
| Founder Photo Block | Founder-to-customer direct communication section |
| UGC Grid | 3–6 customer photos in a mosaic layout |
| Press Logo Bar | Media mentions — logos in a horizontal strip |
| Before/After Split | Transformation visual — side-by-side outcome comparison |
| Ingredient/Formula Callout | Technical proof — ingredient or formulation highlight |
| FAQ Accordion | Objection handling — expandable Q&A (mobile-optimized) |

---

*This document is the base layer. All flow-specific skills extend it. When a flow skill contradicts this document, the flow-specific guidance takes precedence for that flow only.*
`;
