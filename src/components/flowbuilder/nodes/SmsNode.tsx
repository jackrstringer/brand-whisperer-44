import { NodeProps } from "@xyflow/react";
import { BaseNodeCard } from "./BaseNodeCard";
import { FlowNodeData } from "../types";

export function SmsNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  return (
    <BaseNodeCard icon="💬" title={d.label || "SMS"} status={d.status || "draft"} selected={selected}>
      <div className="text-foreground/70 text-[12px] line-clamp-3">
        {d.notes || "No message body yet."}
      </div>
    </BaseNodeCard>
  );
}