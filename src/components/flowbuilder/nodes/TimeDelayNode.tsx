import { NodeProps } from "@xyflow/react";
import { Clock } from "lucide-react";
import { BaseNodeCard } from "./BaseNodeCard";
import { FlowNodeData } from "../types";

export function TimeDelayNode({ data, selected, id }: NodeProps) {
  const d = data as FlowNodeData;
  const value = d.delay_value ?? 0;
  const unit = d.delay_unit || "hours";
  return (
    <BaseNodeCard
      icon={Clock}
      title="Time Delay"
      status={d.status || "draft"}
      selected={selected}
      width={240}
      onOpenDetail={() => window.dispatchEvent(new CustomEvent("flowbuilder:open-detail", { detail: { nodeId: id } }))}
    >
      {value > 0 ? (
        <div className="flex items-baseline gap-1.5">
          <span className="text-muted-foreground text-[10px] uppercase tracking-[0.08em] font-semibold">Wait</span>
          <span className="font-mono tabular-nums text-foreground text-[14px] font-semibold">{value}</span>
          <span className="text-foreground text-[12px]">{unit}</span>
        </div>
      ) : (
        <div className="text-muted-foreground italic">Not configured</div>
      )}
    </BaseNodeCard>
  );
}
