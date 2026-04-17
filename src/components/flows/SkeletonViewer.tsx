import { ParsedFlowNode } from "@/lib/flows/skeletonParser";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";

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
  emails: FlowEmailRow[];
  /** Map of campaign_id → meta (subject_line, preview_text). */
  campaignMeta?: Record<string, FlowEmailMeta>;
  expandedIndex: number | null;
  onToggleExpand: (emailIndex: number | null) => void;
  onGenerateNode: (emailIndex: number) => void;
  onSaveNodeEdit: (
    emailIndex: number,
    patch: Partial<ParsedFlowNode>
  ) => void | Promise<void>;
  generatingIndex: number | null;
  /** When true, show a shimmer placeholder for incoming skeleton. */
  drafting?: boolean;
}

export function SkeletonViewer({
  nodes,
  emails,
  campaignMeta = {},
  expandedIndex,
  onToggleExpand,
  onGenerateNode,
  onSaveNodeEdit,
  generatingIndex,
  drafting,
}: Props) {
  if (nodes.length === 0) {
    if (drafting) {
      return (
        <div className="h-full overflow-y-auto py-8 px-6">
          <div className="max-w-xl mx-auto flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              <span className="text-sm font-medium text-foreground">
                Drafting your flow skeleton…
              </span>
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-full rounded-xl border border-border bg-muted/40 p-4 animate-pulse"
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
    return (
      <div className="h-full flex items-center justify-center text-center px-6">
        <div className="max-w-sm">
          <GitFork className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <p className="text-sm text-muted-foreground">
            Chat with the agent to build your flow skeleton →
          </p>
        </div>
      </div>
    );
  }

  let emailCount = 0;

  return (
    <div className="h-full overflow-y-auto py-8 px-6">
      <div className="max-w-3xl mx-auto flex flex-col items-center">
        {nodes.map((node, i) => {
          const isLast = i === nodes.length - 1;
          let card;
          if (node.node_type === "email") {
            const myIndex = emailCount++;
            const email = emails.find((e) => e.sequence_index === myIndex);
            const meta = email?.campaign_id ? campaignMeta[email.campaign_id] : undefined;
            card = (
              <EmailNode
                node={node}
                index={myIndex}
                email={email}
                meta={meta}
                expanded={expandedIndex === myIndex}
                onToggle={() =>
                  onToggleExpand(expandedIndex === myIndex ? null : myIndex)
                }
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
            <div key={i} className="w-full flex flex-col items-center">
              {card}
              {!isLast && <Connector />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex flex-col items-center py-1.5">
      <div className="w-px h-5 bg-border" />
      <div className="text-muted-foreground/50 text-[10px] leading-none">▼</div>
    </div>
  );
}

function StatusBadge({
  isGenerating,
  status,
}: {
  isGenerating: boolean;
  status: string;
}) {
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
    <div className="w-full bg-card border border-border rounded-xl shadow-sm overflow-hidden hover:border-primary/40 transition-colors">
      {/* Compact header — always visible, click to expand */}
      <button
        onClick={onToggle}
        className="w-full text-left p-3.5 flex items-start justify-between gap-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
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

      {/* Expanded content */}
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
                    <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 mr-1.5" />
                    Generate this email
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
                {isGenerating ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                ) : null}
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
    <div className="bg-muted/40 border border-border rounded-lg px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground">
      <Clock className="w-3 h-3" />
      <span className="font-medium">{label}</span>
    </div>
  );
}

function SplitCard({ node }: { node: ParsedFlowNode }) {
  return (
    <div className="w-full bg-card border border-dashed border-border rounded-xl p-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <GitFork className="w-3.5 h-3.5 text-primary" />
        <h4 className="font-semibold text-foreground text-sm">{node.label}</h4>
      </div>
      {node.notes && (
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans">
          {node.notes}
        </pre>
      )}
    </div>
  );
}

function SmsCard({ node }: { node: ParsedFlowNode }) {
  return (
    <div className="w-full bg-card border border-border rounded-xl p-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <MessageSquare className="w-3.5 h-3.5 text-primary" />
        <h4 className="font-semibold text-foreground text-sm">SMS — {node.label}</h4>
      </div>
      {node.notes && <p className="text-xs text-muted-foreground italic">{node.notes}</p>}
    </div>
  );
}
