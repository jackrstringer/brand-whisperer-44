import { NodeProps } from "@xyflow/react";
import { BaseNodeCard } from "./BaseNodeCard";
import { FlowNodeData } from "../types";

export function TriggerNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  return (
    <BaseNodeCard
      icon="⚡"
      title={d.label || "Trigger"}
      status={d.status || "draft"}
      selected={selected}
      noInput
      warning={!d.trigger_metric_name}
    >
      <div className="space-y-1.5">
        <div className="text-foreground/55 text-[11px] uppercase tracking-wider">Trigger</div>
        <div className="font-medium text-foreground">
          {d.trigger_metric_name || "Not configured"}
        </div>
      </div>
    </BaseNodeCard>
  );
}