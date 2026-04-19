import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Filter,
  GitFork,
  Hand,
  Loader2,
  LogOut,
  Mail,
  Maximize2,
  MessageSquare,
  Minus,
  MousePointer2,
  Network,
  Plus,
  Sparkles,
  StickyNote,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FLOW_TRIGGERS,
  FLOW_TYPE_META,
  ParsedFlowMeta,
  ParsedFlowNode,
} from "@/lib/flows/skeletonParser";
import { cn } from "@/lib/utils";

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

interface Props {
  nodes: ParsedFlowNode[];
  meta: ParsedFlowMeta;
  flowType: string;
  emails: FlowEmailRow[];
  campaignMeta?: Record<string, FlowEmailMeta>;
  expandedIndex: number | null;
  onToggleExpand: (emailIndex: number | null) => void;
  onGenerateNode: (emailIndex: number) => void;
  onSaveNodeEdit: (
    emailIndex: number,
    patch: Partial<ParsedFlowNode>
  ) => void | Promise<void>;
  generatingIndex: number | null;
  drafting?: boolean;
}

type CanvasTool = "select" | "pan";
type BoardTone = "yellow" | "blue" | "pink" | "green";
type CanvasItemKind = "trigger" | "filters" | "delay" | "split" | "email" | "sms" | "exit";

interface CanvasItem {
  key: string;
  kind: CanvasItemKind;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  notes?: string;
  timing?: string;
  job?: string;
  subject_direction?: string;
  sections?: string[];
  emailIndex?: number;
  rawNode?: ParsedFlowNode;
}

interface BoardAnnotation {
  id: string;
  x: number;
  y: number;
  tone: BoardTone;
  label?: string;
  text: string;
  attachedTo: string;
}

interface FlowBriefData {
  title: string;
  statsLabel: string;
  goal: string;
  audience: string;
  metrics: Array<{ name: string; target: string }>;
  notes: string;
}

