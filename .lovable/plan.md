Plan to fix the flow layout behavior so it matches the centered, branch-aware model you described.

### What will change
1. Replace the current collision-push layout with a deterministic tree/path layout.
2. Keep the trigger/main path on a single center line by default.
3. Only split nodes create horizontal movement.
4. Conditional split children render on the same vertical level, evenly spaced around the split parent center.
5. Each branch becomes its own centered vertical path after the split.
6. Dropping new nodes into a path will insert structurally and then re-layout the entire flow, instead of placing the node at an arbitrary midpoint.

### Current issue
The current implementation still uses manual `x/y` placement plus `resolveNodeCollisions(...)`. That resolver only pushes overlapping nodes downward and does not understand parent/child structure. When a split creates a NO exit on the right, the following path can feel shunted right or unbalanced because the layout is not recomputing from the flow graph.

### Target behavior
The layout should work like this:

```text
                    Trigger
                       |
                    Email 1
                       |
              Conditional Split
                  /           \
             YES path       NO path
              Email 2       Exit flow
                 |              |
              Delay          ...
```

Rules:
- Trigger defines the global center line.
- Linear nodes stay centered under the trigger.
- A split node stays centered on its incoming path.
- The first YES and NO child nodes sit on the same Y level.
- YES and NO children are horizontally balanced around the split center.
- Descendants align to the center line of their own branch.
- Empty branches render as an `Exit the flow` node in that branch lane.
- Branch spacing is based on subtree width, not a fixed shove to the right.

### Implementation steps
1. Introduce a small graph layout engine inside `SkeletonViewer.tsx`:
   - Build adjacency from `graphEdges`.
   - Find root at `trigger`.
   - Compute each node subtree width.
   - Assign positions top-down from the trigger center.
   - Use a fixed vertical gap between levels and a minimum horizontal gap between sibling branches.

2. Remove `resolveNodeCollisions(...)` from normal graph layout:
   - No more post-placement shunting.
   - Collision prevention comes from layout math.
   - Manual dragging can select/reposition temporarily, but structural layout wins after insertions so the flow remains coherent.

3. Rebuild split positioning:
   - For a split parent, group outgoing edges by `yes` and `no`.
   - Place YES and NO child subtrees at the same Y.
   - Center the combined branch group under the split node.
   - Keep each branch lane centered on its own first child.

4. Fix insertion behavior:
   - Drops will target an edge/path segment.
   - Inserted node splits that edge.
   - Then the graph layout engine recalculates all positions smoothly.
   - For empty split branches, dropping onto the exit placeholder should replace or insert before that branch exit.

5. Improve edge routing and labels:
   - Main path edges stay vertical when parent/child centers match.
   - Split edges route symmetrically from the split node to each branch child.
   - YES/NO badges sit on their branch line without visually dragging the whole tree off-center.

6. Update fit-to-view and summary-card alignment:
   - Fit-to-view should center the full graph bounds.
   - Summary card stays centered above the trigger and expands upward from its base bar.

### Files to update
- `src/components/flows/SkeletonViewer.tsx`
- `src/index.css`

### Technical details
The key change is replacing this model:

```text
parsed nodes -> arbitrary x/y -> collision resolver pushes overlaps down
```

with this model:

```text
flow graph -> subtree width calculation -> centered branch-aware positions -> render
```

This avoids the current “shunting” problem because a branch cannot push unrelated nodes to the right. The layout engine owns every node position from the graph structure, so overlap prevention is built in rather than patched afterward.