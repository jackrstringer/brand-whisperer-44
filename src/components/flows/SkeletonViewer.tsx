import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Plus,
  StickyNote,
  Wand2,
  Sparkles,
  Mail,
  Bell,
  Clock,
  GitBranch,
  Smartphone,
  Webhook,
  LogOut,
  Filter,
  Zap,
  Loader2,
  Minus as MinusIcon,
  Maximize2,
  X as XIcon,
} from "lucide-react";
import {
  ParsedFlowNode,
  ParsedFlowMeta,
  FLOW_TRIGGERS,
  FLOW_TYPE_META,
} from "@/lib/flows/skeletonParser";

/* ---------- Types ---------- */

export interface FlowEmailRow {
  id: string;
  sequence_index: number;
  label: string | null;
  generation_status: string;
  html: string | null;
  campaign_id: string | null;
}
export interface FlowEmailMeta {
  subject_line: string | null;
  preview_text: string | null;
}

type NodeKind = "trigger" | "filters" | "email" | "delay" | "split" | "trigger_split" | "sms" | "push" | "webhook" | "exit";

interface BoardNode {
  id: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  emailIndex?: number; // for email/sms — index into emailNodes
  meta?: Record<string, any>;
  branch?: "yes" | "no" | null; // for nodes that sit on a branch
}

interface BoardEdge {
  id: string;
  from: string;
  to: string;
  branch?: "yes" | "no" | null;
}

interface DropTarget {
  id: string;
  edge: BoardEdge;
  x: number;
  y: number;
  label: string;
}

interface Sticky {
  id: string;
  x: number;
  y: number;
  text: string;
}

interface Props {
  nodes: ParsedFlowNode[];
  meta: ParsedFlowMeta;
  flowType: string;
  emails: FlowEmailRow[];
  campaignMeta: Record<string, FlowEmailMeta>;
  expandedIndex: number | null;
  onToggleExpand: (i: number | null) => void;
  onGenerateNode: (i: number) => void;
  onSaveNodeEdit: (i: number, patch: Partial<ParsedFlowNode>) => void;
  generatingIndex: number | null;
  drafting?: boolean;
  parsedNodesRaw?: ParsedFlowNode[];
}

/* ---------- Geometry ---------- */

const NODE_W = 260;
const NODE_MARGIN = 44;
const BRANCH_X = 210;
const BRANCH_Y = 92;
const LINEAR_Y_GAP = 64;
const SPLIT_Y_GAP = 104;
const SIBLING_X_GAP = 96;
function getNodeSize(kind: NodeKind) {
  if (kind === "delay") return { w: 220, h: 70 };
  if (kind === "split") return { w: 260, h: 130 };
  if (kind === "trigger_split") return { w: 280, h: 120 };
  if (kind === "filters" || kind === "exit") return { w: 260, h: 100 };
  if (kind === "trigger") return { w: 240, h: 96 };
  return { w: 280, h: 110 }; // email / sms
}

function orthPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius = 12
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) < 1) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  const midY = from.y + dy / 2;
  const r = Math.min(radius, Math.abs(dy) / 2 - 1, Math.abs(dx) / 2);
  const sx = Math.sign(dx);
  return [
    `M ${from.x} ${from.y}`,
    `L ${from.x} ${midY - r * Math.sign(dy)}`,
    `Q ${from.x} ${midY} ${from.x + sx * r} ${midY}`,
    `L ${to.x - sx * r} ${midY}`,
    `Q ${to.x} ${midY} ${to.x} ${midY + r * Math.sign(dy)}`,
    `L ${to.x} ${to.y}`,
  ].join(" ");
}

/* ---------- Build the board model from parsed skeleton ---------- */

