import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, Loader2, Circle, Clock, Copy, Eye, ArrowRight, RotateCcw } from "lucide-react";

/* ─── Types ─── */

type PhaseKey = "audit" | "spec" | "guide";
type PhaseState = "pending" | "running" | "complete" | "failed";
type PipelineStatus = "idle" | "running_spec" | "spec_complete" | "running_guide" | "complete" | "failed";

interface PhaseInfo {
  key: PhaseKey;
  label: string;
  state: PhaseState;
  elapsed?: number; // seconds
  error?: string;
}

interface LogEntry {
  time: Date;
  message: string;
  level: "info" | "error" | "success";
}

/* ─── Props ─── */

export interface BrandProcessingScreenProps {
  brandName: string;
  /** Called to execute the audit phase. Must return audit findings or throw. */
  onRunAudit: (log: (msg: string, level?: "info" | "error" | "success") => void) => Promise<{ auditFindings: any; confirmedProperties?: any; extractionSources?: string[] }>;
  /** Called to create brand + profile and fire spec. Must return brandId or throw. */
  onCreateBrand: (auditFindings: any, confirmedProperties: any, extractionSources: string[], log: (msg: string, level?: "info" | "error" | "success") => void) => Promise<string>;
  /** Called when everything is complete */
  onComplete: (brandId: string, guideHtml: string, rawExtraction?: any, systemPrompt?: string) => void;
  /** Called when user clicks "Try Again" */
  onRetry: () => void;
  /** Called when user clicks Continue after completion */
  onContinue: (brandId: string) => void;
  /** Brand context for guide phase */
  brandContext?: { auditFindings: any; brandName: string; industry: string };
}

/* ─── Helpers ─── */

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ─── Component ─── */

