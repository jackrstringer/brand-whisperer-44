import { useState } from "react";
import { EdgeProps, getSmoothStepPath, EdgeLabelRenderer, BaseEdge } from "@xyflow/react";
import { Plus } from "lucide-react";

export function InsertableEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, sourceHandleId, selected } = props;
  const [hover, setHover] = useState(false);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  const branchLabel =
    sourceHandleId === "yes" ? "YES" : sourceHandleId === "no" ? "NO" : null;

  const stroke = selected
    ? "hsl(var(--foreground))"
    : hover
    ? "hsl(var(--foreground))"
    : "hsl(var(--border))";
  const strokeWidth = selected ? 2.5 : hover ? 2 : 1.5;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke,
          strokeWidth,
          transition: "stroke 150ms, stroke-width 150ms",
        }}
      />
      {/* Invisible wide hit area */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ pointerEvents: "stroke" }}
      />
      <EdgeLabelRenderer>
        {branchLabel && (
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${(sourceX + labelX) / 2}px, ${
                (sourceY + labelY) / 2
              }px)`,
              pointerEvents: "none",
            }}
            className="text-[9px] font-mono font-semibold tracking-[0.1em] px-1.5 py-0.5 rounded bg-card border border-border text-muted-foreground"
          >
            {branchLabel}
          </div>
        )}
        <button
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: hover ? "all" : "none",
            opacity: hover ? 1 : 0,
            transition: "opacity 120ms ease, transform 150ms ease",
          }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onClick={(e) => {
            e.stopPropagation();
            const ev = new CustomEvent("flowbuilder:insert-on-edge", {
              detail: { edgeId: id, x: labelX, y: labelY },
            });
            window.dispatchEvent(ev);
          }}
          className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center shadow-md hover:scale-[1.08] transition-transform"
          aria-label="Insert node"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
