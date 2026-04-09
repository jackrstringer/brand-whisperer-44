import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronRight, Clock, CheckCircle2, XCircle, Loader2, Image as ImageIcon, Code, RefreshCw } from "lucide-react";

interface GenerationEvent {
  id: string;
  campaign_id: string;
  step: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  payload: any;
  result: any;
  error: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName?: string;
}

const STEP_LABELS: Record<string, string> = {
  generation_start: "Generation Started",
  variant_start: "Variant Started",
  variant_complete: "Variant Complete",
  variant_error: "Variant Error",
  skeleton_extract: "Reference Skeleton Extraction",
  claude_generate: "Claude Generation (Pass 1)",
  claude_qa: "Claude QA Audit (Pass 2)",
  claude_retry: "Claude Retry (Truncated)",
  image_rehost: "Image Rehosting (ImageKit)",
  finalize_html: "HTML Finalization",
  klaviyo_validate: "Klaviyo Template Validation",
  qa_flow_render: "Flow Preview Render",
  qa_screenshot: "Screenshot Capture",
  qa_slice: "Image Slicing",
  qa_compare: "Visual QA Comparison",
  qa_patch: "QA Patch Applied",
  qa_edit: "QA Edit (Agent 2)",
  qa_result: "Visual QA Result",
};

function getStepIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case "failed": return <XCircle className="w-4 h-4 text-red-500" />;
    case "started": return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    default: return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

function formatDuration(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function JsonViewer({ data, label }: { data: any; label: string }) {
  const [open, setOpen] = useState(false);
  if (!data || (typeof data === "object" && Object.keys(data).length === 0)) return null;

  const str = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const isLong = str.length > 300;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Code className="w-3 h-3" />
        {label} {isLong && `(${(str.length / 1024).toFixed(1)}KB)`}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 p-2 bg-muted rounded text-[10px] text-foreground font-mono overflow-auto max-h-[300px] whitespace-pre-wrap break-all">
          {str.length > 10000 ? str.slice(0, 10000) + "\n\n... truncated ..." : str}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ImageThumbnails({ urls }: { urls: string[] }) {
  if (!urls || urls.length === 0) return null;
  return (
    <div className="flex gap-1 flex-wrap mt-1">
      {urls.slice(0, 8).map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} className="w-16 h-16 object-cover rounded border border-border hover:ring-2 ring-primary transition-all" />
        </a>
      ))}
      {urls.length > 8 && <span className="text-[10px] text-muted-foreground self-end">+{urls.length - 8} more</span>}
    </div>
  );
}

export default function GenerationTimeline({ open, onOpenChange, campaignId, campaignName }: Props) {
  const [events, setEvents] = useState<GenerationEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const loadEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("generation_events")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true });
    if (!error && data) setEvents(data as unknown as GenerationEvent[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open && campaignId) loadEvents();
  }, [open, campaignId]);

  const totalDuration = events.length > 0
    ? new Date(events[events.length - 1].created_at).getTime() - new Date(events[0].created_at).getTime()
    : 0;

  // Extract image URLs from payload/result for thumbnails
  function extractImageUrls(ev: GenerationEvent): string[] {
    const urls: string[] = [];
    const check = (obj: any) => {
      if (!obj) return;
      if (typeof obj === "string" && (obj.startsWith("http") && /\.(png|jpg|jpeg|webp)/i.test(obj))) urls.push(obj);
      if (Array.isArray(obj)) obj.forEach(check);
      if (typeof obj === "object") {
        for (const v of Object.values(obj)) check(v);
      }
    };
    check(ev.payload);
    check(ev.result);
    return urls.slice(0, 12);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base">Run Details</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {campaignName || "Campaign"} — {events.length} events
                {totalDuration > 0 && ` — Total: ${formatDuration(totalDuration)}`}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadEvents} title="Refresh">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[70vh] px-6 py-4">
          {loading && events.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading events…
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-sm">
              <p>No generation events recorded yet.</p>
              <p className="text-xs mt-1">Events will appear after the next generation run.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

              <div className="space-y-1">
                {events.map((ev, idx) => {
                  const imageUrls = extractImageUrls(ev);
                  const stepLabel = STEP_LABELS[ev.step] || ev.step;

                  return (
                    <div key={ev.id} className="relative pl-7 py-2 group">
                      {/* Timeline dot */}
                      <div className="absolute left-0 top-3">
                        {getStepIcon(ev.status)}
                      </div>

                      <div className="space-y-1">
                        {/* Header row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{stepLabel}</span>
                          <Badge
                            className={`text-[9px] px-1.5 py-0 ${
                              ev.status === "completed" ? "bg-emerald-500/10 text-emerald-600" :
                              ev.status === "failed" ? "bg-red-500/10 text-red-600" :
                              "bg-blue-500/10 text-blue-600"
                            }`}
                          >
                            {ev.status}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {formatTime(ev.started_at)}
                          </span>
                          {ev.duration_ms != null && (
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              ⏱ {formatDuration(ev.duration_ms)}
                            </span>
                          )}
                        </div>

                        {/* Error */}
                        {ev.error && (
                          <div className="text-xs text-red-600 bg-red-500/5 border border-red-500/10 rounded px-2 py-1 font-mono">
                            {ev.error}
                          </div>
                        )}

                        {/* Image thumbnails */}
                        {imageUrls.length > 0 && <ImageThumbnails urls={imageUrls} />}

                        {/* Expandable payload/result */}
                        <div className="flex gap-4">
                          <JsonViewer data={ev.payload} label="Payload" />
                          <JsonViewer data={ev.result} label="Result" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
