import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Heart } from "lucide-react";
import { toast } from "sonner";

const CAMPAIGN_RENDER_WIDTH = 470;
const TARGET_COLUMN_WIDTH = 245;

function CampaignIframeThumbnail({ html, title }: { html: string; title?: string }) {
  const [contentHeight, setContentHeight] = useState(800);
  const [containerWidth, setContainerWidth] = useState(100);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const srcDoc = html.replace(
    /(<head[^>]*>)/i,
    '$1<meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0;pointer-events:none;scrollbar-width:none;-ms-overflow-style:none;}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none;}table{max-width:100%!important;width:100%!important;}img{max-width:100%!important;height:auto!important;}td{box-sizing:border-box!important;}</style>'
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 100;
      setContainerWidth(Math.max(1, width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const measure = () => {
        const h = Math.max(doc.body?.scrollHeight ?? 0, doc.documentElement?.scrollHeight ?? 0, 200);
        setContentHeight(h);
      };
      measure();
      const imgs = doc.querySelectorAll("img");
      imgs.forEach((img) => {
        if (!img.complete) img.addEventListener("load", measure, { once: true });
      });
      setTimeout(measure, 300);
      setTimeout(measure, 1000);
      setTimeout(measure, 2200);
    } catch {}
  }, []);

  const scale = containerWidth / CAMPAIGN_RENDER_WIDTH;
  const scaledHeight = Math.max(20, Math.round(contentHeight * scale));

  return (
    <div ref={containerRef} className="w-full min-w-0 overflow-hidden relative" style={{ height: scaledHeight }}>
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        sandbox="allow-same-origin"
        className="border-0 block bg-white pointer-events-none absolute top-0 left-0"
        style={{
          width: CAMPAIGN_RENDER_WIDTH,
          height: contentHeight,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        title={title || "Campaign preview"}
        tabIndex={-1}
        onLoad={onLoad}
      />
    </div>
  );
}

function MasonryGrid({ children, cols }: { children: React.ReactNode; cols: number }) {
  return (
    <div style={{ columnCount: cols, columnGap: 2, padding: 2 }}>
      {children}
    </div>
  );
}

interface ReferenceCampaign {
  id: string;
  title: string;
  brand_name: string | null;
  category: string | null;
  tags: string[] | null;
  thumbnail_url: string;
  image_urls: string[] | null;
}

interface SavedReference {
  id: string;
  reference_type: string;
  reference_id: string;
}

export type ReferenceMode = "reference" | "dupe";

export interface SelectedReference {
  type: "library" | "campaign";
  id: string;
  title: string;
  thumbnail_url: string;
  image_urls: string[];
  strength: number;
  mode: ReferenceMode;
}

interface ReferencePanelProps {
  brandId: string;
  campaignId: string;
  selectedReference: SelectedReference | null;
  onSelectReference: (ref: SelectedReference | null) => void;
}

const MODE_CONFIG: Record<ReferenceMode, { label: string; strength: number; description: string }> = {
  reference: { label: "Reference", strength: 7, description: "Strongly follows structure, sizing & layout — your brand's colors and fonts applied" },
  dupe: { label: "Dupe", strength: 10, description: "Exact layout clone — section-for-section match with your brand applied" },
};

type TabValue = "library" | "mine" | "saved";

export default function ReferencePanel({
  brandId,
  campaignId,
  selectedReference,
  onSelectReference,
}: ReferencePanelProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabValue>("library");
  const [libraryItems, setLibraryItems] = useState<ReferenceCampaign[]>([]);
  const [myCampaigns, setMyCampaigns] = useState<any[]>([]);
  const [savedRefs, setSavedRefs] = useState<SavedReference[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [zoomLevel, setZoomLevel] = useState(71); // 0=8cols, 100=1col, default ~3 cols

  useEffect(() => {
    supabase
      .from("reference_campaigns")
      .select("*")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (data) {
          setLibraryItems(data as ReferenceCampaign[]);
          const cats = [...new Set(data.map((d: any) => d.category).filter(Boolean))] as string[];
          setCategories(cats);
        }
      });
  }, []);

  useEffect(() => {
    if (!brandId) return;
    supabase
      .from("campaigns")
      .select("id, name, html, status, pinned_asset_urls")
      .eq("brand_id", brandId)
      .in("status", ["ready", "exported"])
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        if (data) setMyCampaigns(data);
      });
  }, [brandId]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("saved_references")
      .select("*")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (data) setSavedRefs(data as SavedReference[]);
      });
  }, [user]);

  const isSavedRef = useCallback(
    (type: string, id: string) => savedRefs.some((s) => s.reference_type === type && s.reference_id === id),
    [savedRefs]
  );

  const toggleSave = useCallback(
    async (type: string, id: string) => {
      if (!user) return;
      const existing = savedRefs.find((s) => s.reference_type === type && s.reference_id === id);
      if (existing) {
        setSavedRefs((prev) => prev.filter((s) => s.id !== existing.id));
        toast("Removed from favorites");
        await supabase.from("saved_references").delete().eq("id", existing.id);
      } else {
        const newRef = { id: crypto.randomUUID(), user_id: user.id, reference_type: type, reference_id: id, saved_at: new Date().toISOString() };
        setSavedRefs((prev) => [...prev, newRef as SavedReference]);
        toast("Saved to favorites");
        await supabase.from("saved_references").insert({ user_id: user.id, reference_type: type, reference_id: id });
      }
    },
    [user, savedRefs]
  );

  const handleUseAsReference = useCallback(
    (type: "library" | "campaign", id: string, title: string, thumbnailUrl: string, imageUrls: string[]) => {
      if (selectedReference?.id === id) {
        onSelectReference(null);
        return;
      }
      const storageKey = `ref-panel-${campaignId}`;
      const stored = localStorage.getItem(storageKey);
      let mode: ReferenceMode = "reference";
      if (stored) {
        try { mode = JSON.parse(stored).selectedReference?.mode || "reference"; } catch {}
      }
      const cfg = MODE_CONFIG[mode];
      onSelectReference({ type, id, title, thumbnail_url: thumbnailUrl, image_urls: imageUrls, strength: cfg.strength, mode });
    },
    [selectedReference, onSelectReference, campaignId]
  );

  useEffect(() => {
    const storageKey = `ref-panel-${campaignId}`;
    localStorage.setItem(storageKey, JSON.stringify({ selectedReference }));
  }, [selectedReference, campaignId]);

  const filteredLibrary = categoryFilter === "all"
    ? libraryItems
    : libraryItems.filter((item) => item.category === categoryFilter);

  const savedItems = savedRefs.map((s) => {
    if (s.reference_type === "library") {
      const item = libraryItems.find((l) => l.id === s.reference_id);
      return item ? { ...item, _source: "Library" as const } : null;
    } else {
      const item = myCampaigns.find((c) => c.id === s.reference_id);
      return item ? { id: item.id, title: item.name, brand_name: null, thumbnail_url: item.pinned_asset_urls?.[0] || "", image_urls: item.pinned_asset_urls || null, category: null, tags: null, _source: "Mine" as const } : null;
    }
  }).filter(Boolean);

  const getGridItems = (): { items: any[]; type: "library" | "campaign" }[] => {
    if (tab === "library") return [{ items: filteredLibrary, type: "library" }];
    if (tab === "mine") return [{ items: myCampaigns.map(c => ({ ...c, title: c.name, thumbnail_url: "", image_urls: [], html: c.html })), type: "campaign" }];
    return [{ items: savedItems as any[], type: "library" }];
  };

  const gridData = getGridItems();

  // Zoom: 0 = 8 cols (zoomed out), 100 = 1 col (zoomed in)
  const cols = Math.max(1, Math.min(8, Math.round(8 - (zoomLevel / 100) * 7)));

  return (
    <div className="h-full flex flex-col">
      {/* Header with tabs + zoom */}
      <div className="shrink-0 border-b border-border px-4 pt-2 pb-0">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex gap-1">
            {(["library", "mine", "saved"] as TabValue[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-[11px] px-3 py-1.5 rounded-t-md transition-colors ${
                  tab === t
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "library" ? "Library" : t === "mine" ? "My Campaigns" : "Saved"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] text-muted-foreground">{cols} wide</span>
            <input
              type="range"
              min={0}
              max={100}
              value={zoomLevel}
              onChange={(e) => setZoomLevel(Number(e.target.value))}
              className="w-24 h-1 accent-primary cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Category filters (library tab only) */}
      {tab === "library" && categories.length > 0 && (
        <div className="flex gap-1 px-4 py-2 flex-wrap shrink-0 border-b border-border">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${categoryFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${categoryFilter === cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Grid — responsive masonry using container width */}
      <ScrollArea className="flex-1">
        <MasonryGrid cols={cols}>
          {gridData.flatMap(({ items, type }) =>
            items.map((item: any) => {
              const id = item.id;
              const imageUrl = item.thumbnail_url || (item.image_urls?.[0]) || "";
              const hasHtml = !!item.html;
              const isSelected = selectedReference?.id === id;
              const saved = isSavedRef(item._source === "Mine" ? "campaign" : item._source === "Library" ? "library" : type, id);
              const refType: "library" | "campaign" = item._source === "Mine" ? "campaign" : item._source === "Library" ? "library" : type;

              return (
                <div
                  key={id}
                  className={`relative group rounded-lg overflow-hidden cursor-pointer border-2 transition-all min-w-0 w-full ${
                    isSelected ? "border-primary ring-2 ring-primary/20" : "border-transparent hover:border-border"
                  }`}
                  style={{ breakInside: "avoid", marginBottom: 2 }}
                >
                  {hasHtml ? (
                    <CampaignIframeThumbnail html={item.html} title={item.title} />
                  ) : imageUrl ? (
                    <div>
                      <img
                        src={imageUrl}
                        alt=""
                        className="w-full h-auto block"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="bg-muted flex items-center justify-center py-12">
                      <span className="text-[10px] text-muted-foreground">No preview</span>
                    </div>
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 z-10">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSave(refType, id); }}
                      className="absolute top-2 right-2 p-1.5 rounded-full bg-background/20 hover:bg-background/40 transition-colors"
                    >
                      <Heart className={`w-3.5 h-3.5 ${saved ? "fill-red-500 text-red-500" : "text-white"}`} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUseAsReference(refType, id, item.title || item.name || "", imageUrl, item.image_urls || []);
                      }}
                      className="text-[11px] font-medium text-white bg-primary/80 hover:bg-primary px-4 py-2 rounded-md transition-colors"
                    >
                      {isSelected ? "Remove reference" : "Use as reference"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
          {gridData.every(({ items }) => items.length === 0) && (
            <p className="text-xs text-muted-foreground text-center py-12">
              {tab === "library" ? "No reference campaigns yet" : tab === "mine" ? "No completed campaigns yet" : "No saved references"}
            </p>
          )}
        </MasonryGrid>
      </ScrollArea>

      {/* Sticky strength slider when reference selected */}
      {selectedReference && (
        <div className="shrink-0 border-t border-border p-4 space-y-3 bg-muted/30">
          <div className="flex items-center gap-2">
            {selectedReference.thumbnail_url && (
              <img src={selectedReference.thumbnail_url} className="w-10 h-10 rounded object-cover shrink-0" alt="" />
            )}
            <span className="text-xs font-medium truncate flex-1">{selectedReference.title}</span>
            <button onClick={() => onSelectReference(null)} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            <span className="text-[10px] text-muted-foreground">Reference mode</span>
            <div className="flex gap-1">
              {(Object.entries(MODE_CONFIG) as [ReferenceMode, typeof MODE_CONFIG["reference"]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => onSelectReference({ ...selectedReference, mode: key, strength: cfg.strength })}
                  className={`flex-1 text-[11px] py-1.5 px-2 rounded-md border transition-colors font-medium ${
                    selectedReference.mode === key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground italic">
              {MODE_CONFIG[selectedReference.mode]?.description || ""}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
