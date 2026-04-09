import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight, Package, MapPin, User, ShoppingCart } from "lucide-react";
import type { FlowConfig } from "@/lib/types";

interface PreviewEvent {
  event_id: string;
  datetime: string;
  profile_email: string;
  profile_name: string;
  order_value: number;
  event_properties: any;
}

interface FlowDetailsPanelProps {
  brandId: string;
  campaignId: string;
  html: string | null;
  flowConfig: FlowConfig | null | undefined;
  onPreviewHtml: (html: string | null) => void;
}

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

function formatCurrency(val: any): string {
  const n = parseFloat(val);
  if (isNaN(n)) return String(val ?? "");
  return `$${n.toFixed(2)}`;
}

function formatAddress(addr: any): string {
  if (!addr || typeof addr !== "object") return "";
  const parts = [
    [addr.first_name, addr.last_name].filter(Boolean).join(" "),
    addr.address1,
    addr.address2,
    [addr.city, addr.province_code, addr.zip].filter(Boolean).join(", "),
    addr.country,
  ].filter(Boolean);
  return parts.join("\n");
}

/* ── Event Summary Card ────────────────────────────────── */
function EventSummaryCard({ event }: { event: PreviewEvent }) {
  const props = event.event_properties || {};
  const extra = props.extra || props.$extra || {};
  const lineItems: any[] = extra.line_items || props.Items || [];
  const shipping = extra.shipping_address || {};
  const orderNumber = extra.order_number || extra.name || props.OrderId || "";
  const orderDate = extra.created_at || event.datetime;
  const total = extra.total_price || props.value || props.$value || event.order_value;

  return (
    <div className="space-y-3 text-[11px]">
      {/* Customer */}
      <div className="flex items-start gap-2">
        <User className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <div className="font-medium text-foreground">{event.profile_name || "Unknown"}</div>
          <div className="text-muted-foreground">{event.profile_email}</div>
        </div>
      </div>

      {/* Order info */}
      <div className="flex items-start gap-2">
        <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="flex justify-between">
            <span className="font-medium text-foreground">
              {orderNumber ? `Order #${String(orderNumber).replace("#", "")}` : "Order"}
            </span>
            <span className="text-muted-foreground">{formatCurrency(total)}</span>
          </div>
          {orderDate && (
            <div className="text-muted-foreground">{new Date(orderDate).toLocaleDateString()}</div>
          )}
        </div>
      </div>

      {/* Line items */}
      {lineItems.length > 0 && (
        <div className="flex items-start gap-2">
          <Package className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1">
            {lineItems.slice(0, 5).map((item: any, i: number) => (
              <div key={i} className="flex justify-between gap-2">
                <span className="text-foreground truncate">
                  {item.name || item.ProductName || "Item"}{" "}
                  {(item.quantity ?? 1) > 1 && <span className="text-muted-foreground">×{item.quantity}</span>}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {formatCurrency(item.price || item.ItemPrice)}
                </span>
              </div>
            ))}
            {lineItems.length > 5 && (
              <div className="text-muted-foreground">+{lineItems.length - 5} more items</div>
            )}
          </div>
        </div>
      )}

      {/* Shipping */}
      {shipping.address1 && (
        <div className="flex items-start gap-2">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-muted-foreground whitespace-pre-line">{formatAddress(shipping)}</div>
        </div>
      )}
    </div>
  );
}