export default function BrandProcessingScreen({
  brandName,
  onRunAudit,
  onCreateBrand,
  onComplete,
  onRetry,
  onContinue,
  brandContext,
}: BrandProcessingScreenProps) {
  const [phases, setPhases] = useState<PhaseInfo[]>([
    { key: "audit", label: "Visual Audit", state: "pending" },
    { key: "spec", label: "Brand Spec", state: "pending" },
    { key: "guide", label: "Brand Guide", state: "pending" },
  ]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [guideHtml, setGuideHtml] = useState<string | null>(null);
  const [rawExtraction, setRawExtraction] = useState<any>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | undefined>();
  const [showPreview, setShowPreview] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);
  const phaseStartTimes = useRef<Record<PhaseKey, number | null>>({ audit: null, spec: null, guide: null });
  const guideFiredRef = useRef(false);
  const hasStartedRef = useRef(false);
  const specCompleteTimeRef = useRef<number | null>(null);

  // Elapsed timer
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = useCallback((message: string, level: "info" | "error" | "success" = "info") => {
    setLogs((prev) => [...prev, { time: new Date(), message, level }]);
  }, []);

  const updatePhase = useCallback((key: PhaseKey, update: Partial<PhaseInfo>) => {
    setPhases((prev) => prev.map((p) => (p.key === key ? { ...p, ...update } : p)));
  }, []);

  const getPhaseElapsed = useCallback((key: PhaseKey): number | undefined => {
    const start = phaseStartTimes.current[key];
    if (!start) return undefined;
    return Math.floor((Date.now() - start) / 1000);
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const startPhase = useCallback((key: PhaseKey) => {
    phaseStartTimes.current[key] = Date.now();
    updatePhase(key, { state: "running" });
  }, [updatePhase]);

  const completePhase = useCallback((key: PhaseKey) => {
    const elapsed = getPhaseElapsed(key);
    updatePhase(key, { state: "complete", elapsed });
  }, [updatePhase, getPhaseElapsed]);

  const failPhase = useCallback((key: PhaseKey, error: string) => {
    const elapsed = getPhaseElapsed(key);
    updatePhase(key, { state: "failed", elapsed, error });
  }, [updatePhase, getPhaseElapsed]);

  // ── Main pipeline ──
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    runPipeline();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const runPipeline = async () => {
    try {
      // Phase 1: Visual Audit
      startPhase("audit");
      addLog("Starting visual audit...");
      const { auditFindings, confirmedProperties, extractionSources } = await onRunAudit(addLog);
      completePhase("audit");
      addLog("Visual audit complete", "success");

      // Phase 2 start: Create brand + fire spec
      startPhase("spec");
      addLog("Creating brand profile and uploading assets...");
      const newBrandId = await onCreateBrand(auditFindings, confirmedProperties || null, extractionSources || ["screenshots"], addLog);
      setBrandId(newBrandId);
      addLog("Brand created, spec generation started");

      // Now poll for spec → guide → complete
      pollForCompletion(newBrandId, auditFindings);
    } catch (err: any) {
      const msg = err?.message || "Pipeline failed";
      addLog(msg, "error");
      // Determine which phase was running
      setPhases((prev) => {
        const running = prev.find((p) => p.state === "running");
        if (running) {
          return prev.map((p) =>
            p.key === running.key ? { ...p, state: "failed" as const, error: msg } : p
          );
        }
        return prev;
      });
      setGlobalError(msg);
    }
  };

  // ── DB Polling (spec → guide → complete) ──
  const pollForCompletion = (bId: string, auditFindings: any) => {
    const POLL_INTERVAL = 4000;
    const MAX_POLL_MS = 15 * 60 * 1000;
    const startTime = Date.now();

    const poll = async (): Promise<"stop" | "continue"> => {
      try {
        const { data: profile } = await supabase
          .from("brand_profiles")
          .select("processing_status, processing_error, brand_guide_html, raw_extraction, system_prompt, audit_findings")
          .eq("brand_id", bId)
          .single();

        const status = (profile as any)?.processing_status as PipelineStatus;
        const error = (profile as any)?.processing_error as string | null;

        if (status === "failed") {
          const msg = error || "Brand processing failed";
          addLog(msg, "error");
          // Fail the currently running phase
          const currentPhase = phases.find((p) => p.state === "running")?.key;
          if (currentPhase) failPhase(currentPhase, msg);
          setGlobalError(msg);
          return "stop";
        }

        if (status === "running_spec") {
          updatePhase("spec", { state: "running" });
        }

        if (status === "spec_complete" && !guideFiredRef.current) {
          guideFiredRef.current = true;
          specCompleteTimeRef.current = Date.now();
          completePhase("spec");
          addLog("Brand spec complete", "success");

          startPhase("guide");
          addLog("Firing brand guide generation (3–5 min)...");

          // Fetch fresh audit from DB
          const freshAudit = (profile as any)?.audit_findings || auditFindings || {};

          supabase.functions.invoke("extract-brand", {
            body: {
              auditFindings: freshAudit,
              brandName: brandContext?.brandName || brandName,
              industry: brandContext?.industry || "",
              brandId: bId,
              step: "guide",
            },
          }).then(({ error: guideErr }) => {
            if (guideErr) addLog(`Guide invoke returned: ${guideErr.message}`, "info");
          }).catch((err) => {
            addLog(`Guide invoke timed out (expected): ${err?.message}`, "info");
          });
        }

        if (status === "running_guide") {
          updatePhase("guide", { state: "running" });
        }

        // Stuck on spec_complete
        if (status === "spec_complete" && guideFiredRef.current && specCompleteTimeRef.current) {
          if (Date.now() - specCompleteTimeRef.current > 60000) {
            const msg = "Guide generation failed to start after spec completed. Please try again.";
            addLog(msg, "error");
            failPhase("guide", msg);
            setGlobalError(msg);
            return "stop";
          }
        }

        if (status === "complete" && profile?.brand_guide_html) {
          completePhase("guide");
          addLog("Brand guide ready!", "success");
          setGuideHtml(profile.brand_guide_html);
          setRawExtraction((profile as any)?.raw_extraction);
          setSystemPrompt(profile.system_prompt || undefined);
          onComplete(bId, profile.brand_guide_html, (profile as any)?.raw_extraction, profile.system_prompt || undefined);
          return "stop";
        }

        // Idle too long
        if (status === "idle") {
          if (Date.now() - startTime > 90000) {
            const msg = "Processing failed to start. Please try again.";
            addLog(msg, "error");
            failPhase("spec", msg);
            setGlobalError(msg);
            return "stop";
          }
        }

        if (Date.now() - startTime > MAX_POLL_MS) {
          const msg = "Processing timed out after 15 minutes.";
          addLog(msg, "error");
          const currentPhase = phases.find((p) => p.state === "running")?.key;
          if (currentPhase) failPhase(currentPhase, msg);
          setGlobalError(msg);
          return "stop";
        }
      } catch {
        // Transient error, keep polling
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
  };

  // ── Derived state ──
  const isFailed = globalError !== null;
  const isComplete = guideHtml !== null;
  const currentStepIndex = phases.findIndex((p) => p.state === "running");
  const completedCount = phases.filter((p) => p.state === "complete").length;
  const stepLabel = isFailed
    ? "Failed"
    : isComplete
    ? "Complete"
    : currentStepIndex >= 0
    ? `Step ${currentStepIndex + 1} of 3`
    : "Starting...";

  const progressValue = isFailed
    ? 0
    : isComplete
    ? 100
    : Math.round(((completedCount + (currentStepIndex >= 0 ? 0.5 : 0)) / 3) * 100);

  const copyLog = () => {
    const text = logs
      .map((l) => `[${formatTime(l.time)}] ${l.message}`)
      .join("\n");
    navigator.clipboard.writeText(text);
  };

  const guideSrcDoc = guideHtml
    ? guideHtml.replace(
        "</head>",
        `<style>
      section:first-of-type, .cover, [class*="cover"], [class*="hero"], header:first-of-type {
        min-height: unset !important; max-height: 420px !important; height: auto !important;
      }
      * { min-height: unset !important; }
      html, body { height: auto !important; min-height: unset !important; overflow: visible !important; }
    </style></head>`
      )
    : null;

  return (
    <div className="min-h-screen bg-background p-6 md:p-12 flex flex-col items-center justify-center">
      <div className="max-w-lg w-full space-y-6">
        {/* Title */}
        <div className="text-center space-y-1">
          <h2 className="text-xl font-semibold">
            {isComplete ? "Brand Guide Ready" : isFailed ? "Processing Failed" : `Analyzing ${brandName}`}
          </h2>
          {!isComplete && !isFailed && (
            <p className="text-sm text-muted-foreground">
              Deep brand analysis in progress. This typically takes 5–10 minutes.
            </p>
          )}
        </div>

        {/* Progress bar + step label */}
        {!isFailed && (
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs text-muted-foreground">
              <span>{stepLabel}</span>
              <span>{progressValue}%</span>
            </div>
            <Progress value={progressValue} className="h-1.5" />
          </div>
        )}

        {/* Phase list */}
        <div className="space-y-3">
          {phases.map((phase) => {
            const elapsed = phase.state === "running" ? getPhaseElapsed(phase.key) : phase.elapsed;
            return (
              <div key={phase.key} className="flex items-center gap-3">
                <div className="shrink-0">
                  {phase.state === "complete" && <Check className="w-5 h-5 text-green-500" />}
                  {phase.state === "running" && <Loader2 className="w-5 h-5 text-primary animate-spin" />}
                  {phase.state === "pending" && <Circle className="w-5 h-5 text-muted-foreground/30" />}
                  {phase.state === "failed" && <X className="w-5 h-5 text-destructive" />}
                </div>
                <span
                  className={`text-sm font-medium flex-1 ${
                    phase.state === "pending"
                      ? "text-muted-foreground"
                      : phase.state === "failed"
                      ? "text-destructive"
                      : ""
                  }`}
                >
                  {phase.label}
                </span>
                <span className="text-xs text-muted-foreground font-mono shrink-0">
                  {phase.state === "complete" && elapsed != null && (
                    <span className="flex items-center gap-1">
                      <Check className="w-3 h-3 text-green-500" />
                      {formatElapsed(elapsed)}
                    </span>
                  )}
                  {phase.state === "running" && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {elapsed != null ? formatElapsed(elapsed) : "..."}
                    </span>
                  )}
                  {phase.state === "failed" && "failed"}
                  {phase.state === "pending" && "pending"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Failed phase error */}
        {isFailed && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {globalError}
          </div>
        )}

        {/* Log panel */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground font-medium">Log</span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={copyLog}>
              <Copy className="w-3 h-3" /> Copy
            </Button>
          </div>
          <ScrollArea className="h-48 rounded-lg border border-border bg-card">
            <div className="p-3 space-y-0.5 font-mono text-xs">
              {logs.length === 0 && (
                <p className="text-muted-foreground">Waiting for events...</p>
              )}
              {logs.map((entry, i) => (
                <div
                  key={i}
                  className={`leading-relaxed ${
                    entry.level === "error"
                      ? "text-destructive"
                      : entry.level === "success"
                      ? "text-green-500"
                      : "text-muted-foreground"
                  }`}
                >
                  <span className="opacity-60">[{formatTime(entry.time)}]</span>{" "}
                  {entry.level === "success" && "✓ "}
                  {entry.level === "error" && "✗ "}
                  {entry.message}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Completion state */}
        {isComplete && (
          <div className="space-y-3">
            {showPreview && guideSrcDoc && (
              <div className="border border-border rounded-lg overflow-hidden bg-card">
                <iframe
                  title="Brand Guide Preview"
                  className="w-full"
                  style={{ minHeight: 400, border: "none" }}
                  sandbox="allow-same-origin"
                  srcDoc={guideSrcDoc}
                />
              </div>
            )}
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => setShowPreview((v) => !v)} className="gap-1.5">
                <Eye className="w-4 h-4" /> {showPreview ? "Hide Preview" : "Preview Guide"}
              </Button>
              <Button onClick={() => brandId && onContinue(brandId)} className="gap-1.5">
                Continue <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Failed state */}
        {isFailed && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={onRetry} className="gap-1.5">
              <RotateCcw className="w-4 h-4" /> Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
