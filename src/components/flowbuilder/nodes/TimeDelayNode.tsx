import { NodeProps } from "@xyflow/react";
import { BaseNodeCard } from "./BaseNodeCard";
import { FlowNodeData } from "../types";

export function TimeDelayNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const value = d.delay_value ?? 0;
  const unit = d.delay_unit || "hours";
  const display = value > 0 ? `Wait ${value} ${unit}` : d.label || "Delay";
  return (
    <BaseNodeCard
      icon="⏱"
      title="Time Delay"
      status={d.status || "draft"}
      selected={selected}
      width={240}
    >
      <div className="font-medium text-foreground">{display}</div>
    </BaseNodeCard>
  );
}