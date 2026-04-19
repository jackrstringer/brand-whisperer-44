import { ParsedFlowNode, ParsedFlowMeta } from "@/lib/flows/skeletonParser";
import {
  Mail,
  Clock,
  GitFork,
  MessageSquare,
  Loader2,
  Check,
  X,
  Pencil,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
  Filter,
  LogOut,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  useControls,
} from "react-zoom-pan-pinch";

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

/**
 * Flowline-style canvas: warm off-white board, charcoal-outlined nodes,
 * thin connectors, calm spacing. Supports pan/zoom but hides chrome.
 */
export function SkeletonViewer(props: Props) {
  const { nodes, drafting } = props;

  return (
    <div className="absolute inset-0 bg-[hsl(var(--canvas))] overflow-hidden">
      <BoardGrid />
      {nodes.length === 0 ? (
        drafting ? (
          <DraftingShimmer />
        ) : (
          <EmptyState />
        )
      ) : (
        <TransformWrapper
          initialScale={0.92}
          minScale={0.35}
          maxScale={2}
          centerOnInit
          limitToBounds={false}
          wheel={{ step: 0.06 }}
          doubleClick={{ disabled: true }}
          panning={{ velocityDisabled: false, excluded: ["input", "textarea", "button", "iframe"] }}
          pinch={{ step: 2 }}
          smooth
        >
          {() => (
            <>
              <ZoomToolbar />
              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "auto", height: "auto" }}
              >
                <div>
                  <CanvasContent {...props} />
                </div>
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      )}
    </div>
  );
}

/** Faint dot grid stays fixed to viewport while user pans. */
function BoardGrid() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage:
          "radial-gradient(circle, hsl(var(--foreground) / 0.07) 1px, transparent 1px)",
        backgroundSize: "26px 26px",
      }}
    />
  );
}

function EmptyState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-center px-6">
      <div className="max-w-sm">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full border border-foreground/20 flex items-center justify-center">
          <GitFork className="w-5 h-5 text-foreground/40" />
        </div>
        <p className="text-[13px] text-foreground/55 font-light">
          Tell the agent what you want — your skeleton will appear here.
        </p>
      </div>
    </div>
  );
}

function ZoomToolbar() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="absolute bottom-5 left-5 z-20 flex items-center gap-0.5 bg-card/90 backdrop-blur border border-border rounded-full shadow-sm px-1 py-1">
      <ToolBtn label="Zoom out" onClick={() => zoomOut()}>
        <ZoomOut className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn label="Fit" onClick={() => resetTransform()}>
        <Maximize2 className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn label="Zoom in" onClick={() => zoomIn()}>
        <ZoomIn className="w-3.5 h-3.5" />
      </ToolBtn>
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-7 h-7 rounded-full flex items-center justify-center text-foreground/55 hover:bg-muted hover:text-foreground transition-colors"
    >
      {children}
    </button>
  );
}

