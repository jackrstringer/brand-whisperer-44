import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FLOW_TYPE_META } from "@/lib/flows/skeletonParser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Plus, Loader2, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface FlowRow {
  id: string;
  name: string;
  flow_type: string;
  status: string;
  updated_at: string;
}

export default function FlowsListPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [brandName, setBrandName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FlowRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("flows").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast({ title: "Failed to delete flow", description: error.message, variant: "destructive" });
      return;
    }
    setFlows((prev) => prev.filter((f) => f.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast({ title: "Flow deleted" });
  };

  useEffect(() => {
    if (!brandId) return;
    (async () => {
      const [{ data: flowData }, { data: brandData }] = await Promise.all([
        supabase
          .from("flows")
          .select("id, name, flow_type, status, updated_at")
          .eq("brand_id", brandId)
          .order("updated_at", { ascending: false }),
        supabase.from("brands").select("name").eq("id", brandId).maybeSingle(),
      ]);
      setFlows(flowData || []);
      setBrandName(brandData?.name || "");
      setLoading(false);
    })();
  }, [brandId]);

  const createFlow = async (flowType: string) => {
    if (!brandId || !user) return;
    setCreating(flowType);
    const meta = FLOW_TYPE_META[flowType];
    const { data, error } = await supabase
      .from("flows")
      .insert({
        brand_id: brandId,
        flow_type: flowType,
        name: `${meta.label} — ${brandName || "Brand"}`,
        status: "draft",
      })
      .select("id")
      .single();
    setCreating(null);
    if (error || !data) {
      toast({ title: "Failed to create flow", description: error?.message, variant: "destructive" });
      return;
    }
    navigate(`/brands/${brandId}/flows/${data.id}`);
  };

  const showEmpty = !loading && flows.length === 0;
  const showPickerView = showEmpty || showPicker;

  return (
    <div className="h-full overflow-y-auto p-8 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Flows</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-built Klaviyo email flow skeletons.
          </p>
        </div>
        {!showPickerView && (
          <Button onClick={() => setShowPicker(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Flow
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading flows…
        </div>
      )}

      {showPickerView && (
        <div>
          {showPicker && !showEmpty && (
            <Button variant="ghost" onClick={() => setShowPicker(false)} className="mb-4">
              ← Back to flows
            </Button>
          )}
          <h2 className="text-lg font-medium text-foreground mb-4">Choose a flow type</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(FLOW_TYPE_META).map(([key, meta]) => (
              <button
                key={key}
                disabled={creating !== null}
                onClick={() => createFlow(key)}
                className="text-left p-5 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-2 mb-2">
                  <GitBranch className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-foreground">{meta.label}</h3>
                  {creating === key && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{meta.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && !showPickerView && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {flows.map((f) => {
            const meta = FLOW_TYPE_META[f.flow_type];
            return (
              <div
                key={f.id}
                className="group relative text-left p-5 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all"
              >
                <button
                  onClick={() => navigate(`/brands/${brandId}/flows/${f.id}`)}
                  className="absolute inset-0 rounded-xl"
                  aria-label={`Open ${f.name}`}
                />
                <div className="relative pointer-events-none">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-semibold text-foreground line-clamp-2">{f.name}</h3>
                    <StatusBadge status={f.status} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      {meta?.label || f.flow_type}
                    </Badge>
                    <span>· Updated {new Date(f.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(f);
                  }}
                  className="absolute top-3 right-3 z-10 p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity"
                  aria-label="Delete flow"
                  title="Delete flow"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this flow?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" and all of its emails will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "Draft", cls: "bg-muted text-muted-foreground" },
    skeleton_ready: { label: "Skeleton Ready", cls: "bg-primary/15 text-primary" },
    generating: { label: "Generating", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
    complete: { label: "Complete", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  };
  const m = map[status] || map.draft;
  return <span className={`text-xs px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>;
}
