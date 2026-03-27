import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp, Image as ImageIcon, Check, X, Wand2, RefreshCw, Clock, Ban } from "lucide-react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string | null;
  product_type: string | null;
  status: string | null;
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
  processing_status: string;
  usable_as_hero: boolean | null;
  usable_as_product_shot: boolean | null;
  is_usable_product_photo: boolean | null;
  has_text_overlay: boolean | null;
  is_marketing_collateral: boolean | null;
  has_salvageable_product: boolean | null;
  rescue_strategy: string | null;
  rescue_transforms: string | null;
}

export default function ShopifyProductGrid({ brandId }: { brandId: string }) {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [images, setImages] = useState<Record<string, ShopifyImage[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRejected, setShowRejected] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: prods } = await supabase
        .from("shopify_products")
        .select("id, title, handle, product_type, status, best_hero_image_id")
        .eq("brand_id", brandId)
        .order("title");
      setProducts((prods || []) as ShopifyProduct[]);

      const { data: imgs } = await supabase
        .from("shopify_product_images")
        .select("id, product_id, original_url, imagekit_url, processed_url, image_type, subject_description, processing_status, usable_as_hero, usable_as_product_shot, is_usable_product_photo, has_text_overlay, is_marketing_collateral, has_salvageable_product, rescue_strategy, rescue_transforms")
        .eq("brand_id", brandId);

      const grouped: Record<string, ShopifyImage[]> = {};
      for (const img of (imgs || []) as ShopifyImage[]) {
        if (!grouped[img.product_id]) grouped[img.product_id] = [];
        grouped[img.product_id].push(img);
      }
      setImages(grouped);
      setLoading(false);
    };
    load();
  }, [brandId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (products.length === 0) return <p className="text-sm text-muted-foreground py-4">No Shopify products synced yet.</p>;

  const rejectionReason = (img: ShopifyImage) => {
    if (img.is_marketing_collateral) return "Unsalvageable collateral";
    if (img.has_text_overlay) return "Text covers product";
    return "Not usable";
  };

  const rescueLabel = (strategy: string | null) => {
    switch (strategy) {
      case "bg_remove": return "BG removed";
      case "smart_crop": return "AI cropped";
      case "bg_remove_and_crop": return "BG removed + cropped";
      case "crop_top": return "Top cropped";
      case "crop_bottom": return "Bottom cropped";
      default: return "Processed";
    }
  };

  const typeLabel = (t: string | null) => {
    if (!t) return null;
    return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Filter out products with zero ready images
  const productsWithImages = products.filter((p) => {
    const prodImages = images[p.id] || [];
    return prodImages.some((i) => i.processing_status === "ready");
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Shopify Products ({productsWithImages.length})</h3>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Switch checked={showRejected} onCheckedChange={setShowRejected} className="scale-75" />
          Show rejected
        </label>
      </div>
      {productsWithImages.map((product) => {
        const prodImages = images[product.id] || [];
        const readyImages = prodImages.filter((i) => i.processing_status === "ready");
        const rescuedImages = readyImages.filter((i) => i.rescue_strategy && !i.is_usable_product_photo);
        const cleanImages = readyImages.filter((i) => i.is_usable_product_photo === true);
        const rejectedImages = prodImages.filter((i) => i.processing_status === "rejected");
        const displayImages = showRejected ? prodImages : readyImages;
        const firstUsable = readyImages.find((i) => i.processing_status === "ready");
        const isExpanded = expandedId === product.id;

        return (
          <div key={product.id} className="border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : product.id)}
              className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
            >
              {firstUsable ? (
                <img
                  src={firstUsable.processed_url || firstUsable.imagekit_url || firstUsable.original_url}
                  alt=""
                  className="w-10 h-10 rounded object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{product.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  {cleanImages.length} clean{rescuedImages.length > 0 && ` + ${rescuedImages.length} rescued`} of {prodImages.length} images
                  {rejectedImages.length > 0 && ` • ${rejectedImages.length} rejected`}
                </p>
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {isExpanded && displayImages.length > 0 && (
              <div className="border-t border-border p-3 grid grid-cols-3 gap-2">
                {displayImages.map((img) => {
                  const isRejected = img.processing_status === "rejected";
                  const isReady = img.processing_status === "ready";
                  const isRescued = isReady && img.rescue_strategy && !img.is_usable_product_photo;
                  const isBestHero = product.best_hero_image_id === img.id;

                  return (
                    <div key={img.id} className="space-y-1">
                      <div className={`relative aspect-square rounded overflow-hidden border ${isRejected ? "border-destructive/30 opacity-50" : isRescued ? "border-amber-500/50" : "border-border"}`}>
                        <img
                          src={img.processed_url || img.imagekit_url || img.original_url}
                          alt=""
                          className={`w-full h-full object-cover ${isRejected ? "grayscale" : ""}`}
                        />
                        {isRejected && (
                          <div className="absolute inset-0 bg-destructive/10 flex items-center justify-center">
                            <X className="w-6 h-6 text-destructive/60" />
                          </div>
                        )}
                        {isReady && !isRescued && (
                          <div className="absolute top-1 left-1 bg-green-500 rounded-full p-0.5">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                        {isRescued && (
                          <div className="absolute top-1 left-1 bg-amber-500 rounded-full p-0.5">
                            <Wand2 className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                        {isBestHero && (
                          <Badge className="absolute top-1 right-1 text-[7px] px-1 py-0 bg-primary">
                            Hero
                          </Badge>
                        )}
                      </div>
                      {isRescued && (
                        <Badge variant="outline" className="text-[8px] w-full justify-center border-amber-500/50 text-amber-600">
                          {rescueLabel(img.rescue_strategy)}
                        </Badge>
                      )}
                      {isRejected && (
                        <Badge variant="destructive" className="text-[8px] w-full justify-center">
                          {rejectionReason(img)}
                        </Badge>
                      )}
                      {!isRejected && !isRescued && img.image_type && (
                        <Badge variant="outline" className="text-[8px] w-full justify-center">
                          {typeLabel(img.image_type)}
                        </Badge>
                      )}
                      {img.subject_description && (
                        <p className="text-[9px] text-muted-foreground line-clamp-2">{img.subject_description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
