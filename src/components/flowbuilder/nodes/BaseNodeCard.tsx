import { ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface BaseNodeCardProps {
  icon: LucideIcon;
  title: string;
  status?: "draft" | "manual" | "live";
  selected?: boolean;
  warning?: boolean;
  children?: ReactNode;
  splitOutputs?: boolean;
  noInput?: boolean;
  noOutput?: boolean;
  width?: number;
  onOpenDetail?: () => void;
}

const statusStyles: Record<string, string> = {
  live: "bg-foreground text-background",
  manual: "bg-muted text-foreground",
  draft: "border border-border text-muted-foreground bg-transparent",
};

export function BaseNodeCard({
  icon: Icon,
  title,
  status = "draft",
  selected,
  warning,
  children,
  splitOutputs,
  noInput,
  noOutput,
  width = 280,
  onOpenDetail,
}: BaseNodeCardProps) {
  return (
    <div
      style={{ width }}
      onClick={onOpenDetail}
      className={cn(
        "group relative rounded-xl bg-card border transition-all duration-200",
        "shadow-sm cursor-pointer",
        selected
          ? "border-foreground shadow-lg scale-[1.01] ring-1 ring-foreground/10"
          : "border-border hover:border-foreground/30 hover:shadow-md hover:-translate-y-px",
        warning && "ring-1 ring-amber-500/40"
      )}
    >
      {!noInput && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2 !h-2 !bg-muted-foreground/50 !border-2 !border-card"
        />
      )}

      {warning && (
        <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-amber-500/70" />
      )}

      <div
        className="flex items-center justify-between gap-2 px-3 h-11 border-b border-border/60 cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <Icon className="w-3.5 h-3.5 text-foreground/70" strokeWidth={2} />
          </div>
          <span className="text-[13px] font-semibold tracking-tight text-foreground truncate">
            {title}
          </span>
        </div>
        <span
          className={cn(
            "text-[9px] uppercase tracking-[0.08em] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap",
            statusStyles[status]
          )}
        >
          {status}
        </span>
      </div>

      {children && <div className="px-3 py-2.5 text-[12px] text-muted-foreground">{children}</div>}

      {!noOutput && !splitOutputs && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-2 !h-2 !bg-muted-foreground/50 !border-2 !border-card"
        />
      )}

      {splitOutputs && (
        <>
          <Handle
            id="yes"
            type="source"
            position={Position.Bottom}
            style={{ left: "30%" }}
            className="!w-2 !h-2 !bg-foreground/60 !border-2 !border-card"
          />
          <Handle
            id="no"
            type="source"
            position={Position.Bottom}
            style={{ left: "70%" }}
            className="!w-2 !h-2 !bg-foreground/60 !border-2 !border-card"
          />
        </>
      )}
    </div>
  );
}
