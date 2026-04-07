import { useState } from "react";
import { Check, MoreHorizontal, Loader2 } from "lucide-react";
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
            const interactive = !disabled && !wasApplied;
            const imageUrl = extractImageUrl(v);

            return (
              <button
                key={i}
                onClick={() => interactive && onApply(v, i)}
                onMouseEnter={() => {
                  if (!interactive) return;
                  setHoveringIndex(i);
                  onPreview?.(v, i);
                }}
                disabled={!interactive}
                className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                  wasApplied
                    ? "border-primary ring-2 ring-primary/20"
                    : hoveringIndex === i
                    ? "border-primary/40 scale-[1.02]"
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
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                  <span className="text-[10px] text-white font-medium leading-tight line-clamp-1">{v.label}</span>
                </div>
              </button>
            );
          })}
        </div>
        {onMore && (
          <button
            disabled={disabled || loadingMore}
            onClick={onMore}
            className="text-[11px] text-primary hover:text-primary/80 transition-colors mt-1 disabled:opacity-40"
          >
            {loadingMore ? (
            <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Generating…</span>
          ) : (
            "Generate More →"
            )}
          </button>
        )}
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
          const isHovering = hoveringIndex === i;
          const interactive = !disabled && !wasApplied;

          return (
            <button
              key={i}
              onClick={() => interactive && onApply(v, i)}
              onMouseEnter={() => {
                if (!interactive) return;
                setHoveringIndex(i);
                onPreview?.(v, i);
              }}
              disabled={!interactive}
              className={`w-full text-left px-3 py-2.5 transition-colors ${
                wasApplied
                  ? "bg-primary/10"
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
      {onMore && (
        <button
          disabled={disabled || loadingMore}
          onClick={onMore}
          className="text-[11px] text-primary hover:text-primary/80 transition-colors mt-1 disabled:opacity-40"
        >
          {loadingMore ? (
            <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Generating…</span>
          ) : (
            "Generate More →"
          )}
        </button>
      )}
    </div>
  );
}
