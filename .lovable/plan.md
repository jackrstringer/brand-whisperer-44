
Goal: make the flow setup feel like Claude/Lovable’s normal chat confirmations: one concise question at a time, stable in the chat, no disappearing cards, no long research dumps, and no fake “drafting skeleton” status before the user has confirmed setup.

1. Stop questions from disappearing during streaming/realtime updates
- Update `FlowAgentChat.tsx` so active streamed assistant content is treated as the visible source of truth until the response finishes.
- Prevent realtime `flows.messages` refreshes from overwriting the in-progress assistant/question message while the stream is active.
- After the stream finishes, reconcile from the saved backend message once, instead of repeatedly replacing the visible chat state.
- Keep the last assistant question visible until the user answers it, even if background `setup_data` or `setup_status` updates arrive.

2. Simplify the setup UI to one Claude-style confirmation at a time
- Remove the large `SynthCard` / research-summary card from the main chat experience.
- Replace it with a short assistant message plus one compact question card:
  - 1 sentence context max
  - 2–4 answer buttons max
  - optional “Something else” text input
- Example target behavior:
  - “I found WELCOME25 as the likely welcome offer. Should this flow use it?”
  - Buttons: `Use WELCOME25`, `No offer`, `Use dynamic Klaviyo coupon`, `Something else`
- Avoid showing long lists of facts, plans, performance data, or multi-section cards during setup.

3. Fix misleading progress/status states
- Remove the automatic “Drafting your skeleton” status when the agent is only asking setup questions.
- Only show skeleton/drafting progress after the setup gate is complete and the agent actually emits a `flow-skeleton`.
- For setup turns, use a simple Claude/Lovable-style thinking indicator like:
  - `Thinking…`
  - `Checking brand research…`
- Do not show the four-step progress rail during every setup question.

4. Tighten the backend agent prompt so it stops overwhelming the user
- Update `supabase/functions/flow-agent/index.ts` prompt rules:
  - no synthesis block by default
  - no full plan before confirmation
  - one confirmation question per response
  - question text must be short and actionable
  - helper text must be one line max
  - options must be short labels, not paragraphs
- Keep the research logic, but use it internally to propose defaults instead of dumping it into the UI.

5. Make setup deterministic instead of relying on verbose LLM control blocks
- Add stricter parsing for `flow-question` / `flow-setup` blocks:
  - strip markdown fences safely
  - ignore incomplete control blocks during streaming
  - only render complete, valid questions
  - fail loudly in the console/backend logs if the control JSON is malformed
- If the agent returns too much prose, show only the concise question portion and suppress hidden setup/control JSON from the user.
- Do not add smooth fake fallback success states.

6. Persist setup progress without re-triggering endless setup loops
- Ensure `setup_status` transitions are stable:
  - `draft` → `needs_confirmation`
  - `needs_confirmation` remains until user answers required items
  - `ready_for_skeleton` only after required setup data is confirmed
  - `skeleton_ready` only after skeleton is actually saved
- Avoid auto-restarting the flow setup when there is already a valid unanswered question in `messages`.
- Keep the user’s answer and the agent’s question visible in the conversation history.

7. Fix React ref warnings in the chat components
- Update `MessageBubble` and/or `QuestionChips` usage so no function component receives a `ref` unless it uses `forwardRef`.
- This will remove the current console warnings and reduce render instability while debugging the chat flow.

8. Keep skeleton generation gated but unobtrusive
- Preserve the hard requirement that offer and product priority are confirmed before skeleton generation.
- Make that requirement invisible to the user as a natural chat sequence:
  1. Confirm offer/coupon mechanics
  2. Confirm hero product/product scope
  3. Generate skeleton
- Once both answers are confirmed, the agent should immediately generate the skeleton without asking another meta question.

Files to update:
- `src/components/flows/FlowAgentChat.tsx`
- `supabase/functions/flow-agent/index.ts`
- possibly `src/pages/FlowBuilderPage.tsx` if setup/realtime gating needs a small adjustment

Validation:
- Create a new welcome flow and confirm:
  - only one concise question appears
  - it does not disappear after a few seconds
  - no raw JSON or fenced blocks appear
  - no long research summary overwhelms the chat
  - no “Drafting your skeleton” message appears before setup is complete
  - answering offer then product priority leads to skeleton generation
  - console no longer shows the function-component ref warning
