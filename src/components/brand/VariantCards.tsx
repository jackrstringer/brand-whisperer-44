import { useState } from "react";
import { Check, Eye, MoreHorizontal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VariantData, VariantOption } from "@/lib/types";

interface VariantCardsProps {
  variantData: VariantData;
  onApply: (variant: VariantOption, index: number) => void;
  onPreview?: (variant: VariantOption, index: number) => void;
  onPreviewClear?: () => void;
  onMore?: () => void;
  loadingMore?: boolean;
  disabled: boolean;
}

export default function VariantCards({ variantData, onApply, onPreview, onPreviewClear, onMore, loadingMore, disabled }: VariantCardsProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoveringIndex, setHoveringIndex] = useState<number | null>(null);
  const hasApplied = variantData.applied_index !== null;

  return (
    <div className="space-y-2">
      <p className="text-sm text-foreground">{variantData.message}</p>
      <div
        className="rounded-lg border border-border/40 overflow-hidden divide-y divide-border/30"
        onMouseLeave={() => {
          setHoveringIndex(null);
          onPreviewClear?.();
        }}
      >
        {variantData.variants.map((v, i) => {
          const wasApplied = hasApplied && variantData.applied_index === i;
          const isSelected = selectedIndex === i;
          const isHovering = hoveringIndex === i;
          const interactive = !disabled && !wasApplied;

          return (
            <button
              key={i}
              onClick={() => interactive && setSelectedIndex(i)}
              onMouseEnter={() => {
                if (!interactive) return;
                setHoveringIndex(i);
                onPreview?.(v, i);
              }}
              disabled={!interactive}
              className={`w-full text-left px-3 py-2.5 transition-colors ${
                wasApplied
                  ? "bg-primary/10"
                  : isSelected
                  ? "bg-primary/5"
                  : isHovering
                  ? "bg-primary/5"
                  : "bg-card hover:bg-muted/30"
              } ${interactive ? "cursor-pointer" : "cursor-default"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium text-foreground leading-snug">{v.preview}</p>
                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                  {isHovering && !wasApplied && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Eye className="w-3 h-3" /> Preview
                    </span>
                  )}
                  {wasApplied && (
                    <span className="flex items-center gap-1 text-[10px] text-primary">
                      <Check className="w-3 h-3" /> Applied
                    </span>
                  )}
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground mt-0.5 block">{v.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        {(!hasApplied || (selectedIndex !== null && selectedIndex !== variantData.applied_index)) && (
          <Button
            size="sm"
            disabled={selectedIndex === null || disabled}
            onClick={() => {
              if (selectedIndex !== null) {
                onApply(variantData.variants[selectedIndex], selectedIndex);
              }
            }}
            className="flex-1 mt-1"
          >
            {hasApplied ? "Switch to this option" : "Apply"}
          </Button>
        )}
        {onMore && (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || loadingMore}
            onClick={onMore}
            className="mt-1"
          >
            {loadingMore ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Loading...</>
            ) : (
              <><MoreHorizontal className="w-3 h-3 mr-1" /> More</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
