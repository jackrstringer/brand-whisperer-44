import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useFlowCanvas } from "@/hooks/useFlowCanvas";
import { Canvas } from "@/components/flowbuilder/Canvas";
import { TopBar } from "@/components/flowbuilder/TopBar";
import { LeftSidebar } from "@/components/flowbuilder/LeftSidebar";
import { StrategyPanel } from "@/components/flowbuilder/StrategyPanel";
import { MessageFlyout } from "@/components/flowbuilder/MessageFlyout";
import { ChatPanel } from "@/components/flowbuilder/ChatPanel";
import { FLOW_TYPE_META } from "@/lib/flows/skeletonParser";
import { FlowNodeData } from "@/components/flowbuilder/types";

export default function FlowBuilderPage() {
  const { brandId, flowId } = useParams<{ brandId: string; flowId: string }>();
  const {
    flow,
    nodes,
    edges,
    setNodes,
    setEdges,
    loading,
    error,
    undo,
    redo,
    updateNodeData,
    renameFlow,
    setFlowStatus,
    reload,
  } = useFlowCanvas(flowId);

  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [flyoutNodeId, setFlyoutNodeId] = useState<string | null>(null);

  const selectedNode = useMemo(
    () => (selectedIds.length === 1 ? nodes.find((n) => n.id === selectedIds[0]) || null : null),
    [selectedIds, nodes]
  );
  const flyoutNode = useMemo(
    () => (flyoutNodeId ? nodes.find((n) => n.id === flyoutNodeId) || null : null),
    [flyoutNodeId, nodes]
  );

  if (loading || !flow) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-background">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading flow…
      </div>
    );
  }

  const meta = FLOW_TYPE_META[flow.flow_type];
  const triggerNode = nodes.find((n) => n.data.kind === "trigger");
  const triggerLabel =
    triggerNode?.data.trigger_metric_name || triggerNode?.data.label || "(no trigger)";

  return (
    <div className="absolute inset-0 bg-background">
      <TopBar
        brandId={brandId!}
        flowName={flow.name}
        flowStatus={flow.status}
        flowTypeLabel={meta?.label || flow.flow_type}
        showAnalytics={showAnalytics}
        onToggleAnalytics={() => setShowAnalytics((s) => !s)}
        onUndo={undo}
        onRedo={redo}
        onRename={renameFlow}
        onStatusChange={setFlowStatus}
      />

      <LeftSidebar
        selectedNode={selectedNode}
        onClearSelection={() => setSelectedIds([])}
        onUpdateNode={(id, patch) => updateNodeData(id, patch as Partial<FlowNodeData>)}
      />

      <StrategyPanel
        nodes={nodes}
        flowTypeLabel={meta?.label || flow.flow_type}
        triggerLabel={triggerLabel}
        onNavigateNode={(id) =>
          window.dispatchEvent(new CustomEvent("flowbuilder:center-on-node", { detail: { nodeId: id } }))
        }
      />

      <div className="absolute top-[96px] left-[280px] right-0 bottom-0">
        <Canvas
          nodes={nodes}
          edges={edges}
          setNodes={setNodes}
          setEdges={setEdges}
          onNodeOpenDetail={(nodeId) => setFlyoutNodeId(nodeId)}
          onSelectionChange={setSelectedIds}
        />
      </div>

      {flyoutNode && (
        <MessageFlyout
          node={flyoutNode}
          brandId={brandId!}
          onClose={() => setFlyoutNodeId(null)}
          onUpdate={(id, patch) => updateNodeData(id, patch)}
        />
      )}

      {!flyoutNode && (
        <ChatPanel
          flowId={flow.id}
          brandId={flow.brand_id}
          flowType={flow.flow_type}
          initialMessages={Array.isArray(flow.messages) ? flow.messages : []}
          onSkeletonUpdated={reload}
        />
      )}

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md bg-destructive text-destructive-foreground text-[12px] shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
