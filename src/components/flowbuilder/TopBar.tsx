import { ArrowLeft, Undo2, Redo2, BarChart3, Save, MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Input } from "@/components/ui/input";

interface TopBarProps {
  brandId: string;
  flowName: string;
  flowStatus: string;
  flowTypeLabel: string;
  showAnalytics: boolean;
  onToggleAnalytics: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRename: (name: string) => void;
  onStatusChange: (status: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  skeleton_ready: "Skeleton ready",
  manual: "Manual",
  generating: "Generating",
  live: "Live",
  complete: "Complete",
};

const STATUS_COLOR: Record<string, string> = {
  live: "bg-emerald-500/15 text-emerald-400",
  complete: "bg-emerald-500/15 text-emerald-400",
  generating: "bg-blue-500/15 text-blue-400",
  manual: "bg-amber-500/15 text-amber-400",
  skeleton_ready: "bg-foreground/10 text-foreground/70",
  draft: "bg-foreground/10 text-foreground/55",
};

export function TopBar({
  brandId,
  flowName,
  flowStatus,
  flowTypeLabel,
  showAnalytics,
  onToggleAnalytics,
  onUndo,
  onRedo,
  onRename,
  onStatusChange,
}: TopBarProps) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(flowName);
  const [statusOpen, setStatusOpen] = useState(false);

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft !== flowName) onRename(draft.trim());
  };

  return (
    <div
      className="absolute top-0 left-0 right-0 h-14 z-30 flex items-center justify-between px-4 border-b"
      style={{ background: "hsl(var(--flow-card))", borderColor: "hsl(var(--flow-border))" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => navigate(`/brands/${brandId}/flows`)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground/55 hover:bg-foreground/10 hover:text-foreground transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          {editing ? (
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === "Enter" && commit()}
              className="h-7 text-[14px] font-mono font-semibold border-0 bg-transparent px-1 focus-visible:ring-0 w-56"
            />
          ) : (
            <button
              onClick={() => {
                setDraft(flowName);
                setEditing(true);
              }}
              className="text-[14px] font-mono font-semibold text-foreground hover:opacity-70 truncate max-w-[280px]"
            >
              {flowName}
            </button>
          )}
          <span className="text-foreground/25 text-[11px]">·</span>
          <span className="text-[11px] text-foreground/55 truncate">{flowTypeLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleAnalytics}
          className={`px-2.5 h-8 rounded-md text-[12px] font-medium flex items-center gap-1.5 transition-colors ${
            showAnalytics
              ? "bg-[hsl(var(--flow-action))]/15 text-[hsl(var(--flow-action))]"
              : "text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Analytics
        </button>
        <div className="w-px h-5 bg-foreground/10 mx-1" />
        <button
          onClick={onUndo}
          className="w-8 h-8 rounded-md flex items-center justify-center text-foreground/55 hover:bg-foreground/10 hover:text-foreground"
          aria-label="Undo"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onRedo}
          className="w-8 h-8 rounded-md flex items-center justify-center text-foreground/55 hover:bg-foreground/10 hover:text-foreground"
          aria-label="Redo"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-5 bg-foreground/10 mx-1" />
        <div className="relative">
          <button
            onClick={() => setStatusOpen((s) => !s)}
            className={`px-2.5 h-8 rounded-md text-[10px] uppercase tracking-[0.08em] font-semibold ${
              STATUS_COLOR[flowStatus] || STATUS_COLOR.draft
            }`}
          >
            {STATUS_LABEL[flowStatus] || "Draft"}
          </button>
          {statusOpen && (
            <div
              className="absolute right-0 top-9 w-40 rounded-lg border shadow-xl z-40"
              style={{ background: "hsl(var(--flow-card))", borderColor: "hsl(var(--flow-border))" }}
            >
              {["draft", "manual", "live"].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    onStatusChange(s);
                    setStatusOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-[12px] text-foreground/80 hover:bg-foreground/5 first:rounded-t-lg last:rounded-b-lg"
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className="w-8 h-8 rounded-md flex items-center justify-center text-foreground/55 hover:bg-foreground/10"
          aria-label="More"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
