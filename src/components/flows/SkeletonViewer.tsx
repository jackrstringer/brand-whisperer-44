import { ParsedFlowNode } from "@/lib/flows/skeletonParser";
import { Mail, Clock, GitFork, MessageSquare, Loader2, Check, X, Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface FlowEmailRow {
  id: string;
  sequence_index: number;
  label: string | null;
  generation_status: string;
  html: string | null;
  campaign_id: string | null;
}

interface Props {
  nodes: ParsedFlowNode[];
  emails: FlowEmailRow[]; // matched by sequence_index for email-type nodes
  onGenerateNode: (emailIndex: number) => void;
  onEditNode: (emailIndex: number) => void;
  onPreviewNode: (emailIndex: number) => void;
  generatingIndex: number | null;
}

export function SkeletonViewer({
  nodes,
  emails,
  onGenerateNode,
  onEditNode,
  onPreviewNode,
  generatingIndex,
}: Props) {
  if (nodes.length === 0) {
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

  // Map: count emails encountered so we can index into `emails`
  let emailCount = 0;

  return (
    <div className="h-full overflow-y-auto py-8 px-6">
      <div className="max-w-xl mx-auto flex flex-col items-center">
        {nodes.map((node, i) => {
          const isLast = i === nodes.length - 1;
          let card;
          if (node.node_type === "email") {
            const myIndex = emailCount++;
            const email = emails.find((e) => e.sequence_index === myIndex);
            card = (
              <EmailCard
                node={node}
                index={myIndex}
                generationStatus={email?.generation_status || "pending"}
                isGenerating={generatingIndex === myIndex}
                onGenerate={() => onGenerateNode(myIndex)}
                onEdit={() => onEditNode(myIndex)}
                onPreview={() => onPreviewNode(myIndex)}
                hasHtml={!!email?.html}
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
    <div className="flex flex-col items-center py-2">
      <div className="w-px h-6 bg-border" />
      <div className="text-muted-foreground/60 text-xs leading-none">▼</div>
    </div>
  );
}

function EmailCard({
  node,
  index,
  generationStatus,
  isGenerating,
  onGenerate,
  onEdit,
  onPreview,
  hasHtml,
}: {
  node: ParsedFlowNode;
  index: number;
  generationStatus: string;
  isGenerating: boolean;
  onGenerate: () => void;
  onEdit: () => void;
  onPreview: () => void;
  hasHtml: boolean;
}) {
  const statusBadge = (() => {
    if (isGenerating || generationStatus === "generating")
      return (
        <span className="text-xs flex items-center gap-1 text-amber-700 dark:text-amber-300">
          <Loader2 className="w-3 h-3 animate-spin" /> Generating
        </span>
      );
    if (generationStatus === "complete")
      return (
        <span className="text-xs flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
          <Check className="w-3 h-3" /> Complete
        </span>
      );
    if (generationStatus === "failed")
      return (
        <span className="text-xs flex items-center gap-1 text-destructive">
          <X className="w-3 h-3" /> Failed
        </span>
      );
    return <span className="text-xs text-muted-foreground">Pending</span>;
  })();

  return (
    <div className="w-full bg-card border border-border rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Mail className="w-4 h-4 text-primary flex-shrink-0" />
          <h4 className="font-semibold text-foreground text-sm truncate">
            Email {index + 1} — {node.label}
          </h4>
        </div>
        {statusBadge}
      </div>

      <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
        {node.timing && (
          <div>
            <span className="font-medium text-foreground/70">Timing:</span> {node.timing}
          </div>
        )}
        {node.job && (
          <div>
            <span className="font-medium text-foreground/70">Job:</span> {node.job}
          </div>
        )}
        {node.subject_direction && (
          <div>
            <span className="font-medium text-foreground/70">Subject:</span>{" "}
            {node.subject_direction}
          </div>
        )}
      </div>

      {node.sections && node.sections.length > 0 && (
        <div className="border-t border-border pt-2.5 mb-3">
          <div className="text-xs font-medium text-foreground/70 mb-1.5">Sections</div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {node.sections.map((s, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-primary/60">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {node.notes && (
        <div className="text-xs text-muted-foreground italic mb-3">{node.notes}</div>
      )}

      <div className="flex gap-2 border-t border-border pt-3">
        <Button size="sm" variant="ghost" onClick={onEdit} className="text-xs h-7">
          <Pencil className="w-3 h-3 mr-1" /> Edit Brief
        </Button>
        {hasHtml ? (
          <>
            <Button size="sm" variant="outline" onClick={onPreview} className="text-xs h-7">
              <Eye className="w-3 h-3 mr-1" /> View
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onGenerate}
              disabled={isGenerating}
              className="text-xs h-7 ml-auto"
            >
              Regenerate
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={onGenerate}
            disabled={isGenerating}
            className="text-xs h-7 ml-auto"
          >
            {isGenerating ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : null}
            Generate Email →
          </Button>
        )}
      </div>
    </div>
  );
}

function DelayCard({ label }: { label: string }) {
  return (
    <div className="bg-muted/40 border border-border rounded-lg px-4 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
      <Clock className="w-3.5 h-3.5" />
      <span>{label}</span>
    </div>
  );
}

function SplitCard({ node }: { node: ParsedFlowNode }) {
  return (
    <div className="w-full bg-card border border-dashed border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <GitFork className="w-4 h-4 text-primary" />
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
    <div className="w-full bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        <h4 className="font-semibold text-foreground text-sm">SMS — {node.label}</h4>
      </div>
      {node.notes && <p className="text-xs text-muted-foreground italic">{node.notes}</p>}
    </div>
  );
}
