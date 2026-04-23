import { NodeProps } from "@xyflow/react";
import { MessageSquare } from "lucide-react";
import { BaseNodeCard } from "./BaseNodeCard";
import { FlowNodeData } from "../types";

export function SmsNode({ data, selected, id }: NodeProps) {
  const d = data as FlowNodeData;
  return (
    <BaseNodeCard
      icon={MessageSquare}
      title={d.label || "SMS"}
      status={d.status || "draft"}
      selected={selected}
      onOpenDetail={() => window.dispatchEvent(new CustomEvent("flowbuilder:open-detail", { detail: { nodeId: id } }))}
    >
      <div className="text-muted-foreground line-clamp-3">
        {d.notes || "No message body yet."}
      </div>
    </BaseNodeCard>
  );
}
