import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface KlaviyoItem {
  id: string;
  attributes: { name: string };
}

interface Props {
  brandId: string;
  selectedListIds: string[];
  selectedSegmentIds: string[];
  onSelectionChange: (listIds: string[], segmentIds: string[]) => void;
}

export default function SegmentSelector({ brandId, selectedListIds, selectedSegmentIds, onSelectionChange }: Props) {
  const [connected, setConnected] = useState(false);
  const [lists, setLists] = useState<KlaviyoItem[]>([]);
  const [segments, setSegments] = useState<KlaviyoItem[]>([]);
  const [presets, setPresets] = useState<{ id: string; name: string; list_ids: string[]; segment_ids: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

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

  const toggleList = (id: string) => {
    const next = selectedListIds.includes(id) ? selectedListIds.filter(x => x !== id) : [...selectedListIds, id];
    onSelectionChange(next, selectedSegmentIds);
  };

  const toggleSegment = (id: string) => {
    const next = selectedSegmentIds.includes(id) ? selectedSegmentIds.filter(x => x !== id) : [...selectedSegmentIds, id];
    onSelectionChange(selectedListIds, next);
  };

  const applyPreset = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;
    onSelectionChange(preset.list_ids || [], preset.segment_ids || []);
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

  const totalSelected = selectedListIds.length + selectedSegmentIds.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Audience
        </label>
        {totalSelected > 0 && (
          <Badge variant="secondary" className="text-[10px]">{totalSelected} selected</Badge>
        )}
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

      {lists.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Lists</p>
          <div className="max-h-32 overflow-y-auto space-y-1 rounded border border-border p-2 bg-card">
            {lists.map(l => (
              <label key={l.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                <Checkbox
                  checked={selectedListIds.includes(l.id)}
                  onCheckedChange={() => toggleList(l.id)}
                  className="h-3.5 w-3.5"
                />
                <span className="truncate">{l.attributes?.name || l.id}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {segments.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Segments</p>
          <div className="max-h-32 overflow-y-auto space-y-1 rounded border border-border p-2 bg-card">
            {segments.map(s => (
              <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                <Checkbox
                  checked={selectedSegmentIds.includes(s.id)}
                  onCheckedChange={() => toggleSegment(s.id)}
                  className="h-3.5 w-3.5"
                />
                <span className="truncate">{s.attributes?.name || s.id}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {totalSelected > 0 && (
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
