import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Connection,
  NodeChange,
  EdgeChange,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { TriggerNode } from "./nodes/TriggerNode";
import { TimeDelayNode } from "./nodes/TimeDelayNode";
import { EmailNode } from "./nodes/EmailNode";
import { SmsNode } from "./nodes/SmsNode";
import { ConditionalSplitNode } from "./nodes/ConditionalSplitNode";
import { SimpleNode } from "./nodes/SimpleNode";
import { InsertableEdge } from "./edges/InsertableEdge";
import { QuickAddMenu } from "./QuickAddMenu";
import { Button } from "@/components/ui/button";
import {
  FlowCanvasNode,
  FlowCanvasEdge,
  FlowNodeKind,
  FlowNodeData,
  NODE_KIND_META,
} from "./types";

const nodeTypes = {
  trigger: TriggerNode,
  time_delay: TimeDelayNode,
  email: EmailNode,
  sms: SmsNode,
  push: SimpleNode,
  conditional_split: ConditionalSplitNode,
  trigger_split: ConditionalSplitNode,
  update_property: SimpleNode,
  list_update: SimpleNode,
  webhook: SimpleNode,
  internal_alert: SimpleNode,
  custom_action: SimpleNode,
};

const edgeTypes = { insertable: InsertableEdge };

// Vertical auto-layout: stack nodes in a single column.
// Splits get their two children placed side-by-side under them.
const NODE_GAP_Y = 160;
const COL_X = 0;

function autoLayout(
  nodes: FlowCanvasNode[],
  edges: FlowCanvasEdge[]
): FlowCanvasNode[] {
  if (nodes.length === 0) return nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    const arr = childrenOf.get(e.source) || [];
    arr.push(e.target);
    childrenOf.set(e.source, arr);
  }
  // Find roots (nodes that are not anyone's target)
  const targets = new Set(edges.map((e) => e.target));
  const roots = nodes.filter((n) => !targets.has(n.id));
  const start = roots[0] || nodes[0];

  const positions = new Map<string, { x: number; y: number }>();
  let y = 0;
  const visited = new Set<string>();
  const walk = (id: string, x: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    positions.set(id, { x, y });
    y += NODE_GAP_Y;
    const kids = childrenOf.get(id) || [];
    if (kids.length <= 1) {
      for (const k of kids) walk(k, x);
    } else {
      // Split: spread kids horizontally
      const span = 320;
      kids.forEach((k, i) => {
        const offset = (i - (kids.length - 1) / 2) * span;
        walk(k, x + offset);
      });
    }
  };
  walk(start.id, COL_X);
  // Any orphans: stack at the bottom
  for (const n of nodes) {
    if (!positions.has(n.id)) {
      positions.set(n.id, { x: COL_X, y });
      y += NODE_GAP_Y;
    }
  }
  return nodes.map((n) => {
    const p = positions.get(n.id)!;
    if (n.position.x === p.x && n.position.y === p.y) return n;
    return { ...n, position: p };
  });
}

interface CanvasProps {
  nodes: FlowCanvasNode[];
  edges: FlowCanvasEdge[];
  setNodes: React.Dispatch<React.SetStateAction<FlowCanvasNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<FlowCanvasEdge[]>>;
  onNodeOpenDetail?: (nodeId: string) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
}

