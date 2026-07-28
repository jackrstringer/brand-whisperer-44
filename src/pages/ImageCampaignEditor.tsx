import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, RotateCcw, Loader2, Send, Trash2, ExternalLink, Wand2 } from "lucide-react";

interface DesignSystem {
  palette: { role: string; hex: string }[];
  typography: { heading: string; body: string; weight_and_tone: string };
  product_treatment: string;
  mood: string;
  mockup_style: string;
  background_treatment: string;
  brand_voice: string;
  slice_shape_language: string;
}

interface CampaignSlice {
  id: string;
  campaign_id: string;
  position: number;
  archetype_slug: string | null;
  image_url: string | null;
  headline_copy: string | null;
  body_copy: string | null;
  cta_label: string | null;
  cta_url: string | null;
  aspect_ratio: string;
  composition_brief: string | null;
  generation_status: "pending" | "generating" | "complete" | "failed";
  last_error: string | null;
}

interface CampaignRow {
  id: string;
  brand_id: string;
  name: string;
  brief: string | null;
  status: string;
  last_error: string | null;
  design_system: DesignSystem | null;
  klaviyo_template_id: string | null;
}

function aspectStyle(ratio: string): React.CSSProperties {
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h) return { aspectRatio: "4 / 5" };
  return { aspectRatio: `${w} / ${h}` };
}

