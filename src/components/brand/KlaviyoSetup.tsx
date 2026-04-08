import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCampaignReport } from "@/hooks/useCampaignReport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Loader2, Check, RefreshCw, Unplug, Eye, EyeOff, ChevronDown,
  BarChart3, Trophy, Type, Brain, Users, Mail, DollarSign, AlertCircle, RotateCcw, ExternalLink,
  ShoppingCart, Zap, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Props {
  brandId: string;
}

type ConnectStep = {
  label: string;
  status: "pending" | "active" | "done" | "error";
  error?: string;
};

type QuickStats = {
  active_profiles: number | null;
  campaigns_last_30d: number | null;
  total_store_revenue: number | null;
  email_revenue: number | null;
  campaign_revenue: number | null;
  flow_revenue: number | null;
  revenue_last_30d: number | null;
  fetched_at: string;
};

type QuickStatsErrors = {
  active_profiles: string | null;
  campaigns_last_30d: string | null;
  campaign_revenue: string | null;
  flow_revenue: string | null;
  total_store_revenue: string | null;
};

type SyncStatus = "pending" | "syncing" | "analyzing" | "compiling" | "complete" | "failed";

const SYNC_PROGRESS: Record<SyncStatus, number> = {
  pending: 0,
  syncing: 40,
  analyzing: 70,
  compiling: 85,
  complete: 100,
  failed: 0,
};

const SYNC_STEPS: { status: SyncStatus; label: string }[] = [
  { status: "syncing", label: "Fetching 30 days of campaigns..." },
  { status: "analyzing", label: "Analyzing performance data..." },
  { status: "compiling", label: "Building AI context..." },
];

const STALL_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