interface BoardData {
  items: CanvasItem[];
  connectors: Array<{ key: string; x: number; y: number; h: number }>;
  annotations: BoardAnnotation[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  brief: FlowBriefData | null;
}

const TONE_BG: Record<BoardTone, string> = {
  yellow: "hsl(var(--postit-yellow))",
  blue: "hsl(var(--postit-blue))",
  pink: "hsl(var(--postit-pink))",
  green: "hsl(var(--postit-green))",
};

const EMAIL_THUMB_WIDTH = 390;
const EMAIL_THUMB_SCALE = 0.12;

export function SkeletonViewer(props: Props) {
  const { nodes, meta, flowType, drafting } = props;
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.82);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<CanvasTool>("select");
  const [panning, setPanning] = useState(false);
  const [briefCollapsed, setBriefCollapsed] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);

  const board = useMemo(() => buildBoardData(nodes, meta, flowType), [nodes, meta, flowType]);

  const fitToView = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || board.items.length === 0) return;

    const rect = stage.getBoundingClientRect();
    const padX = 120;
    const padY = 90;
    const briefExtra = board.brief ? (briefCollapsed ? 120 : 280) : 0;

    const minX = board.bounds.minX - 120;
    const maxX = board.bounds.maxX + 120;
    const minY = board.bounds.minY - briefExtra;
    const maxY = board.bounds.maxY + 120;

    const worldWidth = Math.max(1, maxX - minX);
    const worldHeight = Math.max(1, maxY - minY);

    const nextZoom = Math.max(
      0.45,
      Math.min(1.05, Math.min((rect.width - padX * 2) / worldWidth, (rect.height - padY * 2) / worldHeight))
    );

    setZoom(nextZoom);
    setPan({
      x: rect.width / 2 - ((minX + maxX) / 2) * nextZoom,
      y: Math.max(48, rect.height / 2 - ((minY + maxY) / 2) * nextZoom),
    });
  }, [board, briefCollapsed]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => fitToView());
    return () => cancelAnimationFrame(frame);
  }, [fitToView]);

  const startStagePan = (clientX: number, clientY: number) => {
    const origin = { x: clientX - pan.x, y: clientY - pan.y };
    setPanning(true);

    const move = (event: MouseEvent) => {
      setPan({ x: event.clientX - origin.x, y: event.clientY - origin.y });
    };

    const end = () => {
      setPanning(false);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
  };

  const handleStageMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (tool !== "pan" && event.button !== 1) return;
    event.preventDefault();
    startStagePan(event.clientX, event.clientY);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const rect = stage.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    if (event.ctrlKey || event.metaKey || event.altKey) {
      const nextZoom = Math.max(0.35, Math.min(1.8, zoom * (1 - event.deltaY * 0.0015)));
      const ratio = nextZoom / zoom;
      setPan({
        x: mx - (mx - pan.x) * ratio,
        y: my - (my - pan.y) * ratio,
      });
      setZoom(nextZoom);
      return;
    }

    setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }));
  };

  if (nodes.length === 0) {
    return (
      <div className="absolute inset-0 overflow-hidden bg-[hsl(var(--canvas))]">
        <BoardGrid zoom={1} pan={{ x: 0, y: 0 }} />
        {drafting ? <DraftingCanvasState /> : <EmptyCanvasState />}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-[hsl(var(--canvas))] select-none">
      <div
        ref={stageRef}
        className={cn(
          "absolute inset-0 overflow-hidden",
          tool === "pan" ? "cursor-grab" : "cursor-default",
          panning && "cursor-grabbing"
        )}
        onMouseDown={handleStageMouseDown}
        onWheel={handleWheel}
      >
        <BoardGrid zoom={zoom} pan={pan} />

        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {board.brief && board.items[0] && (
            <div
              className="absolute"
              style={{
                transform: `translate(${-260}px, ${briefCollapsed ? -128 : -276}px)`,
                width: 520,
              }}
            >
              <FlowBriefCard
                brief={board.brief}
                collapsed={briefCollapsed}
                onToggle={() => setBriefCollapsed((current) => !current)}
              />
              <div className="absolute left-1/2 top-full -translate-x-1/2">
                <div className="h-12 w-px border-l border-dashed border-[hsl(var(--canvas-grid)/0.14)]" />
              </div>
            </div>
          )}

          {board.connectors.map((connector) => (
            <div
              key={connector.key}
              className="absolute w-px bg-[hsl(var(--canvas-grid)/0.16)]"
              style={{
                transform: `translate(${connector.x}px, ${connector.y}px)`,
                height: connector.h,
              }}
            />
          ))}

          {showAnnotations &&
            board.annotations.map((annotation) => (
              <StickyAnnotation key={annotation.id} annotation={annotation} />
            ))}

          {board.items.map((item) => {
            if (item.kind === "trigger") return <TriggerCard key={item.key} item={item} />;
            if (item.kind === "filters") return <FiltersCard key={item.key} item={item} meta={meta} flowType={flowType} />;
            if (item.kind === "delay") return <DelayPill key={item.key} item={item} />;
            if (item.kind === "split") return <SplitNodeCard key={item.key} item={item} />;
            if (item.kind === "sms") return <SmsNodeCard key={item.key} item={item} />;
            if (item.kind === "exit") return <ExitNodeCard key={item.key} item={item} />;

            const emailIndex = item.emailIndex ?? 0;
            const email = props.emails.find((entry) => entry.sequence_index === emailIndex);
            const metaRow = email?.campaign_id ? props.campaignMeta?.[email.campaign_id] : undefined;

            return (
              <EmailNodeCard
                key={item.key}
                item={item}
                email={email}
                meta={metaRow}
                expanded={props.expandedIndex === emailIndex}
                isGenerating={props.generatingIndex === emailIndex}
                onToggle={() => props.onToggleExpand(props.expandedIndex === emailIndex ? null : emailIndex)}
                onGenerate={() => props.onGenerateNode(emailIndex)}
                onSaveEdit={(patch) => props.onSaveNodeEdit(emailIndex, patch)}
              />
            );
          })}
        </div>

        <div className="absolute left-5 top-1/2 z-20 -translate-y-1/2">
          <div className="flex flex-col gap-1 rounded-[18px] border border-border/80 bg-card/95 p-2 shadow-[0_12px_36px_-18px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <CanvasToolButton
              active={tool === "select"}
              label="Select"
              shortcut="V"
              onClick={() => setTool("select")}
            >
              <MousePointer2 className="h-4 w-4" />
            </CanvasToolButton>
            <CanvasToolButton
              active={tool === "pan"}
              label="Pan"
              shortcut="H"
              onClick={() => setTool("pan")}
            >
              <Hand className="h-4 w-4" />
            </CanvasToolButton>
            <div className="mx-1 my-1 h-px bg-border" />
            <CanvasToolButton
              active={showAnnotations}
              label="Notes"
              shortcut="N"
              onClick={() => setShowAnnotations((current) => !current)}
            >
              <StickyNote className="h-4 w-4" />
            </CanvasToolButton>
            <CanvasToolButton active={false} label="Clean up" onClick={fitToView}>
              <Network className="h-4 w-4" />
            </CanvasToolButton>
          </div>
        </div>

        <MiniMap board={board} zoom={zoom} pan={pan} stageRef={stageRef} />

        <div className="absolute bottom-5 right-5 z-20 flex items-center overflow-hidden rounded-[18px] border border-border/80 bg-card/95 shadow-[0_12px_36px_-18px_rgba(0,0,0,0.18)] backdrop-blur-xl">
          <ZoomControlButton onClick={() => setZoom((current) => Math.max(0.35, current - 0.12))}>
            <Minus className="h-4 w-4" />
          </ZoomControlButton>
          <button
            onClick={fitToView}
            className="flex h-11 min-w-[72px] items-center justify-center border-x border-border px-4 text-[12px] font-medium text-foreground/65 transition-colors hover:text-foreground"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ZoomControlButton onClick={() => setZoom((current) => Math.min(1.8, current + 0.12))}>
            <Plus className="h-4 w-4" />
          </ZoomControlButton>
          <ZoomControlButton onClick={fitToView}>
            <Maximize2 className="h-4 w-4" />
          </ZoomControlButton>
        </div>
      </div>
    </div>
  );
}

