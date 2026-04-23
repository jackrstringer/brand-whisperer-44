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
  onSelectionChange?: (selectedIds: string[]) => void;
}

function CanvasInner({ nodes, edges, setNodes, setEdges, onNodeOpenDetail, onSelectionChange }: CanvasProps) {
  const [quickAdd, setQuickAdd] = useState<{
    screen: { x: number; y: number };
    flow: { x: number; y: number };
    insertOnEdgeId?: string;
  } | null>(null);
  const rf = useReactFlow();

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
        }
      }}
      onDrop={(e) => {
        const kind = e.dataTransfer.getData("application/flowbuilder-kind") as FlowNodeKind;
        if (!kind) return;
        e.preventDefault();
        const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const id = crypto.randomUUID();
        const meta = NODE_KIND_META[kind];
        const data: FlowNodeData = { kind, label: meta.label, status: "draft" };
        setNodes((nds) => [
          ...nds,
          { id, type: kind, position: { x: flow.x - 140, y: flow.y - 30 }, data },
        ]);
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
          size={1}
          color="hsl(var(--border))"
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
          maskColor="hsl(var(--background) / 0.7)"
          className="!bg-card !border !border-border !rounded-lg !shadow-sm"
          nodeColor={() => "hsl(var(--muted-foreground))"}
          nodeStrokeColor="hsl(var(--border))"
        />
      </ReactFlow>

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
        .react-flow__minimap-mask { fill: hsl(var(--background) / 0.7); }
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
