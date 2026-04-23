import type { Node, Edge } from "@xyflow/react";

export type FlowNodeKind =
  | "trigger"
  | "time_delay"
  | "email"
  | "sms"
  | "push"
  | "conditional_split"
  | "trigger_split"
  | "update_property"
  | "list_update"
  | "webhook"
  | "internal_alert"
  | "custom_action";

export interface FlowNodeData {
  kind: FlowNodeKind;
  label: string;
  // Email/SMS/Push fields
  subject_direction?: string;
  job?: string;
  notes?: string;
  sections?: string[];
  html?: string | null;
  campaign_id?: string | null;
  generation_status?: "pending" | "generating" | "complete" | "failed" | "n_a";
  // Delay
  delay_value?: number;
  delay_unit?: "minutes" | "hours" | "days" | "weeks";
  // Splits
  condition_summary?: string;
  // Trigger
  trigger_type?: "metric" | "list" | "segment" | "date_property" | "price_drop";
  trigger_metric_name?: string;
  // Generic config
  node_config?: Record<string, unknown>;
  // DB linkage
  flow_email_id?: string;
  // Status pill
  status?: "draft" | "manual" | "live";
  [key: string]: unknown;
}

export type FlowCanvasNode = Node<FlowNodeData>;
export type FlowCanvasEdge = Edge & { sourceHandle?: string | null; label?: string };

export interface CanvasState {
  nodes: FlowCanvasNode[];
  edges: FlowCanvasEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export const NODE_KIND_META: Record<
  FlowNodeKind,
  { label: string; category: "messages" | "logic" | "data"; icon: string }
> = {
  trigger: { label: "Trigger", category: "logic", icon: "⚡" },
  time_delay: { label: "Time Delay", category: "logic", icon: "⏱" },
  email: { label: "Email", category: "messages", icon: "✉" },
  sms: { label: "SMS", category: "messages", icon: "💬" },
  push: { label: "Push", category: "messages", icon: "🔔" },
  conditional_split: { label: "Conditional Split", category: "logic", icon: "◆" },
  trigger_split: { label: "Trigger Split", category: "logic", icon: "⚡" },
  update_property: { label: "Update Property", category: "data", icon: "📝" },
  list_update: { label: "List Update", category: "data", icon: "📋" },
  webhook: { label: "Webhook", category: "data", icon: "🔗" },
  internal_alert: { label: "Internal Alert", category: "data", icon: "🔔" },
  custom_action: { label: "Custom Action", category: "data", icon: "⚙️" },
};