function buildBoard(
  parsed: ParsedFlowNode[],
  meta: ParsedFlowMeta,
  flowType: string
): { nodes: BoardNode[]; edges: BoardEdge[] } {
  const COL = 0;
  const VGAP = 60;
  let y = 80;
  const out: BoardNode[] = [];
  const edges: BoardEdge[] = [];

  // Trigger
  out.push({
    id: "trigger",
    kind: "trigger",
    label:
      meta.trigger ||
      FLOW_TRIGGERS[flowType] ||
      "Flow Trigger",
    x: COL,
    y,
    meta: { audience: meta.trigger || "—" },
  });
  y += getNodeSize("trigger").h + VGAP;

  // Filters (optional)
  let prev = "trigger";
  if (meta.filters && meta.filters.length) {
    const id = "filters";
    out.push({ id, kind: "filters", label: "Entry Filters", x: COL, y, meta: { items: meta.filters } });
    edges.push({ id: "e-trig-filters", from: prev, to: id });
    prev = id;
    y += getNodeSize("filters").h + VGAP;
  }

  // Walk parsed nodes; emails get an emailIndex assigned in parsed order.
  // Conditional splits always render as real Klaviyo-style YES/NO branches.
  // Until explicit branch paths exist in the skeleton, the continuing path is
  // YES and the empty branch is a real "Exit flow" node instead of a fake line.
  let emailIndex = 0;
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    const id = `n-${i}-${p.node_type}`;
    const kind: NodeKind = p.node_type as NodeKind;

    const node: BoardNode = {
      id,
      kind,
      label: p.label || (kind === "email" ? `Email ${emailIndex + 1}` : kind),
      x: COL,
      y,
      meta:
        kind === "delay"
          ? { duration: p.label || p.timing || "wait" }
          : kind === "split"
          ? {
              condition: p.notes || p.label || "",
              branches: p.branches || [],
            }
          : kind === "email" || kind === "sms"
          ? {
              subject: p.subject_direction || "",
              preview: p.notes || p.job || "",
              sections: p.sections || [],
              timing: p.timing,
              job: p.job,
              subject_direction: p.subject_direction,
              notes: p.notes,
            }
          : {},
    };
    if (kind === "email" || kind === "sms") {
      node.emailIndex = emailIndex;
      emailIndex += 1;
    }
    out.push(node);
    edges.push({ id: `e-${prev}-${id}`, from: prev, to: id, branch: nodeByIdBranch(prev, kind) });

    if (kind === "split") {
      const splitSize = getNodeSize("split");
      const yesExitId = `${id}-yes-exit`;
      const noExitId = `${id}-no-exit`;
      const isTerminalSplit = i === parsed.length - 1;
      if (isTerminalSplit) {
        out.push({ id: yesExitId, kind: "exit", label: "Exit the flow", x: COL - BRANCH_X, y: y + splitSize.h + BRANCH_Y, branch: "yes", meta: { items: ["No additional YES path configured"] } });
        edges.push({ id: `e-${id}-yes-exit`, from: id, to: yesExitId, branch: "yes" });
      }
      out.push({ id: noExitId, kind: "exit", label: "Exit the flow", x: COL + BRANCH_X, y: y + splitSize.h + BRANCH_Y, branch: "no", meta: { items: ["No additional NO path configured"] } });
      edges.push({ id: `e-${id}-no-exit`, from: id, to: noExitId, branch: "no" });
      prev = id;
      y += splitSize.h + VGAP + 30;
      continue;
    }

    prev = id;
    y += getNodeSize(kind).h + VGAP;
  }

  // Exit
  if (meta.exit && meta.exit.length) {
    const id = "exit";
    out.push({
      id,
      kind: "exit",
      label: "Exit Conditions",
      x: COL,
      y,
      meta: { items: meta.exit },
    });
    edges.push({ id: `e-${prev}-exit`, from: prev, to: id });
  }

  return { nodes: out, edges };
}

function nodeByIdBranch(prevId: string, nextKind: NodeKind): "yes" | "no" | null {
  return prevId.includes("-split") && nextKind !== "exit" ? "yes" : null;
}

function overlaps(a: BoardNode, b: BoardNode): boolean {
  const as = getNodeSize(a.kind);
  const bs = getNodeSize(b.kind);
  return !(
    a.x + as.w + NODE_MARGIN <= b.x ||
    b.x + bs.w + NODE_MARGIN <= a.x ||
    a.y + as.h + NODE_MARGIN <= b.y ||
    b.y + bs.h + NODE_MARGIN <= a.y
  );
}

