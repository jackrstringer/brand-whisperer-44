import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Plus, X, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

interface BrandAsset {
  id: string;
  url: string;
  category: string;
  filename: string | null;
}

const ASSET_CATEGORIES = [
  { id: "logo", title: "Logo" },
  { id: "product_imagery", title: "Product Imagery" },
  { id: "hero_shots", title: "Hero Shots" },
  { id: "lifestyle", title: "Lifestyle" },
];

export default function BrandSettings() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Brand info
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  // Brand profile
  const [brandInstructions, setBrandInstructions] = useState("");
  const [qaChecklist, setQaChecklist] = useState<string[]>([]);
  const [newQaItem, setNewQaItem] = useState("");

  // Assets
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!brandId) return;
    const load = async () => {
      const [{ data: brand }, { data: profile }, { data: brandAssets }] = await Promise.all([
        supabase.from("brands").select("*").eq("id", brandId).single(),
        supabase.from("brand_profiles").select("*").eq("brand_id", brandId).single(),
        supabase.from("brand_assets").select("*").eq("brand_id", brandId),
      ]);
      if (brand) {
        setName(brand.name);
        setIndustry(brand.industry || "");
        setWebsiteUrl(brand.website_url || "");
      }
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
    toast.success("Instructions saved");
    setSaving(false);
  };

  const addQaItem = () => {
    if (!newQaItem.trim()) return;
    setQaChecklist([...qaChecklist, newQaItem.trim()]);
    setNewQaItem("");
  };

  const removeQaItem = (index: number) => {
    setQaChecklist(qaChecklist.filter((_, i) => i !== index));
  };

  const handleDeleteBrand = async () => {
    if (!brandId) return;
    await supabase.from("brands").delete().eq("id", brandId);
    toast.success("Brand deleted");
    navigate("/dashboard");
  };

  const handleUploadAsset = useCallback(async (category: string, files: FileList) => {
    if (!brandId || !files.length) return;
    setUploading(category);
    for (const file of Array.from(files)) {
      const path = `${brandId}/${category}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("brand-assets").upload(path, file);
      if (uploadErr) { toast.error(`Upload failed: ${uploadErr.message}`); continue; }
      const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);
      await supabase.from("brand_assets").insert({ brand_id: brandId, category, url: urlData.publicUrl, filename: file.name });
      setAssets(prev => [...prev, { id: crypto.randomUUID(), url: urlData.publicUrl, category, filename: file.name }]);
    }
    setUploading(null);
    toast.success("Assets uploaded");
  }, [brandId]);

  const handleDeleteAsset = async (assetId: string) => {
    await supabase.from("brand_assets").delete().eq("id", assetId);
    setAssets(prev => prev.filter(a => a.id !== assetId));
    toast.success("Asset removed");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Brand Settings</h1>

      <Tabs defaultValue="info" className="space-y-6">
        <TabsList>
          <TabsTrigger value="info">Info</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="instructions">Instructions</TabsTrigger>
          <TabsTrigger value="qa">QA Checklist</TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info" className="space-y-4">
          <div className="space-y-3">
            <div>
              <Label>Brand Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Industry</Label>
              <Input value={industry} onChange={e => setIndustry(e.target.value)} className="mt-1" placeholder="e.g. Fashion, SaaS, Food & Beverage" />
            </div>
            <div>
              <Label>Website URL</Label>
              <Input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} className="mt-1" placeholder="https://..." />
            </div>
            <Button onClick={saveInfo} disabled={saving} className="bg-primary text-primary-foreground">Save Info</Button>
          </div>
          <div className="pt-8 border-t border-border">
            <h3 className="text-sm font-medium text-destructive mb-2">Danger Zone</h3>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="w-4 h-4 mr-1" /> Delete Brand
            </Button>
          </div>
        </TabsContent>

        {/* Assets Tab */}
        <TabsContent value="assets" className="space-y-6">
          {ASSET_CATEGORIES.map(cat => {
            const catAssets = assets.filter(a => a.category === cat.id);
            return (
              <Card key={cat.id} className="bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{cat.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3 mb-3">
                    {catAssets.map(asset => (
                      <div key={asset.id} className="relative group w-24 h-24 rounded-md overflow-hidden border border-border">
                        <img src={asset.url} alt={asset.filename || ""} className="w-full h-full object-cover" />
                        <button
                          onClick={() => handleDeleteAsset(asset.id)}
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                    {uploading === cat.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    Upload
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      multiple
                      className="hidden"
                      onChange={e => e.target.files && handleUploadAsset(cat.id, e.target.files)}
                    />
                  </label>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Instructions Tab */}
        <TabsContent value="instructions" className="space-y-4">
          <div>
            <Label>Brand Instructions / Notes / Guidelines</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">These instructions will be injected into every campaign generation for this brand.</p>
            <Textarea
              value={brandInstructions}
              onChange={e => setBrandInstructions(e.target.value)}
              placeholder="e.g. Always use a warm, friendly tone. Never use exclamation marks. Buttons should be rounded..."
              className="min-h-[200px]"
            />
          </div>
          <Button onClick={saveInstructions} disabled={saving} className="bg-primary text-primary-foreground">Save Instructions</Button>
        </TabsContent>

        {/* QA Checklist Tab */}
        <TabsContent value="qa" className="space-y-4">
          <div>
            <Label>Brand-Specific QA Checklist</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">These items will be checked during the QA audit pass for every campaign.</p>
            <div className="space-y-2">
              {qaChecklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded bg-card border border-border">
                  <span className="text-sm flex-1">{item}</span>
                  <button onClick={() => removeQaItem(i)} className="text-muted-foreground hover:text-destructive">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <Input
                value={newQaItem}
                onChange={e => setNewQaItem(e.target.value)}
                placeholder="e.g. All buttons must have rounded corners"
                onKeyDown={e => e.key === "Enter" && addQaItem()}
              />
              <Button variant="outline" onClick={addQaItem} disabled={!newQaItem.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <Button onClick={saveInstructions} disabled={saving} className="bg-primary text-primary-foreground">Save Checklist</Button>
        </TabsContent>
      </Tabs>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Brand</DialogTitle>
            <DialogDescription>This will permanently delete the brand and all its campaigns, assets, and data. This cannot be undone.</DialogDescription>
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
