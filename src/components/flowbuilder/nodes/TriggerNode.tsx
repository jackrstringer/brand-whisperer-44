import { NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";
import { BaseNodeCard } from "./BaseNodeCard";
import { FlowNodeData } from "../types";

export function TriggerNode({ data, selected, id }: NodeProps) {
  const d = data as FlowNodeData;
  return (
    <BaseNodeCard
      icon={Zap}
      title={d.label || "Trigger"}
      status={d.status || "draft"}
      selected={selected}
      noInput
      warning={!d.trigger_metric_name}
      onOpenDetail={() => window.dispatchEvent(new CustomEvent("flowbuilder:open-detail", { detail: { nodeId: id } }))}
    >
      <div className="space-y-1">
        <div className="text-muted-foreground text-[10px] uppercase tracking-[0.08em] font-semibold">Trigger</div>
        <div className="font-medium text-foreground text-[12.5px]">
          {d.trigger_metric_name || "Not configured"}
        </div>
      </div>
    </BaseNodeCard>
  );
}
