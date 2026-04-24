Goal: make the flow skeleton represent real flow logic instead of flattening everything into one line, so this browse abandonment flow correctly shows the discount path and no-discount path as two populated branches with accurate send timing.

What is actually broken
- The stored skeleton for this flow already contains the intended strategy: Email 1, a 24h delay, then a split for first-time buyer vs returning buyer, with Email 2A on one path and Email 2B on the other.
- The current preview cannot represent that structure correctly.
- `SkeletonViewer.tsx` linearizes parsed nodes with a single `prev` pointer and a single global `cumulativeDelayMinutes`, so after a split it attaches the next message to YES and then keeps chaining subsequent messages underneath it.
- `SkeletonViewer.tsx` also auto-creates a fake NO exit when a split appears, instead of rendering the explicit NO-path content from the skeleton.
- `skeletonParser.ts` only captures split branch descriptions as text metadata; it does not map downstream nodes to YES/NO paths.
- `flow-agent/index.ts` asks for branch descriptions, but not an executable branch syntax that the parser/renderer can reliably turn into two real paths.

Implementation plan
1. Introduce explicit branch syntax in the flow skeleton contract
- Update `supabase/functions/flow-agent/index.ts` so conditional splits must emit real branch blocks, not just descriptive bullets.
- Use a strict format the parser can execute, for example explicit YES/NO path sections under a split, with optional branch-local delays and optional merge/end behavior.
- Add rules that branch nodes must carry cumulative timing that reconciles with any branch-local delays.
- Keep the current guardrails on short labels, real SL/PT copy, and flow-specific logic.

2. Make the skeleton parser branch-aware
- Update `src/lib/flows/skeletonParser.ts` to parse split nodes plus branch-scoped child nodes instead of treating the skeleton as one flat linear list.
- Preserve per-branch metadata: branch id, parent split id, branch order, branch-local delays, and optional merge target.
- Keep `subject_line` and `preview_text` as first-class fields for every email node.

3. Rebuild the review graph from real path topology
- Refactor `buildBoard` in `src/components/flows/SkeletonViewer.tsx` so it builds an actual graph, not a single linear chain.
- Remove the fake “NO → Exit” fallback when the skeleton explicitly defines a NO branch.
- Track cumulative minutes per path, not globally, so each branch’s timing stays correct after splits.
- Render both child emails under the split for this exact case:
  - YES: discount path
  - NO: proof-only path
- Support optional branch merges so future flows can split and then rejoin without breaking layout.

4. Tighten the flow strategy rules for this browse abandonment case
- Update the flow-agent instructions so this pattern is generated intentionally:
  - Viewed Product trigger
  - real suppression filters
  - Email 1 after a short delay
  - 24h delay
  - first-time-buyer split
  - YES path gets discount version
  - NO path gets proof-only version
- Ensure the agent only uses a split when content genuinely diverges, and when it does, it must fully populate both branches.

5. Validate against the live failing case
- Re-generate this exact flow after the prompt/parser changes.
- Confirm the preview shows:
  - Email 1
  - 24h delay
  - split node
  - populated YES branch with discount email
  - populated NO branch with proof-only email
  - no fake NO exit unless explicitly defined
  - accurate cumulative timing labels on each branch
- Also verify SL/PT still render from actual `Subject line` and `Preview text` fields in the branch emails.

Technical details
- Files to update:
  - `supabase/functions/flow-agent/index.ts`
  - `src/lib/flows/skeletonParser.ts`
  - `src/components/flows/SkeletonViewer.tsx`
  - possibly `src/components/flows/FlowEmailDetail.tsx` if branch timing/copy display needs to read the new parsed shape
- Main architectural change:

```text
Before:
flat node list
split = label only
next email always chained to YES
single global delay counter

After:
graph model
split owns YES/NO child paths
branch nodes belong to explicit paths
per-path cumulative timing
optional merge/end support
```

Validation
- Create/rebuild a browse abandonment flow with first-time buyer discount branching.
- Confirm both branches are visibly populated.
- Confirm timings reconcile exactly with delays on each path.
- Confirm no branch collapses into a fake exit.
- Confirm review/detail views still show correct SL/PT values for branch emails.