import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, ArrowRight, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";
import type { Brand, Campaign } from "@/lib/types";
import { useAuth } from "@/hooks/useAuth";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  generating: "bg-yellow-500/20 text-yellow-400",
  ready: "bg-primary/20 text-primary",
  exported: "bg-blue-500/20 text-blue-400",
  error: "bg-destructive/20 text-destructive",
};

export default function CampaignsList() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  useEffect(() => {
    if (!brandId) return;
    const load = async () => {
      const { data: b } = await supabase.from("brands").select("*").eq("id", brandId).single();
      setBrand(b as Brand | null);
      const { data: c } = await supabase
        .from("campaigns")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });
      setCampaigns((c || []) as Campaign[]);
      setLoading(false);
    };
    load();
  }, [brandId]);

  const createCampaign = async () => {
    if (!brandId || !user) return;
    const { data, error } = await supabase
      .from("campaigns")
      .insert({ brand_id: brandId, name: "Untitled Campaign", status: "draft" })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate(`/brands/${brandId}/campaigns/${(data as Campaign).id}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("campaigns").delete().eq("id", deleteTarget.id);
    setCampaigns(prev => prev.filter(c => c.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast.success("Campaign deleted");
  };

  const cloneCampaign = async (campaign: Campaign) => {
    if (!brandId || !user) return;
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        brand_id: brandId,
        name: `${campaign.name} (clone)`,
        status: "draft",
        brief: campaign.brief,
        goal: campaign.goal,
        reference_campaign_ids: campaign.reference_campaign_ids,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    const cloned = data as Campaign;
    setCampaigns(prev => [cloned, ...prev]);
    toast.success("Campaign cloned");
    navigate(`/brands/${brandId}/campaigns/${cloned.id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-12">
      <div className="flex items-center justify-between mb-8 max-w-3xl">
        <h1 className="text-2xl font-semibold">{brand?.name || "Brand"}</h1>
        <Button onClick={createCampaign} className="bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all">
          <Plus className="w-4 h-4 mr-1" /> New Campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="max-w-3xl border border-dashed border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground mb-4">No campaigns yet. Create your first one.</p>
          <Button onClick={createCampaign} variant="outline" className="active:scale-[0.98] transition-all">
            Create first campaign
          </Button>
        </div>
      ) : (
        <div className="max-w-3xl space-y-2">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => navigate(`/brands/${brandId}/campaigns/${c.id}`)}
            >
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">{c.name}</span>
                <Badge className={statusColors[c.status] || statusColors.draft}>
                  {c.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); cloneCampaign(c); }}
                  className="p-1.5 rounded text-muted-foreground hover:text-primary transition-colors"
                  title="Clone campaign"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>This will permanently delete this campaign and all its data.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
