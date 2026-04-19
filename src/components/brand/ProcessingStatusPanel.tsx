import { useState, useEffect, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Check, AlertTriangle, Loader2, Clock, RefreshCw, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PipelineStatus = "idle" | "running_spec" | "spec_complete" | "running_guide" | "complete" | "failed";

interface Phase {
  key: PipelineStatus[];
  label: string;
  detail?: string;
}

const PHASES: Phase[] = [
  { key: ["running_spec"], label: "Building brand spec", detail: "Extracting design system from your references" },
  { key: ["spec_complete", "running_guide"], label: "Generating brand guide", detail: "Claude Opus is writing your full HTML design guide (3–5 min)" },
  { key: ["complete"], label: "Complete", detail: "Your brand guide is ready" },
];

function getPhaseStatus(phase: Phase, currentStatus: PipelineStatus): "pending" | "running" | "complete" | "failed" {
  const statusOrder: PipelineStatus[] = ["idle", "running_spec", "spec_complete", "running_guide", "complete"];
  const currentIdx = statusOrder.indexOf(currentStatus);
  const phaseStartIdx = Math.min(...phase.key.map((k) => statusOrder.indexOf(k)));
  const phaseEndIdx = Math.max(...phase.key.map((k) => statusOrder.indexOf(k)));

  if (currentStatus === "failed") {
    if (phaseStartIdx <= currentIdx && currentIdx <= phaseEndIdx) return "failed";
    if (currentIdx > phaseEndIdx) return "complete";
    return "pending";
  }

  if (currentIdx > phaseEndIdx) return "complete";
  if (currentIdx >= phaseStartIdx && currentIdx <= phaseEndIdx) return "running";
  return "pending";
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtTs(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour12: false });
}

interface DebugLogEntry {
  timestamp: number;
  event: string;
  detail: string;
}

interface ProcessingStatusPanelProps {
  brandId: string;
  onComplete: (guideHtml: string, rawExtraction?: any, systemPrompt?: string) => void;
  onFailed: (error: string) => void;
  onTimeout?: () => void;
  onRetry?: () => void;
  title?: string;
  subtitle?: string;
  showDashboardLink?: boolean;
  onGoToDashboard?: () => void;
  maxPollMinutes?: number;
  idleTimeoutSeconds?: number;
  /** Status of the parent's guide fetch stream: idle | opening | streaming | ended | error */
  guideStreamStatus?: string;
  brandContext?: {
    auditFindings: any;
    brandName: string;
    industry: string;
  };
}