function CanvasContent({
  nodes,
  meta = {},
  flowType,
  emails,
  campaignMeta = {},
  expandedIndex,
  onToggleExpand,
  onGenerateNode,
  onSaveNodeEdit,
  generatingIndex,
}: Props) {
  let emailCount = 0;
  return (
    <div
      className="flex flex-col items-center"
      style={{ width: 720, paddingTop: 96, paddingBottom: 160, paddingLeft: 64, paddingRight: 64 }}
    >
      <TriggerCard trigger={meta.trigger} flowType={flowType} />
      <Connector />

      {((meta.filters && meta.filters.length > 0) || flowType) && (
        <>
          <FiltersCard filters={meta.filters} flowType={flowType} />
          <Connector />
        </>
      )}

      {nodes.map((node, i) => {
        const isLast = i === nodes.length - 1;
        let card;
        if (node.node_type === "email") {
          const myIndex = emailCount++;
          const email = emails.find((e) => e.sequence_index === myIndex);
          const metaRow = email?.campaign_id ? campaignMeta[email.campaign_id] : undefined;
          card = (
            <EmailNode
              node={node}
              index={myIndex}
              email={email}
              meta={metaRow}
              expanded={expandedIndex === myIndex}
              onToggle={() => onToggleExpand(expandedIndex === myIndex ? null : myIndex)}
              isGenerating={generatingIndex === myIndex}
              onGenerate={() => onGenerateNode(myIndex)}
              onSaveEdit={(patch) => onSaveNodeEdit(myIndex, patch)}
            />
          );
        } else if (node.node_type === "delay") {
          card = <DelayCard label={node.label || "Delay"} />;
        } else if (node.node_type === "split") {
          card = <SplitCard node={node} />;
        } else {
          card = <SmsCard node={node} />;
        }
        return (
          <div key={i} className="flex flex-col items-center w-full">
            {card}
            {!isLast && <Connector />}
          </div>
        );
      })}

      {meta.exit && meta.exit.length > 0 && (
        <>
          <Connector />
          <ExitCard exit={meta.exit} />
        </>
      )}
    </div>
  );
}

/* ---------------- Drafting (ghost cards on the live board) ---------------- */

function DraftingShimmer() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-start pt-24 px-6 overflow-y-auto">
      <div className="flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full bg-card/80 backdrop-blur border border-border shadow-sm">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-foreground opacity-50 animate-ping" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-foreground" />
        </span>
        <span className="text-[12px] font-medium text-foreground/80">Drafting your flow</span>
      </div>
      <div className="w-full max-w-[460px] flex flex-col items-center gap-0">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-full flex flex-col items-center">
            <GhostNode delay={i * 140} />
            {i < 3 && <Connector />}
          </div>
        ))}
      </div>
    </div>
  );
}

function GhostNode({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="w-full rounded-2xl border border-foreground/10 bg-card/70 backdrop-blur-sm p-4 animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="h-2.5 w-28 bg-foreground/10 rounded-full mb-2.5" />
      <div className="h-2 w-full bg-foreground/5 rounded-full mb-1.5" />
      <div className="h-2 w-2/3 bg-foreground/5 rounded-full" />
    </div>
  );
}

/* ---------------- Connectors & Nodes ---------------- */

function Connector() {
  return (
    <div className="flex flex-col items-center" style={{ paddingTop: 4, paddingBottom: 4 }}>
      <div className="w-px h-10 bg-foreground/15" />
    </div>
  );
}

function TriggerCard({ trigger, flowType }: { trigger?: string; flowType: string }) {
  const display =
    trigger ||
    ({
      welcome: "Added to List · newsletter signup",
      abandoned_checkout: "Started Checkout",
      post_purchase: "Placed Order",
      browse_abandonment: "Viewed Product",
      winback: "Time-based · 60+ days inactive",
    } as Record<string, string>)[flowType] ||
    "Trigger";

  return (
    <NodeShell accent="trigger">
      <div className="flex items-center gap-3">
        <NodeIcon>
          <Zap className="w-3.5 h-3.5" strokeWidth={2.2} />
        </NodeIcon>
        <div className="min-w-0 flex-1">
          <NodeKicker>Trigger</NodeKicker>
          <div className="text-[13.5px] font-medium text-foreground truncate">{display}</div>
        </div>
      </div>
    </NodeShell>
  );
}

