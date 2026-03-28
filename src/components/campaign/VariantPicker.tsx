import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, RotateCcw, Check, Loader2, Sparkles } from "lucide-react";

interface Variant {
  label: string;
  html: string | null;
  qa_score: number | null;
  qa_summary: string | null;
  qa_round: number;
  status: string;
  error?: string | null;
}

interface VariantPickerProps {
  variants: Variant[];
  onSelect: (index: number) => void;
  onRegenerate?: (index: number) => void;
  onClose: () => void;
  qaProgress?: { [index: number]: string };
}

export default function VariantPicker({ variants, onSelect, onRegenerate, onClose, qaProgress }: VariantPickerProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);

  const renderIframe = useCallback((iframe: HTMLIFrameElement | null, html: string | null) => {
    if (!iframe || !html) return;
    const srcdoc = html.replace(
      /(<head[^>]*>)/i,
      '$1<meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0;overflow:hidden;pointer-events:none;}</style>'
    );
    iframe.srcdoc = srcdoc;
  }, []);

  useEffect(() => {
    variants.forEach((v, i) => {
      if (v.html && iframeRefs.current[i]) {
        renderIframe(iframeRefs.current[i], v.html);
      }
    });
  }, [variants, renderIframe]);

  const getStatusBadge = (v: Variant, idx: number) => {
    const progress = qaProgress?.[idx];
    if (progress) {
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{progress}</Badge>;
    }
    if (v.status === "error") return <Badge variant="destructive" className="text-[10px]">Failed</Badge>;
    if (v.status === "qa_passed") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]"><Check className="w-3 h-3 mr-1" />QA Passed</Badge>;
    if (v.qa_score !== null) {
      const color = v.qa_score >= 9 ? "emerald" : v.qa_score >= 7 ? "amber" : "red";
      return <Badge className={`bg-${color}-500/20 text-${color}-400 border-${color}-500/30 text-[10px]`}>{v.qa_score}/10</Badge>;
    }
    if (v.status === "generated") return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">Ready</Badge>;
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Perfection Mode — Choose Your Campaign</h2>
          <span className="text-sm text-muted-foreground">3 unique creative directions, aggressively QA'd</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Variant Cards */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="grid grid-cols-3 gap-6 h-full">
          {variants.map((variant, idx) => (
            <div
              key={idx}
              className={`relative flex flex-col rounded-xl border-2 transition-all cursor-pointer overflow-hidden ${
                selectedIdx === idx
                  ? "border-primary shadow-lg shadow-primary/20"
                  : "border-border hover:border-primary/50"
              }`}
              onClick={() => variant.html && setSelectedIdx(idx)}
            >
              {/* Label + Status */}
              <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{variant.label}</span>
                  {getStatusBadge(variant, idx)}
                </div>
                {onRegenerate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-muted-foreground hover:text-foreground"
                    onClick={(e) => { e.stopPropagation(); onRegenerate(idx); }}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    <span className="text-xs">Redo</span>
                  </Button>
                )}
              </div>

              {/* Preview */}
              <div className="flex-1 overflow-hidden bg-white relative">
                {variant.html ? (
                  <iframe
                    ref={(el) => { iframeRefs.current[idx] = el; }}
                    className="w-[470px] origin-top-left border-none"
                    style={{
                      transform: "scale(0.65)",
                      height: "1200px",
                      pointerEvents: "none",
                    }}
                    sandbox="allow-same-origin"
                    title={`Variant ${idx + 1}`}
                  />
                ) : variant.status === "error" ? (
                  <div className="flex items-center justify-center h-full text-destructive text-sm p-4 text-center">
                    Generation failed. Try regenerating.
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                )}

                {/* Selection overlay */}
                {selectedIdx === idx && (
                  <div className="absolute inset-0 bg-primary/5 border-2 border-primary rounded-b-xl pointer-events-none" />
                )}
              </div>

              {/* QA Summary */}
              {variant.qa_summary && (
                <div className="px-4 py-2 bg-card border-t border-border">
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{variant.qa_summary}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-card">
        <p className="text-sm text-muted-foreground">
          {selectedIdx !== null
            ? `Selected: ${variants[selectedIdx]?.label}`
            : "Click a variant to select it"}
        </p>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={selectedIdx === null}
            onClick={() => selectedIdx !== null && onSelect(selectedIdx)}
            className="bg-primary text-primary-foreground"
          >
            <Check className="w-4 h-4 mr-2" />
            Use This Campaign
          </Button>
        </div>
      </div>
    </div>
  );
}