/* ── Main Panel ────────────────────────────────────────── */
export default function FlowDetailsPanel({
  brandId,
  campaignId,
  html,
  flowConfig,
  onPreviewHtml,
}: FlowDetailsPanelProps) {
  const [previewEvents, setPreviewEvents] = useState<PreviewEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [renderingPreview, setRenderingPreview] = useState(false);
  const [autoLoaded, setAutoLoaded] = useState(false);
  const renderingRef = useRef(false);

  // Extract liquid variables from HTML
  const liquidVars = useMemo(() => {
    if (!html) return [];
    const vars: { variable: string; source: string; example: string }[] = [];
    const seen = new Set<string>();

    const varRegex = /\{\{\s*([^}|]+?)(?:\s*\|[^}]*)?\s*\}\}/g;
    let match;
    while ((match = varRegex.exec(html)) !== null) {
      const path = match[1].trim();
      if (seen.has(path)) continue;
      seen.add(path);

      let source = "Unknown";
      if (path.startsWith("event.")) source = "Klaviyo Event";
      else if (path.startsWith("person.")) source = "Profile";
      else if (path.startsWith("organization.")) source = "Organization";

      let example = "";
      if (flowConfig?.event_schema && path.startsWith("event.")) {
        const subPath = path.slice(6);
        const val = resolvePath(flowConfig.event_schema, subPath);
        if (val !== undefined) example = typeof val === "object" ? JSON.stringify(val).slice(0, 40) : String(val).slice(0, 40);
      } else if (path === "person.first_name") {
        example = "Sarah";
      } else if (path === "person.email") {
        example = "sarah@email.com";
      }

      vars.push({ variable: `{{ ${path} }}`, source, example });
    }

    const forRegex = /\{%\s*for\s+(\w+)\s+in\s+([^%]+?)\s*%\}/g;
    while ((match = forRegex.exec(html)) !== null) {
      const arrayPath = match[2].trim();
      if (seen.has(arrayPath)) continue;
      seen.add(arrayPath);
      let count = "";
      if (flowConfig?.event_schema) {
        const subPath = arrayPath.startsWith("event.") ? arrayPath.slice(6) : arrayPath;
        const arr = resolvePath(flowConfig.event_schema, subPath);
        if (Array.isArray(arr)) count = `${arr.length} items`;
      }
      vars.push({ variable: `{% for ${match[1]} in ${arrayPath} %}`, source: "Event Items Array", example: count || "Array" });
    }

    return vars;
  }, [html, flowConfig]);

  const loadPreviewEvents = useCallback(async (): Promise<PreviewEvent[]> => {
    if (!flowConfig?.trigger_metric_id) return [];
    setLoadingEvents(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/klaviyo-fetch-preview-events`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ brandId, metricId: flowConfig.trigger_metric_id }),
        }
      );
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      const events = Array.isArray(data) ? data : [];
      setPreviewEvents(events);
      return events;
    } catch (err) {
      console.error("Failed to load preview events:", err);
      return [];
    } finally {
      setLoadingEvents(false);
    }
  }, [brandId, flowConfig?.trigger_metric_id]);

  const renderPreview = useCallback(async (event: PreviewEvent) => {
    if (!html || renderingRef.current) return;
    renderingRef.current = true;
    setRenderingPreview(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/klaviyo-render-preview`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            html,
            event_properties: event.event_properties,
            profile_name: event.profile_name,
            profile_email: event.profile_email,
          }),
        }
      );
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      onPreviewHtml(data.rendered_html);
    } catch (err) {
      console.error("Failed to render preview:", err);
    } finally {
      setRenderingPreview(false);
      renderingRef.current = false;
    }
  }, [html, onPreviewHtml]);

  // Auto-load events and render first one when html + trigger_metric_id are available
  useEffect(() => {
    if (autoLoaded || !html || !flowConfig?.trigger_metric_id) return;
    setAutoLoaded(true);

    (async () => {
      const events = await loadPreviewEvents();
      if (events.length > 0) {
        setSelectedIndex(0);
        await renderPreview(events[0]);
      }
    })();
  }, [html, flowConfig?.trigger_metric_id, autoLoaded, loadPreviewEvents, renderPreview]);

  const goTo = useCallback(async (newIndex: number) => {
    if (newIndex < 0 || newIndex >= previewEvents.length) return;
    setSelectedIndex(newIndex);
    await renderPreview(previewEvents[newIndex]);
  }, [previewEvents, renderPreview]);

  const activeEvent = previewEvents[selectedIndex] || null;

  return (
    <div className="space-y-4 p-4 overflow-y-auto flex-1">
      {/* Connection status banner */}
      {flowConfig?.klaviyo_synced_at ? (
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-[11px] text-green-500">
          <CheckCircle className="w-3 h-3" />
          Klaviyo data live · Synced {relativeTime(flowConfig.klaviyo_synced_at)} · {flowConfig.trigger_metric_name}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-500">
          <AlertTriangle className="w-3 h-3" />
          Using standard schema — connect Klaviyo for live data
        </div>
      )}

      {/* Preview Navigator */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Preview Data</h3>

        {loadingEvents ? (
          <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading events…
          </div>
        ) : previewEvents.length === 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadPreviewEvents()}
            disabled={!flowConfig?.trigger_metric_id}
            className="w-full"
          >
            Load Recent Events
          </Button>
        ) : (
          <>
            {/* Arrow navigator */}
            <div className="flex items-center justify-between px-1">
              <button
                onClick={() => goTo(selectedIndex - 1)}
                disabled={selectedIndex === 0 || renderingPreview}
                className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[11px] text-muted-foreground">
                {renderingPreview ? (
                  <Loader2 className="w-3 h-3 animate-spin inline" />
                ) : (
                  `${selectedIndex + 1} of ${previewEvents.length}`
                )}
              </span>
              <button
                onClick={() => goTo(selectedIndex + 1)}
                disabled={selectedIndex === previewEvents.length - 1 || renderingPreview}
                className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Event summary card */}
            {activeEvent && (
              <div className="border border-border rounded-lg p-3 bg-card">
                <EventSummaryCard event={activeEvent} />
              </div>
            )}

            {/* Refresh */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadPreviewEvents()}
              disabled={loadingEvents}
              className="w-full text-xs"
            >
              Refresh Events
            </Button>
          </>
        )}
      </div>

      {/* Liquid Variables Table */}
      {liquidVars.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Dynamic Fields</h3>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-2.5 py-1.5 text-muted-foreground font-medium">Variable</th>
                  <th className="text-left px-2.5 py-1.5 text-muted-foreground font-medium">Source</th>
                  <th className="text-left px-2.5 py-1.5 text-muted-foreground font-medium">Example</th>
                </tr>
              </thead>
              <tbody>
                {liquidVars.map((v, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2.5 py-1.5 font-mono text-[10px] text-primary/80">{v.variable}</td>
                    <td className="px-2.5 py-1.5 text-muted-foreground">{v.source}</td>
                    <td className="px-2.5 py-1.5 text-muted-foreground truncate max-w-[120px]">{v.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function resolvePath(obj: any, path: string): any {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}