export default function ImageCampaignEditor() {
  const { brandId, campaignId } = useParams<{ brandId: string; campaignId: string }>();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [slices, setSlices] = useState<CampaignSlice[]>([]);
  const [briefDraft, setBriefDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [pushingKlaviyo, setPushingKlaviyo] = useState(false);
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!campaignId) return;
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from("campaigns").select("*").eq("id", campaignId).single(),
      supabase.from("campaign_slices").select("*").eq("campaign_id", campaignId).order("position"),
    ]);
    if (c) {
      setCampaign(c as unknown as CampaignRow);
      if (!briefDraft) setBriefDraft((c as any).brief || "");
    }
    if (s) setSlices(s as unknown as CampaignSlice[]);
    setLoading(false);
  }, [campaignId, briefDraft]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Poll while anything is generating
  useEffect(() => {
    const anyActive = campaign?.status === "generating"
      || slices.some(s => s.generation_status === "pending" || s.generation_status === "generating");
    if (!anyActive) return;
    const id = setInterval(loadAll, 3000);
    return () => clearInterval(id);
  }, [campaign?.status, slices, loadAll]);

  const selectedSlice = useMemo(
    () => slices.find(s => s.id === selectedSliceId) || null,
    [slices, selectedSliceId]
  );

  const handlePlan = async () => {
    if (!campaignId || !briefDraft.trim()) {
      toast.error("Write a brief first");
      return;
    }
    setPlanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("plan-image-email", {
        body: { campaignId, brief: briefDraft.trim() },
      });
      if (error) throw error;
      toast.success("Planning + generating slices — this takes 1–3 minutes");
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Failed to start planner");
    } finally {
      setPlanning(false);
    }
  };

  const handleRegenerateSlice = async (sliceId: string) => {
    await supabase.from("campaign_slices")
      .update({ generation_status: "pending", last_error: null })
      .eq("id", sliceId);
    setSlices(prev => prev.map(s => s.id === sliceId ? { ...s, generation_status: "pending", last_error: null } : s));
    const { error } = await supabase.functions.invoke("generate-slice", { body: { sliceId, campaignId } });
    if (error) toast.error(error.message);
  };

  const handleUpdateSlice = async (sliceId: string, patch: Partial<CampaignSlice>) => {
    const { error } = await supabase.from("campaign_slices").update(patch).eq("id", sliceId);
    if (error) { toast.error(error.message); return; }
    setSlices(prev => prev.map(s => s.id === sliceId ? { ...s, ...patch } as CampaignSlice : s));
  };

  const handleDeleteSlice = async (sliceId: string) => {
    await supabase.from("campaign_slices").delete().eq("id", sliceId);
    setSlices(prev => prev.filter(s => s.id !== sliceId));
    if (selectedSliceId === sliceId) setSelectedSliceId(null);
  };

  const handlePushToKlaviyo = async () => {
    if (!campaignId) return;
    setPushingKlaviyo(true);
    try {
      const { data, error } = await supabase.functions.invoke("push-image-email-klaviyo", {
        body: { campaignId },
      });
      if (error) throw error;
      toast.success("Pushed to Klaviyo as a drag-and-drop template");
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || "Failed to push");
    } finally {
      setPushingKlaviyo(false);
    }
  };

  const completeCount = slices.filter(s => s.generation_status === "complete").length;

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!campaign) {
    return <div className="p-10">Campaign not found.</div>;
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left rail: brief + design system */}
      <aside className="w-[340px] border-r border-border p-5 flex flex-col gap-5 overflow-y-auto">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/brands/${brandId}`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Campaigns
          </Button>
        </div>

        <div>
          <Input
            value={campaign.name}
            onChange={(e) => setCampaign({ ...campaign, name: e.target.value })}
            onBlur={async (e) => {
              await supabase.from("campaigns").update({ name: e.target.value }).eq("id", campaign.id);
            }}
            className="text-lg font-semibold border-0 px-0 focus-visible:ring-0"
          />
          <p className="text-xs text-muted-foreground mt-1">Image-slice email · {slices.length} slice{slices.length !== 1 ? "s" : ""}</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Brief</label>
          <Textarea
            value={briefDraft}
            onChange={(e) => setBriefDraft(e.target.value)}
            placeholder="Describe the email you want. Include the offer, product focus, mood, angle, urgency…"
            className="min-h-[140px] text-sm"
          />
          <Button
            onClick={handlePlan}
            disabled={planning || !briefDraft.trim() || campaign.status === "generating"}
            className="w-full"
          >
            {planning || campaign.status === "generating" ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : slices.length > 0 ? (
              <><Wand2 className="w-4 h-4 mr-2" /> Re-plan email</>
            ) : (
              <><Wand2 className="w-4 h-4 mr-2" /> Plan + generate slices</>
            )}
          </Button>
          {campaign.status === "error" && campaign.last_error && (
            <p className="text-xs text-destructive break-words">{campaign.last_error}</p>
          )}
        </div>

        {campaign.design_system && (
          <div className="space-y-3 pt-4 border-t border-border">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Locked Design System</h3>
            <div className="flex gap-1.5">
              {campaign.design_system.palette.map((p, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${p.role}: ${p.hex}`}>
                  <div className="w-full aspect-square rounded" style={{ backgroundColor: p.hex }} />
                  <span className="text-[9px] text-muted-foreground uppercase">{p.role}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 text-xs">
              <div><span className="text-muted-foreground">Mood:</span> {campaign.design_system.mood}</div>
              <div><span className="text-muted-foreground">Style:</span> {campaign.design_system.mockup_style}</div>
              <div><span className="text-muted-foreground">Shape:</span> {campaign.design_system.slice_shape_language}</div>
              <div><span className="text-muted-foreground">Voice:</span> {campaign.design_system.brand_voice}</div>
            </div>
          </div>
        )}

        {completeCount > 0 && (
          <div className="pt-4 border-t border-border space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={handlePushToKlaviyo}
              disabled={pushingKlaviyo || completeCount < slices.length}
            >
              {pushingKlaviyo ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Pushing…</>
              ) : (
                <><Send className="w-4 h-4 mr-2" /> Push to Klaviyo</>
              )}
            </Button>
            {campaign.klaviyo_template_id && (
              <a
                href={`https://www.klaviyo.com/template/${campaign.klaviyo_template_id}/edit`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Open in Klaviyo <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </aside>

      {/* Center: stitched preview */}
      <main className="flex-1 overflow-y-auto py-10 px-6 bg-muted/30">
        {slices.length === 0 ? (
          <div className="max-w-md mx-auto text-center text-muted-foreground text-sm py-24">
            Your image email is empty. Write a brief on the left and hit
            <span className="mx-1 font-medium text-foreground">Plan + generate slices</span>
            — the planner will design a locked visual system and generate 3–7 image slices that stack into a full email.
          </div>
        ) : (
          <div className="mx-auto w-[600px] max-w-full bg-white shadow-xl rounded overflow-hidden">
            {slices.map((s) => (
              <SlicePreview
                key={s.id}
                slice={s}
                selected={s.id === selectedSliceId}
                onSelect={() => setSelectedSliceId(s.id)}
                onRegenerate={() => handleRegenerateSlice(s.id)}
                onDelete={() => handleDeleteSlice(s.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Right rail: slice inspector */}
      <aside className="w-[320px] border-l border-border p-5 overflow-y-auto">
        {selectedSlice ? (
          <SliceInspector
            slice={selectedSlice}
            onUpdate={(patch) => handleUpdateSlice(selectedSlice.id, patch)}
            onRegenerate={() => handleRegenerateSlice(selectedSlice.id)}
          />
        ) : (
          <div className="text-xs text-muted-foreground">
            Select a slice on the left to edit its copy, CTA URL, or composition brief.
          </div>
        )}
      </aside>
    </div>
  );
}

function SlicePreview({
  slice, selected, onSelect, onRegenerate, onDelete,
}: {
  slice: CampaignSlice;
  selected: boolean;
  onSelect: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
}) {
  const status = slice.generation_status;
  return (
    <div
      onClick={onSelect}
      className={`relative group cursor-pointer border-2 transition ${selected ? "border-primary" : "border-transparent"}`}
      style={aspectStyle(slice.aspect_ratio)}
    >
      {status === "complete" && slice.image_url ? (
        slice.cta_url ? (
          <a href={slice.cta_url} target="_blank" rel="noreferrer" className="block w-full h-full" onClick={(e) => e.preventDefault()}>
            <img src={slice.image_url} alt={slice.headline_copy || ""} className="w-full h-full object-cover" />
          </a>
        ) : (
          <img src={slice.image_url} alt={slice.headline_copy || ""} className="w-full h-full object-cover" />
        )
      ) : status === "generating" || status === "pending" ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-muted/50 text-xs text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>{status === "generating" ? "Generating" : "Queued"} · slice {slice.position}</span>
          {slice.headline_copy && <span className="text-[10px] px-4 text-center italic">{slice.headline_copy}</span>}
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-destructive/5 text-xs text-destructive gap-2 p-4 text-center">
          <span className="font-medium">Slice failed</span>
          {slice.last_error && <span className="text-[10px] opacity-80">{slice.last_error.slice(0, 200)}</span>}
        </div>
      )}

      {/* Hover controls */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onRegenerate(); }}
          className="bg-black/70 text-white p-1.5 rounded hover:bg-black"
          title="Regenerate this slice"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="bg-black/70 text-white p-1.5 rounded hover:bg-destructive"
          title="Delete slice"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Badge variant="secondary" className="text-[10px]">
          {slice.position} · {slice.archetype_slug} · {slice.aspect_ratio}
        </Badge>
      </div>
    </div>
  );
}

function SliceInspector({
  slice, onUpdate, onRegenerate,
}: {
  slice: CampaignSlice;
  onUpdate: (patch: Partial<CampaignSlice>) => void;
  onRegenerate: () => void;
}) {
  const [local, setLocal] = useState({
    headline_copy: slice.headline_copy || "",
    body_copy: slice.body_copy || "",
    cta_label: slice.cta_label || "",
    cta_url: slice.cta_url || "",
    aspect_ratio: slice.aspect_ratio,
    composition_brief: slice.composition_brief || "",
  });

  useEffect(() => {
    setLocal({
      headline_copy: slice.headline_copy || "",
      body_copy: slice.body_copy || "",
      cta_label: slice.cta_label || "",
      cta_url: slice.cta_url || "",
      aspect_ratio: slice.aspect_ratio,
      composition_brief: slice.composition_brief || "",
    });
  }, [slice.id]);

  const save = (patch: Partial<typeof local>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    onUpdate(patch as Partial<CampaignSlice>);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Slice {slice.position}</h3>
        <p className="text-xs text-muted-foreground">{slice.archetype_slug}</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Headline</label>
        <Input value={local.headline_copy} onChange={(e) => save({ headline_copy: e.target.value })} className="text-sm" />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Body copy</label>
        <Textarea value={local.body_copy} onChange={(e) => save({ body_copy: e.target.value })} className="text-sm min-h-[80px]" />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">CTA label</label>
        <Input value={local.cta_label} onChange={(e) => save({ cta_label: e.target.value })} className="text-sm" />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">CTA URL (whole slice links here)</label>
        <Input value={local.cta_url} onChange={(e) => save({ cta_url: e.target.value })} placeholder="https://" className="text-sm" />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Aspect ratio</label>
        <Input value={local.aspect_ratio} onChange={(e) => save({ aspect_ratio: e.target.value })} className="text-sm" />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Composition brief</label>
        <Textarea value={local.composition_brief} onChange={(e) => save({ composition_brief: e.target.value })} className="text-sm min-h-[80px]" />
      </div>

      <Button onClick={onRegenerate} variant="outline" className="w-full">
        <RotateCcw className="w-4 h-4 mr-2" /> Regenerate slice
      </Button>

      {slice.image_url && (
        <a href={slice.image_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline break-all">
          Open full-res image ↗
        </a>
      )}
    </div>
  );
}