export default function ProcessingStatusPanel({
  brandId,
  onComplete,
  onFailed,
  onTimeout,
  onRetry,
  title = "Deep Brand Analysis",
  subtitle,
  showDashboardLink = false,
  onGoToDashboard,
  maxPollMinutes = 15,
  idleTimeoutSeconds = 90,
  guideStreamStatus = "idle",
}: ProcessingStatusPanelProps) {
  const [dbStatus, setDbStatus] = useState<PipelineStatus>("idle");
  const [dbError, setDbError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [lastPollAt, setLastPollAt] = useState<Date | null>(null);
  const startTimeRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const hasLeftIdleRef = useRef(false);

  // Per-phase timestamps
  const [specStartedAt, setSpecStartedAt] = useState<Date | null>(null);
  const [specCompletedAt, setSpecCompletedAt] = useState<Date | null>(null);
  const [guideStartedAt, setGuideStartedAt] = useState<Date | null>(null);
  const [guideCompletedAt, setGuideCompletedAt] = useState<Date | null>(null);

  // Raw row diagnostics
  const [rowDiag, setRowDiag] = useState<{
    has_audit_findings: boolean;
    audit_error: string | null;
    has_raw_extraction: boolean;
    system_prompt_len: number;
    brand_guide_html_len: number;
  }>({
    has_audit_findings: false,
    audit_error: null,
    has_raw_extraction: false,
    system_prompt_len: 0,
    brand_guide_html_len: 0,
  });

  // Diagnostic log (rolling, keep last 20)
  const [debugLog, setDebugLog] = useState<DebugLogEntry[]>([]);
  const logRef = useRef<DebugLogEntry[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);

  const pushLog = (event: string, detail: string) => {
    const entry = { timestamp: Date.now(), event, detail };
    logRef.current = [...logRef.current, entry].slice(-20);
    setDebugLog([...logRef.current]);
  };

  // Tick elapsed every second
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Track stream status changes
  const lastStreamRef = useRef<string>("idle");
  useEffect(() => {
    if (guideStreamStatus !== lastStreamRef.current) {
      pushLog("stream", `${lastStreamRef.current} → ${guideStreamStatus}`);
      lastStreamRef.current = guideStreamStatus;
    }
  }, [guideStreamStatus]);

  // Poll DB status
  const lastStatusRef = useRef<PipelineStatus | null>(null);
  useEffect(() => {
    const POLL_INTERVAL = 4000;
    const MAX_POLL_TIME = maxPollMinutes * 60 * 1000;

    const poll = async () => {
      try {
        const { data: profile } = await supabase
          .from("brand_profiles")
          .select("processing_status, processing_error, brand_guide_html, raw_extraction, system_prompt, audit_findings")
          .eq("brand_id", brandId)
          .single();

        const status = ((profile as any)?.processing_status as PipelineStatus) || "idle";
        const error = ((profile as any)?.processing_error as string | null) ?? null;
        const auditFindings = (profile as any)?.audit_findings;
        const rawExtraction = (profile as any)?.raw_extraction;
        const sysPrompt = (profile as any)?.system_prompt || "";
        const guideHtml = (profile as any)?.brand_guide_html || "";

        // Track per-phase timestamps from status transitions
        if (status !== lastStatusRef.current) {
          const now = new Date();
          pushLog("status", `${lastStatusRef.current ?? "(initial)"} → ${status}`);
          if (status === "running_spec" && !specStartedAt) setSpecStartedAt(now);
          if ((status === "spec_complete" || status === "running_guide") && !specCompletedAt) setSpecCompletedAt(now);
          if (status === "running_guide" && !guideStartedAt) setGuideStartedAt(now);
          if (status === "complete" && !guideCompletedAt) setGuideCompletedAt(now);
          lastStatusRef.current = status;
        }

        setDbStatus(status);
        setDbError(error);
        setPollCount((c) => c + 1);
        setLastPollAt(new Date());
        setRowDiag({
          has_audit_findings: !!auditFindings,
          audit_error: auditFindings && typeof auditFindings === "object" ? (auditFindings as any)._error || null : null,
          has_raw_extraction: !!rawExtraction,
          system_prompt_len: sysPrompt.length,
          brand_guide_html_len: guideHtml.length,
        });

        if (status && status !== "idle") {
          hasLeftIdleRef.current = true;
        }

        if (status === "failed") {
          pushLog("error", error || "(no error message)");
          onFailed(error || "Brand processing failed");
          return "stop";
        }

        if (status === "complete" && guideHtml) {
          pushLog("done", `guide_html=${guideHtml.length} chars`);
          onComplete(guideHtml, rawExtraction, sysPrompt || undefined);
          return "stop";
        }

        // Stuck on idle
        if (status === "idle" && !hasLeftIdleRef.current) {
          const elapsedMs = Date.now() - startTimeRef.current;
          if (elapsedMs > idleTimeoutSeconds * 1000) {
            pushLog("error", "stuck on idle past timeout");
            onFailed("Brand analysis failed to start. The processing function may not have been invoked. Please try again.");
            return "stop";
          }
        }

        if (Date.now() - startTimeRef.current > MAX_POLL_TIME) {
          pushLog("error", "max poll time exceeded");
          onTimeout?.();
          return "stop";
        }
      } catch (err: any) {
        pushLog("poll_error", err?.message || String(err));
      }
      return "continue";
    };

    const timer = setInterval(async () => {
      const result = await poll();
      if (result === "stop") clearInterval(timer);
    }, POLL_INTERVAL);

    poll().then((result) => {
      if (result === "stop") clearInterval(timer);
    });

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, maxPollMinutes, idleTimeoutSeconds]);

  const progressValue =
    dbStatus === "idle" ? 5 :
    dbStatus === "running_spec" ? 25 :
    dbStatus === "spec_complete" ? 50 :
    dbStatus === "running_guide" ? 70 :
    dbStatus === "complete" ? 100 :
    dbStatus === "failed" ? 0 : 5;

  const isFailed = dbStatus === "failed";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const functionUrl = `${supabaseUrl}/functions/v1/extract-brand`;

  const buildDebugBlob = () => {
    return JSON.stringify({
      brandId,
      title,
      capturedAt: new Date().toISOString(),
      dbStatus,
      dbError,
      elapsedSeconds: elapsed,
      pollCount,
      lastPollAt: lastPollAt?.toISOString() ?? null,
      guideStreamStatus,
      phaseTimings: {
        specStartedAt: specStartedAt?.toISOString() ?? null,
        specCompletedAt: specCompletedAt?.toISOString() ?? null,
        guideStartedAt: guideStartedAt?.toISOString() ?? null,
        guideCompletedAt: guideCompletedAt?.toISOString() ?? null,
        specDurationMs: specStartedAt && specCompletedAt ? specCompletedAt.getTime() - specStartedAt.getTime() : null,
        guideDurationMs: guideStartedAt && guideCompletedAt ? guideCompletedAt.getTime() - guideStartedAt.getTime() : null,
      },
      rowDiagnostics: rowDiag,
      functionUrl,
      debugLog,
    }, null, 2);
  };

  const handleCopyDebug = async () => {
    try {
      await navigator.clipboard.writeText(buildDebugBlob());
      toast.success("Debug info copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="max-w-lg w-full space-y-6 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">
        {subtitle || "Deep brand analysis in progress. This typically takes 5–10 minutes. You can leave this page — we'll pick up when it's ready."}
      </p>

      {!isFailed && <Progress value={progressValue} className="h-1.5" />}

      {/* Phase list */}
      <div className="space-y-3 text-left">
        {PHASES.map((phase, i) => {
          const status = getPhaseStatus(phase, dbStatus);
          return (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                {status === "complete" && <Check className="w-5 h-5 text-green-500" />}
                {status === "running" && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                {status === "pending" && <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/20" />}
                {status === "failed" && <AlertTriangle className="w-5 h-5 text-destructive" />}
              </div>
              <div className="min-w-0 flex-1">
                <span className={`text-sm font-medium ${status === "pending" ? "text-muted-foreground" : status === "failed" ? "text-destructive" : ""}`}>
                  {phase.label}
                </span>
                {status === "running" && phase.detail && (
                  <p className="text-xs text-muted-foreground mt-0.5">{phase.detail}</p>
                )}
                {status === "failed" && dbError && (
                  <p className="text-xs text-destructive mt-0.5 break-words">{dbError}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Status footer */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>Elapsed: {formatElapsed(elapsed)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <RefreshCw className="w-3 h-3" />
          <span>Polls: {pollCount}</span>
        </div>
        {lastPollAt && (
          <span>Last check: {lastPollAt.toLocaleTimeString()}</span>
        )}
      </div>

      {/* DB status badge */}
      <div className="flex justify-center">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono ${
          isFailed ? "bg-destructive/10 text-destructive border border-destructive/20" :
          dbStatus === "complete" ? "bg-green-500/10 text-green-500 border border-green-500/20" :
          "bg-muted text-muted-foreground border border-border"
        }`}>
          {isFailed && <AlertTriangle className="w-3 h-3" />}
          status: {dbStatus}
        </span>
      </div>

      {/* Failure retry */}
      {isFailed && onRetry && (
        <div className="flex justify-center">
          <Button onClick={onRetry} variant="default" className="gap-1.5">
            <RotateCcwIcon /> Retry analysis
          </Button>
        </div>
      )}

      {/* Dashboard link */}
      {showDashboardLink && onGoToDashboard && (
        <Button variant="outline" onClick={onGoToDashboard} className="mt-2">
          Go to dashboard
        </Button>
      )}

      {/* Debug panel toggle */}
      <div className="pt-4 border-t border-border">
        <button
          type="button"
          onClick={() => setDebugOpen((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          {debugOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {debugOpen ? "Hide debug info" : "Show debug info"}
        </button>

        {debugOpen && (
          <div className="mt-3 text-left font-mono text-[11px] bg-muted/40 border border-border rounded-md p-3 max-h-[420px] overflow-auto space-y-3">
            <div>
              <div className="text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Phase timings</div>
              <div>spec: {fmtTs(specStartedAt)} → {fmtTs(specCompletedAt)}{specStartedAt && specCompletedAt ? ` (${Math.round((specCompletedAt.getTime() - specStartedAt.getTime())/1000)}s)` : ""}</div>
              <div>guide: {fmtTs(guideStartedAt)} → {fmtTs(guideCompletedAt)}{guideStartedAt && guideCompletedAt ? ` (${Math.round((guideCompletedAt.getTime() - guideStartedAt.getTime())/1000)}s)` : ""}</div>
            </div>

            <div>
              <div className="text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Stream</div>
              <div>guideStreamStatus: {guideStreamStatus}</div>
            </div>

            <div>
              <div className="text-muted-foreground uppercase tracking-wide text-[10px] mb-1">DB row</div>
              <div>has_audit_findings: {String(rowDiag.has_audit_findings)}</div>
              {rowDiag.audit_error && <div className="text-destructive">audit_findings._error: {rowDiag.audit_error}</div>}
              <div>has_raw_extraction: {String(rowDiag.has_raw_extraction)}</div>
              <div>length(system_prompt): {rowDiag.system_prompt_len}</div>
              <div>length(brand_guide_html): {rowDiag.brand_guide_html_len}</div>
            </div>

            {dbError && (
              <div>
                <div className="text-muted-foreground uppercase tracking-wide text-[10px] mb-1">processing_error</div>
                <div className="text-destructive whitespace-pre-wrap break-words">{dbError}</div>
              </div>
            )}

            <div>
              <div className="text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Function URL</div>
              <div className="break-all">{functionUrl}</div>
            </div>

            <div>
              <div className="text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Log (last 20)</div>
              {debugLog.length === 0 ? (
                <div className="text-muted-foreground">(empty)</div>
              ) : (
                debugLog.map((e, i) => (
                  <div key={i}>
                    {new Date(e.timestamp).toLocaleTimeString([], { hour12: false })} [{e.event}] {e.detail}
                  </div>
                ))
              )}
            </div>

            <div className="pt-2">
              <Button size="sm" variant="outline" onClick={handleCopyDebug} className="gap-1.5">
                <Copy className="w-3 h-3" /> Copy all debug info
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RotateCcwIcon() {
  return <RefreshCw className="w-4 h-4" />;
}
