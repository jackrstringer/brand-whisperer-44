import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Save, Search } from "lucide-react";
import { toast } from "sonner";

interface KlaviyoItem {
  id: string;
  attributes: { name: string };
}

interface Props {
  brandId: string;
  selectedListIds: string[];
  selectedSegmentIds: string[];
  excludeListIds?: string[];
  excludeSegmentIds?: string[];
  onSelectionChange: (listIds: string[], segmentIds: string[], excludeListIds?: string[], excludeSegmentIds?: string[]) => void;
}

export default function SegmentSelector({ brandId, selectedListIds, selectedSegmentIds, excludeListIds = [], excludeSegmentIds = [], onSelectionChange }: Props) {
  const [connected, setConnected] = useState(false);
  const [lists, setLists] = useState<KlaviyoItem[]>([]);
  const [segments, setSegments] = useState<KlaviyoItem[]>([]);
  const [presets, setPresets] = useState<{ id: string; name: string; list_ids: string[]; segment_ids: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [includeSearch, setIncludeSearch] = useState("");
  const [excludeSearch, setExcludeSearch] = useState("");

  useEffect(() => {
    loadData();
  }, [brandId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ data: conn }, { data: presetData }] = await Promise.all([
        supabase.from("klaviyo_connections").select("cached_lists, cached_segments").eq("brand_id", brandId).maybeSingle(),
        supabase.from("brand_segment_presets").select("*").eq("brand_id", brandId).order("created_at", { ascending: false }),
      ]);

      if (conn) {
        setConnected(true);
        setLists((conn.cached_lists as any[] || []) as KlaviyoItem[]);
        setSegments((conn.cached_segments as any[] || []) as KlaviyoItem[]);
      }
      setPresets((presetData || []) as any[]);
    } catch {} finally {
      setLoading(false);
    }
  };

  const toggleIncludeList = (id: string) => {
    const next = selectedListIds.includes(id) ? selectedListIds.filter(x => x !== id) : [...selectedListIds, id];
    onSelectionChange(next, selectedSegmentIds, excludeListIds, excludeSegmentIds);
  };

  const toggleIncludeSegment = (id: string) => {
    const next = selectedSegmentIds.includes(id) ? selectedSegmentIds.filter(x => x !== id) : [...selectedSegmentIds, id];
    onSelectionChange(selectedListIds, next, excludeListIds, excludeSegmentIds);
  };

  const toggleExcludeList = (id: string) => {
    const next = excludeListIds.includes(id) ? excludeListIds.filter(x => x !== id) : [...excludeListIds, id];
    onSelectionChange(selectedListIds, selectedSegmentIds, next, excludeSegmentIds);
  };

  const toggleExcludeSegment = (id: string) => {
    const next = excludeSegmentIds.includes(id) ? excludeSegmentIds.filter(x => x !== id) : [...excludeSegmentIds, id];
    onSelectionChange(selectedListIds, selectedSegmentIds, excludeListIds, next);
  };

  const applyPreset = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;
    onSelectionChange(preset.list_ids || [], preset.segment_ids || [], excludeListIds, excludeSegmentIds);
  };

  const savePreset = async () => {
    if (!presetName.trim()) return;
    const { error } = await supabase.from("brand_segment_presets").insert({
      brand_id: brandId,
      name: presetName.trim(),
      list_ids: selectedListIds,
      segment_ids: selectedSegmentIds,
    } as any);
    if (error) { toast.error("Failed to save preset"); return; }
    toast.success("Preset saved");
    setPresetName("");
    setSaveOpen(false);
    loadData();
  };

  if (loading) return null;
  if (!connected) return null;

  const filterItems = (items: KlaviyoItem[], search: string) => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(item => (item.attributes?.name || item.id).toLowerCase().includes(q));
  };

  const totalIncluded = selectedListIds.length + selectedSegmentIds.length;
  const totalExcluded = excludeListIds.length + excludeSegmentIds.length;
  const filteredIncludeLists = filterItems(lists, includeSearch);
  const filteredIncludeSegments = filterItems(segments, includeSearch);
  const filteredExcludeLists = filterItems(lists, excludeSearch);
  const filteredExcludeSegments = filterItems(segments, excludeSearch);

  const renderCheckboxList = (
    items: KlaviyoItem[],
    selectedIds: string[],
    toggle: (id: string) => void,
    label: string,
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="max-h-28 overflow-y-auto space-y-0.5 rounded border border-border p-1.5 bg-card">
          {items.map(item => (
            <label key={item.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded px-1.5 py-1">
              <Checkbox
                checked={selectedIds.includes(item.id)}
                onCheckedChange={() => toggle(item.id)}
                className="h-3.5 w-3.5"
              />
              <span className="truncate">{item.attributes?.name || item.id}</span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Audience
        </label>
        <div className="flex gap-1.5">
          {totalIncluded > 0 && <Badge variant="secondary" className="text-[10px]">{totalIncluded} included</Badge>}
          {totalExcluded > 0 && <Badge variant="destructive" className="text-[10px]">{totalExcluded} excluded</Badge>}
        </div>
      </div>

      {presets.length > 0 && (
        <Select onValueChange={applyPreset}>
          <SelectTrigger className="bg-card border-border h-8 text-xs">
            <SelectValue placeholder="Load a saved preset..." />
          </SelectTrigger>
          <SelectContent>
            {presets.map(p => (
              <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Include section */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Include</p>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            value={includeSearch}
            onChange={e => setIncludeSearch(e.target.value)}
            placeholder="Search lists & segments..."
            className="h-7 text-xs pl-7 bg-card"
          />
        </div>
        {renderCheckboxList(filteredIncludeLists, selectedListIds, toggleIncludeList, "Lists")}
        {renderCheckboxList(filteredIncludeSegments, selectedSegmentIds, toggleIncludeSegment, "Segments")}
      </div>

      {/* Exclude section */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Exclude</p>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            value={excludeSearch}
            onChange={e => setExcludeSearch(e.target.value)}
            placeholder="Search to exclude..."
            className="h-7 text-xs pl-7 bg-card"
          />
        </div>
        {renderCheckboxList(filteredExcludeLists, excludeListIds, toggleExcludeList, "Lists")}
        {renderCheckboxList(filteredExcludeSegments, excludeSegmentIds, toggleExcludeSegment, "Segments")}
      </div>

      {totalIncluded > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setSaveOpen(true)} className="text-xs h-7">
          <Save className="w-3 h-3 mr-1" /> Save as Preset
        </Button>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Save Audience Preset</DialogTitle></DialogHeader>
          <Input value={presetName} onChange={e => setPresetName(e.target.value)} placeholder="e.g. VIP + Engaged" className="mt-2" />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={savePreset} disabled={!presetName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
