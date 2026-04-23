import { NodeProps } from "@xyflow/react";
import { BaseNodeCard } from "./BaseNodeCard";
import { FlowNodeData, NODE_KIND_META } from "../types";
import { Settings2 } from "lucide-react";

export function SimpleNode({ data, selected, id }: NodeProps) {
  const d = data as FlowNodeData;
  const meta = NODE_KIND_META[d.kind];
  const Icon = meta?.icon || Settings2;
  return (
    <BaseNodeCard
      icon={Icon}
      title={d.label || meta?.label || d.kind}
      status={d.status || "draft"}
      selected={selected}
      width={240}
      onOpenDetail={() => window.dispatchEvent(new CustomEvent("flowbuilder:open-detail", { detail: { nodeId: id } }))}
    >
      <div className="text-muted-foreground line-clamp-2">
        {d.notes || "Not configured"}
      </div>
    </BaseNodeCard>
  );
}
