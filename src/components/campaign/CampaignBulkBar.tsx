import { Trash2, Copy, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CampaignBulkBarProps {
  count: number;
  onDelete: () => void;
  onClone: () => void;
  onClearSelection: () => void;
}

export function CampaignBulkBar({ count, onDelete, onClone, onClearSelection }: CampaignBulkBarProps) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card border border-border rounded-xl px-5 py-3 shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-200">
      <span className="text-sm font-medium text-foreground mr-1">
        {count} selected
      </span>
      <div className="h-5 w-px bg-border" />
      <Button variant="ghost" size="sm" onClick={onClone} className="gap-1.5 text-muted-foreground hover:text-foreground">
        <Copy className="w-3.5 h-3.5" /> Clone
      </Button>
      <Button variant="ghost" size="sm" onClick={onDelete} className="gap-1.5 text-muted-foreground hover:text-destructive">
        <Trash2 className="w-3.5 h-3.5" /> Delete
      </Button>
      <div className="h-5 w-px bg-border" />
      <button onClick={onClearSelection} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
        Clear
      </button>
    </div>
  );
}