function buildBoardData(nodes: ParsedFlowNode[], meta: ParsedFlowMeta, flowType: string): BoardData {
  const items: CanvasItem[] = [];
  const connectors: Array<{ key: string; x: number; y: number; h: number }> = [];
  const annotations: BoardAnnotation[] = [];

  let y = 0;
  let emailIndex = 0;
  const triggerLabel = meta.trigger || FLOW_TRIGGERS[flowType] || FLOW_TYPE_META[flowType]?.label || "Trigger";

  const pushItem = (item: CanvasItem, gap = 72) => {
    items.push(item);
    y = item.y + item.h + gap;
  };

  const trigger: CanvasItem = {
    key: "trigger",
    kind: "trigger",
    x: -120,
    y,
    w: 240,
    h: 74,
    label: triggerLabel,
  };
  pushItem(trigger, meta.filters?.length ? 72 : 86);

  if (meta.filters?.length) {
    const filters: CanvasItem = {
      key: "filters",
      kind: "filters",
      x: -168,
      y,
      w: 336,
      h: 110,
      label: "Entry filters",
    };
    connectors.push({
      key: "trigger-filters",
      x: 0,
      y: trigger.y + trigger.h,
      h: filters.y - (trigger.y + trigger.h),
    });
    pushItem(filters, 80);
  }

  const toneCycle: BoardTone[] = ["yellow", "blue", "pink", "green"];
  const currentTop = items[items.length - 1];
  let previous = currentTop;

  nodes.forEach((node, index) => {
    const kind: CanvasItemKind = node.node_type === "delay" ? "delay" : node.node_type === "split" ? "split" : node.node_type === "sms" ? "sms" : "email";

    const size =
      kind === "delay"
        ? { w: 128, h: 34 }
        : kind === "split"
          ? { w: 320, h: 108 }
          : kind === "sms"
            ? { w: 320, h: 82 }
            : { w: 360, h: 88 };

    const item: CanvasItem = {
      key: `${kind}-${index}`,
      kind,
      x: -size.w / 2,
      y,
      w: size.w,
      h: size.h,
      label:
        kind === "delay"
          ? node.label || "Delay"
          : node.label || (kind === "sms" ? "SMS" : kind === "split" ? "Conditional Split" : `Email ${emailIndex + 1}`),
      notes: node.notes,
      timing: node.timing,
      job: node.job,
      subject_direction: node.subject_direction,
      sections: node.sections,
      rawNode: node,
      emailIndex: kind === "email" ? emailIndex++ : undefined,
    };

    connectors.push({
      key: `${previous.key}-${item.key}`,
      x: 0,
      y: previous.y + previous.h,
      h: item.y - (previous.y + previous.h),
    });

    pushItem(item, kind === "delay" ? 48 : 74);
    previous = item;

    const annotationText =
      node.notes?.trim() ||
      (kind === "email" ? node.job?.trim() : undefined) ||
      (kind === "split" ? node.raw.trim() : undefined);

    if (annotationText && kind !== "delay") {
      const tone = toneCycle[annotations.length % toneCycle.length];
      const side = annotations.length % 2 === 0 ? -1 : 1;
      annotations.push({
        id: `annotation-${index}`,
        attachedTo: item.key,
        tone,
        label: kind === "split" ? "Attached" : undefined,
        text: annotationText,
        x: side < 0 ? item.x - 244 : item.x + item.w + 48,
        y: item.y + Math.max(8, item.h / 2 - 54),
      });
    }
  });

  if (meta.exit?.length) {
    const exit: CanvasItem = {
      key: "exit",
      kind: "exit",
      x: -154,
      y,
      w: 308,
      h: 92,
      label: meta.exit[0],
      notes: meta.exit.slice(1).join("\n"),
    };

    connectors.push({
      key: `${previous.key}-exit`,
      x: 0,
      y: previous.y + previous.h,
      h: exit.y - (previous.y + previous.h),
    });

    items.push(exit);
  }

  const bounds = items.reduce(
    (acc, item) => ({
      minX: Math.min(acc.minX, item.x),
      minY: Math.min(acc.minY, item.y),
      maxX: Math.max(acc.maxX, item.x + item.w),
      maxY: Math.max(acc.maxY, item.y + item.h),
    }),
    { minX: -220, minY: -300, maxX: 220, maxY: 160 }
  );

  annotations.forEach((annotation) => {
    bounds.minX = Math.min(bounds.minX, annotation.x);
    bounds.minY = Math.min(bounds.minY, annotation.y);
    bounds.maxX = Math.max(bounds.maxX, annotation.x + 196);
    bounds.maxY = Math.max(bounds.maxY, annotation.y + 118);
  });

  return {
    items,
    connectors,
    annotations,
    bounds,
    brief: buildFlowBrief(nodes, meta, flowType),
  };
}

