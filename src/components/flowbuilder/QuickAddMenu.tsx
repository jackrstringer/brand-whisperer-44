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
      style={{ left: position.x, top: position.y }}
      className="fixed z-50 w-60 rounded-xl bg-popover border border-foreground/15 shadow-2xl overflow-hidden"
    >
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search nodes…"
        className="w-full px-3 py-2 bg-transparent border-b border-foreground/10 text-[12.5px] text-foreground placeholder:text-foreground/40 outline-none"
      />
      <div className="max-h-72 overflow-y-auto py-1">
        {(["messages", "logic", "data"] as const).map((cat) =>
          grouped[cat].length > 0 ? (
            <div key={cat}>
              <div className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-[0.1em] text-foreground/40 font-semibold">
                {cat}
              </div>
              {grouped[cat].map(([kind, meta]) => (
                <button
                  key={kind}
                  onClick={() => onSelect(kind)}
                  className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-[12.5px] text-foreground/80 hover:bg-muted/60"
                >
                  <span className="w-5 text-center">{meta.icon}</span>
                  <span>{meta.label}</span>
                </button>
              ))}
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}