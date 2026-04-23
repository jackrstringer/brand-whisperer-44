import { NodeProps } from "@xyflow/react";
import { BaseNodeCard } from "./BaseNodeCard";
import { FlowNodeData } from "../types";

export function ConditionalSplitNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  return (
    <BaseNodeCard
      icon="◆"
      title={d.label || "Conditional Split"}
      status={d.status || "draft"}
      selected={selected}
      splitOutputs
    >
      <div className="space-y-2">
        <div className="text-foreground/55 text-[11px] uppercase tracking-wider">If</div>
        <div className="text-foreground/85 font-medium text-[12px]">
          {d.condition_summary || "No condition set"}
        </div>
        <div className="flex justify-between text-[10px] uppercase tracking-wider pt-1">
          <span className="text-[hsl(142_71%_45%)]">YES</span>
          <span className="text-[hsl(45_93%_55%)]">NO</span>
        </div>
      </div>
    </BaseNodeCard>
  );
}