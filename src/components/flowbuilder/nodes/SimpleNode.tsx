import { NodeProps } from "@xyflow/react";
import { BaseNodeCard } from "./BaseNodeCard";
import { FlowNodeData, NODE_KIND_META } from "../types";

export function SimpleNode({ data, selected }: NodeProps) {
  const d = data as FlowNodeData;
  const meta = NODE_KIND_META[d.kind] || { icon: "•", label: d.kind };
  return (
    <BaseNodeCard
      icon={meta.icon}
      title={d.label || meta.label}
      status={d.status || "draft"}
      selected={selected}
      width={240}
    >
      <div className="text-foreground/65 text-[12px] line-clamp-2">
        {d.notes || "Not configured"}
      </div>
    </BaseNodeCard>
  );
}