function buildFlowBrief(
  nodes: ParsedFlowNode[],
  meta: ParsedFlowMeta,
  flowType: string
): FlowBriefData | null {
  const flowMeta = FLOW_TYPE_META[flowType];
  const emailCount = nodes.filter((node) => node.node_type === "email").length;
  const delayLabels = nodes
    .filter((node) => node.node_type === "delay")
    .map((node) => node.label)
    .filter(Boolean) as string[];
  const splitCount = nodes.filter((node) => node.node_type === "split").length;

  if (!flowMeta && emailCount === 0 && !meta.trigger) return null;

  return {
    title: `${flowMeta?.label || "Flow"} — ${meta.trigger || FLOW_TRIGGERS[flowType] || "Custom Trigger"}`,
    statsLabel: `${emailCount || nodes.length} steps · ${delayLabels.join(" · ") || "live edits"}`,
    goal: flowMeta?.description || "Refine the sequence, timing, and message hierarchy before generation.",
    audience:
      meta.filters?.slice(0, 2).join(" · ") ||
      meta.trigger ||
      FLOW_TRIGGERS[flowType] ||
      "Flow audience defined by the entry trigger.",
    metrics: [
      { name: "Messages", target: String(emailCount) },
      { name: "Waits", target: String(delayLabels.length) },
      { name: "Branches", target: String(splitCount) },
    ],
    notes:
      nodes
        .map((node) => node.notes || node.job)
        .filter(Boolean)
        .slice(0, 2)
        .join(" ") || "Use the canvas to refine logic, then generate the strongest path.",
  };
}

