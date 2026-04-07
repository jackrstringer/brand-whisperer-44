import { useState } from "react";
import { Check, MoreHorizontal, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VariantData, VariantOption } from "@/lib/types";

/** Detect if a variant's replace value looks like an image URL */
function isImageVariant(variant: VariantOption): boolean {
  const v = variant.replace?.trim() || "";
  if (/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg|avif)/i.test(v)) return true;
  if (/^<img\b/i.test(v)) return true;
  if (/src=["']https?:\/\//i.test(v)) return true;
  return false;
}

/** Extract image URL from variant replace value */
function extractImageUrl(variant: VariantOption): string | null {
  const v = variant.replace?.trim() || "";
  if (/^https?:\/\/.+/i.test(v) && !/^</.test(v)) return v;
  const srcMatch = v.match(/src=["'](https?:\/\/[^"']+)["']/i);
  if (srcMatch) return srcMatch[1];
  return null;
}

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

  const isImageMode = variantData.variants.length > 0 && variantData.variants.every(v => isImageVariant(v));

  if (isImageMode) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-foreground">{variantData.message}</p>
        <div
          className="grid grid-cols-2 gap-2"
          onMouseLeave={() => {
            setHoveringIndex(null);
            onPreviewClear?.();
          }}
        >
          {variantData.variants.map((v, i) => {
            const wasApplied = hasApplied && variantData.applied_index === i;
            const isSelected = selectedIndex === i;
            const imageUrl = extractImageUrl(v);
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
                className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                  wasApplied
                    ? "border-primary ring-2 ring-primary/20"
                    : isSelected
                    ? "border-primary/60"
                    : hoveringIndex === i
                    ? "border-primary/40"
                    : "border-border/40 hover:border-border/60"
                } ${interactive ? "cursor-pointer" : "cursor-default"}`}
                style={{ aspectRatio: "1" }}
              >
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt={v.label}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
                {wasApplied && (
                  <div className="absolute top-1.5 right-1.5 bg-primary text-primary-foreground rounded-full p-0.5">
                    <Check className="w-3 h-3" />
                  </div>
                )}
                {isSelected && !wasApplied && (
                  <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                    <div className="bg-primary/90 text-primary-foreground rounded-full p-1">
                      <Check className="w-4 h-4" />
                    </div>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                  <span className="text-[10px] text-white font-medium leading-tight line-clamp-1">{v.label}</span>
                </div>
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
              {hasApplied ? "Switch to this image" : "Apply"}
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
