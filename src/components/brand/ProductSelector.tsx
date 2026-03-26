import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronUp, Plus, Package, Pin, Search, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
}

export interface SelectedShopifyProduct {
  title: string;
  description: string;
  image_url: string;
  image_type: string;
  variant: string | null;
}

interface ProductSelectorProps {
  brandId: string;
  selectedProductIds: string[];
  pinnedAssetUrls: string[];
  onSelectionChange: (productIds: string[], pinnedUrls: string[]) => void;
  onShopifyProductsChange?: (products: SelectedShopifyProduct[]) => void;
}

function pickBestImage(images: ShopifyImage[], bestHeroImageId?: string | null): ShopifyImage | null {
  // Filter to only usable product photos
  const usable = images.filter((i) => i.is_usable_product_photo === true && i.processing_status === "ready");
  if (usable.length === 0) return null;

  // If best hero is set and exists in usable, use it
  if (bestHeroImageId) {
    const hero = usable.find((i) => i.id === bestHeroImageId);
    if (hero) return hero;
  }

  // Priority: transparent bg product_isolated > white bg product_isolated > hero lifestyle > first ready
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

  // Shopify state
  const [hasShopify, setHasShopify] = useState(false);
  const [shopifyProducts, setShopifyProducts] = useState<ShopifyProduct[]>([]);
  const [shopifyImages, setShopifyImages] = useState<Record<string, ShopifyImage[]>>({});
  const [selectedShopifyIds, setSelectedShopifyIds] = useState<string[]>([]);
  const [shopifySearch, setShopifySearch] = useState("");

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
      .select("id, title, shopify_product_id")
      .eq("brand_id", brandId)
      .eq("status", "active")
      .order("title");
    setShopifyProducts((prods || []) as ShopifyProduct[]);

    const { data: imgs } = await supabase
      .from("shopify_product_images")
      .select("id, product_id, original_url, imagekit_url, processed_url, image_type, subject_description, variant_shown, usable_as_hero, usable_as_product_shot, has_transparent_bg, has_white_bg, processing_status")
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

  // Emit shopify product changes
  useEffect(() => {
    if (!onShopifyProductsChange) return;
    const selected: SelectedShopifyProduct[] = selectedShopifyIds.map((id) => {
      const product = shopifyProducts.find((p) => p.id === id);
      const images = shopifyImages[id] || [];
      const bestImage = pickBestImage(images);
      const imageUrl = bestImage
        ? (bestImage.processed_url || bestImage.imagekit_url || bestImage.original_url)
        : "";
      return {
        title: product?.title || "",
        description: bestImage?.subject_description || "",
        image_url: imageUrl,
        image_type: bestImage?.image_type || "other",
        variant: bestImage?.variant_shown || null,
      };
    }).filter((p) => p.image_url);
    onShopifyProductsChange(selected);
  }, [selectedShopifyIds, shopifyProducts, shopifyImages, onShopifyProductsChange]);

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
    setSelectedShopifyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev
    );
  };

  const filteredShopifyProducts = shopifySearch
    ? shopifyProducts.filter((p) => p.title.toLowerCase().includes(shopifySearch.toLowerCase()))
    : shopifyProducts;

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
          {/* Shopify products section */}
          {hasShopify && shopifyProducts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                <ShoppingBag className="w-3 h-3" /> Shopify Products
              </div>
              {shopifyProducts.length > 5 && (
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <Input
                    value={shopifySearch}
                    onChange={(e) => setShopifySearch(e.target.value)}
                    placeholder="Search products..."
                    className="pl-7 h-7 text-xs"
                  />
                </div>
              )}
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredShopifyProducts.map((sp) => {
                  const isSelected = selectedShopifyIds.includes(sp.id);
                  const images = shopifyImages[sp.id] || [];
                  const bestImage = pickBestImage(images);
                  const thumbUrl = bestImage
                    ? (bestImage.processed_url || bestImage.imagekit_url || bestImage.original_url)
                    : null;

                  return (
                    <label key={sp.id} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-muted/50">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleShopifyProduct(sp.id)}
                        disabled={!isSelected && selectedShopifyIds.length >= 3}
                      />
                      {thumbUrl && (
                        <img src={thumbUrl} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
                      )}
                      <span className="text-xs font-medium truncate">{sp.title}</span>
                    </label>
                  );
                })}
              </div>
              {selectedShopifyIds.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {selectedShopifyIds.map((id) => {
                    const sp = shopifyProducts.find((p) => p.id === id);
                    const images = shopifyImages[id] || [];
                    const bestImage = pickBestImage(images);
                    const thumbUrl = bestImage
                      ? (bestImage.processed_url || bestImage.imagekit_url || bestImage.original_url)
                      : null;
                    return (
                      <div key={id} className="flex items-center gap-1 bg-primary/10 rounded px-1.5 py-0.5">
                        {thumbUrl && <img src={thumbUrl} alt="" className="w-4 h-4 rounded object-cover" />}
                        <span className="text-[10px] font-medium">{sp?.title}</span>
                      </div>
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
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleProduct(product.id)}
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
