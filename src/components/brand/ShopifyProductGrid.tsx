import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Image as ImageIcon } from "lucide-react";
import { Loader2 } from "lucide-react";

interface ShopifyProduct {
  id: string;
  title: string;
  handle: string | null;
  product_type: string | null;
  status: string | null;
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
}

export default function ShopifyProductGrid({ brandId }: { brandId: string }) {
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [images, setImages] = useState<Record<string, ShopifyImage[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: prods } = await supabase
        .from("shopify_products")
        .select("id, title, handle, product_type, status")
        .eq("brand_id", brandId)
        .order("title");
      setProducts((prods || []) as ShopifyProduct[]);

      const { data: imgs } = await supabase
        .from("shopify_product_images")
        .select("id, product_id, original_url, imagekit_url, processed_url, image_type, subject_description, processing_status, usable_as_hero, usable_as_product_shot")
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

  const statusColor = (s: string) => {
    switch (s) {
      case "ready": return "default";
      case "pending": return "secondary";
      case "processing": return "secondary";
      case "failed": return "destructive";
      default: return "secondary";
    }
  };

  const typeLabel = (t: string | null) => {
    if (!t) return null;
    return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium mb-3">Shopify Products ({products.length})</h3>
      {products.map((product) => {
        const prodImages = images[product.id] || [];
        const readyCount = prodImages.filter((i) => i.processing_status === "ready").length;
        const firstReady = prodImages.find((i) => i.processing_status === "ready");
        const isExpanded = expandedId === product.id;

        return (
          <div key={product.id} className="border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : product.id)}
              className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
            >
              {firstReady ? (
                <img
                  src={firstReady.processed_url || firstReady.imagekit_url || firstReady.original_url}
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
                  {prodImages.length} images • {readyCount} ready
                </p>
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {isExpanded && prodImages.length > 0 && (
              <div className="border-t border-border p-3 grid grid-cols-3 gap-2">
                {prodImages.map((img) => (
                  <div key={img.id} className="space-y-1">
                    <div className="relative aspect-square rounded overflow-hidden border border-border">
                      <img
                        src={img.processed_url || img.imagekit_url || img.original_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      <Badge
                        variant={statusColor(img.processing_status) as any}
                        className="absolute top-1 right-1 text-[8px] px-1 py-0"
                      >
                        {img.processing_status}
                      </Badge>
                    </div>
                    {img.image_type && (
                      <Badge variant="outline" className="text-[8px] w-full justify-center">
                        {typeLabel(img.image_type)}
                      </Badge>
                    )}
                    {img.subject_description && (
                      <p className="text-[9px] text-muted-foreground line-clamp-2">{img.subject_description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