export default function KlaviyoSetup({ brandId }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectSteps, setConnectSteps] = useState<ConnectStep[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshingStats, setRefreshingStats] = useState(false);

  const [accountName, setAccountName] = useState("");
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [statsErrors, setStatsErrors] = useState<QuickStatsErrors | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("pending");
  const [syncError, setSyncError] = useState<string | null>(null);

  const [report, setReport] = useState<any>(null);
  const [compiled, setCompiled] = useState<string | null>(null);

  // Animated progress for "syncing" state
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track when sync_status last changed for stall detection
  const lastStatusChangeRef = useRef<number>(Date.now());
  const lastStatusRef = useRef<SyncStatus>("pending");
  const [showStallWarning, setShowStallWarning] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (animRef.current) clearInterval(animRef.current);
    };
  }, []);

  useEffect(() => {
    checkConnection();
  }, [brandId]);

  // Animate the progress bar smoothly between status ticks
  useEffect(() => {
    if (animRef.current) clearInterval(animRef.current);
    const target = SYNC_PROGRESS[syncStatus] || 0;

    if (syncStatus === "syncing" || syncStatus === "analyzing" || syncStatus === "compiling") {
      const ceiling = syncStatus === "syncing" ? 65 : syncStatus === "analyzing" ? 82 : 95;
      animRef.current = setInterval(() => {
        setAnimatedProgress(prev => {
          if (prev >= ceiling) return ceiling;
          return prev + 0.3;
        });
      }, 500);
    } else {
      setAnimatedProgress(target);
    }

    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, [syncStatus]);

  const checkConnection = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("klaviyo_connections")
        .select("*")
        .eq("brand_id", brandId)
        .maybeSingle();

      if (data) {
        setConnected(true);
        setAccountName((data as any).klaviyo_account_name || "Klaviyo Account");
        setSyncStatus(((data as any).sync_status || "pending") as SyncStatus);
        setSyncError((data as any).sync_error || null);

        const qs = (data as any).quick_stats as QuickStats | null;
        if (qs && qs.fetched_at) setQuickStats(qs);

        await fetchIntelligence();

        const status = (data as any).sync_status;
        if (status === "syncing" || status === "analyzing" || status === "compiling" || status === "pending") {
          startPolling();
        }
      } else {
        setConnected(false);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const fetchIntelligence = async () => {
    try {
      const { data } = await supabase
        .from("brand_intelligence")
        .select("klaviyo_report, klaviyo_compiled")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (data) {
        setReport(data.klaviyo_report);
        setCompiled(data.klaviyo_compiled);
      }
    } catch {}
  };

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    lastStatusChangeRef.current = Date.now();
    lastStatusRef.current = syncStatus;
    setShowStallWarning(false);

    pollRef.current = setInterval(async () => {
      const { data: conn } = await supabase
        .from("klaviyo_connections")
        .select("sync_status, sync_error, quick_stats")
        .eq("brand_id", brandId)
        .maybeSingle();

      if (!conn) return;
      const status = ((conn as any).sync_status || "pending") as SyncStatus;

      // Track status changes for stall detection
      if (status !== lastStatusRef.current) {
        lastStatusRef.current = status;
        lastStatusChangeRef.current = Date.now();
        setShowStallWarning(false);
      } else if (
        (status === "syncing" || status === "analyzing" || status === "compiling") &&
        Date.now() - lastStatusChangeRef.current > STALL_THRESHOLD_MS
      ) {
        setShowStallWarning(true);
      }

      setSyncStatus(status);
      setSyncError((conn as any).sync_error || null);

      const qs = (conn as any).quick_stats as QuickStats | null;
      if (qs && qs.fetched_at) setQuickStats(qs);

      if (status === "complete") {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setShowStallWarning(false);
        await fetchIntelligence();
        toast.success("Performance analysis complete!");
      } else if (status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setShowStallWarning(false);
      }
    }, 5000);
  }, [brandId, syncStatus]);

  const connect = async () => {
    if (!apiKey.trim()) return;
    setConnecting(true);
    setConnectSteps([
      { label: "Validating API key...", status: "active" },
      { label: "Fetching account data...", status: "pending" },
      { label: "Starting deep analysis...", status: "pending" },
    ]);

    try {
      // Step 1: Validate
      const { data: valData, error: valError } = await supabase.functions.invoke("klaviyo-proxy", {
        body: { action: "validate-key", brandId, apiKey: apiKey.trim() },
      });
      if (valError || valData?.error) {
        setConnectSteps(prev => prev.map((s, i) => i === 0 ? { ...s, status: "error", error: valData?.error || valError?.message } : s));
        throw new Error(valData?.error || valError?.message || "Validation failed");
      }
      setConnectSteps(prev => prev.map((s, i) => i === 0 ? { ...s, status: "done" } : i === 1 ? { ...s, status: "active" } : s));
      setAccountName(valData.accountName || "Klaviyo Account");

      // Step 2: Quick stats
      const { data: statsData, error: statsError } = await supabase.functions.invoke("klaviyo-quick-stats", {
        body: { brandId, apiKey: apiKey.trim() },
      });
      if (statsError || statsData?.error) {
        setConnectSteps(prev => prev.map((s, i) => i === 1 ? { ...s, status: "error", error: statsData?.error || statsError?.message } : s));
        // Non-blocking
      } else {
        const stats = statsData.stats as QuickStats;
        const errs = statsData.errors as QuickStatsErrors | undefined;
        setQuickStats(stats);
        if (errs) setStatsErrors(errs);

        // Step 2 is only "done" if at least one stat is non-null
        const hasAnyValue = stats.active_profiles != null || stats.campaigns_last_30d != null || stats.email_revenue != null;
        if (hasAnyValue) {
          setConnectSteps(prev => prev.map((s, i) => i === 1 ? { ...s, status: "done" } : i === 2 ? { ...s, status: "active" } : s));
        } else {
          const firstError = errs?.active_profiles || errs?.campaigns_last_30d || errs?.campaign_revenue || "All stats returned null";
          setConnectSteps(prev => prev.map((s, i) => i === 1 ? { ...s, status: "error", error: firstError } : i === 2 ? { ...s, status: "active" } : s));
        }
      }

      // Step 3: Fire deep sync (async) — do NOT mark as done, leave as "active"
      supabase.functions.invoke("klaviyo-proxy", {
        body: { action: "sync-performance", brandId },
      }).catch(() => {});
      // Step 3 stays "active" — polling drives real progress

      setConnected(true);
      setApiKey("");
      setSyncStatus("syncing");
      startPolling();

      toast.success(`Connected to ${valData.accountName || "Klaviyo"}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConnecting(false);
    }
  };

  const refreshQuickStats = async () => {
    setRefreshingStats(true);
    try {
      const { data: conn } = await supabase
        .from("klaviyo_connections")
        .select("api_key")
        .eq("brand_id", brandId)
        .single();
      if (!conn?.api_key) throw new Error("No API key found");

      const { data, error } = await supabase.functions.invoke("klaviyo-quick-stats", {
        body: { brandId, apiKey: conn.api_key },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setQuickStats(data.stats);
      setStatsErrors(data.errors || null);
      toast.success("Stats refreshed");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRefreshingStats(false);
    }
  };

  const retrySyncPerformance = async () => {
    setSyncStatus("syncing");
    setSyncError(null);
    setShowStallWarning(false);
    try {
      const { error } = await supabase.functions.invoke("klaviyo-proxy", {
        body: { action: "sync-performance", brandId },
      });
      if (error) throw error;
      startPolling();
    } catch (e: any) {
      toast.error(e.message);
      setSyncStatus("failed");
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("klaviyo-proxy", {
        body: { action: "disconnect", brandId },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setConnected(false);
      setQuickStats(null);
      setStatsErrors(null);
      setReport(null);
      setCompiled(null);
      setSyncStatus("pending");
      setShowStallWarning(false);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      toast.success("Klaviyo disconnected");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  // ─── Connection Flow ───
  if (!connected) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Connect your Klaviyo account to push campaigns directly and pull performance intelligence.
          You'll need a <strong>Private API Key</strong> from your Klaviyo account settings.
        </p>
        <div className="space-y-2">
          <Label>Klaviyo Private API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="pk_..."
                className="pr-10"
                disabled={connecting}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button onClick={connect} disabled={!apiKey.trim() || connecting}>
              {connecting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Connect & Sync
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Find this in Klaviyo → Settings → API Keys → Create Private API Key with Campaigns and Metrics read access.
          </p>
        </div>

        {connectSteps.length > 0 && (
          <div className="space-y-2 pt-2">
            {connectSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm">
                {step.status === "done" && <Check className="w-4 h-4 text-foreground shrink-0" />}
                {step.status === "active" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
                {step.status === "pending" && <div className="w-4 h-4 rounded-full border border-border shrink-0" />}
                {step.status === "error" && <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}
                <span className={step.status === "error" ? "text-destructive" : step.status === "pending" ? "text-muted-foreground" : "text-foreground"}>
                  {step.label}
                </span>
                {step.status === "error" && step.error && (
                  <span className="text-xs text-destructive ml-1">— {step.error}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Connected State ───
  const summary = report?.summary;
  const topPerformers = report?.top_performers;
  const subjectIntel = report?.subject_line_intelligence;

  const currentProgress = syncStatus === "complete" ? 100 : syncStatus === "failed" ? 0 : Math.max(animatedProgress, SYNC_PROGRESS[syncStatus]);
  const syncInProgress = ["pending", "syncing", "analyzing", "compiling"].includes(syncStatus);

  const getSyncStepStatus = (stepStatus: SyncStatus) => {
    const order: SyncStatus[] = ["syncing", "analyzing", "compiling", "complete"];
    const currentIdx = order.indexOf(syncStatus);
    const stepIdx = order.indexOf(stepStatus);
    if (syncStatus === "failed") return "error";
    if (syncStatus === "complete" || stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "active";
    return "pending";
  };

  return (
    <div className="space-y-5">
      {/* Connection Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge>
            <span className="w-[5px] h-[5px] rounded-full bg-foreground mr-1.5 inline-block" /> Connected
          </Badge>
          <span className="text-sm font-medium">{accountName}</span>
        </div>
        <Button variant="outline" size="sm" onClick={disconnect} disabled={disconnecting} className="text-destructive hover:text-destructive">
          <Unplug className="w-3.5 h-3.5 mr-1.5" />
          Disconnect
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="rounded-lg border border-border bg-card">
        {/* Top row: Profiles + Campaigns */}
        <div className="grid grid-cols-2 divide-x divide-border">
          <StatCell
            icon={<Users className="w-4 h-4 text-muted-foreground" />}
            label="Active Profiles"
            value={quickStats?.active_profiles}
            format="number"
            loading={!quickStats}
            error={statsErrors?.active_profiles}
          />
          <StatCell
            icon={<Mail className="w-4 h-4 text-muted-foreground" />}
            label="Campaigns Sent"
            sublabel="last 30d"
            value={quickStats?.campaigns_last_30d}
            format="number"
            loading={!quickStats}
            error={statsErrors?.campaigns_last_30d}
          />
        </div>
        {/* Revenue row */}
        <div className="grid grid-cols-4 divide-x divide-border border-t border-border">
          <StatCell
            icon={<ShoppingCart className="w-4 h-4 text-muted-foreground" />}
            label="Total Store"
            sublabel="last 30d"
            value={quickStats?.total_store_revenue}
            format="currency"
            loading={!quickStats}
            error={statsErrors?.total_store_revenue}
          />
          <StatCell
            icon={<TrendingUp className="w-4 h-4 text-muted-foreground" />}
            label="Email Revenue"
            sublabel="last 30d"
            value={quickStats?.email_revenue}
            format="currency"
            loading={!quickStats}
            error={statsErrors?.campaign_revenue || statsErrors?.flow_revenue}
          />
          <StatCell
            icon={<Mail className="w-4 h-4 text-muted-foreground" />}
            label="Campaigns"
            sublabel="last 30d"
            value={quickStats?.campaign_revenue}
            format="currency"
            loading={!quickStats}
            error={statsErrors?.campaign_revenue}
          />
          <StatCell
            icon={<Zap className="w-4 h-4 text-muted-foreground" />}
            label="Flows"
            sublabel="last 30d"
            value={quickStats?.flow_revenue}
            format="currency"
            loading={!quickStats}
            error={statsErrors?.flow_revenue}
          />
        </div>
        <div className="flex items-center justify-end px-3 py-1.5 border-t border-border">
          <Button variant="ghost" size="sm" onClick={refreshQuickStats} disabled={refreshingStats} className="h-6 text-[11px] text-muted-foreground hover:text-foreground px-2">
            <RefreshCw className={`w-3 h-3 mr-1 ${refreshingStats ? "animate-spin" : ""}`} />
            Refresh Stats
          </Button>
        </div>
      </div>

      {/* Campaign Report Row */}
      <CampaignReportRow brandId={brandId} klaviyoSynced={syncStatus === "complete"} />

      {/* Deep Analysis Progress / Complete */}
      <div className="rounded-lg border border-border bg-card p-4">
        {syncStatus === "complete" && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Check className="w-4 h-4 text-foreground" />
              <span className="font-medium">Analysis complete</span>
              {quickStats?.fetched_at && (
                <span className="text-muted-foreground">· Last updated {formatDistanceToNow(new Date(quickStats.fetched_at), { addSuffix: true })}</span>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={retrySyncPerformance} className="h-7 text-xs">
              <RefreshCw className="w-3 h-3 mr-1" />
              Re-analyze
            </Button>
          </div>
        )}

        {syncStatus === "failed" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              <span className="font-medium">Analysis failed</span>
            </div>
            {syncError && <p className="text-xs text-destructive/80">{syncError}</p>}
            <Button variant="outline" size="sm" onClick={retrySyncPerformance}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        )}

        {syncInProgress && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Campaign Performance Analysis</span>
              <span className="text-muted-foreground text-xs">{Math.round(currentProgress)}%</span>
            </div>
            <Progress value={currentProgress} className="h-1.5" />
            <div className="space-y-1.5">
              {SYNC_STEPS.map((step, i) => {
                const stepState = getSyncStepStatus(step.status);
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {stepState === "done" && <Check className="w-3 h-3 text-foreground shrink-0" />}
                    {stepState === "active" && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />}
                    {stepState === "pending" && <div className="w-3 h-3 rounded-full border border-border shrink-0" />}
                    {stepState === "error" && <AlertCircle className="w-3 h-3 text-destructive shrink-0" />}
                    <span className={stepState === "active" ? "text-foreground" : "text-muted-foreground"}>
                      {step.label}
                    </span>
                    {stepState === "done" && <span className="text-muted-foreground">✓ done</span>}
                    {stepState === "active" && <span className="text-muted-foreground">⟳ in progress</span>}
                  </div>
                );
              })}
            </div>
            {showStallWarning ? (
              <p className="text-[11px] text-amber-600">
                This is taking longer than expected — the analysis is running in the background and may take up to 10 minutes for large accounts.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Usually takes 3–5 minutes. You can close this page — we'll keep working in the background.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Performance Summary */}
      {summary && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-3 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium flex-1">Performance Summary</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 p-4 rounded-lg bg-card border border-border space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Campaigns Sent:</span> <strong>{summary.total_campaigns_sent}</strong></div>
              <div><span className="text-muted-foreground">Avg Open Rate:</span> <strong>{(summary.avg_open_rate * 100).toFixed(1)}%</strong></div>
              <div><span className="text-muted-foreground">Avg Click Rate:</span> <strong>{(summary.avg_click_rate * 100).toFixed(1)}%</strong></div>
              <div><span className="text-muted-foreground">Avg RPR:</span> <strong>${summary.avg_revenue_per_recipient?.toFixed(2)}</strong></div>
              <div><span className="text-muted-foreground">Total Revenue:</span> <strong>${summary.total_revenue_attributed?.toLocaleString()}</strong></div>
              <div><span className="text-muted-foreground">Frequency:</span> <strong>{summary.sending_frequency}</strong></div>
            </div>
            {summary.best_sending_days?.length > 0 && (
              <p className="text-xs text-muted-foreground">Best days: {summary.best_sending_days.join(", ")}</p>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Top Performers */}
      {topPerformers && topPerformers.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-3 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors">
            <Trophy className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium flex-1">Top Performing Campaigns</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {topPerformers.map((c: any, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-card border border-border">
                <p className="text-sm font-medium">{c.campaign_name}</p>
                <p className="text-xs text-muted-foreground mt-1">Subject: {c.subject_line}</p>
                <div className="flex gap-4 mt-2 text-xs">
                  <span>Open: <strong>{(c.open_rate * 100).toFixed(1)}%</strong></span>
                  <span>Click: <strong>{(c.click_rate * 100).toFixed(1)}%</strong></span>
                  <span>RPR: <strong>${c.revenue_per_recipient?.toFixed(2)}</strong></span>
                </div>
                {c.why_it_likely_worked && (
                  <p className="text-xs text-muted-foreground mt-1 italic">{c.why_it_likely_worked}</p>
                )}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Subject Line Intelligence */}
      {subjectIntel && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-3 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors">
            <Type className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium flex-1">Subject Line Intelligence</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 p-4 rounded-lg bg-card border border-border space-y-3 text-sm">
            {subjectIntel.common_patterns_that_work?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Patterns that work:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  {subjectIntel.common_patterns_that_work.map((p: string, i: number) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}
            {subjectIntel.common_patterns_that_flop?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Patterns that flop:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  {subjectIntel.common_patterns_that_flop.map((p: string, i: number) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}
            {subjectIntel.best_subject_line_examples?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground font-medium mb-1">Best examples:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  {subjectIntel.best_subject_line_examples.map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {subjectIntel.emoji_usage && <p className="text-xs"><span className="text-muted-foreground">Emoji usage:</span> {subjectIntel.emoji_usage}</p>}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* AI Context Preview */}
      {compiled && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-3 rounded-lg bg-card border border-border hover:bg-accent/50 transition-colors">
            <Brain className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium flex-1">AI Context Preview</span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 p-4 rounded-lg bg-card border border-border">
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{compiled}</p>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// ─── Campaign Report Row ───
function CampaignReportRow({ brandId, klaviyoSynced }: { brandId: string; klaviyoSynced: boolean }) {
  const navigate = useNavigate();
  const { status: reportStatus, generatedAt, isLoading: reportLoading, generateReport } = useCampaignReport(brandId);

  if (!klaviyoSynced) return null;

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between">
      {reportStatus === "complete" && generatedAt && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span>📊</span>
            <span>
              Performance Analysis ready · Generated{" "}
              {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(`/brands/${brandId}/report`)}>
            View Report →
          </Button>
        </>
      )}

      {reportStatus === "generating" && (
        <div className="flex items-center gap-2 text-sm">
          <span>📊</span>
          <span>Building performance analysis...</span>
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        </div>
      )}

      {(reportStatus === "pending" || reportStatus === null) && (
        <div className="flex items-center justify-between w-full">
          <span className="text-sm text-muted-foreground">📊 Performance Analysis not yet generated</span>
          <Button variant="outline" size="sm" onClick={generateReport} disabled={reportLoading}>
            {reportLoading ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Generating...</>
            ) : (
              "Generate Performance Analysis"
            )}
          </Button>
        </div>
      )}

      {reportStatus === "failed" && (
        <div className="flex items-center justify-between w-full">
          <span className="text-sm text-destructive">Report generation failed</span>
          <Button variant="outline" size="sm" onClick={generateReport} disabled={reportLoading}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── StatCell Sub-component ───
function StatCell({ icon, label, sublabel, value, format, loading, error }: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  value: number | null | undefined;
  format: "number" | "currency";
  loading: boolean;
  error?: string | null;
}) {
  const formatted = value != null
    ? format === "currency"
      ? `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : value.toLocaleString()
    : null;

  return (
    <div className="p-4 text-center">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-20 mx-auto" />
      ) : formatted !== null ? (
        <p className="text-xl font-semibold">{formatted}</p>
      ) : error ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-center gap-1 cursor-help">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">Error</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[250px]">
              <p className="text-xs">{error}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <p className="text-xl font-semibold text-muted-foreground">—</p>
      )}
      {sublabel && <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>}
    </div>
  );
}
