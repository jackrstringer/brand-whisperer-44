import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VariantData, VariantOption } from "@/lib/types";

interface VariantCardsProps {
  variantData: VariantData;
  onApply: (variant: VariantOption, index: number) => void;
  disabled: boolean;
}

export default function VariantCards({ variantData, onApply, disabled }: VariantCardsProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const isApplied = variantData.applied_index !== null;

  return (
    <div className="space-y-2">
      <p className="text-sm text-foreground">{variantData.message}</p>
      <div className="space-y-1.5">
        {variantData.variants.map((v, i) => {
          const wasApplied = isApplied && variantData.applied_index === i;
          const isSelected = selectedIndex === i;
          const interactive = !isApplied && !disabled;

          return (
            <button
              key={i}
              onClick={() => interactive && setSelectedIndex(i)}
              disabled={!interactive}
              className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all ${
                wasApplied
                  ? "border-primary/50 bg-primary/10"
                  : isSelected
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/40 bg-card hover:border-border"
              } ${interactive ? "cursor-pointer" : "cursor-default"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">{v.label}</span>
                {wasApplied && (
                  <span className="flex items-center gap-1 text-[10px] text-primary">
                    <Check className="w-3 h-3" /> Applied
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{v.preview}</p>
            </button>
          );
        })}
      </div>
      {!isApplied && (
        <Button
          size="sm"
          disabled={selectedIndex === null || disabled}
          onClick={() => {
            if (selectedIndex !== null) {
              onApply(variantData.variants[selectedIndex], selectedIndex);
            }
          }}
          className="w-full mt-1"
        >
          Apply
        </Button>
      )}
    </div>
  );
}
