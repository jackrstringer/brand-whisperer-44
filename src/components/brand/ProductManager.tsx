import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Plus, Trash2, Loader2, Package, Upload, X, Search,
  Pencil, Link as LinkIcon, Check, ArrowLeft, Image as ImageIcon,
  ExternalLink, MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  { id: "transparent_bg", title: "Transparent Background", description: "Product cutouts with no background" },
  { id: "lifestyle", title: "Lifestyle", description: "In-context lifestyle photography" },
  { id: "hero_shots", title: "Hero Shots", description: "General product photos and renders" },
];

interface ProductManagerProps {
  brandId: string;
}

export default function ProductManager({ brandId }: ProductManagerProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [assets, setAssets] = useState<Record<string, ProductAsset[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);

  // Detail view
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [createSaving, setCreateSaving] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editUrl, setEditUrl] = useState("");

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  // Lightbox
  const [lightboxAsset, setLightboxAsset] = useState<ProductAsset | null>(null);

  // Drag state
  const [dragBucket, setDragBucket] = useState<string | null>(null);

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

  // Fetch all product asset counts for the grid view
  const fetchAllAssetCounts = useCallback(async () => {
    const { data } = await supabase
      .from("product_assets")
      .select("product_id, id")
      .eq("brand_id", brandId);
    if (data) {
      const grouped: Record<string, ProductAsset[]> = {};
      for (const row of data as any[]) {
        if (!grouped[row.product_id]) grouped[row.product_id] = [];
        grouped[row.product_id].push(row);
      }
      setAssets(prev => {
        const next = { ...prev };
        for (const [pid, items] of Object.entries(grouped)) {
          if (!next[pid] || next[pid].length === 0) next[pid] = items;
        }
        return next;
      });
    }
  }, [brandId]);

  useEffect(() => { fetchProducts().then(() => fetchAllAssetCounts()); }, [fetchProducts, fetchAllAssetCounts]);

  // When entering detail view, fetch full assets
  useEffect(() => {
    if (activeProduct) fetchAssets(activeProduct.id);
  }, [activeProduct, fetchAssets]);

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q)
    );
  }, [products, search]);

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Name is required"); return; }
    setCreateSaving(true);
    const { data, error } = await supabase
      .from("products")
      .insert({ brand_id: brandId, name: newName.trim(), description: newDesc.trim() || null, url: newUrl.trim() || null } as any)
      .select("*")
      .single();
    if (error) { toast.error(error.message); setCreateSaving(false); return; }
    const created = data as Product;
    setProducts(prev => [created, ...prev]);
    setNewName(""); setNewDesc(""); setNewUrl("");
    setCreateOpen(false); setCreateSaving(false);
    setActiveProduct(created);
    toast.success("Product created");
  };

  const openEdit = (p: Product) => {
    setEditName(p.name);
    setEditDesc(p.description || "");
    setEditUrl(p.url || "");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!activeProduct || !editName.trim()) return;
    await supabase.from("products").update({
      name: editName.trim(),
      description: editDesc.trim() || null,
      url: editUrl.trim() || null,
    } as any).eq("id", activeProduct.id);
    const updated = { ...activeProduct, name: editName.trim(), description: editDesc.trim() || null, url: editUrl.trim() || null };
    setProducts(prev => prev.map(p => p.id === activeProduct.id ? updated : p));
    setActiveProduct(updated);
    setEditOpen(false);
    toast.success("Product updated");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from("products").delete().eq("id", deleteTarget.id);
    setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
    if (activeProduct?.id === deleteTarget.id) setActiveProduct(null);
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
    toast.success(`${files.length} image${files.length !== 1 ? "s" : ""} uploaded`);
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
    await supabase.from("product_assets").update(updates as any).eq("id", id);
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

  const getProductThumb = (productId: string): string | null => {
    const pAssets = assets[productId];
    if (!pAssets || pAssets.length === 0) return null;
    return pAssets[0]?.url || null;
  };

  const getAssetCount = (productId: string): number => {
    return (assets[productId] || []).length;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading products…</p>
      </div>
    );
  }

  // ─── DETAIL VIEW ───
  if (activeProduct) {
    const productAssets = assets[activeProduct.id] || [];
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <button
            onClick={() => setActiveProduct(null)}
            className="mt-1 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold truncate">{activeProduct.name}</h2>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {productAssets.length} image{productAssets.length !== 1 ? "s" : ""}
              </Badge>
            </div>
            {activeProduct.description && (
              <p className="text-sm text-muted-foreground mt-1">{activeProduct.description}</p>
            )}
            {activeProduct.url && (
              <a
                href={activeProduct.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1.5"
              >
                <ExternalLink className="w-3 h-3" />
                {activeProduct.url}
              </a>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => openEdit(activeProduct)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
            </Button>
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(activeProduct)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* Asset buckets */}
        {BUCKETS.map(bucket => {
          const bucketAssets = productAssets.filter(a => a.bucket === bucket.id);
          const isUploadingHere = uploading === `${activeProduct.id}-${bucket.id}`;
          const isDragOver = dragBucket === bucket.id;

          return (
            <div key={bucket.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">{bucket.title}</h3>
                  <p className="text-xs text-muted-foreground">{bucket.description}</p>
                </div>
                <label className="cursor-pointer">
                  <Button size="sm" variant="outline" className="pointer-events-none" tabIndex={-1}>
                    {isUploadingHere ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                    Upload
                  </Button>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    multiple
                    className="hidden"
                    onChange={e => {
                      if (e.target.files) handleUpload(activeProduct.id, bucket.id, Array.from(e.target.files));
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              <div
                className={`rounded-lg border-2 border-dashed transition-colors min-h-[120px] p-3 ${
                  isDragOver ? "border-primary/60 bg-primary/5" : "border-border"
                }`}
                onDragOver={e => { e.preventDefault(); setDragBucket(bucket.id); }}
                onDragLeave={() => setDragBucket(null)}
                onDrop={e => {
                  e.preventDefault();
                  setDragBucket(null);
                  const files = Array.from(e.dataTransfer.files).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name));
                  if (files.length) handleUpload(activeProduct.id, bucket.id, files);
                }}
              >
                {bucketAssets.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                    {bucketAssets.map(asset => (
                      <div
                        key={asset.id}
                        className="group relative aspect-square rounded-lg overflow-hidden border border-border cursor-pointer hover:border-primary/50 hover:ring-2 hover:ring-primary/20 transition-all bg-background"
                        onClick={() => setLightboxAsset(asset)}
                      >
                        <img src={asset.url} alt={asset.filename || ""} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <button
                          onClick={e => { e.stopPropagation(); handleDeleteAsset(activeProduct.id, asset.id); }}
                          className="absolute top-1.5 right-1.5 bg-destructive text-destructive-foreground rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                        {asset.filename && (
                          <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-[10px] text-foreground truncate font-medium">{asset.filename}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-6 text-muted-foreground">
                    <ImageIcon className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-xs">Drop images here or click Upload</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Edit dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Name</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Product URL</Label>
                <Input value={editUrl} onChange={e => setEditUrl(e.target.value)} className="mt-1" placeholder="https://..." />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} className="mt-1 min-h-[80px]" placeholder="Optional description" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={!editName.trim()}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
              <DialogDescription>This will permanently delete the product and all its images. This cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete Product</Button>
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

  // ─── GRID VIEW (product list) ───
  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products…"
            className="pl-9 h-10 bg-background"
          />
        </div>
        <Button onClick={() => { setNewName(""); setNewDesc(""); setNewUrl(""); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Product
        </Button>
      </div>

      {/* Product grid */}
      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(product => {
            const thumb = getProductThumb(product.id);
            const count = getAssetCount(product.id);
            return (
              <div
                key={product.id}
                className="group rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all cursor-pointer overflow-hidden"
                onClick={() => setActiveProduct(product)}
              >
                {/* Thumbnail area */}
                <div className="aspect-[16/10] bg-background relative overflow-hidden">
                  {thumb ? (
                    <img src={thumb} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Package className="w-10 h-10 text-muted-foreground/20" />
                    </div>
                  )}
                  {/* Actions overlay */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={e => e.stopPropagation()}
                          className="p-1.5 rounded-md bg-background/80 hover:bg-background border border-border text-foreground"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => { setActiveProduct(product); setTimeout(() => openEdit(product), 100); }}>
                          <Pencil className="w-3.5 h-3.5 mr-2" /> Edit Details
                        </DropdownMenuItem>
                        {product.url && (
                          <DropdownMenuItem onClick={() => window.open(product.url!, "_blank")}>
                            <ExternalLink className="w-3.5 h-3.5 mr-2" /> Visit URL
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(product)}>
                          <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {/* Image count badge */}
                  <div className="absolute bottom-2 left-2">
                    <Badge variant="secondary" className="text-[10px] bg-background/80 backdrop-blur-sm border-border">
                      <ImageIcon className="w-3 h-3 mr-1" /> {count}
                    </Badge>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-medium text-sm truncate">{product.name}</h3>
                  {product.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
                  )}
                  {product.url && (
                    <div className="flex items-center gap-1 mt-2 text-[11px] text-primary truncate">
                      <LinkIcon className="w-3 h-3 shrink-0" />
                      <span className="truncate">{product.url.replace(/^https?:\/\//, "")}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : products.length > 0 ? (
        <div className="text-center py-16">
          <Search className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No products matching "{search}"</p>
          <Button variant="link" size="sm" onClick={() => setSearch("")} className="mt-1">Clear search</Button>
        </div>
      ) : (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
          <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground/20" />
          <h3 className="text-base font-medium mb-1">No products yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Add your first product to start building your asset library.</p>
          <Button onClick={() => { setNewName(""); setNewDesc(""); setNewUrl(""); setCreateOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Product
          </Button>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
            <DialogDescription>Create a new product to organize your imagery.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Product Name <span className="text-destructive">*</span></Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Chrome Showerhead"
                className="mt-1"
                autoFocus
                onKeyDown={e => e.key === "Enter" && newName.trim() && handleCreate()}
              />
            </div>
            <div>
              <Label>Product URL</Label>
              <Input
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                placeholder="https://example.com/product"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Brief product description (optional)"
                className="mt-1 min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createSaving || !newName.trim()}>
              {createSaving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Create Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{deleteTarget?.name}"?</DialogTitle>
            <DialogDescription>This will permanently delete the product and all its images. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete Product</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
