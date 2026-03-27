import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronUp, Plus, Package, Pin, Search, ShoppingBag, Check, Upload, X, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import ProductCreator from "./ProductCreator";
import type { Product, ProductAsset } from "@/lib/types";

interface ShopifyProduct {
  id: string;
  title: string;
  shopify_product_id: string;
  best_hero_image_id: string | null;
}

interface ShopifyImage {
  id: string;
  product_id: string;
  original_url: string;
  imagekit_url: string | null;
  processed_url: string | null;
  image_type: string | null;
  subject_description: string | null;
  variant_shown: string | null;
  usable_as_hero: boolean | null;
  usable_as_product_shot: boolean | null;
  has_transparent_bg: boolean | null;
  has_white_bg: boolean | null;
  processing_status: string;
  is_usable_product_photo: boolean | null;
}

export interface SelectedShopifyProduct {
  title: string;
  description: string;
  image_url: string;
  image_type: string;
  variant: string | null;
  pinned_image_urls?: string[];
}

interface ProductSelectorProps {
  brandId: string;
  selectedProductIds: string[];
  pinnedAssetUrls: string[];
  onSelectionChange: (productIds: string[], pinnedUrls: string[]) => void;
  onShopifyProductsChange?: (products: SelectedShopifyProduct[]) => void;
}

function getImageUrl(img: ShopifyImage): string {
  return img.processed_url || img.imagekit_url || img.original_url;
}

function pickBestImage(images: ShopifyImage[], bestHeroImageId?: string | null): ShopifyImage | null {
  const usable = images.filter((i) => i.is_usable_product_photo === true && i.processing_status === "ready");
  if (usable.length === 0) return null;

  if (bestHeroImageId) {
    const hero = usable.find((i) => i.id === bestHeroImageId);
    if (hero) return hero;
  }

  const transparentIsolated = usable.find((i) => i.image_type === "product_isolated" && i.has_transparent_bg);
  if (transparentIsolated) return transparentIsolated;
  const whiteIsolated = usable.find((i) => i.image_type === "product_isolated" && i.has_white_bg);
  if (whiteIsolated) return whiteIsolated;
  const isolated = usable.find((i) => i.image_type === "product_isolated");
  if (isolated) return isolated;
  const heroLifestyle = usable.find((i) => i.image_type === "product_lifestyle" && i.usable_as_hero);
  if (heroLifestyle) return heroLifestyle;
  return usable[0];
}

function getUsableImages(images: ShopifyImage[]): ShopifyImage[] {
  return images.filter((i) => i.is_usable_product_photo === true && i.processing_status === "ready");
}

const BUCKET_TYPES = [
  { value: "transparent_bg", label: "Transparent BG" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "hero_shots", label: "Hero Shot" },
] as const;

