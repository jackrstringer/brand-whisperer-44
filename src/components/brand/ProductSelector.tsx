import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronUp, Plus, Package, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import ProductCreator from "./ProductCreator";
import type { Product, ProductAsset } from "@/lib/types";

interface ProductSelectorProps {
  brandId: string;
  selectedProductIds: string[];
  pinnedAssetUrls: string[];
  onSelectionChange: (productIds: string[], pinnedUrls: string[]) => void;
}

export default function ProductSelector({
  brandId,
  selectedProductIds,
  pinnedAssetUrls,
  onSelectionChange,
}: ProductSelectorProps) {
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [assets, setAssets] = useState<Record<string, ProductAsset[]>>({});

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false });
    setProducts((data || []) as Product[]);
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

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  useEffect(() => {
    if (selectedProductIds.length > 0) fetchAssetsForProducts(selectedProductIds);
  }, [selectedProductIds, fetchAssetsForProducts]);

  const toggleProduct = (productId: string) => {
    const isSelected = selectedProductIds.includes(productId);
    const newIds = isSelected
      ? selectedProductIds.filter((id) => id !== productId)
      : [...selectedProductIds, productId];

    // Remove pinned URLs from deselected products
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

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium">Products</span>
          {selectedProductIds.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">
              {selectedProductIds.length} selected
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border p-3 space-y-3">
          {products.length > 0 && (
            <div className="space-y-2">
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

          {products.length === 0 && !creating && (
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
