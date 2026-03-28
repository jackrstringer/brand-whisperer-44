import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { X, Search, Image as ImageIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AssetItem {
  id: string;
  url: string;
  category: string;
  filename: string | null;
  description: string | null;
  source: "brand" | "product";
  productName?: string;
}

interface ImageSwapPanelProps {
  brandId: string;
  currentSrc: string;
  currentCategory: string;
  onSwap: (url: string) => void;
  onClose: () => void;
  onAssetsLoaded?: (urls: string[]) => void;
}

const CATEGORY_TABS = [
  { id: "all", label: "All" },
  { id: "lifestyle", label: "Lifestyle" },
  { id: "product_imagery", label: "Product" },
  { id: "transparent_bg", label: "Transparent" },
  { id: "hero_shots", label: "Hero" },
  { id: "logo", label: "Logo" },
];

export default function ImageSwapPanel({ brandId, currentSrc, currentCategory, onSwap, onClose, onAssetsLoaded }: ImageSwapPanelProps) {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState(currentCategory || "all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Load brand assets
      const { data: brandAssets } = await supabase
        .from("brand_assets")
        .select("id, url, category, filename, description")
        .eq("brand_id", brandId);

      // Load product assets
      const { data: productAssets } = await supabase
        .from("product_assets")
        .select("id, url, bucket, filename, description, product_id")
        .eq("brand_id", brandId);

      // Load product names
      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .eq("brand_id", brandId);

      const productMap = new Map((products || []).map(p => [p.id, p.name]));

      const items: AssetItem[] = [
        ...(brandAssets || []).map(a => ({
          id: a.id,
          url: a.url,
          category: a.category,
          filename: a.filename,
          description: a.description,
          source: "brand" as const,
        })),
        ...(productAssets || []).map(a => ({
          id: a.id,
          url: a.url,
          category: a.bucket,
          filename: a.filename,
          description: a.description,
          source: "product" as const,
          productName: productMap.get(a.product_id) || undefined,
        })),
      ];

      setAssets(items);
      setLoading(false);
    };
    load();
  }, [brandId]);

  const filtered = useMemo(() => {
    let result = assets;
    if (activeTab !== "all") {
      result = result.filter(a => a.category === activeTab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        (a.filename || "").toLowerCase().includes(q) ||
        (a.description || "").toLowerCase().includes(q) ||
        (a.productName || "").toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
      );
    }
    return result;
  }, [assets, activeTab, search]);

  // Report filtered asset URLs to parent for arrow cycling
  useEffect(() => {
    onAssetsLoaded?.(filtered.map(a => a.url));
  }, [filtered, onAssetsLoaded]);

  // Sync activeTab when parent changes currentCategory
  useEffect(() => {
    if (currentCategory && currentCategory !== activeTab) {
      setActiveTab(currentCategory);
    }
  }, [currentCategory]);

  return (
    <div className="h-full flex flex-col bg-background border-r border-border" style={{ width: 320 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Swap Image</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets..."
            className="pl-8 h-8 text-xs bg-card border-border"
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="px-3 py-2 border-b border-border shrink-0 flex gap-1 flex-wrap">
        {CATEGORY_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
              activeTab === tab.id
                ? "bg-primary/20 border-primary/30 text-primary font-medium"
                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/20"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Asset grid */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {loading ? (
            <div className="text-center py-8 text-xs text-muted-foreground">Loading assets...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">No assets found</div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {filtered.map(asset => {
                const isCurrentImage = currentSrc && asset.url && (
                  currentSrc.includes(asset.url.split("?")[0]) || asset.url.includes(currentSrc.split("?")[0])
                );
                return (
                  <button
                    key={asset.id}
                    onClick={() => onSwap(asset.url)}
                    className={`relative aspect-square rounded-md overflow-hidden border transition-all hover:ring-1 hover:ring-primary/40 ${
                      isCurrentImage
                        ? "border-primary ring-1 ring-primary/40"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <img
                      src={asset.url}
                      alt={asset.filename || asset.description || ""}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {asset.productName && (
                      <div className="absolute bottom-0 left-0 right-0 bg-background/80 px-1 py-0.5">
                        <p className="text-[8px] text-foreground truncate">{asset.productName}</p>
                      </div>
                    )}
                    {isCurrentImage && (
                      <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                        <span className="text-[9px] font-medium text-primary bg-background/90 px-1.5 py-0.5 rounded">Current</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Count */}
      <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground shrink-0">
        {filtered.length} asset{filtered.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