function BoardGrid({ zoom, pan }: { zoom: number; pan: { x: number; y: number } }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          "radial-gradient(circle, hsl(var(--canvas-grid) / 0.1) 1px, transparent 1px)",
        backgroundSize: `${Math.max(18, 24 * zoom)}px ${Math.max(18, 24 * zoom)}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    />
  );
}

function EmptyCanvasState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-6">
      <div className="rounded-[24px] border border-border bg-card/90 px-8 py-6 text-center shadow-[0_24px_60px_-28px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <div className="mb-3 flex justify-center text-foreground/45">
          <Sparkles className="h-5 w-5" />
        </div>
        <p className="text-[14px] font-medium text-foreground">Describe the flow you want to build.</p>
        <p className="mt-1 text-[12px] text-foreground/55">The board will appear here as the agent drafts the structure.</p>
      </div>
    </div>
  );
}

function DraftingCanvasState() {
  return (
    <div className="absolute inset-0 px-6 pt-28">
      <div className="mx-auto flex max-w-[720px] flex-col items-center gap-5">
        <div className="rounded-full border border-border bg-card/90 px-4 py-2 text-[12px] font-medium text-foreground/65 shadow-sm backdrop-blur-xl">
          Drafting your flow on canvas…
        </div>
        <div className="w-[520px] rounded-[22px] border border-border bg-card/90 p-5 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.18)] backdrop-blur-xl animate-pulse">
          <div className="mb-3 h-3 w-36 rounded-full bg-foreground/8" />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="h-2.5 w-full rounded-full bg-foreground/6" />
              <div className="h-2.5 w-[88%] rounded-full bg-foreground/6" />
              <div className="h-2.5 w-[76%] rounded-full bg-foreground/6" />
            </div>
            <div className="space-y-2">
              <div className="h-2.5 w-full rounded-full bg-foreground/6" />
              <div className="h-2.5 w-[80%] rounded-full bg-foreground/6" />
              <div className="h-2.5 w-[64%] rounded-full bg-foreground/6" />
            </div>
          </div>
        </div>
        <GhostCard width={250} />
        <div className="h-12 w-px bg-foreground/12" />
        <GhostCard width={132} pill />
        <div className="h-12 w-px bg-foreground/12" />
        <GhostCard width={360} />
      </div>
    </div>
  );
}

function GhostCard({ width, pill = false }: { width: number; pill?: boolean }) {
  return (
    <div
      className={cn(
        "animate-pulse border border-border bg-card/85 shadow-[0_14px_32px_-18px_rgba(0,0,0,0.18)] backdrop-blur-xl",
        pill ? "rounded-full px-4 py-2" : "rounded-[18px] p-4"
      )}
      style={{ width }}
    >
      <div className="h-2.5 w-24 rounded-full bg-foreground/8" />
      {!pill && (
        <>
          <div className="mt-3 h-2.5 w-full rounded-full bg-foreground/6" />
          <div className="mt-2 h-2.5 w-[72%] rounded-full bg-foreground/6" />
        </>
      )}
    </div>
  );
}

function FlowBriefCard({
  brief,
  collapsed,
  onToggle,
}: {
  brief: FlowBriefData;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-border bg-card/95 shadow-[0_28px_72px_-32px_rgba(0,0,0,0.2)] backdrop-blur-xl">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-foreground text-background">
            <WandSparkles className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/45">Flow brief</div>
            <div className="truncate text-[13px] font-medium text-foreground">{brief.title}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-foreground/55">
          <span>{brief.statsLabel}</span>
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </div>
      </button>
      {!collapsed && (
        <div className="grid grid-cols-2 gap-4 border-t border-border/80 px-5 py-4">
          <FlowBriefBlock label="Strategic goal">{brief.goal}</FlowBriefBlock>
          <FlowBriefBlock label="Audience">{brief.audience}</FlowBriefBlock>
          <FlowBriefBlock label="Success metrics">
            <ul className="space-y-1.5">
              {brief.metrics.map((metric) => (
                <li key={metric.name} className="flex items-center justify-between gap-4">
                  <span>{metric.name}</span>
                  <strong className="text-foreground">{metric.target}</strong>
                </li>
              ))}
            </ul>
          </FlowBriefBlock>
          <FlowBriefBlock label="Notes">{brief.notes}</FlowBriefBlock>
        </div>
      )}
    </div>
  );
}

function FlowBriefBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/4៥">{label}</div>
      <div className="text-[12px] leading-5 text-foreground/68">{children}</div>
    </div>
  );
}

function StickyAnnotation({ annotation }: { annotation: BoardAnnotation }) {
  return (
    <div
      className="absolute rounded-[10px] border border-black/5 px-3 py-2 shadow-[0_14px_28px_-18px_rgba(0,0,0,0.18)]"
      style={{
        transform: `translate(${annotation.x}px, ${annotation.y}px)`,
        width: 196,
        backgroundColor: TONE_BG[annotation.tone],
      }}
    >
      {annotation.label && (
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground/45">{annotation.label}</div>
      )}
      <div className="text-[12px] leading-5 text-foreground/72">{annotation.text}</div>
    </div>
  );
}

function CanvasToolButton({
  active,
  label,
  shortcut,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex h-10 w-10 items-center justify-center rounded-[12px] transition-all",
        active ? "bg-foreground text-background" : "text-foreground/60 hover:bg-muted hover:text-foreground"
      )}
      aria-label={label}
    >
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 ml-3 hidden -translate-y-1/2 rounded-[8px] bg-foreground px-2.5 py-1.5 text-[11px] font-medium text-background shadow-lg group-hover:block">
        {label}
        {shortcut ? <span className="ml-2 text-background/70">{shortcut}</span> : null}
      </div>
    </button>
  );
}

function ZoomControlButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center text-foreground/65 transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function MiniMap({
  board,
  zoom,
  pan,
  stageRef,
}: {
  board: BoardData;
  zoom: number;
  pan: { x: number; y: number };
  stageRef: React.RefObject<HTMLDivElement>;
}) {
  if (!board.items.length) return null;

  const rect = stageRef.current?.getBoundingClientRect();
  const vpX = -pan.x / zoom;
  const vpY = -pan.y / zoom;
  const vpW = (rect?.width || 1) / zoom;
  const vpH = (rect?.height || 1) / zoom;
  const viewX = board.bounds.minX - 80;
  const viewY = board.bounds.minY - 120;
  const viewW = board.bounds.maxX - board.bounds.minX + 160;
  const viewH = board.bounds.maxY - board.bounds.minY + 220;

  return (
    <div className="absolute bottom-5 left-5 z-20 h-[118px] w-[180px] overflow-hidden rounded-[18px] border border-border/80 bg-card/95 shadow-[0_12px_36px_-18px_rgba(0,0,0,0.18)] backdrop-blur-xl">
      <svg className="h-full w-full" viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`} preserveAspectRatio="xMidYMid meet">
        {board.items.map((item) => (
          <rect
            key={item.key}
            x={item.x}
            y={item.y}
            width={item.w}
            height={item.h}
            rx={item.kind === "delay" ? 17 : 12}
            fill="rgba(232,232,230,0.95)"
            stroke="rgba(10,10,10,0.16)"
            strokeWidth="2"
          />
        ))}
        <rect
          x={vpX}
          y={vpY}
          width={vpW}
          height={vpH}
          fill="rgba(17,17,17,0.04)"
          stroke="rgba(17,17,17,0.32)"
          strokeWidth="1.6"
          rx="12"
        />
      </svg>
    </div>
  );
}

