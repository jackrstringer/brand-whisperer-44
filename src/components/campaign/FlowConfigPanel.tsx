import { useState, useEffect, useMemo } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  ShoppingCart,
  Mail,
  Zap,
  CircleDot,
  ChevronsUpDown,
  Check,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { FlowConfig } from "@/lib/types";

interface TriggerMetric {
  metric_id: string;
  metric_name: string;
  description: string;
  integration_name: string | null;
  integration_category: string | null;
  priority: number;
  is_recommended: boolean;
  has_real_data: boolean;
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
  { key: "best_sellers", label: "Best Sellers", description: "Products with the most orders in the last 30 days" },
  { key: "trending", label: "Trending Now", description: "Most viewed products in the last 7 days" },
  { key: "most_viewed", label: "Most Viewed", description: "Most viewed products in the last 30 days" },
  { key: "popular_checkouts", label: "Popular Picks", description: "Products most frequently added to checkout in the last 30 days" },
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

/** Map integration source name to a Lucide icon */
function IntegrationIcon({ name, className = "w-4 h-4" }: { name: string | null; className?: string }) {
  const n = (name || "").toLowerCase();
  if (n.includes("shopify")) return <ShoppingCart className={className} />;
  if (n.includes("recharge")) return <RefreshCw className={className} />;
  if (n.includes("stripe") || n.includes("payment")) return <CreditCard className={className} />;
  if (n.includes("klaviyo")) return <Mail className={className} />;
  if (n.includes("api") || n.includes("custom") || n.includes("webhook")) return <Zap className={className} />;
  if (n) return <CircleDot className={className} />;
  return <CircleDot className={className} />;
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
  const [productCount, setProductCount] = useState<number | null>(null);
  const [syncingProducts, setSyncingProducts] = useState(false);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [fetchingEvent, setFetchingEvent] = useState(false);

  useEffect(() => {
    fetchSchema();
    checkProductStore();
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
        handleSelectMetric(best, false);
      }

      if (data.connected) {
        triggerProductSync(false);
      }
    } catch (err) {
      console.error("Failed to fetch schema:", err);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const checkProductStore = async () => {
    const { count } = await supabase
      .from("klaviyo_product_store")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId)
      .eq("is_junk", false);
    setProductCount(count ?? 0);
  };

  const triggerProductSync = async (force: boolean) => {
    setSyncingProducts(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/klaviyo-fetch-products`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            brandId,
            presetKey: flowConfig.selected_product_preset || "best_sellers",
            slotCount: 8,
            forceSync: force,
          }),
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data.syncPerformed) {
          await checkProductStore();
          if (data.products?.length > 0) {
            toast.success(`Synced ${data.products.length} products from Klaviyo`);
          } else if (data.error) {
            toast.error(data.error);
          }
        }
        if (data.syncErrors?.length > 0) {
          console.warn("[FlowConfigPanel] Sync errors:", data.syncErrors);
        }
      }
    } catch (err) {
      console.error("Product sync failed:", err);
    } finally {
      setSyncingProducts(false);
    }
  };

  /** Select a metric and lazy-fetch its event data */
  const handleSelectMetric = async (metric: TriggerMetric, fetchEvent = true) => {
    const newFlowType =
      !flowConfig.flow_type ||
      flowConfig.flow_type === TRIGGER_PREFILLS[flowConfig.trigger_metric_name || ""]
        ? TRIGGER_PREFILLS[metric.metric_name] || ""
        : flowConfig.flow_type;

    onConfigChange({
      ...flowConfig,
      trigger_metric_id: metric.metric_id,
      trigger_metric_name: metric.metric_name,
      flow_type: newFlowType,
      selected_product_preset: flowConfig.selected_product_preset || "best_sellers",
    });

    setTriggerOpen(false);

    if (!fetchEvent) return;

    // Lazy fetch event data for this metric
    setFetchingEvent(true);
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
          body: JSON.stringify({ brandId, fetchEventFor: metric.metric_id }),
        }
      );
      if (resp.ok) {
        const eventData = await resp.json();
        onConfigChange({
          ...flowConfig,
          trigger_metric_id: metric.metric_id,
          trigger_metric_name: metric.metric_name,
          event_schema: eventData.sample_payload,
          liquid_variables: eventData.liquid_variables,
          flow_type: newFlowType,
          selected_product_preset: flowConfig.selected_product_preset || "best_sellers",
        });
      }
    } catch (err) {
      console.error("Failed to fetch event data:", err);
      toast.error("Failed to load event schema for this trigger");
    } finally {
      setFetchingEvent(false);
    }
  };

  const handlePresetChange = (value: string) => {
    onConfigChange({ ...flowConfig, selected_product_preset: value });
  };

  const selectedMetric = useMemo(
    () => metrics.find((m) => m.metric_id === flowConfig.trigger_metric_id),
    [metrics, flowConfig.trigger_metric_id]
  );

  const selectedPreset = FEED_PRESETS.find(
    (p) => p.key === (flowConfig.selected_product_preset || "best_sellers")
  );

  const recommendedMetrics = useMemo(() => metrics.filter((m) => m.is_recommended), [metrics]);
  const otherMetrics = useMemo(() => metrics.filter((m) => !m.is_recommended), [metrics]);

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
          <Popover open={triggerOpen} onOpenChange={setTriggerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={triggerOpen}
                className="w-full justify-between bg-card border-border h-auto py-2.5 px-3"
              >
                {selectedMetric ? (
                  <div className="flex items-center gap-2 text-left">
                    <IntegrationIcon name={selectedMetric.integration_name} className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">{selectedMetric.metric_name}</span>
                    {selectedMetric.is_recommended && (
                      <Badge className="text-[9px] bg-primary/20 text-primary shrink-0">Recommended</Badge>
                    )}
                    {fetchingEvent && <Loader2 className="w-3 h-3 animate-spin shrink-0 text-muted-foreground" />}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Choose a trigger metric...</span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search metrics..." />
                <CommandList>
                  <CommandEmpty>No metrics found.</CommandEmpty>
                  {recommendedMetrics.length > 0 && (
                    <CommandGroup heading="Recommended">
                      {recommendedMetrics.map((metric) => (
                        <CommandItem
                          key={metric.metric_id}
                          value={metric.metric_name}
                          onSelect={() => handleSelectMetric(metric)}
                          className="flex items-center gap-2 py-2"
                        >
                          <IntegrationIcon name={metric.integration_name} className="w-4 h-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{metric.metric_name}</span>
                          {metric.integration_name && (
                            <span className="text-[10px] text-muted-foreground/70 shrink-0">{metric.integration_name}</span>
                          )}
                          {flowConfig.trigger_metric_id === metric.metric_id && (
                            <Check className="w-3.5 h-3.5 shrink-0 text-primary" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {otherMetrics.length > 0 && (
                    <CommandGroup heading="All Metrics">
                      {otherMetrics.map((metric) => (
                        <CommandItem
                          key={metric.metric_id}
                          value={metric.metric_name}
                          onSelect={() => handleSelectMetric(metric)}
                          className="flex items-center gap-2 py-2"
                        >
                          <IntegrationIcon name={metric.integration_name} className="w-4 h-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{metric.metric_name}</span>
                          {metric.integration_name && (
                            <span className="text-[10px] text-muted-foreground/70 shrink-0">{metric.integration_name}</span>
                          )}
                          {flowConfig.trigger_metric_id === metric.metric_id && (
                            <Check className="w-3.5 h-3.5 shrink-0 text-primary" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
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
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground">
            Product Grid Preset
          </label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => triggerProductSync(true)}
            disabled={syncingProducts}
          >
            {syncingProducts ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            {syncingProducts ? "Syncing..." : "Refresh"}
          </Button>
        </div>
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
          {selectedPreset?.description || "Controls which products appear in recommendation grids."}
        </p>
        {productCount !== null && productCount > 0 && (
          <p className="text-[10px] text-muted-foreground/70">
            {productCount} products in store
          </p>
        )}
        {productCount === 0 && connected && !syncingProducts && (
          <p className="text-[10px] text-amber-500">
            No products found yet. Click Refresh to sync from Klaviyo event data.
          </p>
        )}
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
