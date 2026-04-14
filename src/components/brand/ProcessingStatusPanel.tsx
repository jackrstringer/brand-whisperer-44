import { useState, useEffect, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Check, AlertTriangle, Loader2, Clock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
    // Mark the phase that was running when it failed
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

interface ProcessingStatusPanelProps {
  brandId: string;
  onComplete: (guideHtml: string, rawExtraction?: any, systemPrompt?: string) => void;
  onFailed: (error: string) => void;
  onTimeout?: () => void;
  title?: string;
  subtitle?: string;
  showDashboardLink?: boolean;
  onGoToDashboard?: () => void;
  maxPollMinutes?: number;
}

export default function ProcessingStatusPanel({
  brandId,
  onComplete,
  onFailed,
  onTimeout,
  title = "Deep Brand Analysis",
  subtitle,
  showDashboardLink = false,
  onGoToDashboard,
  maxPollMinutes = 15,
}: ProcessingStatusPanelProps) {
  const [dbStatus, setDbStatus] = useState<PipelineStatus>("idle");
  const [dbError, setDbError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [lastPollAt, setLastPollAt] = useState<Date | null>(null);
  const startTimeRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  // Tick elapsed every second
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Poll DB status
  useEffect(() => {
    const POLL_INTERVAL = 4000;
    const MAX_POLL_TIME = maxPollMinutes * 60 * 1000;

    const poll = async () => {
      try {
        const { data: profile } = await supabase
          .from("brand_profiles")
          .select("processing_status, processing_error, brand_guide_html, raw_extraction, system_prompt")
          .eq("brand_id", brandId)
          .single();

        const status = (profile as any)?.processing_status as PipelineStatus;
        const error = (profile as any)?.processing_error as string | null;

        setDbStatus(status || "idle");
        setDbError(error);
        setPollCount((c) => c + 1);
        setLastPollAt(new Date());

        if (status === "failed") {
          onFailed(error || "Brand processing failed");
          return "stop";
        }

        if (status === "complete" && profile?.brand_guide_html) {
          onComplete(profile.brand_guide_html, (profile as any)?.raw_extraction, profile.system_prompt || undefined);
          return "stop";
        }

        if (Date.now() - startTimeRef.current > MAX_POLL_TIME) {
          onTimeout?.();
          return "stop";
        }
      } catch {
        // Keep polling on transient errors
      }
      return "continue";
    };

    const timer = setInterval(async () => {
      const result = await poll();
      if (result === "stop") clearInterval(timer);
    }, POLL_INTERVAL);

    // Initial poll
    poll().then((result) => {
      if (result === "stop") clearInterval(timer);
    });

    return () => clearInterval(timer);
  }, [brandId, maxPollMinutes, onComplete, onFailed, onTimeout]);

  const progressValue =
    dbStatus === "idle" ? 5 :
    dbStatus === "running_spec" ? 25 :
    dbStatus === "spec_complete" ? 50 :
    dbStatus === "running_guide" ? 70 :
    dbStatus === "complete" ? 100 :
    dbStatus === "failed" ? 0 : 5;

  const isFailed = dbStatus === "failed";

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
              <div className="min-w-0">
                <span className={`text-sm font-medium ${status === "pending" ? "text-muted-foreground" : status === "failed" ? "text-destructive" : ""}`}>
                  {phase.label}
                </span>
                {status === "running" && phase.detail && (
                  <p className="text-xs text-muted-foreground mt-0.5">{phase.detail}</p>
                )}
                {status === "failed" && dbError && (
                  <p className="text-xs text-destructive mt-0.5">{dbError}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Status footer */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-2">
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

      {/* Actions */}
      {showDashboardLink && onGoToDashboard && (
        <Button variant="outline" onClick={onGoToDashboard} className="mt-2">
          Go to dashboard
        </Button>
      )}
    </div>
  );
}
