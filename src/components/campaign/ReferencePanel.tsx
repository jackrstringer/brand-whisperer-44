import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Heart, Maximize2, ChevronRight } from "lucide-react";
import { toast } from "sonner";

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

export interface SelectedReference {
  type: "library" | "campaign";
  id: string;
  title: string;
  thumbnail_url: string;
  image_urls: string[];
  strength: number;
}

interface ReferencePanelProps {
  brandId: string;
  campaignId: string;
  isOpen: boolean;
  onToggle: () => void;
  selectedReference: SelectedReference | null;
  onSelectReference: (ref: SelectedReference | null) => void;
}

const STRENGTH_HINTS: Record<string, string> = {
  "1": "Light — subtle tonal influence on copy energy",
  "2": "Light — subtle tonal influence on copy energy",
  "3": "Light — subtle tonal influence on copy energy",
  "4": "Medium — borrows structural approach and pacing",
  "5": "Medium — borrows structural approach and pacing",
  "6": "Medium — borrows structural approach and pacing",
  "7": "Strong — closely follows layout and section flow",
  "8": "Strong — closely follows layout and section flow",
  "9": "Strong — closely follows layout and section flow",
  "10": "Full — direct structural template, brand applied on top",
};

function ThumbnailCard({
  thumbnailUrl,
  title,
  subtitle,
  isSaved,
  isSelected,
  badgeLabel,
  onSave,
  onUseAsReference,
  onExpand,
}: {
  thumbnailUrl: string;
  title: string;
  subtitle: string;
  isSaved: boolean;
  isSelected: boolean;
  badgeLabel?: string;
  onSave: () => void;
  onUseAsReference: () => void;
  onExpand: () => void;
}) {
  return (
    <div
      className={`relative group rounded-lg overflow-hidden border-2 transition-colors cursor-pointer ${
        isSelected ? "border-primary" : "border-transparent hover:border-border"
      }`}
    >
      <img
        src={thumbnailUrl}
        alt={title}
        className="w-full h-[180px] object-cover object-top"
        loading="lazy"
      />
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onSave(); }}
            className="p-1.5 rounded-full bg-background/20 hover:bg-background/40 transition-colors"
          >
            <Heart className={`w-4 h-4 ${isSaved ? "fill-red-500 text-red-500" : "text-white"}`} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onExpand(); }}
            className="p-1.5 rounded-full bg-background/20 hover:bg-background/40 transition-colors"
          >
            <Maximize2 className="w-4 h-4 text-white" />
          </button>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onUseAsReference(); }}
          className="text-[11px] font-medium text-white bg-primary/80 hover:bg-primary px-3 py-1.5 rounded-md transition-colors"
        >
          Use as reference
        </button>
      </div>
      {/* Info below */}
      <div className="p-1.5">
        <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
        {badgeLabel && (
          <Badge variant="outline" className="text-[9px] mt-0.5 px-1 py-0">{badgeLabel}</Badge>
        )}
      </div>
    </div>
  );
}

