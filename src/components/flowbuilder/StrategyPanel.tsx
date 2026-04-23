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
    <div className="absolute top-14 left-[280px] right-0 z-20 border-b border-border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 h-10 flex items-center justify-between hover:bg-muted/60 transition-colors"
      >
        <div className="flex items-center gap-3 text-[12px] text-foreground/80">
          <span className="font-semibold tracking-tight text-foreground">{flowTypeLabel}</span>
          <span className="text-border">·</span>
          <span className="font-mono tabular-nums text-muted-foreground">{ordered.length} steps</span>
          <span className="text-border">·</span>
          <span className="font-mono tabular-nums text-muted-foreground">{messageCount} messages</span>
        </div>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-3 max-h-[240px] overflow-y-auto">
          <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-mono font-semibold mb-1.5 mt-1">
            Trigger
          </div>
          <div className="text-[12px] text-foreground/85 mb-3">{triggerLabel}</div>
          <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-mono font-semibold mb-1.5">
            Steps
          </div>
          <div className="space-y-0.5">
            {ordered.map((n, i) => {
              const meta = NODE_KIND_META[n.data.kind];
              const Icon = meta.icon;
              return (
                <button
                  key={n.id}
                  onClick={() => onNavigateNode(n.id)}
                  className="w-full text-left px-2 py-1.5 rounded-md text-[12px] text-foreground/80 hover:bg-muted hover:text-foreground transition-colors flex items-center gap-2"
                >
                  <span className="text-muted-foreground font-mono tabular-nums w-5 text-right text-[11px]">{i + 1}</span>
                  <Icon className="w-3 h-3 text-foreground/60 flex-shrink-0" strokeWidth={2} />
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
