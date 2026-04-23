import { ArrowLeft, Undo2, Redo2, BarChart3, MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

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

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "manual", label: "Manual" },
  { value: "live", label: "Live" },
];

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

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft !== flowName) onRename(draft.trim());
  };

  const normalizedStatus = STATUS_OPTIONS.some((s) => s.value === flowStatus)
    ? flowStatus
    : "draft";

  return (
    <div className="absolute top-0 left-0 right-0 h-14 z-30 flex items-center justify-between px-4 border-b border-border bg-card">
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/brands/${brandId}/flows`)}
          aria-label="Back"
          className="h-8 w-8"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          {editing ? (
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === "Enter" && commit()}
              className="h-8 text-[14px] font-semibold tracking-tight w-64"
            />
          ) : (
            <button
              onClick={() => {
                setDraft(flowName);
                setEditing(true);
              }}
              className="text-[14px] font-semibold tracking-tight text-foreground hover:text-foreground/70 transition-colors truncate max-w-[280px]"
            >
              {flowName}
            </button>
          )}
          <span className="text-border">·</span>
          <span className="text-[12px] text-muted-foreground truncate">{flowTypeLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant={showAnalytics ? "secondary" : "ghost"}
          size="sm"
          onClick={onToggleAnalytics}
          className="h-8 gap-1.5 text-[12px]"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Analytics
        </Button>
        <div className="w-px h-5 bg-border mx-1.5" />
        <Button variant="ghost" size="icon" onClick={onUndo} aria-label="Undo" className="h-8 w-8">
          <Undo2 className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onRedo} aria-label="Redo" className="h-8 w-8">
          <Redo2 className="w-3.5 h-3.5" />
        </Button>
        <div className="w-px h-5 bg-border mx-1.5" />
        <Select value={normalizedStatus} onValueChange={onStatusChange}>
          <SelectTrigger
            className={cn(
              "h-8 w-[110px] text-[10px] uppercase tracking-[0.08em] font-semibold",
              normalizedStatus === "live" && "bg-foreground text-background border-foreground hover:bg-foreground/90"
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-[12px]">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" aria-label="More" className="h-8 w-8">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