export default function ReferencePanel({
  brandId,
  campaignId,
  isOpen,
  onToggle,
  selectedReference,
  onSelectReference,
}: ReferencePanelProps) {
  const { user } = useAuth();
  const [tab, setTab] = useState("library");
  const [libraryItems, setLibraryItems] = useState<ReferenceCampaign[]>([]);
  const [myCampaigns, setMyCampaigns] = useState<any[]>([]);
  const [savedRefs, setSavedRefs] = useState<SavedReference[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [expandedItem, setExpandedItem] = useState<ReferenceCampaign | null>(null);

  // Load library items
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

  // Load my campaigns
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

  // Load saved references
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
      // Restore strength from localStorage if available
      const storageKey = `ref-panel-${campaignId}`;
      const stored = localStorage.getItem(storageKey);
      let strength = 5;
      if (stored) {
        try { strength = JSON.parse(stored).strength || 5; } catch {}
      }
      onSelectReference({ type, id, title, thumbnail_url: thumbnailUrl, image_urls: imageUrls, strength });
    },
    [selectedReference, onSelectReference, campaignId]
  );

  // Persist state to localStorage
  useEffect(() => {
    const storageKey = `ref-panel-${campaignId}`;
    const state = {
      isOpen,
      selectedReference,
    };
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [isOpen, selectedReference, campaignId]);

  // Collapsed strip
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="w-10 h-full bg-card border-r border-border flex flex-col items-center justify-center gap-2 hover:bg-accent/50 transition-colors shrink-0"
      >
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground writing-mode-vertical" style={{ writingMode: "vertical-rl" }}>
          References
        </span>
      </button>
    );
  }

  const filteredLibrary = categoryFilter === "all"
    ? libraryItems
    : libraryItems.filter((item) => item.category === categoryFilter);

  // Build saved tab items
  const savedItems = savedRefs.map((s) => {
    if (s.reference_type === "library") {
      const item = libraryItems.find((l) => l.id === s.reference_id);
      return item ? { ...item, _source: "Library" as const } : null;
    } else {
      const item = myCampaigns.find((c) => c.id === s.reference_id);
      return item ? { id: item.id, title: item.name, brand_name: null, thumbnail_url: "", image_urls: null, category: null, tags: null, _source: "Mine" as const } : null;
    }
  }).filter(Boolean);

  // Expanded lightbox
  if (expandedItem) {
    return (
      <div className="w-[280px] h-full bg-card border-r border-border flex flex-col shrink-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <button onClick={() => setExpandedItem(null)} className="text-xs text-muted-foreground hover:text-foreground">
            ← Back
          </button>
          <span className="text-xs font-medium truncate mx-2">{expandedItem.title}</span>
          <button onClick={onToggle} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {(expandedItem.image_urls || [expandedItem.thumbnail_url]).map((url, i) => (
              <img key={i} src={url} alt="" className="w-full rounded" loading="lazy" />
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="w-[280px] h-full bg-card border-r border-border flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-medium">Inspiration</span>
        <button onClick={onToggle} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent h-8 px-2">
          <TabsTrigger value="library" className="text-[11px] px-2 py-1 h-6 data-[state=active]:bg-muted">Library</TabsTrigger>
          <TabsTrigger value="mine" className="text-[11px] px-2 py-1 h-6 data-[state=active]:bg-muted">My Campaigns</TabsTrigger>
          <TabsTrigger value="saved" className="text-[11px] px-2 py-1 h-6 data-[state=active]:bg-muted">Saved</TabsTrigger>
        </TabsList>

        <TabsContent value="library" className="flex-1 min-h-0 mt-0">
          {/* Category filters */}
          {categories.length > 0 && (
            <div className="flex gap-1 p-2 flex-wrap">
              <button
                onClick={() => setCategoryFilter("all")}
                className={`text-[10px] px-2 py-0.5 rounded-full border ${categoryFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${categoryFilter === cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
          <ScrollArea className="flex-1 h-[calc(100%-2rem)]">
            <div className="grid grid-cols-2 gap-2 p-2">
              {filteredLibrary.map((item) => (
                <ThumbnailCard
                  key={item.id}
                  thumbnailUrl={item.thumbnail_url}
                  title={item.title}
                  subtitle={item.brand_name || ""}
                  isSaved={isSavedRef("library", item.id)}
                  isSelected={selectedReference?.id === item.id}
                  onSave={() => toggleSave("library", item.id)}
                  onUseAsReference={() => handleUseAsReference("library", item.id, item.title, item.thumbnail_url, item.image_urls || [])}
                  onExpand={() => setExpandedItem(item)}
                />
              ))}
              {filteredLibrary.length === 0 && (
                <p className="col-span-2 text-xs text-muted-foreground text-center py-8">No reference campaigns yet</p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="mine" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="grid grid-cols-2 gap-2 p-2">
              {myCampaigns.map((c) => (
                <ThumbnailCard
                  key={c.id}
                  thumbnailUrl={c.pinned_asset_urls?.[0] || ""}
                  title={c.name}
                  subtitle={c.name}
                  isSaved={isSavedRef("campaign", c.id)}
                  isSelected={selectedReference?.id === c.id}
                  onSave={() => toggleSave("campaign", c.id)}
                  onUseAsReference={() => handleUseAsReference("campaign", c.id, c.name, c.pinned_asset_urls?.[0] || "", c.pinned_asset_urls || [])}
                  onExpand={() => {}}
                />
              ))}
              {myCampaigns.length === 0 && (
                <p className="col-span-2 text-xs text-muted-foreground text-center py-8">No completed campaigns yet</p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="saved" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="grid grid-cols-2 gap-2 p-2">
              {savedItems.map((item: any) => (
                <ThumbnailCard
                  key={item.id}
                  thumbnailUrl={item.thumbnail_url || ""}
                  title={item.title || item.name}
                  subtitle={item.brand_name || item.title}
                  isSaved={true}
                  isSelected={selectedReference?.id === item.id}
                  badgeLabel={item._source}
                  onSave={() => toggleSave(item._source === "Library" ? "library" : "campaign", item.id)}
                  onUseAsReference={() => handleUseAsReference(
                    item._source === "Library" ? "library" : "campaign",
                    item.id,
                    item.title || item.name,
                    item.thumbnail_url || "",
                    item.image_urls || []
                  )}
                  onExpand={() => item._source === "Library" ? setExpandedItem(item) : null}
                />
              ))}
              {savedItems.length === 0 && (
                <p className="col-span-2 text-xs text-muted-foreground text-center py-8">No saved references</p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Reference control bar */}
      {selectedReference && (
        <div className="border-t border-border p-3 space-y-2 bg-muted/30">
          <div className="flex items-center gap-2">
            {selectedReference.thumbnail_url && (
              <img src={selectedReference.thumbnail_url} className="w-10 h-10 rounded object-cover shrink-0" alt="" />
            )}
            <span className="text-xs font-medium truncate flex-1">{selectedReference.title}</span>
            <button onClick={() => onSelectReference(null)} className="text-muted-foreground hover:text-foreground shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Reference strength</span>
              <span className="text-[10px] font-medium tabular-nums">{selectedReference.strength}</span>
            </div>
            <Slider
              value={[selectedReference.strength]}
              onValueChange={([v]) => onSelectReference({ ...selectedReference, strength: v })}
              min={1}
              max={10}
              step={1}
              className="w-full"
            />
            <p className="text-[9px] text-muted-foreground italic">
              {STRENGTH_HINTS[String(selectedReference.strength)] || ""}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
