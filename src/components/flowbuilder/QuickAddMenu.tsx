import { useEffect, useRef, useState } from "react";
import { FlowNodeKind, NODE_KIND_META } from "./types";

interface QuickAddMenuProps {
  position: { x: number; y: number };
  onSelect: (kind: FlowNodeKind) => void;
  onClose: () => void;
}

export function QuickAddMenu({ position, onSelect, onClose }: QuickAddMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const closeTimer = useRef<number | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => onClose(), 220);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, [onClose]);

  const entries = (Object.entries(NODE_KIND_META) as [FlowNodeKind, typeof NODE_KIND_META[FlowNodeKind]][])
    .filter(([k]) => k !== "trigger")
    .filter(([, m]) => m.label.toLowerCase().includes(search.toLowerCase()));

  const grouped = {
    messages: entries.filter(([, m]) => m.category === "messages"),
    logic: entries.filter(([, m]) => m.category === "logic"),
    data: entries.filter(([, m]) => m.category === "data"),
  };

  return (
    <div
      ref={ref}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      style={{
        left: position.x,
        top: position.y,
        animation: "qa-pop 150ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        transformOrigin: "top left",
      }}
      className="fixed z-50 w-64 rounded-xl bg-popover border border-border shadow-lg overflow-hidden"
    >
      <style>{`@keyframes qa-pop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search nodes…"
        className="w-full px-3 py-2.5 bg-transparent border-b border-border text-[12.5px] text-foreground placeholder:text-muted-foreground outline-none"
      />
      <div className="max-h-72 overflow-y-auto py-1">
        {(["messages", "logic", "data"] as const).map((cat) =>
          grouped[cat].length > 0 ? (
            <div key={cat}>
              <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-[0.1em] text-muted-foreground font-semibold font-mono">
                {cat}
              </div>
              {grouped[cat].map(([kind, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={kind}
                    onClick={() => onSelect(kind)}
                    className="w-full px-3 py-1.5 flex items-center gap-2.5 text-left text-[12.5px] text-foreground/85 hover:bg-muted transition-colors"
                  >
                    <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <Icon className="w-3 h-3 text-foreground/70" />
                    </div>
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
