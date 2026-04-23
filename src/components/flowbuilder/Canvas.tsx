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

interface CanvasProps {
  nodes: FlowCanvasNode[];
  edges: FlowCanvasEdge[];
  setNodes: React.Dispatch<React.SetStateAction<FlowCanvasNode[]>>;
  setEdges: React.Dispatch<React.SetStateAction<FlowCanvasEdge[]>>;
  onNodeOpenDetail?: (nodeId: string) => void;
}

function CanvasInner({ nodes, edges, setNodes, setEdges, onNodeOpenDetail }: CanvasProps) {
  const [quickAdd, setQuickAdd] = useState<{
    screen: { x: number; y: number };
    flow: { x: number; y: number };
    insertOnEdgeId?: string;
  } | null>(null);
  const rf = useReactFlow();

  // Force every edge to use our insertable type
  const decoratedEdges = useMemo(
    () => edges.map((e) => ({ ...e, type: "insertable" as const })),
    [edges]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds) as FlowCanvasNode[]),
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

  const handleAddNode = useCallback(
    (kind: FlowNodeKind) => {
      if (!quickAdd) return;
      const id = crypto.randomUUID();
      const meta = NODE_KIND_META[kind];
      const data: FlowNodeData = { kind, label: meta.label, status: "draft" };
      const newNode: FlowCanvasNode = {
        id,
        type: kind,
        position: { x: quickAdd.flow.x - 140, y: quickAdd.flow.y - 30 },
        data,
      };
      setNodes((nds) => [...nds, newNode]);

      if (quickAdd.insertOnEdgeId) {
        // Atomic edge split: remove old edge, create source→new and new→target
        setEdges((eds) => {
          const target = eds.find((e) => e.id === quickAdd.insertOnEdgeId);
          if (!target) return eds;
          const remaining = eds.filter((e) => e.id !== quickAdd.insertOnEdgeId);
          return [
            ...remaining,
            { id: crypto.randomUUID(), source: target.source, sourceHandle: target.sourceHandle, target: id, type: "insertable" },
            { id: crypto.randomUUID(), source: id, target: target.target, type: "insertable" },
          ];
        });
      }
      setQuickAdd(null);
    },
    [quickAdd, setNodes, setEdges]
  );

  // Listen for edge "+" insertion events
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
    window.addEventListener("flowbuilder:insert-on-edge", onInsert);
    window.addEventListener("flowbuilder:open-detail", onOpen);
    return () => {
      window.removeEventListener("flowbuilder:insert-on-edge", onInsert);
      window.removeEventListener("flowbuilder:open-detail", onOpen);
    };
  }, [rf, onNodeOpenDetail]);

  return (
    <div
      className="absolute inset-0"
      style={{ background: "hsl(var(--flow-canvas))" }}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest(".react-flow__pane")) return;
        const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        setQuickAdd({ screen: { x: e.clientX, y: e.clientY }, flow });
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
        snapToGrid
        snapGrid={[20, 20]}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{ type: "insertable" }}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color="hsl(var(--flow-grid))"
        />
        <Controls
          position="bottom-left"
          showInteractive={false}
          style={{
            background: "hsl(var(--flow-card))",
            borderRadius: 999,
            border: "1px solid hsl(var(--flow-border))",
            padding: 4,
          }}
        />
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          maskColor="hsl(var(--flow-canvas) / 0.7)"
          style={{
            background: "hsl(var(--flow-card))",
            border: "1px solid hsl(var(--flow-border))",
            borderRadius: 8,
          }}
          nodeColor={() => "hsl(var(--flow-edge))"}
        />
      </ReactFlow>

      {quickAdd && (
        <QuickAddMenu
          position={quickAdd.screen}
          onSelect={handleAddNode}
          onClose={() => setQuickAdd(null)}
        />
      )}
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