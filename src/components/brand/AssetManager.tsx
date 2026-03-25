import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, X, Loader2, Trash2 } from "lucide-react";
import AssetLightbox from "./AssetLightbox";
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

const ASSET_CATEGORIES = [
  { id: "logo", title: "Logo" },
  { id: "product_imagery", title: "Product Imagery" },
  { id: "hero_shots", title: "Hero Shots" },
  { id: "lifestyle", title: "Lifestyle" },
];

interface AssetManagerProps {
  brandId: string;
  assets: BrandAsset[];
  setAssets: React.Dispatch<React.SetStateAction<BrandAsset[]>>;
}

export default function AssetManager({ brandId, assets, setAssets }: AssetManagerProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [lightboxAsset, setLightboxAsset] = useState<BrandAsset | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const handleUpload = useCallback(async (category: string, files: File[]) => {
    if (!brandId || !files.length) return;
    setUploading(category);
    const uploadPromises = files.map(async (file) => {
      const path = `${brandId}/${category}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("brand-assets").upload(path, file);
      if (uploadErr) { toast.error(`Upload failed: ${uploadErr.message}`); return null; }
      const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      let description: string | undefined;
      let dominant_colors: string[] | undefined;
      let ai_category: string | undefined;
      try {
        const { data: analysis } = await supabase.functions.invoke("analyze-asset", {
          body: { imageUrl: publicUrl, filename: file.name, userCategory: category },
        });
        if (analysis && !analysis.error) {
          description = analysis.description;
          dominant_colors = analysis.dominant_colors;
          ai_category = analysis.suggested_category;
        }
      } catch {}

      const { data: inserted } = await supabase.from("brand_assets").insert({
        brand_id: brandId, category, url: publicUrl, filename: file.name,
        description, dominant_colors, ai_category,
      } as any).select("*").single();

      return inserted ? { ...inserted } as BrandAsset : null;
    });

    const results = await Promise.all(uploadPromises);
    const newAssets = results.filter(Boolean) as BrandAsset[];
    if (newAssets.length) setAssets(prev => [...prev, ...newAssets]);
    setUploading(null);
    toast.success(`${newAssets.length} asset${newAssets.length !== 1 ? "s" : ""} uploaded`);
  }, [brandId, setAssets]);

  const handleDelete = async (assetId: string) => {
    await supabase.from("brand_assets").delete().eq("id", assetId);
    setAssets(prev => prev.filter(a => a.id !== assetId));
    if (lightboxAsset?.id === assetId) setLightboxAsset(null);
    toast.success("Asset removed");
  };

  const handleSaveAsset = async (id: string, updates: Record<string, any>) => {
    await supabase.from("brand_assets").update(updates as any).eq("id", id);
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    if (lightboxAsset?.id === id) setLightboxAsset(prev => prev ? { ...prev, ...updates } : null);
    toast.success("Asset updated");
  };

  const handleDrop = (category: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const files = Array.from(e.dataTransfer.files).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name));
    if (files.length) handleUpload(category, files);
  };

  return (
    <div className="space-y-5">
      {ASSET_CATEGORIES.map(cat => {
        const catAssets = assets.filter(a => a.category === cat.id);
        const isDragOver = dragOver === cat.id;
        return (
          <Card
            key={cat.id}
            className={`bg-card border-border transition-colors ${isDragOver ? "border-primary/50 bg-primary/5" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(cat.id); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => handleDrop(cat.id, e)}
          >
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">{cat.title}</CardTitle>
              <span className="text-[10px] text-muted-foreground">{catAssets.length} asset{catAssets.length !== 1 ? "s" : ""}</span>
            </CardHeader>
            <CardContent>
              {catAssets.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-3">
                  {catAssets.map(asset => (
                    <div
                      key={asset.id}
                      className="relative group aspect-square rounded-md overflow-hidden border border-border cursor-pointer hover:border-primary/50 transition-all hover:ring-1 hover:ring-primary/30"
                      onClick={() => setLightboxAsset(asset)}
                    >
                      <img src={asset.url} alt={asset.filename || ""} className="w-full h-full object-cover" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      {asset.description && (
                        <div className="absolute bottom-0 left-0 right-0 bg-background/80 px-1.5 py-0.5">
                          <p className="text-[9px] text-foreground truncate">{asset.description}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  No assets yet — drag & drop or click to upload
                </div>
              )}
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                {uploading === cat.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                Upload
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  multiple
                  className="hidden"
                  onChange={e => {
                    if (e.target.files) handleUpload(cat.id, Array.from(e.target.files));
                    e.target.value = "";
                  }}
                />
              </label>
            </CardContent>
          </Card>
        );
      })}

      <AssetLightbox
        asset={lightboxAsset}
        open={!!lightboxAsset}
        onClose={() => setLightboxAsset(null)}
        onSave={handleSaveAsset}
        categories={ASSET_CATEGORIES}
        categoryField="category"
      />
    </div>
  );
}