function TriggerCard({ item }: { item: CanvasItem }) {
  return (
    <div className="absolute" style={{ transform: `translate(${item.x}px, ${item.y}px)` }}>
      <NodeShell width={item.w} height={item.h}>
        <NodeHeader icon={<Zap className="h-3.5 w-3.5" />} iconFilled label="Trigger" title={item.label} />
      </NodeShell>
    </div>
  );
}

function FiltersCard({ item, meta, flowType }: { item: CanvasItem; meta: ParsedFlowMeta; flowType: string }) {
  const filters = meta.filters || [FLOW_TRIGGERS[flowType] || FLOW_TYPE_META[flowType]?.description || "Flow entry rule"];
  return (
    <div className="absolute" style={{ transform: `translate(${item.x}px, ${item.y}px)` }}>
      <NodeShell width={item.w} height={item.h}>
        <NodeHeader icon={<Filter className="h-3.5 w-3.5" />} label="Entry filters" title={item.label} muted />
        <div className="mt-2 space-y-1 pl-10 text-[12px] leading-5 text-foreground/68">
          {filters.slice(0, 3).map((filter) => (
            <div key={filter} className="flex gap-2">
              <span className="text-foreground/25">•</span>
              <span>{filter}</span>
            </div>
          ))}
        </div>
      </NodeShell>
    </div>
  );
}

function DelayPill({ item }: { item: CanvasItem }) {
  return (
    <div
      className="absolute flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-[12px] font-medium text-foreground/68 shadow-[0_10px_24px_-18px_rgba(0,0,0,0.18)] backdrop-blur-xl"
      style={{ transform: `translate(${item.x}px, ${item.y}px)`, width: item.w, height: item.h }}
    >
      <Clock3 className="h-3.5 w-3.5 text-foreground/45" />
      <span className="truncate">Wait {item.label}</span>
    </div>
  );
}

function SplitNodeCard({ item }: { item: CanvasItem }) {
  return (
    <div className="absolute" style={{ transform: `translate(${item.x}px, ${item.y}px)` }}>
      <NodeShell width={item.w} height={item.h}>
        <NodeHeader icon={<GitFork className="h-3.5 w-3.5" />} label="Conditional split" title={item.label} muted />
        <div className="mt-2 rounded-[8px] bg-muted px-3 py-2 text-[11px] font-medium text-foreground/68">
          {item.notes || "Route subscribers based on the branch condition."}
        </div>
        <div className="mt-3 flex gap-2">
          <span className="rounded-[7px] border border-black/5 px-3 py-1 text-[11px] font-semibold text-foreground/72" style={{ backgroundColor: TONE_BG.green }}>
            Yes
          </span>
          <span className="rounded-[7px] border border-black/5 px-3 py-1 text-[11px] font-semibold text-foreground/72" style={{ backgroundColor: TONE_BG.pink }}>
            No
          </span>
        </div>
      </NodeShell>
    </div>
  );
}

function SmsNodeCard({ item }: { item: CanvasItem }) {
  return (
    <div className="absolute" style={{ transform: `translate(${item.x}px, ${item.y}px)` }}>
      <NodeShell width={item.w} height={item.h}>
        <NodeHeader icon={<MessageSquare className="h-3.5 w-3.5" />} label="SMS" title={item.label} />
        {item.notes ? <div className="mt-1 line-clamp-2 pl-10 text-[12px] text-foreground/58">{item.notes}</div> : null}
      </NodeShell>
    </div>
  );
}

function ExitNodeCard({ item }: { item: CanvasItem }) {
  return (
    <div className="absolute" style={{ transform: `translate(${item.x}px, ${item.y}px)` }}>
      <NodeShell width={item.w} height={item.h} noBottomPort>
        <NodeHeader icon={<LogOut className="h-3.5 w-3.5" />} label="Exit condition" title={item.label} muted />
        {item.notes ? <div className="mt-2 pl-10 text-[12px] text-foreground/58">{item.notes}</div> : null}
      </NodeShell>
    </div>
  );
}

