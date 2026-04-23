import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { FlowCanvasNode, FlowNodeData, FlowNodeKind, NODE_KIND_META } from "./types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LeftSidebarProps {
  selectedNode: FlowCanvasNode | null;
  onClearSelection: () => void;
  onUpdateNode: (id: string, patch: Partial<FlowNodeData>) => void;
}

export function LeftSidebar({ selectedNode, onClearSelection, onUpdateNode }: LeftSidebarProps) {
  return (
    <aside className="absolute left-0 top-14 bottom-0 w-[280px] z-20 border-r border-border bg-card overflow-y-auto">
      {selectedNode ? (
        <NodeConfigPanel
          node={selectedNode}
          onBack={onClearSelection}
          onUpdate={(patch) => onUpdateNode(selectedNode.id, patch)}
        />
      ) : (
        <NodePalette />
      )}
    </aside>
  );
}

function NodePalette() {
  const [search, setSearch] = useState("");
  const entries = (Object.entries(NODE_KIND_META) as [FlowNodeKind, typeof NODE_KIND_META[FlowNodeKind]][])
    .filter(([k]) => k !== "trigger")
    .filter(([, m]) => m.label.toLowerCase().includes(search.toLowerCase()));
  const grouped = {
    messages: entries.filter(([, m]) => m.category === "messages"),
    logic: entries.filter(([, m]) => m.category === "logic"),
    data: entries.filter(([, m]) => m.category === "data"),
  };
  const onDragStart = (e: React.DragEvent, kind: FlowNodeKind) => {
    e.dataTransfer.setData("application/flowbuilder-kind", kind);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <div className="p-3">
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-mono font-semibold px-1 pb-2">
        Flow Builder
      </div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search nodes…"
        className="h-8 mb-3 text-[12px]"
      />
      {(["messages", "logic", "data"] as const).map((cat) =>
        grouped[cat].length > 0 ? (
          <div key={cat} className="mb-4">
            <div className="px-1 pb-1.5 text-[9px] uppercase tracking-[0.1em] text-muted-foreground font-mono font-semibold">
              {cat}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {grouped[cat].map(([kind, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={kind}
                    draggable
                    onDragStart={(e) => onDragStart(e, kind)}
                    className="rounded-lg border border-border bg-background p-2.5 text-left transition-all duration-150 hover:border-foreground/30 hover:bg-muted hover:shadow-sm active:scale-[0.98] cursor-grab active:cursor-grabbing"
                  >
                    <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center mb-1.5">
                      <Icon className="w-3.5 h-3.5 text-foreground/70" strokeWidth={2} />
                    </div>
                    <div className="text-[11px] text-foreground/85 font-medium leading-tight">{meta.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}

function NodeConfigPanel({
  node,
  onBack,
  onUpdate,
}: {
  node: FlowCanvasNode;
  onBack: () => void;
  onUpdate: (patch: Partial<FlowNodeData>) => void;
}) {
  const d = node.data;
  const meta = NODE_KIND_META[d.kind];
  const Icon = meta.icon;

  return (
    <div className="p-3">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        <ChevronLeft className="w-3 h-3" /> Back to Nodes
      </button>
      <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
          <Icon className="w-4 h-4 text-foreground/70" strokeWidth={2} />
        </div>
        <div>
          <div className="text-[13px] font-semibold tracking-tight text-foreground">{meta.label}</div>
          <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-mono">{d.kind}</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Label</Label>
          <Input value={d.label} onChange={(e) => onUpdate({ label: e.target.value })} className="h-8 text-[12px]" />
        </div>

        {(d.kind === "email" || d.kind === "sms" || d.kind === "push") && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Subject Direction</Label>
              <Input
                value={d.subject_direction || ""}
                onChange={(e) => onUpdate({ subject_direction: e.target.value })}
                className="h-8 text-[12px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Job</Label>
              <Textarea
                value={d.job || ""}
                onChange={(e) => onUpdate({ job: e.target.value })}
                rows={2}
                className="text-[12px] resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Notes</Label>
              <Textarea
                value={d.notes || ""}
                onChange={(e) => onUpdate({ notes: e.target.value })}
                rows={3}
                className="text-[12px] resize-none"
              />
            </div>
          </>
        )}

        {d.kind === "time_delay" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Wait</Label>
              <Input
                type="number"
                min={0}
                value={d.delay_value ?? 1}
                onChange={(e) => onUpdate({ delay_value: Number(e.target.value) })}
                className="h-8 text-[12px] font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Unit</Label>
              <Select
                value={d.delay_unit || "hours"}
                onValueChange={(v) => onUpdate({ delay_unit: v as FlowNodeData["delay_unit"] })}
              >
                <SelectTrigger className="h-8 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                  <SelectItem value="weeks">Weeks</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {(d.kind === "conditional_split" || d.kind === "trigger_split") && (
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Condition</Label>
            <Textarea
              value={d.condition_summary || ""}
              onChange={(e) => onUpdate({ condition_summary: e.target.value })}
              rows={3}
              placeholder='e.g. "Has Placed Order at least 1 time"'
              className="text-[12px] resize-none"
            />
          </div>
        )}

        {d.kind === "trigger" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Trigger Type</Label>
              <Select
                value={d.trigger_type || "metric"}
                onValueChange={(v) => onUpdate({ trigger_type: v as FlowNodeData["trigger_type"] })}
              >
                <SelectTrigger className="h-8 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="metric">Metric</SelectItem>
                  <SelectItem value="list">List</SelectItem>
                  <SelectItem value="segment">Segment</SelectItem>
                  <SelectItem value="date_property">Date Property</SelectItem>
                  <SelectItem value="price_drop">Price Drop</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Trigger Name</Label>
              <Input
                value={d.trigger_metric_name || ""}
                onChange={(e) => onUpdate({ trigger_metric_name: e.target.value })}
                placeholder="e.g. Placed Order"
                className="h-8 text-[12px]"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
