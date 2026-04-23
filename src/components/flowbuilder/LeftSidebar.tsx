import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { FlowCanvasNode, FlowNodeData, FlowNodeKind, NODE_KIND_META } from "./types";

interface LeftSidebarProps {
  selectedNode: FlowCanvasNode | null;
  onClearSelection: () => void;
  onUpdateNode: (id: string, patch: Partial<FlowNodeData>) => void;
}

export function LeftSidebar({ selectedNode, onClearSelection, onUpdateNode }: LeftSidebarProps) {
  return (
    <aside
      className="absolute left-0 top-14 bottom-0 w-[280px] z-20 border-r overflow-y-auto"
      style={{ background: "hsl(var(--flow-card))", borderColor: "hsl(var(--flow-border))" }}
    >
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
      <div className="text-[10px] uppercase tracking-[0.1em] text-foreground/40 font-semibold px-1 pb-2">
        Flow Builder
      </div>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search nodes…"
        className="w-full px-2.5 py-1.5 mb-3 rounded-md bg-foreground/5 text-[12px] text-foreground placeholder:text-foreground/40 outline-none border border-foreground/10 focus:border-foreground/25"
      />
      {(["messages", "logic", "data"] as const).map((cat) =>
        grouped[cat].length > 0 ? (
          <div key={cat} className="mb-4">
            <div className="px-1 pb-1.5 text-[9px] uppercase tracking-[0.1em] text-foreground/40 font-semibold">
              {cat}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {grouped[cat].map(([kind, meta]) => (
                <button
                  key={kind}
                  draggable
                  onDragStart={(e) => onDragStart(e, kind)}
                  className="rounded-md border p-2 text-left hover:border-foreground/35 transition-colors cursor-grab active:cursor-grabbing"
                  style={{ borderColor: "hsl(var(--flow-border))", background: "hsl(var(--flow-canvas))" }}
                >
                  <div className="text-[14px] mb-0.5">{meta.icon}</div>
                  <div className="text-[11px] text-foreground/70 leading-tight">{meta.label}</div>
                </button>
              ))}
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

  return (
    <div className="p-3">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-[11px] text-foreground/55 hover:text-foreground mb-3"
      >
        <ChevronLeft className="w-3 h-3" /> Back to Nodes
      </button>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[16px]">{meta.icon}</span>
        <span className="text-[13px] font-mono font-semibold text-foreground">{meta.label}</span>
      </div>

      <Field label="Label">
        <input
          value={d.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="cfg-input"
        />
      </Field>

      {(d.kind === "email" || d.kind === "sms" || d.kind === "push") && (
        <>
          <Field label="Subject Direction">
            <input
              value={d.subject_direction || ""}
              onChange={(e) => onUpdate({ subject_direction: e.target.value })}
              className="cfg-input"
            />
          </Field>
          <Field label="Job">
            <textarea
              value={d.job || ""}
              onChange={(e) => onUpdate({ job: e.target.value })}
              rows={2}
              className="cfg-input resize-none"
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={d.notes || ""}
              onChange={(e) => onUpdate({ notes: e.target.value })}
              rows={3}
              className="cfg-input resize-none"
            />
          </Field>
        </>
      )}

      {d.kind === "time_delay" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Wait">
            <input
              type="number"
              min={0}
              value={d.delay_value ?? 1}
              onChange={(e) => onUpdate({ delay_value: Number(e.target.value) })}
              className="cfg-input"
            />
          </Field>
          <Field label="Unit">
            <select
              value={d.delay_unit || "hours"}
              onChange={(e) => onUpdate({ delay_unit: e.target.value as any })}
              className="cfg-input"
            >
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
            </select>
          </Field>
        </div>
      )}

      {(d.kind === "conditional_split" || d.kind === "trigger_split") && (
        <Field label="Condition">
          <textarea
            value={d.condition_summary || ""}
            onChange={(e) => onUpdate({ condition_summary: e.target.value })}
            rows={3}
            placeholder='e.g. "Has Placed Order at least 1 time"'
            className="cfg-input resize-none"
          />
        </Field>
      )}

      {d.kind === "trigger" && (
        <>
          <Field label="Trigger Type">
            <select
              value={d.trigger_type || "metric"}
              onChange={(e) => onUpdate({ trigger_type: e.target.value as any })}
              className="cfg-input"
            >
              <option value="metric">Metric</option>
              <option value="list">List</option>
              <option value="segment">Segment</option>
              <option value="date_property">Date Property</option>
              <option value="price_drop">Price Drop</option>
            </select>
          </Field>
          <Field label="Trigger Name">
            <input
              value={d.trigger_metric_name || ""}
              onChange={(e) => onUpdate({ trigger_metric_name: e.target.value })}
              placeholder="e.g. Placed Order"
              className="cfg-input"
            />
          </Field>
        </>
      )}

      <style>{`
        .cfg-input {
          width: 100%;
          padding: 6px 8px;
          background: hsl(var(--flow-canvas));
          border: 1px solid hsl(var(--flow-border));
          border-radius: 6px;
          color: hsl(var(--foreground));
          font-size: 12px;
          outline: none;
        }
        .cfg-input:focus { border-color: hsl(var(--flow-action)); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] uppercase tracking-[0.08em] text-foreground/45 font-semibold mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}
