import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, Package, Upload, X, ChevronDown, ChevronRight, Pencil, Link as LinkIcon, Check } from "lucide-react";
import AssetLightbox from "./AssetLightbox";
import { toast } from "sonner";

interface Product {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  url: string | null;
  created_at: string;
}

interface ProductAsset {
  id: string;
  product_id: string;
  brand_id: string;
  bucket: string;
  url: string;
  filename: string | null;
  description: string | null;
  dominant_colors: string[] | null;
  ai_category: string | null;
  composition_notes: string | null;
  transparent_bg: boolean;
}

const BUCKETS = [
  { id: "transparent_bg", title: "Transparent BG" },
  { id: "lifestyle", title: "Lifestyle" },
  { id: "hero_shots", title: "Hero Shots" },
];

interface ProductManagerProps {
  brandId: string;
}

export default function ProductManager({ brandId }: ProductManagerProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [assets, setAssets] = useState<Record<string, ProductAsset[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  // Create product form
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [createSaving, setCreateSaving] = useState(false);

  // Edit inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editUrl, setEditUrl] = useState("");

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  // Lightbox
  const [lightboxAsset, setLightboxAsset] = useState<ProductAsset | null>(null);

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false });
    setProducts((data || []) as Product[]);
    setLoading(false);
  }, [brandId]);

  const fetchAssets = useCallback(async (productId: string) => {
    const { data } = await supabase
      .from("product_assets")
      .select("*")
      .eq("product_id", productId);
    setAssets(prev => ({ ...prev, [productId]: (data || []) as ProductAsset[] }));
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const toggleExpand = (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!assets[id]) fetchAssets(id);
  };

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Name is required"); return; }
    setCreateSaving(true);
    const { data, error } = await supabase
      .from("products")
      .insert({ brand_id: brandId, name: newName.trim(), description: newDesc.trim() || null, url: newUrl.trim() || null } as any)
      .select("*")
      .single();
    if (error) { toast.error(error.message); setCreateSaving(false); return; }
    setProducts(prev => [data as Product, ...prev]);
    setNewName(""); setNewDesc(""); setNewUrl("");
    setCreating(false); setCreateSaving(false);
    toast.success("Product created");
  };

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditDesc(p.description || "");
    setEditUrl(p.url || "");
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await supabase.from("products").update({
      name: editName.trim(),
      description: editDesc.trim() || null,
      url: editUrl.trim() || null,
    } as any).eq("id", editingId);
    setProducts(prev => prev.map(p => p.id === editingId ? { ...p, name: editName.trim(), description: editDesc.trim() || null, url: editUrl.trim() || null } : p));
    setEditingId(null);
    toast.success("Product updated");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("products").delete().eq("id", deleteTarget.id);
    setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
    if (expandedId === deleteTarget.id) setExpandedId(null);
    setDeleteTarget(null);
    toast.success("Product deleted");
  };

  const handleUpload = async (productId: string, bucket: string, files: File[]) => {
    setUploading(`${productId}-${bucket}`);
    for (const file of files) {
      const ext = file.name.split(".").pop() || "png";
      const path = `${brandId}/products/${productId}/${bucket}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("brand-assets").upload(path, file, { contentType: file.type });
      if (uploadErr) { toast.error(`Upload failed: ${uploadErr.message}`); continue; }
      const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      const { data: inserted } = await supabase.from("product_assets").insert({
        product_id: productId, brand_id: brandId, bucket, url: publicUrl, filename: file.name,
      }).select("*").single();

      if (inserted) {
        setAssets(prev => ({
          ...prev,
          [productId]: [...(prev[productId] || []), inserted as ProductAsset],
        }));
      }

      // Fire-and-forget analysis
      supabase.functions.invoke("analyze-asset", {
        body: { imageUrl: publicUrl, filename: file.name, userCategory: bucket },
      }).then(async ({ data }) => {
        if (data && !data.error) {
          await supabase.from("product_assets").update({
            description: data.description || null,
            dominant_colors: data.dominant_colors || null,
            ai_category: data.suggested_category || null,
            composition_notes: data.composition_notes || null,
            transparent_bg: data.transparent_bg ?? false,
          }).eq("url", publicUrl);
          setAssets(prev => ({
            ...prev,
            [productId]: (prev[productId] || []).map(a =>
              a.url === publicUrl ? { ...a, description: data.description, dominant_colors: data.dominant_colors, ai_category: data.suggested_category, composition_notes: data.composition_notes, transparent_bg: data.transparent_bg ?? false } : a
            ),
          }));
        }
      }).catch(() => {});
    }
    setUploading(null);
    toast.success("Images uploaded");
  };

  const handleDeleteAsset = async (productId: string, assetId: string) => {
    await supabase.from("product_assets").delete().eq("id", assetId);
    setAssets(prev => ({
      ...prev,
      [productId]: (prev[productId] || []).filter(a => a.id !== assetId),
    }));
    if (lightboxAsset?.id === assetId) setLightboxAsset(null);
    toast.success("Image removed");
  };

  const handleSaveAssetDetails = async (id: string, updates: Record<string, any>) => {
    await supabase.from("product_assets").update(updates).eq("id", id);
    // Update local state across all products
    setAssets(prev => {
      const next = { ...prev };
      for (const pid of Object.keys(next)) {
        next[pid] = next[pid].map(a => a.id === id ? { ...a, ...updates } : a);
      }
      return next;
    });
    if (lightboxAsset?.id === id) setLightboxAsset(prev => prev ? { ...prev, ...updates } : null);
    toast.success("Details updated");
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Product list */}
      {products.map(product => {
        const isExpanded = expandedId === product.id;
        const isEditing = editingId === product.id;
        const productAssets = assets[product.id] || [];

        return (
          <Card key={product.id} className="bg-card border-border">
            <CardContent className="p-0">
              {/* Header row */}
              <div className="flex items-center gap-2 p-3">
                <button onClick={() => toggleExpand(product.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {isEditing ? (
                  <div className="flex-1 space-y-2">
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-7 text-sm" placeholder="Product name" />
                    <Input value={editUrl} onChange={e => setEditUrl(e.target.value)} className="h-7 text-xs" placeholder="Product URL (optional)" />
                    <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="text-xs min-h-[50px]" placeholder="Description (optional)" />
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={saveEdit} className="h-6 text-xs px-2"><Check className="w-3 h-3 mr-1" /> Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)} className="h-6 text-xs px-2">Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpand(product.id)}>
                      <div className="flex items-center gap-2">
                        <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{product.name}</span>
                        <span className="text-[10px] text-muted-foreground">{productAssets.length} img</span>
                      </div>
                      {product.description && <p className="text-[11px] text-muted-foreground truncate ml-5.5 mt-0.5">{product.description}</p>}
                      {product.url && (
                        <a href={product.url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} className="text-[10px] text-primary hover:underline ml-5.5 flex items-center gap-0.5 mt-0.5">
                          <LinkIcon className="w-2.5 h-2.5" /> {product.url}
                        </a>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => startEdit(product)} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(product)} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Expanded: asset buckets */}
              {isExpanded && (
                <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
                  {BUCKETS.map(bucket => {
                    const bucketAssets = productAssets.filter(a => a.bucket === bucket.id);
                    const isUploadingHere = uploading === `${product.id}-${bucket.id}`;
                    return (
                      <div key={bucket.id}>
                        <p className="text-[11px] font-medium text-muted-foreground mb-1.5">{bucket.title}</p>
                        <div className="flex flex-wrap gap-2">
                          {bucketAssets.map(asset => (
                            <div
                              key={asset.id}
                              className="relative group w-20 h-20 rounded overflow-hidden border border-border cursor-pointer hover:border-primary/50 transition-all"
                              onClick={() => setLightboxAsset(asset)}
                            >
                              <img src={asset.url} alt={asset.filename || ""} className="w-full h-full object-cover" />
                              <button
                                onClick={e => { e.stopPropagation(); handleDeleteAsset(product.id, asset.id); }}
                                className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                          <label className="w-20 h-20 rounded border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/50 transition-colors text-muted-foreground hover:text-foreground">
                            {isUploadingHere ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            <span className="text-[9px]">Add</span>
                            <input
                              type="file"
                              accept=".jpg,.jpeg,.png,.webp"
                              multiple
                              className="hidden"
                              onChange={e => {
                                if (e.target.files) handleUpload(product.id, bucket.id, Array.from(e.target.files));
                                e.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Empty state */}
      {products.length === 0 && !creating && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No products yet. Add your first product to get started.
        </div>
      )}

      {/* Create form */}
      {creating ? (
        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <div>
              <Label className="text-xs">Product Name *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Chrome Showerhead" className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Product URL</Label>
              <Input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="https://example.com/product" className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Brief description (optional)" className="mt-1 text-xs min-h-[50px]" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={createSaving || !newName.trim()}>
                {createSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Create Product
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => setCreating(true)} className="w-full">
          <Plus className="w-4 h-4 mr-1" /> Add Product
        </Button>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>This will permanently delete the product and all its images.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Asset lightbox */}
      <AssetLightbox
        asset={lightboxAsset}
        open={!!lightboxAsset}
        onClose={() => setLightboxAsset(null)}
        onSave={handleSaveAssetDetails}
        categories={BUCKETS}
        categoryField="bucket"
      />
    </div>
  );
}
