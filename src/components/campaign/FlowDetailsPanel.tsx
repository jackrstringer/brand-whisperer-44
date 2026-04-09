import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, AlertTriangle, RotateCcw } from "lucide-react";
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

export default function FlowDetailsPanel({
  brandId,
  campaignId,
  html,
  flowConfig,
  onPreviewHtml,
}: FlowDetailsPanelProps) {
  const [previewEvents, setPreviewEvents] = useState<PreviewEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [renderingPreview, setRenderingPreview] = useState(false);
  

  // Extract liquid variables from HTML
  const liquidVars = useMemo(() => {
    if (!html) return [];
    const vars: { variable: string; source: string; example: string }[] = [];
    const seen = new Set<string>();

    // Match {{ event.X }}, {{ person.X }}, {{ organization.X }}
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

      // Try to get example value from flow_config
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

    // Match {% for item in event.Items %}
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

  const loadPreviewEvents = useCallback(async () => {
    if (!flowConfig?.trigger_metric_id) return;
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
      setPreviewEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load preview events:", err);
    } finally {
      setLoadingEvents(false);
    }
  }, [brandId, flowConfig?.trigger_metric_id]);

  const renderPreview = useCallback(async (event: PreviewEvent) => {
    if (!html) return;
    setRenderingPreview(true);
    setSelectedEventId(event.event_id);
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
    }
  }, [html, onPreviewHtml]);

  const revertPreview = useCallback(() => {
    onPreviewHtml(null);
    setSelectedEventId(null);
  }, [onPreviewHtml]);

  const selectedEvent = previewEvents.find(e => e.event_id === selectedEventId);

  return (
    <div className="space-y-5 p-4 overflow-y-auto flex-1">
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

      {/* Liquid Variables Table */}
      {liquidVars.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Dynamic Fields in This Email</h3>
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

      {/* Preview with Real Events */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Preview with Real Data</h3>

        {selectedEventId && selectedEvent && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-[11px]">
            <span className="text-primary font-medium">Previewing</span>
            <span className="text-muted-foreground truncate">
              {selectedEvent.event_properties?.OrderId || selectedEvent.profile_email}
            </span>
            <button
              onClick={revertPreview}
              className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
        )}

        {previewEvents.length === 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={loadPreviewEvents}
            disabled={loadingEvents || !flowConfig?.trigger_metric_id}
            className="w-full"
          >
            {loadingEvents ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin mr-1" /> Loading...
              </>
            ) : (
              "Load Recent Events"
            )}
          </Button>
        ) : (
          <div className="space-y-1">
            {previewEvents.map((event) => {
              const orderVal = event.order_value ? `$${event.order_value.toFixed(2)}` : "";
              const orderId = event.event_properties?.OrderId || "";
              return (
                <button
                  key={event.event_id}
                  onClick={() => renderPreview(event)}
                  disabled={renderingPreview}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors text-[11px] ${
                    selectedEventId === event.event_id
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {orderId || event.profile_email || "Event"}
                    </span>
                    <span className="text-muted-foreground">
                      {relativeTime(event.datetime)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                    {event.profile_email && <span>{event.profile_email}</span>}
                    {orderVal && <span>· {orderVal}</span>}
                  </div>
                </button>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              onClick={loadPreviewEvents}
              disabled={loadingEvents}
              className="w-full text-xs"
            >
              {loadingEvents ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh"}
            </Button>
          </div>
        )}
      </div>
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
