import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Plus, X, Loader2 } from "lucide-react";
import ReanalyzeBrand from "@/components/brand/ReanalyzeBrand";
import AssetManager from "@/components/brand/AssetManager";
import ProductManager from "@/components/brand/ProductManager";
import KlaviyoSetup from "@/components/brand/KlaviyoSetup";
import { toast } from "sonner";

interface BrandAsset {
  id: string;
  url: string;
  category: string;
  filename: string | null;
  description: string | null;
  dominant_colors: string[] | null;
  ai_category: string | null;
}

export default function BrandSettings() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  const [brandInstructions, setBrandInstructions] = useState("");
  const [qaChecklist, setQaChecklist] = useState<string[]>([]);
  const [newQaItem, setNewQaItem] = useState("");

  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!brandId) return;
    const load = async () => {
      const [{ data: brand }, { data: profile }, { data: brandAssets }] = await Promise.all([
        supabase.from("brands").select("*").eq("id", brandId).single(),
        supabase.from("brand_profiles").select("*").eq("brand_id", brandId).single(),
        supabase.from("brand_assets").select("*").eq("brand_id", brandId),
      ]);
      if (brand) { setName(brand.name); setIndustry(brand.industry || ""); setWebsiteUrl(brand.website_url || ""); }
      if (profile) {
        setBrandInstructions((profile as any).brand_instructions || "");
        const checklist = (profile as any).qa_checklist;
        setQaChecklist(Array.isArray(checklist) ? checklist : []);
      }
      setAssets((brandAssets || []) as BrandAsset[]);
      setLoading(false);
    };
    load();
  }, [brandId]);

  const saveInfo = async () => {
    if (!brandId) return;
    setSaving(true);
    await supabase.from("brands").update({ name, industry: industry || null, website_url: websiteUrl || null }).eq("id", brandId);
    toast.success("Brand info saved");
    setSaving(false);
  };

  const saveInstructions = async () => {
    if (!brandId) return;
    setSaving(true);
    const { data: existing } = await supabase.from("brand_profiles").select("id").eq("brand_id", brandId).single();
    if (existing) {
      await supabase.from("brand_profiles").update({ brand_instructions: brandInstructions || null, qa_checklist: qaChecklist } as any).eq("brand_id", brandId);
    }
    toast.success("Saved");
    setSaving(false);
  };

  const addQaItem = () => { if (!newQaItem.trim()) return; setQaChecklist([...qaChecklist, newQaItem.trim()]); setNewQaItem(""); };
  const removeQaItem = (index: number) => setQaChecklist(qaChecklist.filter((_, i) => i !== index));

  const handleDeleteBrand = async () => {
    if (!brandId) return;
    await supabase.from("brands").delete().eq("id", brandId);
    toast.success("Brand deleted");
    navigate("/dashboard");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Brand Settings</h1>

      <Tabs defaultValue="info" className="space-y-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="instructions">Instructions</TabsTrigger>
          <TabsTrigger value="qa">QA Checklist</TabsTrigger>
          <TabsTrigger value="klaviyo">Klaviyo</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4">
          <div className="space-y-3">
            <div><Label>Brand Name</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-1" /></div>
            <div><Label>Industry</Label><Input value={industry} onChange={e => setIndustry(e.target.value)} className="mt-1" placeholder="e.g. Fashion, SaaS, Food & Beverage" /></div>
            <div><Label>Website URL</Label><Input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} className="mt-1" placeholder="https://..." /></div>
            <Button onClick={saveInfo} disabled={saving}>Save Info</Button>
          </div>
          <div className="pt-8 border-t border-border">
            <h3 className="text-sm font-medium text-destructive mb-2">Danger Zone</h3>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="w-4 h-4 mr-1" /> Delete Brand</Button>
          </div>
        </TabsContent>

        <TabsContent value="assets">
          {brandId && <AssetManager brandId={brandId} assets={assets} setAssets={setAssets} />}
        </TabsContent>

        <TabsContent value="products">
          {brandId && <ProductManager brandId={brandId} />}
        </TabsContent>

        <TabsContent value="instructions" className="space-y-4">
          <div>
            <Label>Brand Instructions / Notes / Guidelines</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">Injected into every campaign generation.</p>
            <Textarea value={brandInstructions} onChange={e => setBrandInstructions(e.target.value)} placeholder="e.g. Always use a warm, friendly tone..." className="min-h-[200px]" />
          </div>
          <Button onClick={saveInstructions} disabled={saving}>Save Instructions</Button>
        </TabsContent>

        <TabsContent value="qa" className="space-y-4">
          <div>
            <Label>Brand-Specific QA Checklist</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">Checked during QA audit for every campaign.</p>
            <div className="space-y-2">
              {qaChecklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded bg-card border border-border">
                  <span className="text-sm flex-1">{item}</span>
                  <button onClick={() => removeQaItem(i)} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <Input value={newQaItem} onChange={e => setNewQaItem(e.target.value)} placeholder="e.g. All buttons must have rounded corners" onKeyDown={e => e.key === "Enter" && addQaItem()} />
              <Button variant="outline" onClick={addQaItem} disabled={!newQaItem.trim()}><Plus className="w-4 h-4" /></Button>
            </div>
          </div>
          <Button onClick={saveInstructions} disabled={saving}>Save Checklist</Button>
        </TabsContent>

        <TabsContent value="analysis">
          {brandId && <ReanalyzeBrand brandId={brandId} brandName={name} industry={industry} />}
        </TabsContent>
      </Tabs>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Brand</DialogTitle>
            <DialogDescription>This will permanently delete the brand and all its campaigns, assets, and data.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteBrand}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
