import { useState } from "react";
import { EdgeProps, getSmoothStepPath, EdgeLabelRenderer, BaseEdge } from "@xyflow/react";
import { Plus } from "lucide-react";

export function InsertableEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, sourceHandleId } = props;
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

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: hover ? "hsl(var(--flow-action))" : "hsl(var(--flow-edge))",
          strokeWidth: hover ? 2.5 : 1.75,
          transition: "stroke 150ms, stroke-width 150ms",
        }}
      />
      {/* Invisible wide hit area for hover */}
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
            className="text-[9px] font-semibold tracking-[0.1em] px-1.5 py-0.5 rounded bg-card border border-foreground/20 text-foreground/70"
          >
            {branchLabel}
          </div>
        )}
        {hover && (
          <button
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onClick={(e) => {
              e.stopPropagation();
              const ev = new CustomEvent("flowbuilder:insert-on-edge", {
                detail: { edgeId: id, x: labelX, y: labelY },
              });
              window.dispatchEvent(ev);
            }}
            className="w-6 h-6 rounded-full bg-[hsl(var(--flow-action))] text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </EdgeLabelRenderer>
    </>
  );
}