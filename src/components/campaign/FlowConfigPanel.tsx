import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import type { FlowConfig } from "@/lib/types";

interface TriggerMetric {
  metric_id: string;
  metric_name: string;
  description: string;
  priority: number;
  is_transactional: boolean;
  has_real_data: boolean;
  sample_payload: any;
  liquid_variables: string[];
}

interface FlowConfigPanelProps {
  brandId: string;
  flowConfig: FlowConfig;
  onConfigChange: (config: FlowConfig) => void;
  additionalNotes: string;
  onNotesChange: (notes: string) => void;
}

const TRIGGER_PREFILLS: Record<string, string> = {
  "Checkout Started": "Abandoned Cart — Step 1",
  "Started Checkout": "Abandoned Cart — Step 1",
  "Placed Order": "Order Confirmation",
  "Ordered Product": "Order Confirmation",
  "Fulfilled Order": "Shipping Confirmation",
  "Viewed Product": "Browse Abandonment — Step 1",
};

const FEED_PRESETS = [
  { key: "best_sellers", label: "Best Sellers" },
  { key: "trending", label: "Trending Now" },
  { key: "new_arrivals", label: "New Arrivals" },
  { key: "most_viewed", label: "Most Viewed" },
];

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function FlowConfigPanel({
  brandId,
  flowConfig,
  onConfigChange,
  additionalNotes,
  onNotesChange,
}: FlowConfigPanelProps) {
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<TriggerMetric[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string>("");

  useEffect(() => {
    fetchSchema();
  }, [brandId]);

  const fetchSchema = async () => {
    setLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/klaviyo-fetch-schema`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ brandId }),
        }
      );
      if (!resp.ok) throw new Error("Failed to fetch schema");
      const data = await resp.json();
      setConnected(data.connected);
      setMetrics(data.metrics || []);
      setSyncedAt(data.synced_at);
      setAccountName(data.account_name || "");

      if (!flowConfig.trigger_metric_id && data.metrics?.length > 0) {
        const best = data.metrics[0];
        onConfigChange({
          ...flowConfig,
          trigger_metric_id: best.metric_id,
          trigger_metric_name: best.metric_name,
          event_schema: best.sample_payload,
          liquid_variables: best.liquid_variables,
          klaviyo_synced_at: data.synced_at,
          flow_type:
            flowConfig.flow_type ||
            TRIGGER_PREFILLS[best.metric_name] ||
            "",
          selected_product_preset: flowConfig.selected_product_preset || "best_sellers",
        });
      }
    } catch (err) {
      console.error("Failed to fetch schema:", err);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const selectTrigger = (metric: TriggerMetric) => {
    const newFlowType =
      !flowConfig.flow_type ||
      flowConfig.flow_type ===
        TRIGGER_PREFILLS[flowConfig.trigger_metric_name || ""]
        ? TRIGGER_PREFILLS[metric.metric_name] || ""
        : flowConfig.flow_type;

    onConfigChange({
      ...flowConfig,
      trigger_metric_id: metric.metric_id,
      trigger_metric_name: metric.metric_name,
      event_schema: metric.sample_payload,
      liquid_variables: metric.liquid_variables,
      flow_type: newFlowType,
    });
  };

  const handlePresetChange = (value: string) => {
    onConfigChange({ ...flowConfig, selected_product_preset: value });
  };

  return (
    <div className="space-y-5">
      {/* Section 1: Trigger Selection */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Select Trigger</h3>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Fetching your Klaviyo triggers...
          </div>
        ) : (
          <div className="space-y-1.5">
            {metrics.map((metric, idx) => {
              const isSelected =
                flowConfig.trigger_metric_id === metric.metric_id;
              const isRecommended = idx === 0;
              return (
                <button
                  key={metric.metric_id}
                  onClick={() => selectTrigger(metric)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        metric.has_real_data
                          ? "bg-green-500"
                          : "bg-muted-foreground/40"
                      }`}
                    />
                    <span className="text-sm font-medium">
                      {metric.metric_name}
                    </span>
                    {isRecommended && (
                      <Badge className="text-[9px] bg-primary/20 text-primary ml-auto">
                        Recommended
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground ml-4 mt-0.5">
                    {metric.description}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {connected !== null && (
          <div
            className={`flex items-center gap-1.5 text-[11px] ${
              connected ? "text-green-500" : "text-amber-500"
            }`}
          >
            {connected ? (
              <>
                <CheckCircle className="w-3 h-3" />
                Connected to Klaviyo
                {accountName ? ` (${accountName})` : ""} · Last synced{" "}
                {relativeTime(syncedAt)}
              </>
            ) : (
              <>
                <AlertTriangle className="w-3 h-3" />
                No Klaviyo connection — using standard Shopify schemas
              </>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Flow Type Label */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">
          What is this email?
        </label>
        <Input
          value={flowConfig.flow_type || ""}
          onChange={(e) =>
            onConfigChange({ ...flowConfig, flow_type: e.target.value })
          }
          placeholder='e.g. "Order Confirmation", "Abandoned Cart — Step 1"'
          className="bg-card border-border"
        />
      </div>

      {/* Section 3: Product Preset Selector */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">
          Product Grid Preset
        </label>
        <Select
          value={flowConfig.selected_product_preset || "best_sellers"}
          onValueChange={handlePresetChange}
        >
          <SelectTrigger className="bg-card border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FEED_PRESETS.map((preset) => (
              <SelectItem key={preset.key} value={preset.key}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Controls which products appear in recommendation grids. Data is pulled live from your Klaviyo catalog.
        </p>
      </div>

      {/* Section 4: Additional Notes */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">
          Any specific instructions? (optional)
        </label>
        <Textarea
          value={additionalNotes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="e.g. Include a cross-sell block for our bestseller. Use an urgent tone for step 3."
          className="bg-card border-border min-h-[80px]"
        />
      </div>
    </div>
  );
}
