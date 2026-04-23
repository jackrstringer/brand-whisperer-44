import { ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";

interface BaseNodeCardProps {
  icon: string;
  title: string;
  status?: "draft" | "manual" | "live";
  selected?: boolean;
  warning?: boolean;
  children?: ReactNode;
  /** Render two output handles for split nodes */
  splitOutputs?: boolean;
  /** Hide the input handle (for trigger nodes) */
  noInput?: boolean;
  /** Hide the output handle */
  noOutput?: boolean;
  width?: number;
  onOpenDetail?: () => void;
}

const statusStyles: Record<string, string> = {
  live: "bg-emerald-500/15 text-emerald-400",
  manual: "bg-amber-500/15 text-amber-400",
  draft: "bg-foreground/10 text-foreground/55",
};

export function BaseNodeCard({
  icon,
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
      className={cn(
        "relative rounded-xl bg-card border transition-all",
        "shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)]",
        selected
          ? "border-[hsl(var(--flow-select))] shadow-[0_8px_24px_-6px_hsl(var(--flow-select)/0.35)]"
          : "border-foreground/15 hover:border-foreground/35",
        warning && "ring-1 ring-[hsl(45_93%_55%/0.4)]"
      )}
    >
      {!noInput && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-2.5 !h-2.5 !bg-foreground/30 !border-2 !border-card"
        />
      )}

      {warning && (
        <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-[hsl(45_93%_55%/0.7)]" />
      )}

      <div
        className="flex items-center justify-between px-3 h-10 border-b border-foreground/10 cursor-pointer"
        onDoubleClick={onOpenDetail}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] leading-none text-foreground/70">{icon}</span>
          <span className="text-[12.5px] font-mono font-semibold tracking-tight text-foreground truncate">
            {title}
          </span>
        </div>
        <span
          className={cn(
            "text-[9px] uppercase tracking-[0.08em] font-semibold px-1.5 py-0.5 rounded",
            statusStyles[status]
          )}
        >
          {status}
        </span>
      </div>

      {children && <div className="p-3 text-[12px] text-foreground/70">{children}</div>}

      {!noOutput && !splitOutputs && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-2.5 !h-2.5 !bg-foreground/30 !border-2 !border-card"
        />
      )}

      {splitOutputs && (
        <>
          <Handle
            id="yes"
            type="source"
            position={Position.Bottom}
            style={{ left: "30%" }}
            className="!w-2.5 !h-2.5 !bg-[hsl(142_71%_45%/0.8)] !border-2 !border-card"
          />
          <Handle
            id="no"
            type="source"
            position={Position.Bottom}
            style={{ left: "70%" }}
            className="!w-2.5 !h-2.5 !bg-[hsl(45_93%_55%/0.8)] !border-2 !border-card"
          />
        </>
      )}
    </div>
  );
}