function FiltersCard({ filters, flowType }: { filters?: string[]; flowType: string }) {
  const fallback: Record<string, string[]> = {
    welcome: [
      "Has not been in this flow in the last 60 days",
      "Has email consent",
      "Has not Placed Order since starting this flow",
    ],
    abandoned_checkout: [
      "Has not Placed Order since Started Checkout",
      "Has not been in this flow in the last 7 days",
    ],
    post_purchase: ["Has Placed Order"],
    browse_abandonment: [
      "Has not Started Checkout since Viewed Product",
      "Has not been in this flow in the last 14 days",
    ],
    winback: ["Has Placed Order at least once", "Has not Placed Order in 60+ days"],
  };
  const list = filters && filters.length > 0 ? filters : fallback[flowType] || [];
  if (list.length === 0) return null;

  return (
    <NodeShell>
      <div className="flex items-center gap-3 mb-2.5">
        <NodeIcon variant="muted">
          <Filter className="w-3.5 h-3.5" strokeWidth={2} />
        </NodeIcon>
        <NodeKicker>Entry filters</NodeKicker>
      </div>
      <ul className="space-y-1 pl-9">
        {list.map((f, i) => (
          <li key={i} className="text-[12.5px] text-foreground/70 flex gap-1.5 leading-relaxed">
            <span className="text-foreground/30">·</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </NodeShell>
  );
}

function ExitCard({ exit }: { exit: string[] }) {
  return (
    <div className="w-full max-w-[460px] rounded-2xl border border-dashed border-foreground/20 bg-transparent px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <LogOut className="w-3 h-3 text-foreground/50" strokeWidth={2.2} />
        <NodeKicker>Exit conditions</NodeKicker>
      </div>
      <ul className="space-y-1 pl-1">
        {exit.map((e, i) => (
          <li key={i} className="text-[12px] text-foreground/55 flex gap-1.5">
            <span className="text-foreground/30">·</span>
            <span>{e}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Shared node primitives ---------------- */

function NodeShell({
  children,
  accent,
  expanded,
}: {
  children: React.ReactNode;
  accent?: "trigger" | "final";
  expanded?: boolean;
}) {
  const base =
    "w-full max-w-[460px] rounded-2xl bg-card transition-all duration-200";
  const border = expanded
    ? "border border-foreground shadow-[0_4px_20px_-8px_rgba(0,0,0,0.18)]"
    : "border border-foreground/15 hover:border-foreground/35 hover:shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)] hover:-translate-y-[1px]";
  const accentCls =
    accent === "trigger"
      ? "border-foreground/40 bg-card"
      : accent === "final"
      ? "border-foreground bg-foreground text-background"
      : "";
  return (
    <div className={`${base} ${border} ${accentCls}`} style={{ padding: 14 }}>
      {children}
    </div>
  );
}

function NodeIcon({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "muted";
}) {
  const cls =
    variant === "muted"
      ? "bg-foreground/5 text-foreground/55 border-foreground/10"
      : "bg-foreground text-background border-transparent";
  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border ${cls}`}
    >
      {children}
    </div>
  );
}

function NodeKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.12em] text-foreground/45 font-semibold">
      {children}
    </div>
  );
}

function StatusBadge({ isGenerating, status }: { isGenerating: boolean; status: string }) {
  if (isGenerating || status === "generating")
    return (
      <span className="text-[10.5px] flex items-center gap-1 text-foreground/70 px-2 py-0.5 rounded-full border border-foreground/15 bg-card">
        <Loader2 className="w-3 h-3 animate-spin" /> Generating
      </span>
    );
  if (status === "complete")
    return (
      <span className="text-[10.5px] flex items-center gap-1 text-background px-2 py-0.5 rounded-full bg-foreground">
        <Check className="w-3 h-3" /> Live
      </span>
    );
  if (status === "failed")
    return (
      <span className="text-[10.5px] flex items-center gap-1 text-foreground px-2 py-0.5 rounded-full border border-foreground/30 bg-card">
        <X className="w-3 h-3" /> Failed
      </span>
    );
  return (
    <span className="text-[10.5px] text-foreground/55 px-2 py-0.5 rounded-full border border-foreground/10 bg-transparent">
      Brief
    </span>
  );
}

function EmailNode({
  node,
  index,
  email,
  meta,
  expanded,
  onToggle,
  isGenerating,
  onGenerate,
  onSaveEdit,
}: {
  node: ParsedFlowNode;
  index: number;
  email: FlowEmailRow | undefined;
  meta: FlowEmailMeta | undefined;
  expanded: boolean;
  onToggle: () => void;
  isGenerating: boolean;
  onGenerate: () => void;
  onSaveEdit: (patch: Partial<ParsedFlowNode>) => void | Promise<void>;
}) {
  const hasHtml = !!email?.html;
  const status = email?.generation_status || "pending";

  return (
    <div
      className={`w-full max-w-[460px] rounded-2xl bg-card overflow-hidden transition-all duration-200 ${
        expanded
          ? "border border-foreground shadow-[0_8px_28px_-12px_rgba(0,0,0,0.22)]"
          : "border border-foreground/15 hover:border-foreground/40 hover:shadow-[0_2px_12px_-6px_rgba(0,0,0,0.12)] hover:-translate-y-[1px]"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full text-left px-3.5 py-3 flex items-start justify-between gap-3"
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-[11px] font-semibold">
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <Mail className="w-3 h-3 text-foreground/45" strokeWidth={2.2} />
              <h4 className="font-medium text-foreground text-[13.5px] truncate">
                {node.label || `Email ${index + 1}`}
              </h4>
              {node.timing && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-foreground/10 text-foreground/55 font-medium">
                  {node.timing}
                </span>
              )}
            </div>
            {node.job && (
              <p className="text-[12px] text-foreground/55 line-clamp-1 leading-snug">
                {node.job}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge isGenerating={isGenerating} status={status} />
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-foreground/45" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-foreground/45" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-foreground/10 p-4 space-y-4 animate-fade-in bg-[hsl(var(--canvas))]/40">
          <BriefEditor node={node} onSave={onSaveEdit} />

          {hasHtml && email?.html ? (
            <CampaignPreview html={email.html} meta={meta} />
          ) : (
            <div className="rounded-xl border border-dashed border-foreground/20 p-6 flex flex-col items-center text-center bg-card">
              <p className="text-[12px] text-foreground/55 mb-3">
                No campaign generated yet for this email.
              </p>
              <Button size="sm" onClick={onGenerate} disabled={isGenerating}>
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 mr-1.5" /> Generate this email
                  </>
                )}
              </Button>
            </div>
          )}

          {hasHtml && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={onGenerate}
                disabled={isGenerating}
                className="text-[12px] h-7"
              >
                {isGenerating ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : null}
                Regenerate
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BriefEditor({
  node,
  onSave,
}: {
  node: ParsedFlowNode;
  onSave: (patch: Partial<ParsedFlowNode>) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<ParsedFlowNode>>({});

  useEffect(() => {
    if (!editing) {
      setDraft({
        label: node.label,
        timing: node.timing,
        job: node.job,
        subject_direction: node.subject_direction,
        sections: node.sections,
        notes: node.notes,
      });
    }
  }, [node, editing]);

  if (editing) {
    return (
      <div className="rounded-xl border border-foreground/15 bg-card p-3 space-y-2.5">
        <Field label="Label">
          <Input
            value={draft.label || ""}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            className="h-8 text-[13px]"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Timing">
            <Input
              value={draft.timing || ""}
              onChange={(e) => setDraft((d) => ({ ...d, timing: e.target.value }))}
              className="h-8 text-[13px]"
            />
          </Field>
          <Field label="Subject angle">
            <Input
              value={draft.subject_direction || ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, subject_direction: e.target.value }))
              }
              className="h-8 text-[13px]"
            />
          </Field>
        </div>
        <Field label="Job">
          <Textarea
            value={draft.job || ""}
            onChange={(e) => setDraft((d) => ({ ...d, job: e.target.value }))}
            rows={2}
            className="text-[13px]"
          />
        </Field>
        <Field label="Sections (one per line)">
          <Textarea
            value={(draft.sections || []).join("\n")}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                sections: e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }))
            }
            rows={3}
            className="text-[13px]"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
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
    <div className="rounded-xl border border-foreground/10 bg-card p-3 space-y-2 relative group">
      <button
        onClick={() => setEditing(true)}
        className="absolute top-2 right-2 p-1 rounded text-foreground/45 hover:bg-muted hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Edit brief"
      >
        <Pencil className="w-3 h-3" />
      </button>
      <NodeKicker>Brief</NodeKicker>
      <div className="space-y-1.5 text-[12.5px]">
        {node.subject_direction && (
          <div>
            <span className="font-medium text-foreground/70">Subject angle:</span>{" "}
            <span className="text-foreground/55">{node.subject_direction}</span>
          </div>
        )}
        {node.sections && node.sections.length > 0 && (
          <div className="pt-1">
            <div className="font-medium text-foreground/70 mb-1">Sections</div>
            <div className="flex flex-wrap gap-1">
              {node.sections.map((s, i) => (
                <span
                  key={i}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-card border border-foreground/15 text-foreground/75"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
        {node.notes && (
          <div className="text-foreground/55 italic pt-1">{node.notes}</div>
        )}
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
    <div className="rounded-xl border border-foreground/15 bg-card p-3">
      {(meta?.subject_line || meta?.preview_text) && (
        <div className="space-y-1 mb-3 pb-3 border-b border-foreground/10">
          {meta?.subject_line && (
            <div className="text-[12px]">
              <span className="text-foreground/55">Subject:</span>{" "}
              <span className="font-medium text-foreground">{meta.subject_line}</span>
            </div>
          )}
          {meta?.preview_text && (
            <div className="text-[12px]">
              <span className="text-foreground/55">Preview:</span>{" "}
              <span className="text-foreground/80">{meta.preview_text}</span>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-center">
        <iframe
          srcDoc={html}
          sandbox="allow-same-origin"
          style={{
            width: 390,
            height: 560,
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
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
      <label className="text-[10px] font-semibold uppercase tracking-[0.1em] text-foreground/45 mb-1 block">
        {label}
      </label>
      {children}
    </div>
  );
}

function DelayCard({ label }: { label: string }) {
  return (
    <div className="bg-card border border-foreground/15 rounded-full px-3.5 py-1.5 flex items-center gap-2 text-[12px] text-foreground/65 hover:border-foreground/35 hover:-translate-y-[1px] transition-all duration-200">
      <Clock className="w-3 h-3" strokeWidth={2.2} />
      <span className="font-medium">Wait {label}</span>
    </div>
  );
}

function SplitCard({ node }: { node: ParsedFlowNode }) {
  return (
    <NodeShell>
      <div className="flex items-center gap-3 mb-1.5">
        <NodeIcon variant="muted">
          <GitFork className="w-3.5 h-3.5" strokeWidth={2} />
        </NodeIcon>
        <div className="min-w-0">
          <NodeKicker>Conditional split</NodeKicker>
          <div className="text-[13.5px] font-medium text-foreground truncate">
            {node.label || "Conditional Split"}
          </div>
        </div>
      </div>
      {node.notes && (
        <div className="text-[12px] text-foreground/55 whitespace-pre-line pl-10">
          {node.notes}
        </div>
      )}
    </NodeShell>
  );
}

function SmsCard({ node }: { node: ParsedFlowNode }) {
  return (
    <NodeShell>
      <div className="flex items-center gap-3">
        <NodeIcon variant="muted">
          <MessageSquare className="w-3.5 h-3.5" strokeWidth={2} />
        </NodeIcon>
        <div className="min-w-0 flex-1">
          <NodeKicker>SMS</NodeKicker>
          <div className="text-[13.5px] font-medium text-foreground truncate">
            {node.label || "SMS"}
          </div>
          {node.notes && (
            <div className="text-[12px] text-foreground/55 line-clamp-2 mt-0.5">
              {node.notes}
            </div>
          )}
        </div>
      </div>
    </NodeShell>
  );
}
