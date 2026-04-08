import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Check, RefreshCw, Unplug, Eye, EyeOff, ChevronDown, BarChart3, Trophy, Type, Brain } from "lucide-react";
import { toast } from "sonner";

interface Props {
  brandId: string;
}

export default function KlaviyoSetup({ brandId }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingPerformance, setSyncingPerformance] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [stats, setStats] = useState<{ lists: number; segments: number; lastSynced: string | null }>({ lists: 0, segments: 0, lastSynced: null });
  const [connectionInfo, setConnectionInfo] = useState<{ accountName: string; syncStatus: string; syncError: string | null; connectedAt: string | null }>({
    accountName: "", syncStatus: "pending", syncError: null, connectedAt: null,
  });
  const [report, setReport] = useState<any>(null);
  const [compiled, setCompiled] = useState<string | null>(null);

  useEffect(() => {
    checkConnection();
  }, [brandId]);

  const checkConnection = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from("klaviyo_connections").select("*").eq("brand_id", brandId).maybeSingle();
      if (data) {
        setConnected(true);
        setStats({
          lists: Array.isArray(data.cached_lists) ? (data.cached_lists as any[]).length : 0,
          segments: Array.isArray(data.cached_segments) ? (data.cached_segments as any[]).length : 0,
          lastSynced: data.last_synced_at,
        });
        setConnectionInfo({
          accountName: (data as any).klaviyo_account_name || "Klaviyo Account",
          syncStatus: (data as any).sync_status || "pending",
          syncError: (data as any).sync_error || null,
          connectedAt: (data as any).connected_at || null,
        });
        // Fetch intelligence data
        await fetchIntelligence();
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
        .select("klaviyo_report, klaviyo_compiled, klaviyo_last_synced_at")
        .eq("brand_id", brandId)
        .maybeSingle();
      if (data) {
        setReport(data.klaviyo_report);
        setCompiled(data.klaviyo_compiled);
      }
    } catch {}
  };

  const connect = async () => {
    if (!apiKey.trim()) return;
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("klaviyo-proxy", {
        body: { action: "validate-key", brandId, apiKey: apiKey.trim() },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Connection failed");
      toast.success(`Connected to ${data.accountName || "Klaviyo"} (${data.listCount} lists found). Performance sync started.`);
      setConnected(true);
      setApiKey("");
      setConnectionInfo(prev => ({ ...prev, accountName: data.accountName || "Klaviyo Account", syncStatus: "syncing" }));
      await checkConnection();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConnecting(false);
    }
  };

  const syncData = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("klaviyo-proxy", {
        body: { action: "sync", brandId },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setStats({
        lists: (data.lists || []).length,
        segments: (data.segments || []).length,
        lastSynced: new Date().toISOString(),
      });
      toast.success("Lists & segments synced");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const syncPerformance = async () => {
    setSyncingPerformance(true);
    try {
      const { data, error } = await supabase.functions.invoke("klaviyo-proxy", {
        body: { action: "sync-performance", brandId },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success("Performance data sync started. This may take a few minutes.");
      setConnectionInfo(prev => ({ ...prev, syncStatus: "syncing" }));
      // Poll for completion
      const pollInterval = setInterval(async () => {
        const { data: conn } = await supabase.from("klaviyo_connections").select("sync_status, sync_error").eq("brand_id", brandId).maybeSingle();
        if (conn && (conn as any).sync_status !== "syncing") {
          clearInterval(pollInterval);
          setConnectionInfo(prev => ({ ...prev, syncStatus: (conn as any).sync_status, syncError: (conn as any).sync_error }));
          setSyncingPerformance(false);
          if ((conn as any).sync_status === "complete") {
            toast.success("Performance data synced! Analysis running...");
            // Wait a bit for analysis to complete, then refresh
            setTimeout(() => fetchIntelligence(), 30000);
          } else {
            toast.error(`Sync failed: ${(conn as any).sync_error || "Unknown error"}`);
          }
        }
      }, 5000);
      // Safety timeout
      setTimeout(() => {
        clearInterval(pollInterval);
        setSyncingPerformance(false);
      }, 300000);
    } catch (e: any) {
      toast.error(e.message);
      setSyncingPerformance(false);
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
      setStats({ lists: 0, segments: 0, lastSynced: null });
      setReport(null);
      setCompiled(null);
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

  if (connected) {
    const summary = report?.summary;
    const topPerformers = report?.top_performers;
    const subjectIntel = report?.subject_line_intelligence;

    return (
      <div className="space-y-6">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              <Check className="w-3 h-3 mr-1" /> Connected
            </Badge>
            <span className="text-sm font-medium">{connectionInfo.accountName}</span>
          </div>
          <div className="flex items-center gap-2">
            {connectionInfo.syncStatus === "syncing" && (
              <Badge variant="outline" className="text-yellow-400 border-yellow-500/30">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Syncing...
              </Badge>
            )}
            {connectionInfo.syncStatus === "complete" && (
              <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                <Check className="w-3 h-3 mr-1" /> Synced
              </Badge>
            )}
            {connectionInfo.syncStatus === "failed" && (
              <Badge variant="outline" className="text-destructive border-destructive/30">
                Failed
              </Badge>
            )}
          </div>
        </div>

        {connectionInfo.syncError && (
          <p className="text-xs text-destructive">{connectionInfo.syncError}</p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-card border border-border">
            <p className="text-2xl font-semibold">{stats.lists}</p>
            <p className="text-xs text-muted-foreground mt-1">Lists</p>
          </div>
          <div className="p-4 rounded-lg bg-card border border-border">
            <p className="text-2xl font-semibold">{stats.segments}</p>
            <p className="text-xs text-muted-foreground mt-1">Segments</p>
          </div>
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

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={syncData} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            Sync Lists & Segments
          </Button>
          <Button variant="outline" onClick={syncPerformance} disabled={syncingPerformance}>
            <BarChart3 className={`w-4 h-4 mr-1.5`} />
            {syncingPerformance ? "Syncing..." : "Re-sync Performance Data"}
          </Button>
          <Button variant="outline" onClick={disconnect} disabled={disconnecting} className="text-destructive hover:text-destructive">
            <Unplug className="w-4 h-4 mr-1.5" />
            Disconnect
          </Button>
        </div>

        {stats.lastSynced && (
          <p className="text-xs text-muted-foreground">
            Lists last synced: {new Date(stats.lastSynced).toLocaleDateString()}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground mb-4">
          Connect your Klaviyo account to push campaigns directly and pull performance intelligence.
          You'll need a <strong>Private API Key</strong> from your Klaviyo account settings.
        </p>
      </div>
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
    </div>
  );
}
