import { NodeProps } from "@xyflow/react";
import { Loader2, Sparkles, Mail } from "lucide-react";
import { BaseNodeCard } from "./BaseNodeCard";
import { FlowNodeData } from "../types";

export function EmailNode({ data, selected, id }: NodeProps) {
  const d = data as FlowNodeData;
  const generating = d.generation_status === "generating";
  const failed = d.generation_status === "failed";
  const ready = !!d.html;

  return (
    <BaseNodeCard
      icon={Mail}
      title={d.label || "Email"}
      status={d.status || "draft"}
      selected={selected}
      warning={failed}
      onOpenDetail={() => {
        const ev = new CustomEvent("flowbuilder:open-detail", { detail: { nodeId: id } });
        window.dispatchEvent(ev);
      }}
    >
      <div className="flex gap-3">
        <div className="w-[60px] h-[80px] rounded-md bg-muted border border-border overflow-hidden flex-shrink-0 flex items-center justify-center">
          {ready ? (
            <div
              className="w-[200px] h-[266px] origin-top-left scale-[0.3] pointer-events-none"
              dangerouslySetInnerHTML={{ __html: d.html || "" }}
            />
          ) : generating ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : (
            <Sparkles className="w-4 h-4 text-muted-foreground/60" />
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-muted-foreground text-[10px] uppercase tracking-[0.08em] font-semibold">Subject</div>
          <div className="text-foreground font-medium text-[12px] truncate">
            {d.subject_direction || "Not set"}
          </div>
          <div className="text-muted-foreground text-[11px] line-clamp-2 leading-snug">
            {d.job || d.notes || "—"}
          </div>
        </div>
      </div>
    </BaseNodeCard>
  );
}
