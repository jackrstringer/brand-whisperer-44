
Implement the flow message click behavior exactly as requested:

1. Split message-node click zones
   - Update `SkeletonViewer.tsx` so email/message nodes have two explicit interactive regions:
     - Top half/header: opens the full details flyout.
     - Bottom half/preview area: opens the rendered campaign preview.
   - Prevent drag/click conflicts by keeping the existing drag threshold, but routing clicks by region after the pointer is released.
   - Keep node selection behavior: clicking either region still selects the node, but only the correct region opens the correct UI.

2. Replace the current flow “details” modal with the actual ideate task flyout pattern
   - Reuse the existing `TaskDetail` implementation style and structure from `src/components/ideation/TaskDetail.tsx`.
   - Create a flow-specific adapter component that maps a `flow_email` / parsed flow node into the same detail panel UI shape:
     - Title / label
     - Status
     - Flow step metadata
     - Brief / job
     - Subject direction
     - Preview text
     - Copy notes
     - Sections
     - Timing
     - Campaign preview if generated
     - Open in Editor if `campaign_id` exists
     - Regenerate / generate action
   - This avoids the current small generic `.fl-details` pop-up and gives flow messages the same large side/center peek experience used by calendar/list tasks.

3. Implement the campaign preview overlay matching the provided reference
   - Replace the current centered basic iframe modal with a cleaner email preview modal:
     - White, rounded, high-polish preview shell.
     - Compact top bar with subject line, preview text, close button, and optional expand/open controls.
     - Rendered email iframe in a constrained campaign preview frame.
     - Bottom action bar with “Open in Editor” and “Regenerate” where available.
   - This preview opens only from the bottom half of the message node.

4. Keep non-message nodes simple
   - Delay, split, trigger, filter, and exit nodes can continue opening their lightweight metadata/details behavior unless they need the full flyout later.
   - Exit remains a tiny icon node.

5. Tighten hover and selected states for the new regions
   - Add clear hover states separately for:
     - Entire node
     - Top/header details zone
     - Bottom campaign preview zone
     - Preview thumbnail
     - Generate button
     - Delete button
   - Make selected state persist visually after click.
   - Ensure hover states do not move, resize, or jitter the node.

6. Technical changes
   - Files to update:
     - `src/components/flows/SkeletonViewer.tsx`
     - `src/pages/FlowBuilderPage.tsx`
     - `src/index.css`
   - Likely add a new component:
     - `src/components/flows/FlowEmailDetail.tsx`
   - Use the existing `TaskDetail.tsx` layout patterns rather than inventing a new modal:
     - Portal-based panel.
     - Side/center peek mode behavior.
     - Same top bar controls.
     - Same details section structure.
     - Same campaign preview section behavior.
   - No database schema changes are required.
