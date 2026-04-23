import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { FlowCanvasNode, NODE_KIND_META } from "./types";

interface StrategyPanelProps {
  nodes: FlowCanvasNode[];
  flowTypeLabel: string;
  triggerLabel: string;
  onNavigateNode: (id: string) => void;
}

export function StrategyPanel({ nodes, flowTypeLabel, triggerLabel, onNavigateNode }: StrategyPanelProps) {
  const [open, setOpen] = useState(false);
  const ordered = [...nodes].sort((a, b) => a.position.y - b.position.y);
  const messageCount = ordered.filter((n) => n.data.kind === "email" || n.data.kind === "sms" || n.data.kind === "push").length;

  return (
    <div
      className="absolute top-14 left-[280px] right-0 z-20 border-b"
      style={{ background: "hsl(var(--flow-card))", borderColor: "hsl(var(--flow-border))" }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 h-10 flex items-center justify-between hover:bg-foreground/5 transition-colors"
      >
        <div className="flex items-center gap-3 text-[12px] text-foreground/75">
          <span className="font-mono font-semibold text-foreground">{flowTypeLabel}</span>
          <span className="text-foreground/25">·</span>
          <span>{ordered.length} steps</span>
          <span className="text-foreground/25">·</span>
          <span>{messageCount} messages</span>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-foreground/45" /> : <ChevronDown className="w-3.5 h-3.5 text-foreground/45" />}
      </button>
      {open && (
        <div className="px-4 pb-3 max-h-[200px] overflow-y-auto">
          <div className="text-[10px] uppercase tracking-[0.08em] text-foreground/45 font-semibold mb-2">
            Trigger
          </div>
          <div className="text-[12px] text-foreground/80 mb-3">{triggerLabel}</div>
          <div className="text-[10px] uppercase tracking-[0.08em] text-foreground/45 font-semibold mb-2">
            Steps
          </div>
          <div className="space-y-0.5">
            {ordered.map((n, i) => {
              const meta = NODE_KIND_META[n.data.kind];
              return (
                <button
                  key={n.id}
                  onClick={() => onNavigateNode(n.id)}
                  className="w-full text-left px-2 py-1 rounded text-[12px] text-foreground/75 hover:bg-foreground/5 hover:text-foreground flex items-center gap-2"
                >
                  <span className="text-foreground/40 font-mono w-5 text-right">{i + 1}.</span>
                  <span>{meta.icon}</span>
                  <span className="truncate">{n.data.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
