
Goal: replace the current “jump straight to skeleton” flow with a research-backed, interactive setup conversation that confirms the few operator-controlled inputs before a skeleton is generated, while also fixing the broken/raw JSON formatting in the setup chat.

1. Fix the pre-skeleton chat rendering so setup never shows broken JSON
- Update `FlowAgentChat.tsx` so partial `flow-synth` / `flow-question` control blocks are buffered and rendered only through dedicated UI components, never as raw markdown text mid-stream.
- Prevent clipped fenced payloads during streaming by keeping control-block parsing state separate from visible assistant prose.
- Tighten the centered hero layout so the setup panel expands naturally with content instead of truncating/cropping long synth blocks.

2. Add structured flow-setup state to persist discovered + confirmed inputs
- Add fields to `public.flows` for structured setup data and setup phase, e.g.:
  - `setup_status` (`draft`, `research_ready`, `needs_confirmation`, `ready_for_skeleton`, `skeleton_ready`, etc.)
  - `setup_data jsonb`
- Store both:
  - researched candidates: detected site offers, likely hero products, subscription model, promo patterns
  - confirmed operator choices: offer type, coupon configuration, hero product priority, product-feed priority, notes
- Keep this on the existing `flows` table so RLS stays simple and the flow record remains the single source of truth.

3. Change the flow-agent behavior from “research first, ask last” to “research, propose, confirm, then build”
- Update `supabase/functions/flow-agent/index.ts` so the first pass always:
  - reads compiled brand context + raw research
  - extracts candidate offers, hero products, subscription model, and likely product priorities
  - determines which items are operator-controlled and must be confirmed before skeleton generation
- Replace the current prompt rule that often allows immediate skeleton generation with a stricter setup rule:
  - never generate the skeleton until critical flow-configuration facts are confirmed
  - propose researched defaults instead of asking blank questions
  - ask in a structured sequence, not generic chat
- The setup sequence should explicitly cover:
  - Offer status: no offer / evergreen offer / campaign-specific offer
  - Discount type: static site code / static flow-only code / dynamic Klaviyo coupon
  - If dynamic coupon: require coupon pool/name and instruct downstream generation to use the correct Klaviyo Liquid syntax
  - Hero product / catalog priority: confirm the main product(s) or whether it should stay category-wide
  - Feed/product priority: what products should be emphasized if product blocks are used
- Use brand research to populate candidate options first, e.g. “I found these likely offers on the site — is it one of these or something else?”

4. Introduce richer interactive setup cards in the chat UI
- Extend `FlowAgentChat.tsx` beyond simple chips into structured assistant cards:
  - researched summary card
  - confirmation cards
  - selectable option pills/cards
  - inline edit forms
  - “use this / edit / none of these” actions
- Build a more polished conversational setup pattern:
  - assistant proposes researched assumptions
  - user can confirm quickly or edit inline
  - assistant proceeds to next required setup item
- Keep the interaction visually chat-native rather than opening a separate boring form.

5. Feed confirmed setup data into skeleton generation and downstream email generation
- When setup is complete, pass `setup_data` into the skeleton prompt so the generated flow reflects:
  - the confirmed offer type
  - correct coupon mechanics
  - confirmed hero product emphasis
  - confirmed product prioritization
- Update downstream flow email generation (`FlowBuilderPage.tsx` and related generation brief assembly) to include the confirmed setup metadata, so message generation uses:
  - correct dynamic coupon syntax vs static code handling
  - correct product emphasis
  - correct offer framing
- This also avoids bad field usage like stuffing non-subject content into subject/preview-oriented slots.

6. Improve the create-flow experience so the user always lands in setup first
- On first open of a new flow, show the guided setup conversation as the required first stage.
- Only transition into skeleton review mode once:
  - required setup items are confirmed
  - the skeleton has been generated from those confirmed values
- Preserve the refine panel afterward, but treat it as post-setup editing rather than the main place where critical requirements are gathered.

7. QA the full path end-to-end
- Verify these flow-creation scenarios:
  - brand with a clearly visible evergreen site offer
  - brand with no visible offer
  - brand with subscription language but ambiguous discount mechanics
  - dynamic coupon flow requiring coupon pool confirmation
  - single hero-product brand vs multi-product brand
- Confirm that:
  - no raw JSON/fenced control blocks ever appear in the UI
  - setup cards never clip or truncate
  - skeleton generation is blocked until required confirmations are complete
  - confirmed offer/product data is reflected in the skeleton and later generation prompts

Technical details
- Files likely touched:
  - `src/components/flows/FlowAgentChat.tsx`
  - `src/pages/FlowBuilderPage.tsx`
  - `supabase/functions/flow-agent/index.ts`
  - `supabase/migrations/...sql`
- Recommended `setup_data` shape:
```text
{
  offer: {
    detected_candidates: [...],
    confirmed_mode: "none" | "static_code" | "dynamic_coupon",
    description: "",
    static_code: "",
    dynamic_coupon_pool: ""
  },
  products: {
    detected_hero_products: [...],
    confirmed_primary_products: [...],
    scope: "hero" | "category" | "catalog"
  },
  merchandising: {
    selected_feed_preset: "",
    notes: ""
  },
  confirmations: {
    offer_confirmed: true,
    product_priority_confirmed: true
  }
}
```
- Dynamic coupon rule:
  - static code: use the explicit code the operator confirmed
  - dynamic Klaviyo coupon: store the coupon pool/name in setup and instruct downstream content/generation to use the proper dynamic coupon Liquid, not a hardcoded code