/* ── Expanded detail for a selected Shopify product ── */
function ShopifyProductDetail({
  product,
  images,
  pinnedUrls,
  onTogglePin,
  brandId,
  onUploadComplete,
}: {
  product: ShopifyProduct;
  images: ShopifyImage[];
  pinnedUrls: string[];
  onTogglePin: (url: string) => void;
  brandId: string;
  onUploadComplete: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadBucket, setUploadBucket] = useState<string>("hero_shots");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const usable = getUsableImages(images);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${brandId}/products/${product.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("brand-assets")
          .upload(path, file, { contentType: file.type });
        if (uploadErr) { toast.error(`Upload failed: ${uploadErr.message}`); continue; }

        const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);
        const publicUrl = urlData.publicUrl;

        // Create product_asset record — use shopify product's internal id
        // We store it as a product_asset linked to a manual "products" row if one exists,
        // otherwise we just pin the URL directly
        onUploadComplete(publicUrl);
        toast.success(`Uploaded ${file.name}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground font-medium">
        {product.title}
        {usable.length > 0 && (
          <span> — {usable.length} usable image{usable.length !== 1 ? "s" : ""}</span>
        )}
        <span className="ml-1 opacity-60">(click to pin)</span>
      </p>

      {/* Existing usable images */}
      {usable.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {usable.map((img) => {
            const url = getImageUrl(img);
            const isPinned = pinnedUrls.includes(url);
            return (
              <button
                key={img.id}
                onClick={() => onTogglePin(url)}
                className={`relative aspect-square rounded overflow-hidden border-2 transition-all ${
                  isPinned ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-muted-foreground"
                }`}
                title={img.subject_description || img.image_type || "Click to pin"}
              >
                <img src={url} alt="" className="w-full h-full object-cover" />
                {isPinned && (
                  <div className="absolute top-0.5 right-0.5 bg-primary rounded-full p-0.5">
                    <Pin className="w-2 h-2 text-primary-foreground" />
                  </div>
                )}
                {img.image_type && (
                  <div className="absolute bottom-0 left-0 right-0 bg-background/70 text-[8px] text-center py-0.5 truncate">
                    {img.image_type.replace(/_/g, " ")}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Upload own images */}
      <div className="flex items-center gap-1.5 pt-1">
        <select
          value={uploadBucket}
          onChange={(e) => setUploadBucket(e.target.value)}
          className="h-6 text-[10px] rounded border border-border bg-background px-1.5"
        >
          {BUCKET_TYPES.map((b) => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] px-2"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-2.5 h-2.5 mr-1" />
          {uploading ? "Uploading..." : "Upload Image"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleUpload}
          className="hidden"
        />
      </div>
    </div>
  );
}

export default function ProductSelector({
  brandId,
  selectedProductIds,
  pinnedAssetUrls,
  onSelectionChange,
  onShopifyProductsChange,
}: ProductSelectorProps) {
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [assets, setAssets] = useState<Record<string, ProductAsset[]>>({});

  const [hasShopify, setHasShopify] = useState(false);
  const [shopifyProducts, setShopifyProducts] = useState<ShopifyProduct[]>([]);
  const [shopifyImages, setShopifyImages] = useState<Record<string, ShopifyImage[]>>({});
  const [selectedShopifyIds, setSelectedShopifyIds] = useState<string[]>([]);
  const [shopifySearch, setShopifySearch] = useState("");
  const [expandedShopifyId, setExpandedShopifyId] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false });
    setProducts((data || []) as Product[]);
  }, [brandId]);

  const fetchShopifyData = useCallback(async () => {
    const { data: conn } = await supabase
      .from("shopify_connections")
      .select("id")
      .eq("brand_id", brandId)
      .maybeSingle();

    if (!conn) { setHasShopify(false); return; }
    setHasShopify(true);

    const { data: prods } = await supabase
      .from("shopify_products")
      .select("id, title, shopify_product_id, best_hero_image_id")
      .eq("brand_id", brandId)
      .eq("status", "active")
      .order("title");
    setShopifyProducts((prods || []) as ShopifyProduct[]);

    const { data: imgs } = await supabase
      .from("shopify_product_images")
      .select("id, product_id, original_url, imagekit_url, processed_url, image_type, subject_description, variant_shown, usable_as_hero, usable_as_product_shot, has_transparent_bg, has_white_bg, processing_status, is_usable_product_photo")
      .eq("brand_id", brandId);

    const grouped: Record<string, ShopifyImage[]> = {};
    for (const img of (imgs || []) as ShopifyImage[]) {
      if (!grouped[img.product_id]) grouped[img.product_id] = [];
      grouped[img.product_id].push(img);
    }
    setShopifyImages(grouped);
  }, [brandId]);

  const fetchAssetsForProducts = useCallback(async (productIds: string[]) => {
    if (productIds.length === 0) return;
    const { data } = await supabase
      .from("product_assets")
      .select("*")
      .in("product_id", productIds);
    const grouped: Record<string, ProductAsset[]> = {};
    for (const asset of (data || []) as ProductAsset[]) {
      if (!grouped[asset.product_id]) grouped[asset.product_id] = [];
      grouped[asset.product_id].push(asset);
    }
    setAssets((prev) => ({ ...prev, ...grouped }));
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchShopifyData();
  }, [fetchProducts, fetchShopifyData]);

  useEffect(() => {
    if (selectedProductIds.length > 0) fetchAssetsForProducts(selectedProductIds);
  }, [selectedProductIds, fetchAssetsForProducts]);

  // Build selected shopify products data for parent
  useEffect(() => {
    if (!onShopifyProductsChange) return;
    const selected: SelectedShopifyProduct[] = selectedShopifyIds.map((id) => {
      const product = shopifyProducts.find((p) => p.id === id);
      const images = shopifyImages[id] || [];
      const bestImage = pickBestImage(images, product?.best_hero_image_id);
      const imageUrl = bestImage ? getImageUrl(bestImage) : "";

      // Collect pinned URLs for this product's images
      const usable = getUsableImages(images);
      const productPinnedUrls = usable
        .map((i) => getImageUrl(i))
        .filter((u) => pinnedAssetUrls.includes(u));

      return {
        title: product?.title || "",
        description: bestImage?.subject_description || "",
        image_url: imageUrl,
        image_type: bestImage?.image_type || "other",
        variant: bestImage?.variant_shown || null,
        pinned_image_urls: productPinnedUrls.length > 0 ? productPinnedUrls : undefined,
      };
    }).filter((p) => p.image_url);
    onShopifyProductsChange(selected);
  }, [selectedShopifyIds, shopifyProducts, shopifyImages, pinnedAssetUrls, onShopifyProductsChange]);

  // Only show Shopify products that have at least one usable image
  const shopifyProductsWithImages = useMemo(() => {
    return shopifyProducts.filter((sp) => {
      const images = shopifyImages[sp.id] || [];
      return pickBestImage(images, sp.best_hero_image_id) !== null;
    });
  }, [shopifyProducts, shopifyImages]);

  const filteredShopifyProducts = useMemo(() => {
    if (!shopifySearch) return shopifyProductsWithImages;
    return shopifyProductsWithImages.filter((p) => p.title.toLowerCase().includes(shopifySearch.toLowerCase()));
  }, [shopifyProductsWithImages, shopifySearch]);

  const toggleProduct = (productId: string) => {
    const isSelected = selectedProductIds.includes(productId);
    const newIds = isSelected
      ? selectedProductIds.filter((id) => id !== productId)
      : [...selectedProductIds, productId];

    let newPinned = pinnedAssetUrls;
    if (isSelected) {
      const productAssetUrls = (assets[productId] || []).map((a) => a.url);
      newPinned = pinnedAssetUrls.filter((u) => !productAssetUrls.includes(u));
    } else {
      fetchAssetsForProducts([productId]);
    }
    onSelectionChange(newIds, newPinned);
  };

  const togglePin = (url: string) => {
    const newPinned = pinnedAssetUrls.includes(url)
      ? pinnedAssetUrls.filter((u) => u !== url)
      : [...pinnedAssetUrls, url];
    onSelectionChange(selectedProductIds, newPinned);
  };

  const toggleShopifyProduct = (id: string) => {
    setSelectedShopifyIds((prev) => {
      const wasSelected = prev.includes(id);
      if (wasSelected) {
        // Deselecting — also remove pinned URLs for this product's images
        const images = shopifyImages[id] || [];
        const productImageUrls = getUsableImages(images).map((i) => getImageUrl(i));
        const newPinned = pinnedAssetUrls.filter((u) => !productImageUrls.includes(u));
        if (newPinned.length !== pinnedAssetUrls.length) {
          onSelectionChange(selectedProductIds, newPinned);
        }
        setExpandedShopifyId((cur) => cur === id ? null : cur);
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 3) return prev;
      setExpandedShopifyId(id);
      return [...prev, id];
    });
  };

  const totalSelected = selectedProductIds.length + selectedShopifyIds.length;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium">Products</span>
          {totalSelected > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
              {totalSelected} selected
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border p-3 space-y-3">
          {/* Shopify products section — scrollable 3-wide grid */}
          {hasShopify && shopifyProductsWithImages.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                <ShoppingBag className="w-3 h-3" /> Shopify Products ({shopifyProductsWithImages.length})
                {selectedShopifyIds.length > 0 && (
                  <span className="text-primary ml-auto normal-case">{selectedShopifyIds.length}/3 selected</span>
                )}
              </div>

              {/* Always show search */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  value={shopifySearch}
                  onChange={(e) => setShopifySearch(e.target.value)}
                  placeholder="Search products..."
                  className="pl-7 h-7 text-xs"
                />
              </div>

              {/* Scrollable product grid */}
              <ScrollArea className="max-h-[400px]">
                <div className="grid grid-cols-3 gap-2">
                  {filteredShopifyProducts.map((sp) => {
                    const isSelected = selectedShopifyIds.includes(sp.id);
                    const images = shopifyImages[sp.id] || [];
                    const bestImage = pickBestImage(images, sp.best_hero_image_id);
                    const thumbUrl = bestImage ? getImageUrl(bestImage) : null;

                    return (
                      <button
                        key={sp.id}
                        onClick={() => toggleShopifyProduct(sp.id)}
                        disabled={!isSelected && selectedShopifyIds.length >= 3}
                        className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                          isSelected
                            ? "border-primary ring-1 ring-primary/30"
                            : "border-border hover:border-muted-foreground"
                        } ${!isSelected && selectedShopifyIds.length >= 3 ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        {thumbUrl && (
                          <div className="aspect-square bg-muted">
                            <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/90 to-transparent p-1.5 pt-4">
                          <p className="text-[10px] font-medium truncate text-foreground">{sp.title}</p>
                        </div>
                        {isSelected && (
                          <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
                            <Check className="w-3 h-3 text-primary-foreground" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Expanded image details for selected products */}
              {selectedShopifyIds.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-border">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                    Selected Product Images
                  </p>
                  {selectedShopifyIds.map((id) => {
                    const product = shopifyProducts.find((p) => p.id === id);
                    if (!product) return null;
                    return (
                      <ShopifyProductDetail
                        key={id}
                        product={product}
                        images={shopifyImages[id] || []}
                        pinnedUrls={pinnedAssetUrls}
                        onTogglePin={togglePin}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Manual products section */}
          {products.length > 0 && (
            <div className="space-y-2">
              {hasShopify && (
                <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Manual Products</div>
              )}
              {products.map((product) => {
                const isSelected = selectedProductIds.includes(product.id);
                const productAssets = assets[product.id] || [];
                return (
                  <div key={product.id} className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleProduct(product.id)}
                        className="rounded border-border"
                      />
                      <span className="text-xs font-medium">{product.name}</span>
                      {product.description && (
                        <span className="text-[10px] text-muted-foreground truncate">{product.description}</span>
                      )}
                    </label>

                    {isSelected && productAssets.length > 0 && (
                      <div className="ml-6 grid grid-cols-4 gap-1.5">
                        {productAssets.map((asset) => {
                          const isPinned = pinnedAssetUrls.includes(asset.url);
                          return (
                            <button
                              key={asset.id}
                              onClick={() => togglePin(asset.url)}
                              className={`relative aspect-square rounded overflow-hidden border transition-all ${
                                isPinned ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-foreground"
                              }`}
                              title={asset.description || asset.filename || "Click to pin"}
                            >
                              <img src={asset.url} alt="" className="w-full h-full object-cover" />
                              {isPinned && (
                                <div className="absolute top-0.5 right-0.5 bg-primary rounded-full p-0.5">
                                  <Pin className="w-2 h-2 text-primary-foreground" />
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-background/70 text-[8px] text-center py-0.5 truncate">
                                {asset.bucket.replace("_", " ")}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {products.length === 0 && !hasShopify && !creating && (
            <p className="text-xs text-muted-foreground text-center py-2">No products yet</p>
          )}

          {creating ? (
            <ProductCreator
              brandId={brandId}
              onCreated={() => { setCreating(false); fetchProducts(); }}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)} className="w-full">
              <Plus className="w-3 h-3 mr-1" /> Add Product
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