function EmailNodeCard({
  item,
  email,
  meta,
  expanded,
  isGenerating,
  onToggle,
  onGenerate,
  onSaveEdit,
}: {
  item: CanvasItem;
  email: FlowEmailRow | undefined;
  meta: FlowEmailMeta | undefined;
  expanded: boolean;
  isGenerating: boolean;
  onToggle: () => void;
  onGenerate: () => void;
  onSaveEdit: (patch: Partial<ParsedFlowNode>) => void | Promise<void>;
}) {
  const status = email?.generation_status || "pending";
  const hasHtml = !!email?.html;

  return (
    <>
      <div className="absolute" style={{ transform: `translate(${item.x}px, ${item.y}px)` }}>
        <div
          className={cn(
            "relative rounded-[14px] border bg-card shadow-[0_14px_32px_-20px_rgba(0,0,0,0.18)] transition-all",
            expanded ? "border-foreground/30 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.22)]" : "border-border hover:border-foreground/25"
          )}
          style={{ width: item.w, minHeight: item.h }}
        >
          <button
            onClick={onToggle}
            className="flex w-full items-start gap-3 px-3.5 py-3 text-left"
          >
            <MiniPreviewThumb html={email?.html} />
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-[12px] font-semibold text-foreground">{item.label}</div>
                {item.timing ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-foreground/55">
                    {item.timing}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 line-clamp-1 text-[11px] text-foreground/52">
                {meta?.subject_line || item.subject_direction || item.job || "Expand preview"}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <StatusBadge status={status} isGenerating={isGenerating} />
                <span className="text-[10px] uppercase tracking-[0.12em] text-foreground/38">Email</span>
              </div>
            </div>
            <div className="pt-1 text-foreground/40">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="absolute" style={{ transform: `translate(${item.x + item.w + 28}px, ${item.y - 8}px)` }}>
          <div className="w-[420px] overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_30px_80px_-26px_rgba(0,0,0,0.24)]">
            <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-3">
              <div>
                <div className="text-[12px] font-semibold text-foreground">{item.label}</div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-foreground/42">Preview</div>
              </div>
              <button onClick={onToggle} className="text-foreground/40 transition-colors hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[72vh] overflow-y-auto p-4 space-y-4 bg-[hsl(var(--canvas))]">
              <BriefEditor item={item} onSave={onSaveEdit} />
              {hasHtml && email?.html ? (
                <CampaignPreview html={email.html} meta={meta} />
              ) : (
                <div className="rounded-[16px] border border-dashed border-border bg-card px-6 py-8 text-center">
                  <p className="text-[12px] text-foreground/56">No campaign generated yet for this step.</p>
                  <Button size="sm" onClick={onGenerate} disabled={isGenerating} className="mt-4">
                    {isGenerating ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1.5 h-3 w-3" />}
                    Generate this email
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MiniPreviewThumb({ html }: { html: string | null | undefined }) {
  if (!html) {
    return (
      <div className="relative h-[56px] w-[44px] overflow-hidden rounded-[8px] border border-border bg-white shadow-sm">
        <div className="px-1.5 pt-1.5">
          <div className="h-1.5 w-5 rounded-full bg-foreground/12" />
          <div className="mt-1 h-1.5 w-8 rounded-full bg-foreground/10" />
          <div className="mt-2 h-5 rounded-[4px] bg-foreground/6" />
          <div className="mt-1 h-1.5 w-full rounded-full bg-foreground/8" />
          <div className="mt-1 h-1.5 w-3/4 rounded-full bg-foreground/8" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[56px] w-[44px] overflow-hidden rounded-[8px] border border-border bg-white shadow-sm">
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `scale(${EMAIL_THUMB_SCALE})`, width: EMAIL_THUMB_WIDTH }}
      >
        <iframe
          srcDoc={html}
          sandbox="allow-same-origin"
          style={{ width: EMAIL_THUMB_WIDTH, height: 560, border: 0, background: "white", pointerEvents: "none" }}
        />
      </div>
    </div>
  );
}

function NodeShell({
  children,
  width,
  height,
  noTopPort,
  noBottomPort,
}: {
  children: React.ReactNode;
  width: number;
  height: number;
  noTopPort?: boolean;
  noBottomPort?: boolean;
}) {
  return (
    <div className="relative rounded-[14px] border border-border bg-card px-3.5 py-3 shadow-[0_14px_32px_-20px_rgba(0,0,0,0.18)]" style={{ width, minHeight: height }}>
      {!noTopPort ? <NodePort top /> : null}
      {children}
      {!noBottomPort ? <NodePort /> : null}
    </div>
  );
}

function NodePort({ top = false }: { top?: boolean }) {
  return (
    <div
      className={cn(
        "absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-border bg-card",
        top ? "-top-1.5" : "-bottom-1.5"
      )}
    />
  );
}

function NodeHeader({
  icon,
  label,
  title,
  muted,
  iconFilled,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  muted?: boolean;
  iconFilled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-[9px] border text-foreground/60",
          iconFilled ? "border-transparent bg-foreground text-background" : muted ? "border-border bg-muted" : "border-border bg-card"
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/42">{label}</div>
        <div className="truncate text-[13px] font-medium text-foreground">{title}</div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  isGenerating,
}: {
  status: string;
  isGenerating: boolean;
}) {
  if (isGenerating || status === "generating") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-foreground/62">
        <Loader2 className="h-3 w-3 animate-spin" /> Generating
      </span>
    );
  }

  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
        <Check className="h-3 w-3" /> Live
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-foreground/62">
        <X className="h-3 w-3" /> Failed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-foreground/52">
      Brief
    </span>
  );
}

function BriefEditor({
  item,
  onSave,
}: {
  item: CanvasItem;
  onSave: (patch: Partial<ParsedFlowNode>) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<ParsedFlowNode>>({});

  useEffect(() => {
    if (!editing) {
      setDraft({
        label: item.label,
        timing: item.timing,
        job: item.job,
        subject_direction: item.subject_direction,
        notes: item.notes,
        sections: item.sections,
      });
    }
  }, [editing, item]);

  if (editing) {
    return (
      <div className="rounded-[16px] border border-border bg-card p-3 space-y-3">
        <Field label="Label">
          <Input value={draft.label || ""} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} className="h-8 text-[13px]" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Timing">
            <Input value={draft.timing || ""} onChange={(event) => setDraft((current) => ({ ...current, timing: event.target.value }))} className="h-8 text-[13px]" />
          </Field>
          <Field label="Subject angle">
            <Input value={draft.subject_direction || ""} onChange={(event) => setDraft((current) => ({ ...current, subject_direction: event.target.value }))} className="h-8 text-[13px]" />
          </Field>
        </div>
        <Field label="Job">
          <Textarea value={draft.job || ""} onChange={(event) => setDraft((current) => ({ ...current, job: event.target.value }))} rows={2} className="text-[13px]" />
        </Field>
        <Field label="Sections">
          <Textarea
            value={(draft.sections || []).join("\n")}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                sections: event.target.value
                  .split("\n")
                  .map((entry) => entry.trim())
                  .filter(Boolean),
              }))
            }
            rows={3}
            className="text-[13px]"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          <Button
            size="sm"
            onClick={async () => {
              await onSave(draft);
              setEditing(false);
            }}
          >
            Save brief
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[16px] border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/42">Brief</div>
        <button onClick={() => setEditing(true)} className="text-[11px] font-medium text-foreground/48 transition-colors hover:text-foreground">Edit</button>
      </div>
      <div className="space-y-1.5 text-[12px] text-foreground/64">
        {item.subject_direction ? <div><strong className="text-foreground/82">Subject:</strong> {item.subject_direction}</div> : null}
        {item.job ? <div>{item.job}</div> : null}
        {item.sections?.length ? (
          <div className="flex flex-wrap gap-1 pt-1">
            {item.sections.map((section) => (
              <span key={section} className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-foreground/55">{section}</span>
            ))}
          </div>
        ) : null}
        {item.notes ? <div className="italic text-foreground/52">{item.notes}</div> : null}
      </div>
    </div>
  );
}

function CampaignPreview({
  html,
  meta,
}: {
  html: string;
  meta: FlowEmailMeta | undefined;
}) {
  return (
    <div className="rounded-[16px] border border-border bg-card p-3">
      {(meta?.subject_line || meta?.preview_text) && (
        <div className="mb-3 space-y-1 border-b border-border pb-3 text-[12px] text-foreground/66">
          {meta?.subject_line ? <div><span className="text-foreground/48">Subject:</span> <span className="font-medium text-foreground">{meta.subject_line}</span></div> : null}
          {meta?.preview_text ? <div><span className="text-foreground/48">Preview:</span> {meta.preview_text}</div> : null}
        </div>
      )}
      <div className="flex justify-center">
        <iframe
          srcDoc={html}
          sandbox="allow-same-origin"
          style={{
            width: 390,
            height: 560,
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "white",
          }}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/42">{label}</label>
      {children}
    </div>
  );
}