function CanvasInner({ nodes, edges, setNodes, setEdges, onNodeOpenDetail, onSelectionChange }: CanvasProps) {
  const [quickAdd, setQuickAdd] = useState<{
    screen: { x: number; y: number };
    flow: { x: number; y: number };
    insertOnEdgeId?: string;
  } | null>(null);
  const [dropPreview, setDropPreview] = useState<{ edgeId: string | null; afterNodeId: string | null } | null>(
    null
  );
  const rf = useReactFlow();

  const decoratedEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        type: "insertable" as const,
        data: { ...(e.data || {}), highlighted: dropPreview?.edgeId === e.id },
      })),
    [edges, dropPreview]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => {
        return applyNodeChanges(changes, nds) as FlowCanvasNode[];
      }),
    [setNodes]
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds) as FlowCanvasEdge[]),
    [setEdges]
  );
  const onConnect = useCallback(
    (conn: Connection) => setEdges((eds) => addEdge({ ...conn, type: "insertable" }, eds) as FlowCanvasEdge[]),
    [setEdges]
  );
  const cleanupLayout = useCallback(() => {
    setNodes((nds) => autoLayout(nds, edges));
  }, [edges, setNodes]);

  const insertNodeOnEdge = useCallback(
    (kind: FlowNodeKind, edgeId: string) => {
      const id = crypto.randomUUID();
      const meta = NODE_KIND_META[kind];
      const data: FlowNodeData = { kind, label: meta.label, status: "draft" };
      const newNode: FlowCanvasNode = {
        id,
        type: kind,
        position: { x: 0, y: 0 }, // auto-layout will place it
        data,
      };
      setEdges((eds) => {
        const target = eds.find((e) => e.id === edgeId);
        if (!target) return eds;
        const remaining = eds.filter((e) => e.id !== edgeId);
        const nextEdges = [
          ...remaining,
          {
            id: crypto.randomUUID(),
            source: target.source,
            sourceHandle: target.sourceHandle,
            target: id,
            type: "insertable",
          },
          { id: crypto.randomUUID(), source: id, target: target.target, type: "insertable" },
        ];
        setNodes((nds) => autoLayout([...nds, newNode], nextEdges));
        return nextEdges;
      });
    },
    [setNodes, setEdges]
  );

  const appendNodeAfter = useCallback(
    (kind: FlowNodeKind, afterNodeId: string | null) => {
      const id = crypto.randomUUID();
      const meta = NODE_KIND_META[kind];
      const data: FlowNodeData = { kind, label: meta.label, status: "draft" };
      const newNode: FlowCanvasNode = {
        id,
        type: kind,
        position: { x: 0, y: 0 },
        data,
      };
      if (afterNodeId) {
        setEdges((eds) => {
          const nextEdges = [
            ...eds,
            { id: crypto.randomUUID(), source: afterNodeId, target: id, type: "insertable" },
          ];
          setNodes((nds) => autoLayout([...nds, newNode], nextEdges));
          return nextEdges;
        });
      } else {
        setNodes((nds) => [...nds, newNode]);
      }
    },
    [setNodes, setEdges]
  );

  const handleAddNode = useCallback(
    (kind: FlowNodeKind) => {
      if (!quickAdd) return;
      if (quickAdd.insertOnEdgeId) {
        insertNodeOnEdge(kind, quickAdd.insertOnEdgeId);
      } else {
        // Append to end of last node
        const last = [...nodes].sort((a, b) => b.position.y - a.position.y)[0];
        appendNodeAfter(kind, last?.id || null);
      }
      setQuickAdd(null);
    },
    [quickAdd, nodes, insertNodeOnEdge, appendNodeAfter]
  );

  useEffect(() => {
    const onInsert = (e: Event) => {
      const detail = (e as CustomEvent).detail as { edgeId: string; x: number; y: number };
      const screen = rf.flowToScreenPosition({ x: detail.x, y: detail.y });
      setQuickAdd({
        screen,
        flow: { x: detail.x, y: detail.y },
        insertOnEdgeId: detail.edgeId,
      });
    };
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { nodeId: string };
      onNodeOpenDetail?.(detail.nodeId);
    };
    const onCenter = (e: Event) => {
      const detail = (e as CustomEvent).detail as { nodeId: string };
      const node = nodes.find((n) => n.id === detail.nodeId);
      if (node) rf.setCenter(node.position.x + 140, node.position.y + 60, { zoom: 1, duration: 400 });
    };
    window.addEventListener("flowbuilder:insert-on-edge", onInsert);
    window.addEventListener("flowbuilder:open-detail", onOpen);
    window.addEventListener("flowbuilder:center-on-node", onCenter);
    return () => {
      window.removeEventListener("flowbuilder:insert-on-edge", onInsert);
      window.removeEventListener("flowbuilder:open-detail", onOpen);
      window.removeEventListener("flowbuilder:center-on-node", onCenter);
    };
  }, [rf, onNodeOpenDetail, nodes]);

  // Find nearest edge to a flow-coordinate point (for drop preview)
  const findNearestEdge = useCallback(
    (x: number, y: number): string | null => {
      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const e of edges) {
        const s = nodes.find((n) => n.id === e.source);
        const t = nodes.find((n) => n.id === e.target);
        if (!s || !t) continue;
        const mx = (s.position.x + t.position.x) / 2 + 140;
        const my = (s.position.y + t.position.y) / 2 + 60;
        const d = Math.hypot(mx - x, my - y);
        if (d < bestDist && d < 200) {
          bestDist = d;
          bestId = e.id;
        }
      }
      return bestId;
    },
    [edges, nodes]
  );

  return (
    <div
      className="absolute inset-0 bg-background"
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest(".react-flow__pane")) return;
        const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        setQuickAdd({ screen: { x: e.clientX, y: e.clientY }, flow });
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/flowbuilder-kind")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
          const edgeId = findNearestEdge(flow.x, flow.y);
          setDropPreview({ edgeId, afterNodeId: null });
        }
      }}
      onDragLeave={() => setDropPreview(null)}
      onDrop={(e) => {
        const kind = e.dataTransfer.getData("application/flowbuilder-kind") as FlowNodeKind;
        if (!kind) return;
        e.preventDefault();
        const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const edgeId = findNearestEdge(flow.x, flow.y);
        setDropPreview(null);
        if (edgeId) {
          insertNodeOnEdge(kind, edgeId);
        } else {
          const last = [...nodes].sort((a, b) => b.position.y - a.position.y)[0];
          appendNodeAfter(kind, last?.id || null);
        }
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={decoratedEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={(sel) => onSelectionChange?.(sel.nodes.map((n) => n.id))}
        nodesDraggable
        elementsSelectable
        minZoom={0.1}
        maxZoom={2}
        panOnDrag={[1, 2]}
        panOnScroll
        panOnScrollSpeed={1}
        selectionOnDrag
        selectNodesOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        preventScrolling={false}
        defaultEdgeOptions={{ type: "insertable" }}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="var(--gray-3)"
        />
        <Controls
          position="bottom-left"
          showInteractive={false}
          className="!bg-card !border !border-border !rounded-lg !shadow-sm overflow-hidden"
        />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          maskColor="rgba(250,250,250,0.7)"
          className="!bg-card !border !border-border !rounded-lg !shadow-sm"
          nodeColor={() => "var(--gray-2)"}
          nodeStrokeColor="var(--gray-3)"
        />
      </ReactFlow>

      <div className="absolute right-4 top-4 z-20">
        <Button type="button" variant="outline" size="sm" onClick={cleanupLayout}>
          Cleanup
        </Button>
      </div>

      {quickAdd && (
        <QuickAddMenu
          position={quickAdd.screen}
          onSelect={handleAddNode}
          onClose={() => setQuickAdd(null)}
        />
      )}

      {/* React Flow control button overrides */}
      <style>{`
        .react-flow__controls-button {
          background: hsl(var(--card)) !important;
          border-bottom: 1px solid hsl(var(--border)) !important;
          color: hsl(var(--foreground)) !important;
        }
        .react-flow__controls-button:hover { background: hsl(var(--muted)) !important; }
        .react-flow__controls-button svg { fill: currentColor; }
        .react-flow__minimap-mask { fill: rgba(250,250,250,0.7); }
        .react-flow__node {
          transition: transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .react-flow__node.dragging { transition: none; }
        .react-flow__pane { cursor: default; }
        .react-flow__pane.selection { cursor: crosshair; }
        .react-flow__selection {
          z-index: 20 !important;
          background: hsl(var(--foreground) / 0.08) !important;
          border: 1.5px solid hsl(var(--foreground) / 0.55) !important;
          border-radius: 8px;
          box-shadow: inset 0 0 0 1px hsl(var(--background) / 0.7), 0 8px 24px hsl(var(--foreground) / 0.08);
          pointer-events: none;
        }
        .react-flow__nodesselection-rect {
          border: 1px solid hsl(var(--foreground)) !important;
          border-radius: 10px;
          box-shadow: 0 0 0 4px hsl(var(--foreground) / 0.05);
        }
      `}</style>
    </div>
  );
}

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
