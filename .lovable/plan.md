

## Investigation summary

**Root causes of the bad UX:**

1. **Agent over-produces.** The current prompt + welcome-flow.md tell Claude to output full Subject Lines, Preview Text, Hero Sections, Body Structure, etc. inside the `flow-skeleton` block. That's why you're seeing 100+ lines of pseudo-copy. The skeleton is supposed to be a *brief structural map*, not the email itself.
2. **Parser mismatch = empty canvas.** `skeletonParser.ts` only recognizes `[EMAIL ...]`, `[DELAY ...]`, `[CONDITIONAL SPLIT ...]` bracket syntax. The agent is currently outputting `## EMAIL 1: ...` markdown headers, so `parsedNodes` returns `[]` → SkeletonViewer shows the empty-state placeholder → "I don't see anything."
3. **Skeleton streams into the chat as a giant bubble.** While Claude streams the `flow-skeleton` fence content, every token is rendered as an assistant message. We strip the fence *after* completion, but the user sees the wall of markdown for 30+ seconds.
4. **Model is already `claude-sonnet-4-5-20250929`** — it's not Opus. So the slowness isn't model choice; it's the 8000-token verbose output. Cutting output 5× makes it feel 5× faster.
5. **Canvas is a vertical list, not a Miro board.** And there's no inline-expansion of generated emails — there's just a tiny preview dialog.

## What I'll change

### A. Fix the agent (brief skeletons, not copy)

**`supabase/functions/flow-agent/index.ts`**
- Tighten system prompt: skeleton must be a *structural brief only* — per email: `label`, `timing`, `job` (one sentence), `subject_direction` (angle, not actual SL), `sections` (3-5 bullets), `notes` (≤1 line). **Forbid** writing actual subject lines, preview text, body copy, hero copy, CTA copy.
- Force the bracket syntax the parser expects (`[EMAIL 1 — Label]`, `[DELAY] — 24h`) so the canvas actually populates.
- Drop `max_tokens` from 8000 → 2500. Skeleton should fit in ~600 tokens.
- Keep Sonnet-4.5 (already correct).
- Suppress streaming the `flow-skeleton` fence into the chat: emit a separate `skeleton_chunk` SSE event for content inside the fence so the UI can route it to the canvas, not the chat bubble. Chat only shows the synth card + a short "Skeleton drafted ✓" line.

### B. Make the canvas the source of truth

**`src/components/flows/SkeletonViewer.tsx` → rebuild as "Flow Board"**
- Horizontal/vertical Miro-style canvas (vertical column for v1, since flows are linear) with cleaner node cards.
- Each email node = compact brief card: number, label, timing pill, one-line job, subject angle, sections as small chips.
- **Inline expand**: clicking a node expands it *in place* in the canvas (not a dialog) to reveal:
  - Brief (editable inline)
  - When generated: rendered 390px email iframe + Subject Line + Preview Text + creation insights, side-by-side with the brief
  - Collapses back with a chevron
- Connectors stay as thin vertical lines with the timing label between nodes.
- Empty state replaced by a "Skeleton drafting…" shimmer when `flow.status === 'generating'` and chat is producing the skeleton.

**`src/pages/FlowBuilderPage.tsx`**
- Remove the small `previewIndex` Dialog (replaced by inline expansion).
- Remove the `editingNodeIndex` Dialog (inline edit in the expanded node).
- Pass `expandedIndex` state down so only one node is open at a time.
- Pull SL/PT/insights from the linked `campaigns` row (subject_line, preview_text, creation_insights / generation_meta) when expanded.

### C. Chat stays the conductor

**`src/components/flows/FlowAgentChat.tsx`**
- When a `skeleton_chunk` event arrives, do NOT append to the chat bubble — just show a compact "Drafting skeleton in the canvas →" indicator.
- After skeleton completes, the chat shows: synth card + "Skeleton ready. Edit nodes directly or tell me what to change."
- Existing question chips / synth card stay as-is.

### D. Tighten the skill file (welcome-flow.md)

The welcome-flow.md skill currently instructs full per-email "Subject line direction / Sections / Copy spec". I'll add a stronger directive in the system prompt (not edit the .md, per your earlier instruction to not overwrite skill files): *"Output skeleton in BRACKET syntax only. No subject lines, no preview text, no body copy. ≤80 lines total."*

## Flow after changes

```text
1. User picks flow type
   → Centered chat, agent does research + asks ≤1 question via chips
2. Agent drafts a SHORT bracket-format skeleton
   → Canvas slides in with brief node cards (labels, timing, job, sections)
   → Chat shows synth card + "Skeleton ready" message
3. User edits inline in the canvas OR chats "make E2 about social proof"
   → Agent returns updated skeleton, canvas re-renders
4. User hits "Approve & Generate All"
   → generate-campaign runs per node (already wired)
   → Each node card flips to expanded state showing live email + SL/PT/insights
```

## Files to edit

- `supabase/functions/flow-agent/index.ts` — prompt rewrite, max_tokens=2500, separate `skeleton_chunk` SSE event
- `src/components/flows/FlowAgentChat.tsx` — handle `skeleton_chunk`, suppress fence in chat, "Drafting in canvas" indicator
- `src/components/flows/SkeletonViewer.tsx` — Miro-board node cards with inline expand
- `src/pages/FlowBuilderPage.tsx` — remove preview/edit dialogs, wire inline expansion, pull campaign meta (SL/PT/insights) for expanded nodes
- `src/lib/flows/skeletonParser.ts` — add tolerant fallback so `## EMAIL N:` markdown still parses (defense in depth)

No DB migrations needed.

