import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Clock, CheckCircle2, XCircle, Loader2, Code, RefreshCw, AlertTriangle, ImageIcon, ExternalLink } from "lucide-react";

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
  run_id: string | null;
  event_key: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName?: string;
}

const STEP_LABELS: Record<string, string> = {
  generation_start: "Generation Started",
  variant_start: "Variant",
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

/** Renders a collapsible JSON payload/result viewer */
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

/** Renders image thumbnails with click-to-expand lightbox */
function ImageGallery({ urls, label }: { urls: string[]; label?: string }) {
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  if (!urls || urls.length === 0) return null;

  return (
    <div className="mt-1">
      {label && <p className="text-[10px] text-muted-foreground mb-1">{label}</p>}
      <div className="flex gap-1.5 flex-wrap">
        {urls.map((url, i) => (
          <button
            key={i}
            onClick={() => setExpandedUrl(url)}
            className="relative group cursor-pointer"
          >
            <img
              src={url}
              className="w-20 h-20 object-cover rounded border border-border hover:ring-2 ring-primary transition-all"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded transition-colors flex items-center justify-center">
              <ExternalLink className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        ))}
      </div>
      {/* Lightbox */}
      {expandedUrl && (
        <Dialog open={!!expandedUrl} onOpenChange={() => setExpandedUrl(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] p-2">
            <img src={expandedUrl} className="w-full h-auto max-h-[85vh] object-contain rounded" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** QA Issues list renderer */
function QaIssuesList({ issues }: { issues: any[] }) {
  if (!issues || issues.length === 0) return null;
  return (
    <div className="mt-1 space-y-1">
      <p className="text-[10px] text-muted-foreground font-medium">Issues found:</p>
      {issues.map((issue: any, i: number) => (
        <div key={i} className={`text-[11px] px-2 py-1 rounded border ${
          issue.severity === "critical" ? "bg-red-500/5 border-red-500/20 text-red-700" :
          issue.severity === "major" ? "bg-amber-500/5 border-amber-500/20 text-amber-700" :
          "bg-muted border-border text-muted-foreground"
        }`}>
          <span className="font-medium">[{issue.severity}] [{issue.category}]</span> {issue.description}
        </div>
      ))}
    </div>
  );
}

/** Extract image URLs from slices data in payload/result */
function extractSliceUrls(data: any): string[] {
  if (!data) return [];
  // Check for slices array with url properties
  if (data.slices && Array.isArray(data.slices)) {
    return data.slices
      .filter((s: any) => s.url && typeof s.url === "string" && !s.url.startsWith("[base64"))
      .map((s: any) => s.url);
  }
  // Check for reference_slices
  if (data.reference_slices && Array.isArray(data.reference_slices)) {
    return data.reference_slices
      .filter((s: any) => s.url && typeof s.url === "string")
      .map((s: any) => s.url);
  }
  return [];
}

/** Extract any image URLs from deeply nested payload/result */
function extractImageUrls(obj: any): string[] {
  const urls: string[] = [];
  const check = (val: any) => {
    if (!val) return;
    if (typeof val === "string" && val.startsWith("http") && /\.(png|jpg|jpeg|webp)/i.test(val)) urls.push(val);
    if (Array.isArray(val)) val.forEach(check);
    if (typeof val === "object" && !Array.isArray(val)) {
      for (const v of Object.values(val)) check(v);
    }
  };
  check(obj);
  return urls.slice(0, 20);
}

/** Group events by run_id, with legacy (null run_id) events in their own group */
function groupByRun(events: GenerationEvent[]): { runId: string; label: string; events: GenerationEvent[]; startedAt: string }[] {
  const runs = new Map<string, GenerationEvent[]>();

  for (const ev of events) {
    const key = ev.run_id || "legacy";
    if (!runs.has(key)) runs.set(key, []);
    runs.get(key)!.push(ev);
  }

  const result: { runId: string; label: string; events: GenerationEvent[]; startedAt: string }[] = [];
  for (const [runId, evts] of runs) {
    const sorted = evts.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const first = sorted[0];
    const genStart = evts.find(e => e.step === "generation_start");
    const mode = genStart?.payload?.campaign_mode || "campaign";
    const label = runId === "legacy"
      ? `Legacy Run (${formatTime(first.created_at)})`
      : `${mode === "flow" ? "Flow" : "Campaign"} Run — ${new Date(first.created_at).toLocaleString()}`;
    result.push({ runId, label, events: sorted, startedAt: first.created_at });
  }

  // Sort runs newest first
  result.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return result;
}

/** Deduplicate legacy events: if a "started" and "completed" event exist with the same step
 *  (no run_id/event_key), merge them into one event */
function deduplicateLegacyEvents(events: GenerationEvent[]): GenerationEvent[] {
  const result: GenerationEvent[] = [];
  const startedMap = new Map<string, number>();

  for (const ev of events) {
    if (ev.run_id) {
      // Modern events with run_id — keep as-is
      result.push(ev);
      continue;
    }

    if (ev.status === "started") {
      startedMap.set(ev.step, result.length);
      result.push(ev);
    } else if (ev.status === "completed" || ev.status === "failed") {
      const startIdx = startedMap.get(ev.step);
      if (startIdx !== undefined && result[startIdx]?.status === "started") {
        // Merge: update the started event with completion data
        result[startIdx] = {
          ...result[startIdx],
          status: ev.status,
          completed_at: ev.completed_at,
          duration_ms: ev.duration_ms,
          result: ev.result,
          error: ev.error,
        };
        startedMap.delete(ev.step);
      } else {
        result.push(ev);
      }
    } else {
      result.push(ev);
    }
  }
  return result;
}

export default function GenerationTimeline({ open, onOpenChange, campaignId, campaignName }: Props) {
  const [allEvents, setAllEvents] = useState<GenerationEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const loadEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("generation_events")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true });
    if (!error && data) {
      setAllEvents(data as unknown as GenerationEvent[]);
      // Auto-select latest run
      const runs = groupByRun(data as unknown as GenerationEvent[]);
      if (runs.length > 0 && !selectedRunId) {
        setSelectedRunId(runs[0].runId);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && campaignId) {
      setSelectedRunId(null);
      loadEvents();
    }
  }, [open, campaignId]);

  const runs = groupByRun(allEvents);
  const currentRun = runs.find(r => r.runId === selectedRunId) || runs[0];
  const displayEvents = currentRun ? deduplicateLegacyEvents(currentRun.events) : [];

  const totalDuration = displayEvents.length > 0
    ? new Date(displayEvents[displayEvents.length - 1].created_at).getTime() - new Date(displayEvents[0].created_at).getTime()
    : 0;

  // Extract reference info from generation_start event
  const genStartEvent = displayEvents.find(e => e.step === "generation_start");
  const referenceIds = genStartEvent?.payload?.reference_ids;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base">Run Details</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {campaignName || "Campaign"} — {displayEvents.length} events
                {totalDuration > 0 && ` — Total: ${formatDuration(totalDuration)}`}
              </p>
              {/* Reference info */}
              {referenceIds && referenceIds.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  References: {referenceIds.map((r: any) => r.title || r.id).join(", ")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Run switcher */}
              {runs.length > 1 && (
                <Select value={selectedRunId || undefined} onValueChange={setSelectedRunId}>
                  <SelectTrigger className="h-7 text-[11px] w-[200px]">
                    <SelectValue placeholder="Select run..." />
                  </SelectTrigger>
                  <SelectContent>
                    {runs.map(run => (
                      <SelectItem key={run.runId} value={run.runId} className="text-[11px]">
                        {run.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadEvents} title="Refresh">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[70vh] px-6 py-4">
          {loading && allEvents.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading events…
            </div>
          ) : displayEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-sm">
              <p>No generation events recorded yet.</p>
              <p className="text-xs mt-1">Events will appear after the next generation run.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

              <div className="space-y-1">
                {displayEvents.map((ev) => {
                  const stepLabel = STEP_LABELS[ev.step] || ev.step;
                  const variantLabel = ev.payload?.label || ev.result?.label;
                  const displayLabel = variantLabel ? `${stepLabel}: ${variantLabel}` : stepLabel;

                  // Extract images from different event types
                  const outputSliceUrls = extractSliceUrls(ev.result);
                  const refSliceUrls = extractSliceUrls(ev.payload);
                  const miscImageUrls = outputSliceUrls.length === 0 && refSliceUrls.length === 0
                    ? extractImageUrls({ ...ev.payload, ...ev.result })
                    : [];

                  // QA issues
                  const qaIssues = ev.result?.issues;

                  return (
                    <div key={ev.id} className="relative pl-7 py-2 group">
                      {/* Timeline dot */}
                      <div className="absolute left-0 top-3">
                        {getStepIcon(ev.status)}
                      </div>

                      <div className="space-y-1">
                        {/* Header row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{displayLabel}</span>
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
                            {formatTime(ev.started_at || ev.created_at || "")}
                          </span>
                          {ev.duration_ms != null && (
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              ⏱ {formatDuration(ev.duration_ms)}
                            </span>
                          )}
                          {/* Score badges for QA events */}
                          {ev.result?.overall_score != null && (
                            <Badge className={`text-[9px] px-1.5 py-0 ${
                              ev.result.overall_score >= 8 ? "bg-emerald-500/10 text-emerald-600" :
                              ev.result.overall_score >= 5 ? "bg-amber-500/10 text-amber-600" :
                              "bg-red-500/10 text-red-600"
                            }`}>
                              Score: {ev.result.overall_score}/10
                            </Badge>
                          )}
                          {ev.result?.structural_fidelity != null && (
                            <Badge className={`text-[9px] px-1.5 py-0 ${
                              ev.result.structural_fidelity >= 8 ? "bg-emerald-500/10 text-emerald-600" :
                              ev.result.structural_fidelity >= 5 ? "bg-amber-500/10 text-amber-600" :
                              "bg-red-500/10 text-red-600"
                            }`}>
                              Structure: {ev.result.structural_fidelity}/10
                            </Badge>
                          )}
                        </div>

                        {/* Summary text for QA compare */}
                        {ev.result?.summary && (
                          <p className="text-xs text-muted-foreground italic">{ev.result.summary}</p>
                        )}

                        {/* Error */}
                        {ev.error && (
                          <div className="text-xs text-red-600 bg-red-500/5 border border-red-500/10 rounded px-2 py-1 font-mono flex items-start gap-1.5">
                            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            {ev.error}
                          </div>
                        )}

                        {/* QA Issues */}
                        {Array.isArray(qaIssues) && qaIssues.length > 0 && (
                          <QaIssuesList issues={qaIssues} />
                        )}

                        {/* Reference slices gallery */}
                        {refSliceUrls.length > 0 && (
                          <ImageGallery urls={refSliceUrls} label={`Reference Slices (${refSliceUrls.length})`} />
                        )}

                        {/* Output slices gallery */}
                        {outputSliceUrls.length > 0 && (
                          <ImageGallery urls={outputSliceUrls} label={`Output Slices (${outputSliceUrls.length})`} />
                        )}

                        {/* Misc image thumbnails */}
                        {miscImageUrls.length > 0 && (
                          <ImageGallery urls={miscImageUrls} />
                        )}

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
