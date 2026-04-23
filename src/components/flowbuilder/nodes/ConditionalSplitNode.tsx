import { NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import { BaseNodeCard } from "./BaseNodeCard";
import { FlowNodeData } from "../types";

export function ConditionalSplitNode({ data, selected, id }: NodeProps) {
  const d = data as FlowNodeData;
  return (
    <BaseNodeCard
      icon={GitBranch}
      title={d.label || "Conditional Split"}
      status={d.status || "draft"}
      selected={selected}
      splitOutputs
      onOpenDetail={() => window.dispatchEvent(new CustomEvent("flowbuilder:open-detail", { detail: { nodeId: id } }))}
    >
      <div className="space-y-2">
        <div className="text-muted-foreground text-[10px] uppercase tracking-[0.08em] font-semibold">If</div>
        <div className="text-foreground font-medium text-[12px] leading-snug">
          {d.condition_summary || "No condition set"}
        </div>
        <div className="flex justify-between text-[10px] uppercase tracking-[0.08em] font-mono pt-1 text-muted-foreground">
          <span>YES</span>
          <span>NO</span>
        </div>
      </div>
    </BaseNodeCard>
  );
}