function resolveNodeCollisions(nodes: BoardNode[]): BoardNode[] {
  const resolved = nodes.map((n) => ({ ...n }));
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        if (!overlaps(resolved[i], resolved[j])) continue;
        const aSize = getNodeSize(resolved[i].kind);
        const targetY = resolved[i].y + aSize.h + NODE_MARGIN;
        if (resolved[j].y < targetY) {
          resolved[j].y = targetY;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return resolved;
}

function layoutFlowGraph(nodes: BoardNode[], edges: BoardEdge[]): BoardNode[] {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const childrenById: Record<string, BoardEdge[]> = {};
  for (const edge of edges) {
    if (!byId[edge.from] || !byId[edge.to]) continue;
    (childrenById[edge.from] ||= []).push(edge);
  }

  const sortEdges = (items: BoardEdge[]) =>
    [...items].sort((a, b) => {
      const rank = (branch?: "yes" | "no" | null) => (branch === "yes" ? 0 : branch === "no" ? 1 : 2);
      return rank(a.branch) - rank(b.branch) || a.to.localeCompare(b.to);
    });

  const widthCache: Record<string, number> = {};
  const measure = (id: string, seen = new Set<string>()): number => {
    const node = byId[id];
    if (!node || seen.has(id)) return 0;
    if (widthCache[id]) return widthCache[id];
    const size = getNodeSize(node.kind);
    const children = sortEdges(childrenById[id] || []).filter((edge) => byId[edge.to]);
    if (!children.length) return (widthCache[id] = size.w);
    const nextSeen = new Set(seen).add(id);
    const childWidth = children.reduce((sum, edge, index) => {
      return sum + measure(edge.to, nextSeen) + (index > 0 ? SIBLING_X_GAP : 0);
    }, 0);
    return (widthCache[id] = Math.max(size.w, childWidth));
  };

  const positioned: Record<string, BoardNode> = {};
  const place = (id: string, centerX: number, y: number, seen = new Set<string>()) => {
    const node = byId[id];
    if (!node || seen.has(id)) return;
    const size = getNodeSize(node.kind);
    positioned[id] = { ...node, x: centerX - size.w / 2, y };

    const children = sortEdges(childrenById[id] || []).filter((edge) => byId[edge.to]);
    if (!children.length) return;

    const childY = y + size.h + (children.length > 1 || node.kind === "split" ? SPLIT_Y_GAP : LINEAR_Y_GAP);
    const nextSeen = new Set(seen).add(id);
    if (children.length === 1 && node.kind !== "split") {
      place(children[0].to, centerX, childY, nextSeen);
      return;
    }

    const widths = children.map((edge) => measure(edge.to, nextSeen));
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + SIBLING_X_GAP * Math.max(0, widths.length - 1);
    let cursor = centerX - totalWidth / 2;
    children.forEach((edge, index) => {
      const childCenter = cursor + widths[index] / 2;
      place(edge.to, childCenter, childY, nextSeen);
      cursor += widths[index] + SIBLING_X_GAP;
    });
  };

  place(byId.trigger ? "trigger" : nodes[0]?.id, 0, 80);
  let orphanY = 80;
  return nodes.map((node) => {
    if (positioned[node.id]) return positioned[node.id];
    const size = getNodeSize(node.kind);
    const fallback = { ...node, x: -size.w / 2, y: orphanY };
    orphanY += size.h + LINEAR_Y_GAP;
    return fallback;
  });
}

/* ---------- Icons ---------- */

const KIND_META: Record<NodeKind, { Icon: any; label: string }> = {
  trigger: { Icon: Zap, label: "Trigger" },
  filters: { Icon: Filter, label: "Entry Filters" },
  email: { Icon: Mail, label: "Email" },
  sms: { Icon: Smartphone, label: "SMS" },
  push: { Icon: Bell, label: "Push Notification" },
  webhook: { Icon: Webhook, label: "Webhook" },
  delay: { Icon: Clock, label: "Time Delay" },
  split: { Icon: GitBranch, label: "Conditional Split" },
  trigger_split: { Icon: GitBranch, label: "Trigger Split" },
  exit: { Icon: LogOut, label: "Exit Flow" },
};

/* ---------- Component ---------- */

export function SkeletonViewer({
  nodes: parsedNodes,
  meta,
  flowType,
  emails,
  campaignMeta,
  expandedIndex,
  onToggleExpand,
  onGenerateNode,
  onSaveNodeEdit,
  generatingIndex,
  drafting,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [stickies, setStickies] = useState<Sticky[]>([]);
  const [selectedSticky, setSelectedSticky] = useState<string | null>(null);
  const [editingSticky, setEditingSticky] = useState<string | null>(null);
  const [editingLabelOf, setEditingLabelOf] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);
  const [stickyArmed, setStickyArmed] = useState(false);
  const [activeDragKind, setActiveDragKind] = useState<NodeKind | null>(null);
  const [hoveredDropTarget, setHoveredDropTarget] = useState<string | null>(null);

  const board = useMemo(
    () => buildBoard(parsedNodes, meta, flowType),
    [parsedNodes, meta, flowType]
  );
  const [layoutNodes, setLayoutNodes] = useState<BoardNode[]>(board.nodes);
  const [graphEdges, setGraphEdges] = useState<BoardEdge[]>(board.edges);
  const hoveredDropTargetRef = useRef<string | null>(null);

  useEffect(() => {
    setLayoutNodes((prev) => {
      const prevById = Object.fromEntries(prev.map((n) => [n.id, n]));
      return resolveNodeCollisions(
        board.nodes.map((n) => ({ ...n, x: prevById[n.id]?.x ?? n.x, y: prevById[n.id]?.y ?? n.y }))
      );
    });
    setGraphEdges(board.edges);
  }, [board.nodes]);

  const displayBoard = useMemo(() => ({ ...board, nodes: layoutNodes, edges: graphEdges }), [board, layoutNodes, graphEdges]);

  const nodeById = useMemo(() => {
    const m: Record<string, BoardNode> = {};
    for (const n of displayBoard.nodes) m[n.id] = n;
    return m;
  }, [displayBoard.nodes]);

  /* -------- Coords -------- */
  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const r = stageRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return {
        x: (sx - r.left - pan.x) / zoom,
        y: (sy - r.top - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  /* -------- Initial fit -------- */
  useLayoutEffect(() => {
    if (!stageRef.current || !displayBoard.nodes.length) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of displayBoard.nodes) {
      const sz = getNodeSize(n.kind);
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + sz.w);
      maxY = Math.max(maxY, n.y + sz.h);
    }
    const r = stageRef.current.getBoundingClientRect();
    const pad = 100;
    const zx = (r.width - pad * 2) / Math.max(1, maxX - minX);
    const zy = (r.height - pad * 2) / Math.max(1, maxY - minY);
    const z = Math.min(1, Math.max(0.4, Math.min(zx, zy)));
    setZoom(z);
    setPan({
      x: (r.width - (maxX - minX) * z) / 2 - minX * z,
      y: 80 - minY * z,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayBoard.nodes.length]);

  /* -------- Wheel: pinch zoom or two-finger pan, NEVER scroll page -------- */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.01;
        setZoom((z) => {
          const nz = Math.max(0.2, Math.min(2.5, z * (1 + delta)));
          const ratio = nz / z;
          setPan((p) => ({ x: mx - (mx - p.x) * ratio, y: my - (my - p.y) * ratio }));
          return nz;
        });
      } else {
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  /* -------- Keyboard: space, escape, v/n/a -------- */
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpaceHeld(true);
      }
      if (e.key === "Escape") {
        setSelected(null);
        setSelectedSticky(null);
        setEditingSticky(null);
        setEditingLabelOf(null);
        if (expandedIndex !== null) onToggleExpand(null);
      }
      if (e.key === "n") setStickyArmed(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [expandedIndex, onToggleExpand]);

  /* -------- Stage mouse down: pan, marquee deselect, tool place -------- */
  const handleStageMouseDown = (e: React.MouseEvent) => {
    const onEmpty = e.target === e.currentTarget;
    if (e.button === 1 || (e.button === 0 && (spaceHeld || e.altKey))) {
      e.preventDefault();
      setPanning(true);
      const start = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      const move = (ev: MouseEvent) =>
        setPan({ x: ev.clientX - start.x, y: ev.clientY - start.y });
      const upHandler = () => {
        setPanning(false);
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", upHandler);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", upHandler);
      return;
    }
    if (!onEmpty) return;

    if (stickyArmed) {
      const w = screenToWorld(e.clientX, e.clientY);
      const id = `s-${Date.now()}`;
      setStickies((s) => [...s, { id, x: w.x - 90, y: w.y - 50, text: "" }]);
      setSelectedSticky(id);
      setEditingSticky(id);
      setStickyArmed(false);
      return;
    }
    setSelected(null);
    setSelectedSticky(null);
    setEditingLabelOf(null);
  };

  const fitToView = () => {
    if (!stageRef.current || !displayBoard.nodes.length) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of displayBoard.nodes) {
      const sz = getNodeSize(n.kind);
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + sz.w);
      maxY = Math.max(maxY, n.y + sz.h);
    }
    const r = stageRef.current.getBoundingClientRect();
    const pad = 100;
    const z = Math.min(
      1,
      Math.max(
        0.3,
        Math.min(
          (r.width - pad * 2) / Math.max(1, maxX - minX),
          (r.height - pad * 2) / Math.max(1, maxY - minY)
        )
      )
    );
    setZoom(z);
    setPan({
      x: (r.width - (maxX - minX) * z) / 2 - minX * z,
      y: 80 - minY * z,
    });
  };

  /* -------- Drag sticky -------- */
  const startStickyDrag = (e: React.MouseEvent, s: Sticky) => {
    if (e.button !== 0 || spaceHeld) return;
    e.stopPropagation();
    setSelectedSticky(s.id);
    setSelected(null);
    const startX = e.clientX,
      startY = e.clientY;
    const orig = { x: s.x, y: s.y };
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      setStickies((arr) =>
        arr.map((x) => (x.id === s.id ? { ...x, x: orig.x + dx, y: orig.y + dy } : x))
      );
    };
    const upH = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", upH);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", upH);
  };

  const startNodeDrag = (e: React.MouseEvent, node: BoardNode) => {
    if (e.button !== 0 || spaceHeld || editingLabelOf) return;
    e.stopPropagation();
    setSelected(node.id);
    setSelectedSticky(null);
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { x: node.x, y: node.y };
    const move = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      setLayoutNodes((arr) =>
        resolveNodeCollisions(
          arr.map((n) => (n.id === node.id ? { ...n, x: orig.x + dx, y: orig.y + dy } : n))
        )
      );
    };
    const upH = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", upH);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", upH);
  };

  /* -------- Compute edge paths -------- */
  const edgePaths = displayBoard.edges
    .map((edge) => {
      const a = nodeById[edge.from];
      const b = nodeById[edge.to];
      if (!a || !b) return null;
      const sa = getNodeSize(a.kind);
      const sb = getNodeSize(b.kind);
      let from = { x: a.x + sa.w / 2, y: a.y + sa.h };
      // For split nodes, bias outgoing port to YES (left) or NO (right)
      if (a.kind === "split") {
        from.x = edge.branch === "no" ? a.x + sa.w * 0.78 : a.x + sa.w * 0.22;
      }
      const to = { x: b.x + sb.w / 2, y: b.y };
      return { edge, from, to, path: orthPath(from, to) };
    })
    .filter(Boolean) as { edge: BoardEdge; from: any; to: any; path: string }[];

  const triggerNode = nodeById.trigger;

  const dropTargets = useMemo<DropTarget[]>(() => {
    return edgePaths.map(({ edge, from, to }) => ({
      id: `drop-${edge.id}`,
      edge,
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
      label: edge.branch ? `Drop on ${edge.branch.toUpperCase()} path` : "Drop into path",
    }));
  }, [edgePaths]);

  const insertNodeOnTarget = (kind: NodeKind, targetId: string) => {
    const target = dropTargets.find((t) => t.id === targetId);
    if (!target) return;
    const id = `manual-${kind}-${Date.now()}`;
    const size = getNodeSize(kind);
    const node: BoardNode = {
      id,
      kind,
      label: KIND_META[kind].label,
      x: target.x - size.w / 2,
      y: target.y - size.h / 2,
      branch: target.edge.branch ?? null,
      meta: kind === "split" || kind === "trigger_split" ? { condition: "New split", branches: [{ label: "YES" }, { label: "NO" }] } : {},
    };
    setLayoutNodes((arr) => resolveNodeCollisions([...arr, node]));
    setGraphEdges((edges) => [
      ...edges.filter((e) => e.id !== target.edge.id),
      { id: `e-${target.edge.from}-${id}`, from: target.edge.from, to: id, branch: target.edge.branch ?? null },
      { id: `e-${id}-${target.edge.to}`, from: id, to: target.edge.to, branch: target.edge.branch ?? null },
    ]);
    setSelected(id);
  };

  const startPaletteDrag = (kind: NodeKind, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveDragKind(kind);
    const ghost = document.createElement("div");
    ghost.className = "fl-drag-ghost";
    ghost.textContent = KIND_META[kind].label;
    document.body.appendChild(ghost);
    const move = (ev: MouseEvent) => {
      ghost.style.left = `${ev.clientX + 12}px`;
      ghost.style.top = `${ev.clientY + 12}px`;
      const r = stageRef.current?.getBoundingClientRect();
      if (!r) return;
      const world = screenToWorld(ev.clientX, ev.clientY);
      const target = dropTargets.reduce<{ id: string; d: number } | null>((best, t) => {
        const d = Math.hypot(t.x - world.x, t.y - world.y);
        return d < 110 && (!best || d < best.d) ? { id: t.id, d } : best;
      }, null);
      hoveredDropTargetRef.current = target?.id ?? null;
      setHoveredDropTarget(target?.id ?? null);
    };
    const up = (ev: MouseEvent) => {
      ghost.remove();
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setActiveDragKind(null);
      const targetId = hoveredDropTargetRef.current;
      hoveredDropTargetRef.current = null;
      setHoveredDropTarget(null);
      if (targetId) insertNodeOnTarget(kind, targetId);
    };
    move(e.nativeEvent);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  /* -------- Render -------- */
  return (
    <div className="flowline-root absolute inset-0">
      <div
        ref={stageRef}
        className={`fl-stage ${panning ? "fl-panning" : ""} ${
          spaceHeld ? "fl-space" : ""
        }`}
        onMouseDown={handleStageMouseDown}
      >
        <div className="fl-dot-grid" />

        {/* Viewport — only this gets transformed */}
        <div
          className="fl-viewport"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {triggerNode && (
            <FlowSummaryCard
              trigger={triggerNode}
              flowType={flowType}
              meta={meta}
              open={briefOpen}
              onToggle={() => setBriefOpen((v) => !v)}
            />
          )}

          {/* Edges */}
          <svg className="fl-edges" style={{ overflow: "visible" }}>
            <defs>
              <marker
                id="fl-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M0 0 L10 5 L0 10 z" className="fl-edge-arrow" />
              </marker>
            </defs>
            {edgePaths.map(({ edge, from, to, path }) => (
              <g key={edge.id}>
                <path className="fl-edge-path" d={path} markerEnd="url(#fl-arrow)" />
                {edge.branch && (
                  <foreignObject
                    x={(from.x + to.x) / 2 - 22}
                    y={(from.y + to.y) / 2 - 11}
                    width="44"
                    height="22"
                    style={{ overflow: "visible" }}
                  >
                    <div className={`fl-edge-label ${edge.branch}`}>
                      {edge.branch}
                    </div>
                  </foreignObject>
                )}
              </g>
            ))}
          </svg>

          {/* Path insertion targets — only active while dragging from the rail */}
          {activeDragKind && dropTargets.map((target) => (
            <div
              key={target.id}
              className={`fl-drop-target ${hoveredDropTarget === target.id ? "over" : ""}`}
              style={{ transform: `translate(${target.x - 76}px, ${target.y - 16}px)` }}
            >
              <Plus className="w-3 h-3" />
              <span>{target.edge.branch ? target.edge.branch.toUpperCase() : "INSERT"}</span>
            </div>
          ))}

          {/* Stickies (under nodes) */}
          {stickies.map((s) => (
            <div
              key={s.id}
              className={`fl-sticky ${selectedSticky === s.id ? "sel" : ""}`}
              style={{ transform: `translate(${s.x}px, ${s.y}px)`, width: 200 }}
              onMouseDown={(e) => startStickyDrag(e, s)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingSticky(s.id);
              }}
            >
              <button
                className="fl-sticky-del"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setStickies((arr) => arr.filter((x) => x.id !== s.id));
                  setSelectedSticky(null);
                }}
              >
                <XIcon className="w-3 h-3" />
              </button>
              {editingSticky === s.id ? (
                <textarea
                  autoFocus
                  defaultValue={s.text}
                  onMouseDown={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    setStickies((arr) =>
                      arr.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x))
                    );
                    setEditingSticky(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
                  }}
                />
              ) : (
                <div>
                  {s.text || (
                    <span style={{ color: "rgba(0,0,0,0.35)" }}>Double-click to edit…</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Nodes */}
          {displayBoard.nodes.map((n) => (
            <NodeView
              key={n.id}
              node={n}
              selected={selected === n.id}
              isEditingLabel={editingLabelOf === n.id}
              labelDraft={labelDraft}
              onLabelDraft={setLabelDraft}
              onLabelCommit={() => {
                if (typeof n.emailIndex === "number") {
                  onSaveNodeEdit(n.emailIndex, { label: labelDraft });
                }
                setEditingLabelOf(null);
              }}
              onSelect={() => {
                setSelected(n.id);
                setSelectedSticky(null);
              }}
              onStartDrag={(e) => startNodeDrag(e, n)}
              onDoubleClickTitle={() => {
                setLabelDraft(n.label);
                setEditingLabelOf(n.id);
              }}
              onGenerate={
                typeof n.emailIndex === "number"
                  ? () => onGenerateNode(n.emailIndex!)
                  : undefined
              }
              onExpand={
                typeof n.emailIndex === "number"
                  ? () => onToggleExpand(n.emailIndex!)
                  : undefined
              }
              emailRow={
                typeof n.emailIndex === "number"
                  ? emails.find((e) => e.sequence_index === n.emailIndex)
                  : undefined
              }
              campaignMeta={campaignMeta}
              isGenerating={
                typeof n.emailIndex === "number" && generatingIndex === n.emailIndex
              }
            />
          ))}

          {/* Drafting ghost */}
          {drafting && parsedNodes.length === 0 && (
            <div
              className="fl-node"
              style={{
                transform: `translate(0px, 80px)`,
                width: 240,
                opacity: 0.55,
                borderStyle: "dashed",
              }}
            >
              <div className="fl-node-head">
                <div className="fl-badge">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="fl-title">Drafting your flow…</div>
                  <div className="fl-kind">Skeleton</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Permanent left node rail */}
        <div className="fl-tool" onMouseDown={(e) => e.stopPropagation()}>
          <NodePalette onStartDrag={startPaletteDrag} />
          <button
            className={stickyArmed ? "on" : ""}
            onClick={() => setStickyArmed((v) => !v)}
            title="Sticky note (N)"
          >
            <StickyNote className="w-4 h-4" />
          </button>
          <div className="fl-sep" />
          <button onClick={fitToView} title="Fit to view">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom-left minimap */}
        <Minimap board={displayBoard} pan={pan} zoom={zoom} stageRef={stageRef} />

        {/* Bottom-right zoom control */}
        <div className="fl-zoom" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              const r = stageRef.current?.getBoundingClientRect();
              if (!r) return;
              const mx = r.width / 2,
                my = r.height / 2;
              setZoom((z) => {
                const nz = Math.max(0.2, z - 0.15);
                const ratio = nz / z;
                setPan((p) => ({ x: mx - (mx - p.x) * ratio, y: my - (my - p.y) * ratio }));
                return nz;
              });
            }}
            title="Zoom out"
          >
            <MinusIcon className="w-3.5 h-3.5" />
          </button>
          <div className="val" onClick={fitToView} title="Fit to view">
            {Math.round(zoom * 100)}%
          </div>
          <button
            onClick={() => {
              const r = stageRef.current?.getBoundingClientRect();
              if (!r) return;
              const mx = r.width / 2,
                my = r.height / 2;
              setZoom((z) => {
                const nz = Math.min(2.5, z + 0.15);
                const ratio = nz / z;
                setPan((p) => ({ x: mx - (mx - p.x) * ratio, y: my - (my - p.y) * ratio }));
                return nz;
              });
            }}
            title="Zoom in"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded message preview */}
      {expandedIndex !== null && (() => {
        const row = emails.find((e) => e.sequence_index === expandedIndex);
        if (!row?.html) return null;
        const cm = row.campaign_id ? campaignMeta[row.campaign_id] : null;
        return (
          <div
            onClick={() => onToggleExpand(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(8px)",
              zIndex: 100,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 420,
                maxHeight: "92vh",
                background: "#fff",
                borderRadius: 16,
                overflow: "hidden",
                boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {cm?.subject_line || row.label || "Email"}
                  </div>
                  {cm?.preview_text && (
                    <div style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {cm.preview_text}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onToggleExpand(null)}
                  style={{ width: 30, height: 30, borderRadius: 8, border: 0, background: "rgba(0,0,0,0.06)", cursor: "pointer", display: "grid", placeItems: "center" }}
                  title="Close"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <iframe
                title={`expanded-${row.id}`}
                srcDoc={row.html}
                style={{ flex: 1, width: "100%", border: 0, background: "#fff" }}
              />
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
              Click outside or press Esc to close
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ---------- Node renderers ---------- */

function NodeView({
  node,
  selected,
  isEditingLabel,
  labelDraft,
  onLabelDraft,
  onLabelCommit,
  onSelect,
  onStartDrag,
  onDoubleClickTitle,
  onGenerate,
  onExpand,
  emailRow,
  campaignMeta,
  isGenerating,
}: {
  node: BoardNode;
  selected: boolean;
  isEditingLabel: boolean;
  labelDraft: string;
  onLabelDraft: (v: string) => void;
  onLabelCommit: () => void;
  onSelect: () => void;
  onStartDrag: (e: React.MouseEvent) => void;
  onDoubleClickTitle: () => void;
  onGenerate?: () => void;
  onExpand?: () => void;
  emailRow?: FlowEmailRow;
  campaignMeta: Record<string, FlowEmailMeta>;
  isGenerating: boolean;
}) {
  const sz = getNodeSize(node.kind);
  const km = KIND_META[node.kind];
  const I = km.Icon;

  return (
    <div
      className={`fl-node ${selected ? "sel" : ""} ${
        node.kind === "delay" ? "tiny" : ""
      }`}
      style={{
        transform: `translate(${node.x}px, ${node.y}px)`,
        width: sz.w,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect();
        onStartDrag(e);
      }}
    >
      <div className="fl-node-head">
        <div className={`fl-badge ${node.kind === "trigger" ? "trigger" : ""}`}>
          <I className="w-3.5 h-3.5" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditingLabel ? (
            <input
              autoFocus
              value={labelDraft}
              onChange={(e) => onLabelDraft(e.target.value)}
              onBlur={onLabelCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") onLabelCommit();
              }}
              className="fl-title"
              style={{
                width: "100%",
                background: "transparent",
                border: "1px solid var(--fl-line-2)",
                borderRadius: 4,
                padding: "1px 4px",
                outline: "none",
                font: "inherit",
                color: "inherit",
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="fl-title"
              onDoubleClick={(e) => {
                e.stopPropagation();
                onDoubleClickTitle();
              }}
            >
              {node.label}
            </div>
          )}
          <div className="fl-kind">{km.label}</div>
        </div>
        {onGenerate && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onGenerate();
            }}
            disabled={isGenerating}
            title="Generate this email"
            style={{
              flexShrink: 0,
              width: 26,
              height: 26,
              borderRadius: 7,
              background: "var(--fl-ink)",
              color: "#fff",
              border: 0,
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            {isGenerating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
          </button>
        )}
      </div>

      {node.kind === "trigger" && (
        <div className="fl-body">
          <div className="fl-row">
            <span className="k">Source</span>
            <span className="v">{node.meta?.audience || "—"}</span>
          </div>
        </div>
      )}

      {node.kind === "filters" && (
        <div className="fl-body">
          {(node.meta?.items || []).slice(0, 3).map((it: string, i: number) => (
            <div key={i} className="fl-row" style={{ borderTop: i ? "1px dashed var(--fl-line)" : "none", paddingTop: i ? 6 : 0 }}>
              <span className="v" style={{ textAlign: "left", fontSize: 11, color: "var(--fl-ink-2)" }}>{it}</span>
            </div>
          ))}
          {(node.meta?.items?.length || 0) > 3 && (
            <div className="fl-kind" style={{ marginTop: 4 }}>
              +{node.meta!.items.length - 3} more
            </div>
          )}
        </div>
      )}

      {node.kind === "exit" && (
        <div className="fl-body">
          {(node.meta?.items || []).slice(0, 3).map((it: string, i: number) => (
            <div key={i} className="fl-row" style={{ borderTop: i ? "1px dashed var(--fl-line)" : "none", paddingTop: i ? 6 : 0 }}>
              <span className="v" style={{ textAlign: "left", fontSize: 11, color: "var(--fl-ink-2)" }}>{it}</span>
            </div>
          ))}
        </div>
      )}

      {node.kind === "delay" && (
        <div className="fl-body" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fl-ink)" }}>
            {node.meta?.duration || "—"}
          </div>
          <div style={{ marginLeft: "auto", fontFamily: "var(--fl-mono)", fontSize: 10, color: "var(--fl-ink-4)", textTransform: "uppercase" }}>
            wait
          </div>
        </div>
      )}

      {node.kind === "split" && (
        <div className="fl-body">
          <div className="fl-split-cond">
            {node.meta?.condition || node.label}
          </div>
          {Array.isArray(node.meta?.branches) && node.meta!.branches.length > 0 ? (
            <div className="fl-branches">
              {node.meta!.branches.map((b: any, i: number) => (
                <div
                  key={i}
                  className={`fl-branch ${b.label?.toLowerCase().includes("yes") ? "yes" : b.label?.toLowerCase().includes("no") ? "no" : ""}`}
                  title={b.description || ""}
                >
                  {b.label}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: "var(--fl-ink-4)", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Branches not specified
            </div>
          )}
        </div>
      )}

      {(node.kind === "email" || node.kind === "sms") && (
        <MessagePreview
          node={node}
          emailRow={emailRow}
          campaignMeta={campaignMeta}
          onExpand={onExpand}
        />
      )}
    </div>
  );
}

function MessagePreview({
  node,
  emailRow,
  campaignMeta,
  onExpand,
}: {
  node: BoardNode;
  emailRow?: FlowEmailRow;
  campaignMeta: Record<string, FlowEmailMeta>;
  onExpand?: () => void;
}) {
  const cm = emailRow?.campaign_id ? campaignMeta[emailRow.campaign_id] : null;
  const subject =
    cm?.subject_line || node.meta?.subject || node.label || "Subject…";
  const preview = cm?.preview_text || node.meta?.preview || "—";
  const hasHtml = !!emailRow?.html;

  let statusEl: React.ReactNode = null;
  if (emailRow?.generation_status === "complete") {
    statusEl = <span className="fl-msg-status ready">READY</span>;
  } else if (emailRow?.generation_status === "generating") {
    statusEl = <span className="fl-msg-status gen">GENERATING…</span>;
  } else if (emailRow?.generation_status === "failed") {
    statusEl = <span className="fl-msg-status fail">FAILED</span>;
  } else {
    statusEl = <span className="fl-msg-status">DRAFT</span>;
  }

  return (
    <div
      className="fl-msg-preview"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (hasHtml && onExpand) {
          e.stopPropagation();
          onExpand();
        }
      }}
      style={hasHtml && onExpand ? { cursor: "zoom-in" } : undefined}
      title={hasHtml ? "Click to expand" : undefined}
    >
      <div className="fl-msg-thumb">
        {emailRow?.html ? (
          <iframe
            title={`thumb-${node.id}`}
            srcDoc={emailRow.html}
            style={{
              width: 360,
              height: 460,
              border: 0,
              transform: "scale(0.122)",
              transformOrigin: "top left",
              pointerEvents: "none",
              position: "absolute",
              inset: 0,
            }}
          />
        ) : null}
        {hasHtml && onExpand && (
          <div
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 22,
              height: 22,
              borderRadius: 6,
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              backdropFilter: "blur(4px)",
              pointerEvents: "none",
            }}
          >
            <Maximize2 className="w-3 h-3" />
          </div>
        )}
      </div>
      <div className="fl-msg-meta">
        <div className="fl-msg-subject">{subject}</div>
        <div className="fl-msg-snip">{preview}</div>
        {statusEl}
      </div>
    </div>
  );
}

function FlowSummaryCard({
  trigger,
  flowType,
  meta,
  open,
  onToggle,
}: {
  trigger: BoardNode;
  flowType: string;
  meta: ParsedFlowMeta;
  open: boolean;
  onToggle: () => void;
}) {
  const title = FLOW_TYPE_META[flowType]?.label || "Flow Strategy";
  const filterCount = meta.filters?.length || 0;
  const exitCount = meta.exit?.length || 0;
  return (
    <div className={`fl-brief ${open ? "open" : ""}`} style={{ transform: `translate(${trigger.x - 140}px, ${trigger.y - (open ? 250 : 72)}px)` }}>
      <button className="fl-brief-head" onClick={onToggle} onMouseDown={(e) => e.stopPropagation()}>
        <div className="fl-brief-badge"><Wand2 className="w-3.5 h-3.5" /></div>
        <div className="fl-brief-main">
          <div className="fl-brief-kicker">Flow summary</div>
          <div className="fl-brief-title">{title}</div>
        </div>
        <div className="fl-brief-pill">{open ? "Collapse" : "Expand"}</div>
      </button>
      {open && (
        <div className="fl-brief-body">
          <div><p className="fl-brief-label">Trigger</p><p className="fl-brief-text">{trigger.label}</p></div>
          <div><p className="fl-brief-label">Logic</p><p className="fl-brief-text">{filterCount} entry filters · {exitCount} exits</p></div>
          <div><p className="fl-brief-label">Entry filters</p><p className="fl-brief-text">{meta.filters?.join(" • ") || "None specified"}</p></div>
          <div><p className="fl-brief-label">Exit rules</p><p className="fl-brief-text">{meta.exit?.join(" • ") || "Default flow completion"}</p></div>
        </div>
      )}
    </div>
  );
}

function NodePalette({ onStartDrag }: { onStartDrag: (kind: NodeKind, e: React.MouseEvent) => void }) {
  const items: NodeKind[] = ["email", "sms", "push", "delay", "split", "trigger_split", "webhook", "exit"];
  return (
    <div className="fl-node-palette">
      {items.map((kind) => {
        const { Icon, label } = KIND_META[kind];
        return (
          <button key={kind} onMouseDown={(e) => onStartDrag(kind, e)} title={`Drag ${label} into a path`}>
            <span className="sw"><Icon className="w-3.5 h-3.5" /></span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Minimap ---------- */

function Minimap({
  board,
  pan,
  zoom,
  stageRef,
}: {
  board: { nodes: BoardNode[] };
  pan: { x: number; y: number };
  zoom: number;
  stageRef: React.RefObject<HTMLDivElement>;
}) {
  if (!board.nodes.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const n of board.nodes) {
    const sz = getNodeSize(n.kind);
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + sz.w);
    maxY = Math.max(maxY, n.y + sz.h);
  }
  const pad = 240;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const w = maxX - minX;
  const h = maxY - minY;
  const r = stageRef.current?.getBoundingClientRect() || { width: 1200, height: 800 };
  const vpX = -pan.x / zoom;
  const vpY = -pan.y / zoom;
  const vpW = (r as any).width / zoom;
  const vpH = (r as any).height / zoom;

  return (
    <div className="fl-mini">
      <svg viewBox={`${minX} ${minY} ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
        {board.nodes.map((n) => {
          const sz = getNodeSize(n.kind);
          return (
            <rect
              key={n.id}
              x={n.x}
              y={n.y}
              width={sz.w}
              height={sz.h}
              rx={10}
              fill="rgba(10,10,10,0.06)"
              stroke="rgba(10,10,10,0.30)"
              strokeWidth={2}
            />
          );
        })}
        <rect className="vp" x={vpX} y={vpY} width={vpW} height={vpH} />
      </svg>
    </div>
  );
}
