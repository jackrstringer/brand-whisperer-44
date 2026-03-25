import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, RefreshCw, Unplug, Eye, EyeOff } from "lucide-react";
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
  const [disconnecting, setDisconnecting] = useState(false);
  const [stats, setStats] = useState<{ lists: number; segments: number; lastSynced: string | null }>({ lists: 0, segments: 0, lastSynced: null });

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
      } else {
        setConnected(false);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const connect = async () => {
    if (!apiKey.trim()) return;
    setConnecting(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const { data, error } = await supabase.functions.invoke("klaviyo-proxy", {
        body: { action: "validate-key", brandId, apiKey: apiKey.trim() },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Connection failed");
      toast.success(`Connected to Klaviyo (${data.listCount} lists found)`);
      setConnected(true);
      setApiKey("");
      await syncData();
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

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("klaviyo-proxy", {
        body: { action: "disconnect", brandId },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setConnected(false);
      setStats({ lists: 0, segments: 0, lastSynced: null });
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
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            <Check className="w-3 h-3 mr-1" /> Connected
          </Badge>
          {stats.lastSynced && (
            <span className="text-xs text-muted-foreground">
              Last synced: {new Date(stats.lastSynced).toLocaleDateString()}
            </span>
          )}
        </div>

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

        <div className="flex gap-2">
          <Button variant="outline" onClick={syncData} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            Sync Lists & Segments
          </Button>
          <Button variant="outline" onClick={disconnect} disabled={disconnecting} className="text-destructive hover:text-destructive">
            <Unplug className="w-4 h-4 mr-1.5" />
            Disconnect
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground mb-4">
          Connect your Klaviyo account to push campaigns directly as templates or live campaigns.
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
            Connect
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Find this in Klaviyo → Settings → API Keys → Create Private API Key (Full Access)
        </p>
      </div>
    </div>
  );
}
