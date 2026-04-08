import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function BrandPreferences() {
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

  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!brandId) return;
    (async () => {
      const [{ data: brand }, { data: profile }] = await Promise.all([
        supabase.from("brands").select("*").eq("id", brandId).single(),
        supabase.from("brand_profiles").select("*").eq("brand_id", brandId).single(),
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
      setLoading(false);
    })();
  }, [brandId]);

  const saveAll = async () => {
    if (!brandId) return;
    setSaving(true);
    await supabase.from("brands").update({ name, industry: industry || null, website_url: websiteUrl || null }).eq("id", brandId);
    const { data: existing } = await supabase.from("brand_profiles").select("id").eq("brand_id", brandId).single();
    if (existing) {
      await supabase.from("brand_profiles").update({ brand_instructions: brandInstructions || null, qa_checklist: qaChecklist } as any).eq("brand_id", brandId);
    }
    toast.success("Preferences saved");
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
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Preferences</h1>

      {/* Brand Info */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-2 uppercase tracking-wide">Brand Info</h3>
        <div><Label>Brand Name</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-1" /></div>
        <div><Label>Industry</Label><Input value={industry} onChange={e => setIndustry(e.target.value)} className="mt-1" placeholder="e.g. Fashion, SaaS, Food & Beverage" /></div>
        <div><Label>Website URL</Label><Input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} className="mt-1" placeholder="https://..." /></div>
      </div>

      {/* Instructions */}
      <div className="border-t border-border pt-6">
        <Label>Brand Instructions / Notes / Guidelines</Label>
        <p className="text-xs text-gray-2 mt-1 mb-2">Injected into every campaign generation.</p>
        <Textarea value={brandInstructions} onChange={e => setBrandInstructions(e.target.value)} placeholder="e.g. Always use a warm, friendly tone..." className="min-h-[200px]" />
      </div>

      {/* QA Checklist */}
      <div className="border-t border-border pt-6">
        <Label>Brand-Specific QA Checklist</Label>
        <p className="text-xs text-gray-2 mt-1 mb-3">Checked during QA audit for every campaign.</p>
        <div className="space-y-2">
          {qaChecklist.map((item, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded bg-surface border border-border">
              <span className="text-sm flex-1">{item}</span>
              <button onClick={() => removeQaItem(i)} className="text-gray-3 hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <Input value={newQaItem} onChange={e => setNewQaItem(e.target.value)} placeholder="e.g. All buttons must have rounded corners" onKeyDown={e => e.key === "Enter" && addQaItem()} />
          <Button variant="outline" onClick={addQaItem} disabled={!newQaItem.trim()}><Plus className="w-4 h-4" /></Button>
        </div>
      </div>

      <Button onClick={saveAll} disabled={saving}>Save Preferences</Button>

      {/* Danger Zone */}
      <div className="border-t border-border pt-8">
        <h3 className="text-sm font-medium text-destructive mb-2">Danger Zone</h3>
        <Button variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="w-4 h-4 mr-1" /> Delete Brand</Button>
      </div>

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
