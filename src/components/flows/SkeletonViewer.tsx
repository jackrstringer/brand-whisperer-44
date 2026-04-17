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

export function SkeletonViewer(props: Props) {
  const { nodes, drafting } = props;

  if (nodes.length === 0) {
    return (
      <div className="h-full w-full bg-[hsl(var(--muted))/0.3] dot-grid relative">
        {drafting ? (
          <DraftingShimmer />
        ) : (
          <div className="h-full flex items-center justify-center text-center px-6">
            <div className="max-w-sm">
              <GitFork className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-sm text-muted-foreground">
                Chat with the agent to build your flow skeleton →
              </p>
            </div>
          </div>
        )}
        <DotGridStyle />
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[hsl(var(--muted))/0.3] relative overflow-hidden">
      <DotGridStyle />
      <TransformWrapper
        initialScale={1}
        minScale={0.35}
        maxScale={2.2}
        limitToBounds={false}
        wheel={{ step: 0.08 }}
        doubleClick={{ disabled: true }}
        panning={{ velocityDisabled: true, excluded: ["input", "textarea", "button"] }}
        pinch={{ step: 5 }}
      >
        {() => (
          <>
            <ZoomToolbar />
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{ width: "100%", height: "100%" }}
            >
              <CanvasContent {...props} />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}

function DotGridStyle() {
  return (
    <style>{`
      .dot-grid {
        background-image: radial-gradient(circle, hsl(var(--muted-foreground) / 0.18) 1px, transparent 1px);
        background-size: 22px 22px;
      }
    `}</style>
  );
}

function ZoomToolbar() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 bg-card border border-border rounded-full shadow-lg px-1.5 py-1 backdrop-blur">
      <button
        onClick={() => zoomOut()}
        className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Zoom out"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <button
        onClick={() => resetTransform()}
        className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Reset view"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => zoomIn()}
        className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Zoom in"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
    </div>
  );
}

function CanvasContent({
  nodes,
  meta,
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
    <div className="dot-grid min-h-full w-full py-12 px-8 flex flex-col items-center">
      <TriggerCard trigger={meta.trigger} flowType={flowType} />
      <Connector label="When triggered" />
      {(meta.filters && meta.filters.length > 0) || true ? (
        <>
          <FiltersCard filters={meta.filters} flowType={flowType} />
          <Connector label="If matched" />
        </>
      ) : null}

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
          <div key={i} className="flex flex-col items-center w-full max-w-[460px]">
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

function DraftingShimmer() {
  return (
    <div className="h-full overflow-y-auto py-10 px-6">
      <div className="max-w-md mx-auto flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-sm font-medium text-foreground">Drafting your flow…</span>
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-full rounded-xl border border-border bg-card/60 p-4 animate-pulse"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="h-3 w-32 bg-muted rounded mb-2" />
            <div className="h-2 w-full bg-muted rounded mb-1.5" />
            <div className="h-2 w-3/4 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Connector({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-2">
      <div className="w-px h-6 bg-border" />
      {label && (
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-2 py-0.5 my-0.5">
          {label}
        </div>
      )}
      <div className="w-px h-6 bg-border" />
      <div className="text-muted-foreground/60 text-[11px] leading-none -mt-0.5">▼</div>
    </div>
  );
}

function TriggerCard({ trigger, flowType }: { trigger?: string; flowType: string }) {
  const display =
    trigger ||
    ({
      welcome: "Added to List (newsletter signup)",
      abandoned_checkout: "Started Checkout",
      post_purchase: "Placed Order",
      browse_abandonment: "Viewed Product",
      winback: "Time-based — 60+ days inactive",
    } as Record<string, string>)[flowType] ||
    "Trigger";

  return (
    <div className="w-full max-w-[460px] rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/30 px-4 py-3 shadow-sm hover:shadow-md hover:border-primary/50 hover:-translate-y-0.5 transition-all duration-200 cursor-default">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-primary/80 font-semibold">
            Trigger
          </div>
          <div className="text-sm font-medium text-foreground truncate">{display}</div>
        </div>
      </div>
    </div>
  );
}

function FiltersCard({ filters, flowType }: { filters?: string[]; flowType: string }) {
  // Always render — fall back to defaults so the user always sees the filter logic.
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
    <div className="w-full max-w-[460px] rounded-2xl bg-card border border-border px-4 py-3 shadow-sm hover:shadow-md hover:border-foreground/20 hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-full bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0">
          <Filter className="w-3.5 h-3.5" />
        </div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Entry filters
        </div>
      </div>
      <ul className="space-y-1 pl-1">
        {list.map((f, i) => (
          <li key={i} className="text-xs text-foreground/80 flex gap-1.5">
            <span className="text-muted-foreground/60">•</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExitCard({ exit }: { exit: string[] }) {
  return (
    <div className="w-full max-w-[460px] rounded-2xl bg-card border border-dashed border-border px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <LogOut className="w-3.5 h-3.5 text-muted-foreground" />
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Exit conditions
        </div>
      </div>
      <ul className="space-y-1 pl-1">
        {exit.map((e, i) => (
          <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
            <span className="text-muted-foreground/60">•</span>
            <span>{e}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ isGenerating, status }: { isGenerating: boolean; status: string }) {
  if (isGenerating || status === "generating")
    return (
      <span className="text-[11px] flex items-center gap-1 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full bg-amber-500/10">
        <Loader2 className="w-3 h-3 animate-spin" /> Generating
      </span>
    );
  if (status === "complete")
    return (
      <span className="text-[11px] flex items-center gap-1 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full bg-emerald-500/10">
        <Check className="w-3 h-3" /> Live
      </span>
    );
  if (status === "failed")
    return (
      <span className="text-[11px] flex items-center gap-1 text-destructive px-2 py-0.5 rounded-full bg-destructive/10">
        <X className="w-3 h-3" /> Failed
      </span>
    );
  return (
    <span className="text-[11px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
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
      className={`w-full bg-card border rounded-2xl shadow-sm overflow-hidden transition-all duration-200 ${
        expanded
          ? "border-primary/50 shadow-lg ring-2 ring-primary/10"
          : "border-border hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full text-left p-3.5 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <h4 className="font-semibold text-foreground text-sm truncate">
                {node.label || `Email ${index + 1}`}
              </h4>
              {node.timing && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  {node.timing}
                </span>
              )}
            </div>
            {node.job && (
              <p className="text-xs text-muted-foreground line-clamp-1">{node.job}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge isGenerating={isGenerating} status={status} />
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4 animate-fade-in">
          <BriefEditor node={node} onSave={onSaveEdit} />

          {hasHtml && email?.html ? (
            <CampaignPreview html={email.html} meta={meta} />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-6 flex flex-col items-center text-center bg-muted/20">
              <p className="text-xs text-muted-foreground mb-3">
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
                className="text-xs h-7"
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
      <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2.5">
        <Field label="Label">
          <Input
            value={draft.label || ""}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            className="h-8 text-sm"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Timing">
            <Input
              value={draft.timing || ""}
              onChange={(e) => setDraft((d) => ({ ...d, timing: e.target.value }))}
              className="h-8 text-sm"
            />
          </Field>
          <Field label="Subject angle">
            <Input
              value={draft.subject_direction || ""}
              onChange={(e) =>
                setDraft((d) => ({ ...d, subject_direction: e.target.value }))
              }
              className="h-8 text-sm"
            />
          </Field>
        </div>
        <Field label="Job">
          <Textarea
            value={draft.job || ""}
            onChange={(e) => setDraft((d) => ({ ...d, job: e.target.value }))}
            rows={2}
            className="text-sm"
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
            className="text-sm"
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
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 relative group">
      <button
        onClick={() => setEditing(true)}
        className="absolute top-2 right-2 p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Edit brief"
      >
        <Pencil className="w-3 h-3" />
      </button>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Brief
      </div>
      <div className="space-y-1.5 text-xs">
        {node.subject_direction && (
          <div>
            <span className="font-medium text-foreground/70">Subject angle:</span>{" "}
            <span className="text-muted-foreground">{node.subject_direction}</span>
          </div>
        )}
        {node.sections && node.sections.length > 0 && (
          <div className="pt-1">
            <div className="font-medium text-foreground/70 mb-1">Sections</div>
            <div className="flex flex-wrap gap-1">
              {node.sections.map((s, i) => (
                <span
                  key={i}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-background border border-border text-foreground/80"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
        {node.notes && (
          <div className="text-muted-foreground italic pt-1">{node.notes}</div>
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
    <div className="rounded-lg border border-border bg-background p-3">
      {(meta?.subject_line || meta?.preview_text) && (
        <div className="space-y-1 mb-3 pb-3 border-b border-border">
          {meta?.subject_line && (
            <div className="text-xs">
              <span className="text-muted-foreground">Subject:</span>{" "}
              <span className="font-medium text-foreground">{meta.subject_line}</span>
            </div>
          )}
          {meta?.preview_text && (
            <div className="text-xs">
              <span className="text-muted-foreground">Preview:</span>{" "}
              <span className="text-foreground">{meta.preview_text}</span>
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
      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
        {label}
      </label>
      {children}
    </div>
  );
}

function DelayCard({ label }: { label: string }) {
  return (
    <div className="bg-card border border-border rounded-full px-4 py-1.5 flex items-center gap-2 text-xs text-muted-foreground shadow-sm hover:shadow-md hover:border-foreground/30 hover:-translate-y-0.5 transition-all duration-200">
      <Clock className="w-3 h-3" />
      <span className="font-medium">Wait {label}</span>
    </div>
  );
}

function SplitCard({ node }: { node: ParsedFlowNode }) {
  return (
    <div className="w-full bg-card border border-dashed border-border rounded-2xl p-3.5 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-center gap-2 mb-1.5">
        <GitFork className="w-3.5 h-3.5 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          {node.label || "Conditional Split"}
        </span>
      </div>
      {node.notes && (
        <div className="text-xs text-muted-foreground whitespace-pre-line">{node.notes}</div>
      )}
    </div>
  );
}

function SmsCard({ node }: { node: ParsedFlowNode }) {
  return (
    <div className="w-full bg-card border border-border rounded-2xl p-3.5 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-center gap-2 mb-1.5">
        <MessageSquare className="w-3.5 h-3.5 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          {node.label || "SMS"}
        </span>
      </div>
      {node.notes && (
        <div className="text-xs text-muted-foreground line-clamp-3">{node.notes}</div>
      )}
    </div>
  );
}
