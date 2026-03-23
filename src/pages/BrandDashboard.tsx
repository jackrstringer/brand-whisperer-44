import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, ArrowRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Brand {
  id: string;
  name: string;
  industry: string | null;
  created_at: string;
  website_url: string | null;
}

export default function BrandDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchBrands = async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name, industry, created_at, website_url")
        .order("created_at", { ascending: false });
      if (!error && data) setBrands(data);
      setLoading(false);
    };
    fetchBrands();
  }, [user]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("brands").delete().eq("id", deleteTarget.id);
    setBrands(prev => prev.filter(b => b.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast.success("Brand deleted");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold">Your Brands</h1>
            <p className="text-muted-foreground text-sm mt-1">Select a brand or create a new one.</p>
          </div>
          <Button onClick={() => navigate("/brands/new")} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-1" /> New Brand
          </Button>
        </div>

        {brands.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No brands yet. Create your first one to get started.</p>
              <Button onClick={() => navigate("/brands/new")} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-1" /> Create Brand
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {brands.map((brand) => (
              <Card
                key={brand.id}
                className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/brands/${brand.id}`)}
              >
                <CardContent className="flex items-center justify-between py-5">
                  <div>
                    <h3 className="font-medium text-foreground">{brand.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {brand.industry || "No industry"} · Created {new Date(brand.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(brand); }}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>This will permanently delete this brand and all its campaigns, assets, and data.</DialogDescription>
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
