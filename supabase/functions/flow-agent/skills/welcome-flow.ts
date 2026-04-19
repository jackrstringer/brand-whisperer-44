// Auto-generated from welcome-flow.md
export default String.raw`
---
name: welcome-flow
description: >
  Generates complete welcome flow architectures for DTC brands. Outputs a structured flow
  skeleton with triggers, timing, splits, filters, and per-email specs including design element
  selections from the email design element library. Use this skill whenever a user wants to build,
  plan, audit, or restructure a welcome flow, welcome series, or new subscriber sequence. Trigger
  on phrases like "welcome flow", "welcome series", "new subscriber flow", "build a welcome",
  "plan my welcome emails", "welcome sequence", or any request involving onboarding new email
  subscribers. Also trigger when a user mentions Klaviyo flows and welcome in the same context,
  or asks about what emails new subscribers should receive.
---

# Welcome Flow Architect

Generates a complete welcome flow skeleton for DTC brands. The output is a structured
architecture that defines every email in the sequence, the logic between them, and the
design element specs for each message. This skeleton is what a copywriter (or the
email-copywriter skill) uses to generate all the actual copy.

The welcome flow is the highest-leverage flow in any DTC email program. It runs 24/7,
hits every new subscriber at peak intent, and sets the tone for the entire relationship.
Getting the architecture right matters more than any individual email in it.

---

## Inputs

The skill needs to understand the brand and offer before generating. Ask the user for
whatever is missing:

**Required:**
- Brand name and category
- Welcome offer (discount, GWP, free shipping, or no offer)
- Hero product(s) to feature

**Helpful but not required (infer or ask):**
- Number of products / product lines
- Whether the brand has a subscription model
- Whether SMS is part of the flow
- Key proof points (review count, press, certifications, stats)
- Brand voice direction (the email-copywriter skill's brand brief if available)
- Any existing welcome flow they're replacing (to understand what they've tried)

If the user provides past campaign data, brand URLs, or training data, process it the same
way the email-copywriter skill does to extract voice and brand context.

---

## Output Format

The skeleton outputs in a structured format inside a code block. Each node in the flow is
clearly defined with its type, timing, and specs.

\`\`\`
WELCOME FLOW: [Brand Name]
Trigger: [trigger event]
Entry Filters: [any filters on who enters]
Exit Condition: [when someone leaves the flow, typically on purchase]

---

[DELAY] — Immediate / X minutes after trigger

[EMAIL 1] — [Short purpose label]
Timing: [when this sends relative to trigger]
Purpose: [1-2 sentences on what this email accomplishes]
Subject line direction: [the angle, not the actual subject line]
Sections:
  1. [Section type + design element if applicable]
     Copy spec: [what copy goes here, briefly]
  2. [Section type + design element]
     Copy spec: [brief]
  3. ...
Dynamic content: [any Klaviyo dynamic blocks, conditional shows, or personalization]
Notes: [any implementation notes for the builder]

---

[DELAY] — X hours/days

[CONDITIONAL SPLIT] — Split on [condition]
  YES branch → continues to Email X
  NO branch → continues to Email Y

[EMAIL 2] — [Short purpose label]
...
\`\`\`

### Design Elements in Flow Emails

Each email in the skeleton can reference design elements from the email design element
library (the email-copywriter skill's block library). When speccing an email, reference
these by their exact library name so the copywriter and designer know what to build.

Flow emails tend to be shorter than campaign emails. 1-2 design elements per flow email
max. Some flow emails (like a simple reminder) might have zero and just be clean hero +
copy + CTA.

### Dynamic Content in Flows

Unlike campaigns, flow emails can pull dynamic data from the trigger event and subscriber
profile. Always spec where dynamic content should go:

- \`{{ first_name|default:"there" }}\` for personalization
- \`{{ event.ProductName }}\` from browse/cart trigger events
- \`{{ event.ProductImageURL }}\` for dynamic product images
- \`{{ event.Price }}\` for dynamic pricing
- Conditional show/hide blocks based on profile properties (e.g., show subscription CTA
  only if subscriber is not already a subscriber)
- Catalog feed blocks for personalized product recommendations

---

## Architecture Principles

### 1. Each email has exactly one job.

E1 is not trying to welcome, educate, prove, AND sell. E1 welcomes and sells. E2 proves.
E3 educates. E4 urgency-closes. When a single email tries to do too much, every section
competes for attention and nothing lands. Define the job first, then build the sections
around that single job.

### 2. The sequence tells a narrative, not a list of pitches.

Read the purpose labels in order. They should tell a story:
"Welcome + offer > Why this is different > Real people, real results > How to use it >
Last chance on your offer"

If the purposes read like: "Sell > Sell again > Sell harder > Please buy" the
architecture is wrong.

### 3. Front-load the offer, back-load the proof.

E1 should deliver the welcome offer clearly and immediately. The subscriber just opted in.
They're expecting it. Don't make them wait. The proof, education, and brand story come in
E2-E4 where they build the case for anyone who didn't convert on E1.

### 4. Timing compresses at the start, expands at the end.

E1: Immediate or within minutes. E2: ~24 hours later. E3: ~48 hours. E4: ~72 hours.
E5+: 3-5 day gaps. The subscriber's intent decays over time. Hit them while they're warm,
then taper as interest cools. Never send E2 the same day as E1.

### 5. Split on purchase, not engagement.

The most important split in a welcome flow is: did they buy or not? If they bought after
E1, they should NOT get the "still thinking about it?" E3. They should either exit the
flow or enter a post-purchase track. Engagement splits (opened vs didn't open) are
secondary and optional.

### 6. The offer should appear in every email until they convert.

If the welcome offer is 50% off, that offer should be visible somewhere in every email in
the series. Not always as the hero, but always present. A banner, a footer reminder, a PS
line. The offer is the thread that ties the sequence together.

### 7. Design elements carry more weight in flows than campaigns.

Flow emails are shorter. Subscribers are less invested. A Feature Checklist Matrix or a
Before/After Photo Grid communicates in 2 seconds what a paragraph of copy can't. Lean on
design elements heavily, especially in E2-E4 where you're building the case.

### 8. Always plan the "did not purchase" ending.

The last email in the welcome flow for non-converters should be a genuine last-chance on
the offer with urgency, or a clean transition into the main list with no hard feelings.
Don't let the flow just stop. Close the loop.

---

## Generating

Before generating a welcome flow skeleton, read \`references/welcome-templates.md\`. It
contains proven architectures for different welcome flow scenarios:

- **Standard Welcome (with offer)** — 5-7 emails over 10-14 days
- **Welcome (no offer)** — 4-6 emails, brand-led
- **Welcome + Subscription Push** — OTP to subscription conversion
- **Welcome with SMS** — dual-channel
- **Minimal Welcome** — 3 emails, compressed
- **Product-Specific Welcome** — branching paths by product interest

Select the right variant based on what the user describes. Customize timing, splits,
design elements, and email count based on brand context. The templates are starting points,
not rigid scripts.

---

## Flow Filters and Smart Sending

Every welcome flow skeleton should include:

**Entry filters:**
- Has not been in this flow in the last X days (prevents re-entry)
- Is not suppressed
- Has email consent

**Exit conditions:**
- Placed Order (primary exit)
- Unsubscribed
- Or: completed the full sequence

**Smart sending:** Typically OFF for welcome flows. Welcome emails are expected and
time-sensitive. Smart sending can delay or skip critical messages.

**Quiet hours:** Respect sending hours (8am-9pm recipient local time), but E1 should
send immediately regardless since they just opted in.

---

## After Generating

Once the user approves the skeleton:
1. Each email node can be fed into the email-copywriter skill for full copy generation
2. The skeleton can be handed to a Klaviyo builder for implementation
3. The platform can auto-generate all messages from the approved skeleton

The skeleton is the blueprint. Everything else builds on top of it.
`;
