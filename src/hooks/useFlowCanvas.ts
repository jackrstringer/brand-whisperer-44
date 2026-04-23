import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  FlowCanvasNode,
  FlowCanvasEdge,
  CanvasState,
  FlowNodeData,
  NODE_KIND_META,
  FlowNodeKind,
} from "@/components/flowbuilder/types";
import { parseSkeleton, parseSkeletonMeta, FLOW_TRIGGERS } from "@/lib/flows/skeletonParser";

interface FlowRow {
  id: string;
  brand_id: string;
  flow_type: string;
  name: string;
  status: string;
  skeleton_markdown: string | null;
  canvas_state: any;
  trigger_config: any;
  messages: any;
}

const HISTORY_LIMIT = 50;

function buildLegacyCanvasFromSkeleton(
  flowType: string,
  skeleton: string | null
): CanvasState {
  const meta = parseSkeletonMeta(skeleton);
  const parsed = parseSkeleton(skeleton);
  const nodes: FlowCanvasNode[] = [];
  const edges: FlowCanvasEdge[] = [];

  // Trigger first
  const triggerId = crypto.randomUUID();
  nodes.push({
    id: triggerId,
    type: "trigger",
    position: { x: 0, y: 0 },
    data: {
      kind: "trigger",
      label: meta.trigger || FLOW_TRIGGERS[flowType] || "Trigger",
      trigger_type: flowType === "welcome" ? "list" : "metric",
      trigger_metric_name: FLOW_TRIGGERS[flowType] || undefined,
      status: "draft",
    },
  });

  let prevId = triggerId;
  parsed.forEach((p, i) => {
    const id = crypto.randomUUID();
    let kind: FlowNodeKind = "email";
    if (p.node_type === "delay") kind = "time_delay";
    else if (p.node_type === "split") kind = "conditional_split";
    else if (p.node_type === "sms") kind = "sms";

    const data: FlowNodeData = {
      kind,
      label: p.label || NODE_KIND_META[kind].label,
      job: p.job,
      subject_direction: p.subject_direction,
      sections: p.sections,
      notes: p.notes,
      status: "draft",
      generation_status: "pending",
    };
    nodes.push({
      id,
      type: kind,
      position: { x: 0, y: (i + 1) * 200 },
      data,
    });
    edges.push({
      id: crypto.randomUUID(),
      source: prevId,
      target: id,
      type: "insertable",
    });
    prevId = id;
  });

  return { nodes, edges };
}

export function useFlowCanvas(flowId: string | undefined) {
  const [flow, setFlow] = useState<FlowRow | null>(null);
  const [nodes, setNodesState] = useState<FlowCanvasNode[]>([]);
  const [edges, setEdgesState] = useState<FlowCanvasEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);
  const history = useRef<{ past: CanvasState[]; future: CanvasState[] }>({
    past: [],
    future: [],
  });
  const saveTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!flowId) return;
    setLoading(true);
    const { data, error: e } = await supabase
      .from("flows")
      .select("id, brand_id, flow_type, name, status, skeleton_markdown, canvas_state, trigger_config, messages")
      .eq("id", flowId)
      .single();
    if (e || !data) {
      setError(e?.message || "Flow not found");
      setLoading(false);
      return;
    }
    const row = data as FlowRow;
    setFlow(row);

    const cs = (row.canvas_state || null) as CanvasState | null;
    if (cs && Array.isArray(cs.nodes) && cs.nodes.length > 0) {
      setNodesState(cs.nodes);
      setEdgesState(cs.edges || []);
    } else {
      // Legacy import — build from skeleton if any, else just a trigger node
      const built = row.skeleton_markdown
        ? buildLegacyCanvasFromSkeleton(row.flow_type, row.skeleton_markdown)
        : buildLegacyCanvasFromSkeleton(row.flow_type, null);
      setNodesState(built.nodes);
      setEdgesState(built.edges);
    }
    hydrated.current = true;
    setLoading(false);
  }, [flowId]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced autosave
  useEffect(() => {
    if (!hydrated.current || !flowId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const payload: CanvasState = { nodes, edges };
      const { error: e } = await supabase
        .from("flows")
        .update({ canvas_state: payload as any })
        .eq("id", flowId);
      if (e) setError(`Autosave failed: ${e.message}`);
    }, 500);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [nodes, edges, flowId]);

  const pushHistory = useCallback(() => {
    history.current.past.push({ nodes, edges });
    if (history.current.past.length > HISTORY_LIMIT) history.current.past.shift();
    history.current.future = [];
  }, [nodes, edges]);

  const setNodes: typeof setNodesState = useCallback((updater) => {
    setNodesState((prev) => {
      const next = typeof updater === "function" ? (updater as any)(prev) : updater;
      return next;
    });
  }, []);

  const setEdges: typeof setEdgesState = useCallback((updater) => {
    setEdgesState((prev) => {
      const next = typeof updater === "function" ? (updater as any)(prev) : updater;
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    const prev = history.current.past.pop();
    if (!prev) return;
    history.current.future.push({ nodes, edges });
    setNodesState(prev.nodes);
    setEdgesState(prev.edges);
  }, [nodes, edges]);

  const redo = useCallback(() => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push({ nodes, edges });
    setNodesState(next.nodes);
    setEdgesState(next.edges);
  }, [nodes, edges]);

  const updateNodeData = useCallback(
    (nodeId: string, patch: Partial<FlowNodeData>) => {
      pushHistory();
      setNodesState((prev) =>
        prev.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
        )
      );
    },
    [pushHistory]
  );

  const renameFlow = useCallback(
    async (name: string) => {
      if (!flowId) return;
      setFlow((f) => (f ? { ...f, name } : f));
      const { error: e } = await supabase.from("flows").update({ name }).eq("id", flowId);
      if (e) setError(`Rename failed: ${e.message}`);
    },
    [flowId]
  );

  const setFlowStatus = useCallback(
    async (status: string) => {
      if (!flowId) return;
      setFlow((f) => (f ? { ...f, status } : f));
      const { error: e } = await supabase.from("flows").update({ status }).eq("id", flowId);
      if (e) setError(`Status update failed: ${e.message}`);
    },
    [flowId]
  );

  return {
    flow,
    nodes,
    edges,
    setNodes,
    setEdges,
    loading,
    error,
    undo,
    redo,
    pushHistory,
    updateNodeData,
    renameFlow,
    setFlowStatus,
    reload: load,
  };
}
