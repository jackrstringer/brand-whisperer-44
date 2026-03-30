import { useEffect, useState, useCallback } from "react";
import { autoCropPadding } from "@/lib/autoCropPadding";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MoreVertical, Trash2, Pencil, Eye, EyeOff, Sparkles, CheckSquare, Square, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import ReferenceUploadZone from "@/components/admin/ReferenceUploadZone";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReferenceCampaignSlicesTab } from "@/components/admin/ReferenceCampaignSlicesTab";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CATEGORIES = [
  "Product Launch", "Seasonal", "Minimal", "Bold",
  "Editorial", "Lifestyle", "Promotional", "Re-engagement", "Other",
];

interface RefCampaign {
  id: string;
  title: string;
  brand_name: string | null;
  category: string | null;
  tags: string[] | null;
  thumbnail_url: string;
  image_urls: string[] | null;
  is_published: boolean;
  sort_order: number;
  industry: string | null;
  campaign_type: string | null;
  message_type: string | null;
  extracted_copy: string | null;
  ai_metadata: any | null;
  slicing_status: string | null;
  image_slice_urls: any[] | null;
  image_total_height: number | null;
}

export default function AdminLibrary() {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [campaigns, setCampaigns] = useState<RefCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [editingItem, setEditingItem] = useState<RefCampaign | null>(null);
  const [detailItem, setDetailItem] = useState<RefCampaign | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [brandName, setBrandName] = useState("");
  const [category, setCategory] = useState("Other");
  const [tags, setTags] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      toast.error("Access denied");
      navigate("/dashboard");
    }
  }, [adminLoading, isAdmin, navigate]);

  const loadCampaigns = useCallback(async () => {
    const { data } = await supabase
      .from("reference_campaigns")
      .select("*")
      .order("sort_order", { ascending: true });
    if (data) setCampaigns(data as unknown as RefCampaign[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const resetForm = () => {
    setTitle(""); setBrandName(""); setCategory("Other"); setTags(""); setIsPublished(false); setFiles([]);
    setEditingItem(null);
  };

  const openEdit = (item: RefCampaign) => {
    setEditingItem(item);
    setTitle(item.title);
    setBrandName(item.brand_name || "");
    setCategory(item.category || "Other");
    setTags((item.tags || []).join(", "));
    setIsPublished(item.is_published);
    setFiles([]);
    setShowUpload(true);
  };

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setUploading(true);

    try {
      const id = editingItem?.id || crypto.randomUUID();
      let imageUrls: string[] = editingItem?.image_urls || [];
      let thumbnailUrl = editingItem?.thumbnail_url || "";

      // Upload new files
      if (files.length > 0) {
        const uploadedUrls: string[] = [];
        for (const file of files) {
          const ext = file.name.split(".").pop() || "png";
          const path = `${id}/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage.from("reference-campaigns").upload(path, file, { contentType: file.type });
          if (error) { console.error(error); continue; }
          const { data } = supabase.storage.from("reference-campaigns").getPublicUrl(path);
          uploadedUrls.push(data.publicUrl);
        }
        if (editingItem) {
          imageUrls = [...imageUrls, ...uploadedUrls];
        } else {
          imageUrls = uploadedUrls;
        }
        if (!editingItem || !thumbnailUrl) {
          thumbnailUrl = uploadedUrls[0] || thumbnailUrl;
        }
      }

      if (!thumbnailUrl) { toast.error("At least one image is required"); setUploading(false); return; }

      const tagArr = tags.split(",").map((t) => t.trim()).filter(Boolean);

      const record = {
        id,
        title: title.trim(),
        brand_name: brandName.trim() || null,
        category,
        tags: tagArr.length > 0 ? tagArr : null,
        thumbnail_url: thumbnailUrl,
        image_urls: imageUrls,
        is_published: isPublished,
        sort_order: editingItem?.sort_order ?? campaigns.length,
      };

      if (editingItem) {
        await supabase.from("reference_campaigns").update(record).eq("id", id);
      } else {
        await supabase.from("reference_campaigns").insert(record);
      }

      toast.success(editingItem ? "Updated" : "Campaign uploaded");
      setShowUpload(false);
      resetForm();
      loadCampaigns();

      // Fire-and-forget AI analysis for new uploads with images
      if (imageUrls.length > 0) {
        toast.info("Analyzing campaign with AI...");
        supabase.functions.invoke("analyze-reference", {
          body: { referenceId: id, imageUrls },
        }).then(({ data, error }) => {
          if (error) {
            console.error("AI analysis error:", error);
            toast.error("AI analysis failed — you can edit metadata manually");
          } else {
            toast.success("AI analysis complete — metadata updated");
            loadCampaigns();
          }
        });

        // Fire-and-forget slicing
        supabase.functions.invoke("slice-reference", {
          body: { referenceCampaignId: id },
        }).catch((err) => console.error("Slice-reference trigger failed:", err));
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const reanalyze = async (item: RefCampaign) => {
    if (!item.image_urls?.length && !item.thumbnail_url) { toast.error("No images to analyze"); return; }
    toast.info("Re-processing campaign...");

    // Step 1: Auto-crop check on the primary image
    const imgUrl = item.image_urls?.[0] || item.thumbnail_url;
    let finalImageUrls = item.image_urls || [item.thumbnail_url];
    let finalThumbnail = item.thumbnail_url;

    try {
      const imgResp = await fetch(imgUrl);
      if (imgResp.ok) {
        const blob = await imgResp.blob();
        const cropResult = await autoCropPadding(blob);
        if (cropResult.cropped) {
          // Re-upload the cropped version
          const path = `${item.id}/${crypto.randomUUID()}.png`;
          const { error: upErr } = await supabase.storage
            .from("reference-campaigns")
            .upload(path, cropResult.blob, { contentType: "image/png" });
          if (!upErr) {
            const { data: urlData } = supabase.storage
              .from("reference-campaigns")
              .getPublicUrl(path);
            finalThumbnail = urlData.publicUrl;
            finalImageUrls = [urlData.publicUrl];
            await supabase.from("reference_campaigns")
              .update({ thumbnail_url: finalThumbnail, image_urls: finalImageUrls })
              .eq("id", item.id);
            toast.info(`Auto-cropped ${cropResult.left + cropResult.right}px horizontal padding`);
          }
        }
      }
    } catch (cropErr) {
      console.error("Auto-crop during reprocess failed:", cropErr);
    }

    // Step 2: Re-analyze with AI + re-slice (parallel, fire-and-forget)
    const analyzePromise = supabase.functions.invoke("analyze-reference", {
      body: { referenceId: item.id, imageUrls: finalImageUrls },
    });
    const slicePromise = supabase.functions.invoke("slice-reference", {
      body: { referenceCampaignId: item.id },
    });

    const [analyzeResult, sliceResult] = await Promise.all([analyzePromise, slicePromise]);
    if (analyzeResult.error) {
      toast.error("Analysis failed");
    } else if (sliceResult.error) {
      toast.error("Slicing failed");
    } else {
      toast.success("Re-processing complete");
      loadCampaigns();
    }
  };

  const togglePublish = async (item: RefCampaign) => {
    await supabase.from("reference_campaigns").update({ is_published: !item.is_published }).eq("id", item.id);
    loadCampaigns();
    toast.success(item.is_published ? "Unpublished" : "Published");
  };

  const deleteItem = async (item: RefCampaign) => {
    if (!confirm(`Delete "${item.title}"?`)) return;
    // Delete storage files
    const { data: files } = await supabase.storage.from("reference-campaigns").list(item.id);
    if (files && files.length > 0) {
      await supabase.storage.from("reference-campaigns").remove(files.map((f) => `${item.id}/${f.name}`));
    }
    await supabase.from("reference_campaigns").delete().eq("id", item.id);
    toast.success("Deleted");
    loadCampaigns();
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === campaigns.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(campaigns.map(c => c.id)));
    }
  };

  const bulkReprocess = async () => {
    const ids = Array.from(selectedIds);
    const items = campaigns.filter(c => ids.includes(c.id));
    if (items.length === 0) return;

    setBulkProcessing(true);
    toast.info(`Re-processing ${items.length} campaign(s)...`);

    for (const item of items) {
      const imageUrls = item.image_urls || [item.thumbnail_url];
      supabase.functions.invoke("analyze-reference", {
        body: { referenceId: item.id, imageUrls },
      }).catch(err => console.error("Bulk analyze error:", err));
      supabase.functions.invoke("slice-reference", {
        body: { referenceCampaignId: item.id },
      }).catch(err => console.error("Bulk slice error:", err));
    }

    toast.success(`Triggered re-processing for ${items.length} campaign(s) — results will appear as they complete`);
    setBulkProcessing(false);
    setSelectedIds(new Set());
    setTimeout(loadCampaigns, 2000);
  };

  if (adminLoading || loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate("/dashboard")} className="text-sm text-muted-foreground hover:text-foreground">← Dashboard</button>
        <h1 className="text-lg font-semibold">Reference Library</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            {selectedIds.size === campaigns.length && campaigns.length > 0
              ? <><CheckSquare className="w-3.5 h-3.5 mr-1.5" /> Deselect All</>
              : <><Square className="w-3.5 h-3.5 mr-1.5" /> Select All</>
            }
          </Button>
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
              <Button variant="outline" size="sm" onClick={bulkReprocess} disabled={bulkProcessing}>
                {bulkProcessing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                Re-process
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Inline upload zone — drag/drop, paste, URL */}
        <ReferenceUploadZone onUploaded={loadCampaigns} campaignCount={campaigns.length} />
        <div className="grid grid-cols-3 gap-4">
          {campaigns.map((item) => (
            <div key={item.id} className={`rounded-lg border overflow-hidden bg-card group cursor-pointer transition-all ${selectedIds.has(item.id) ? "border-primary ring-2 ring-primary/20" : "border-border"}`} onClick={() => setDetailItem(item)}>
              <div className="relative">
                <img src={item.thumbnail_url} alt={item.title} className="w-full h-[200px] object-cover object-top" />
                {/* Selection checkbox */}
                <div className="absolute top-2 left-2" onClick={(e) => toggleSelect(item.id, e)}>
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    className={`h-5 w-5 rounded border-2 bg-background/80 ${selectedIds.has(item.id) || selectedIds.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}
                  />
                </div>
                <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1.5 rounded bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => openEdit(item)}>
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => reanalyze(item)}>
                        <Sparkles className="w-3.5 h-3.5 mr-2" /> Re-analyze
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => togglePublish(item)}>
                        {item.is_published ? <EyeOff className="w-3.5 h-3.5 mr-2" /> : <Eye className="w-3.5 h-3.5 mr-2" />}
                        {item.is_published ? "Unpublish" : "Publish"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => deleteItem(item)} className="text-destructive">
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="p-3">
                <h3 className="text-sm font-medium truncate">{item.title}</h3>
                <p className="text-xs text-muted-foreground truncate">{item.brand_name}</p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {!item.is_published && (
                    <Badge variant="secondary" className="text-[9px]">Draft</Badge>
                  )}
                  {item.industry && (
                    <Badge variant="outline" className="text-[9px] bg-primary/5 border-primary/20">{item.industry}</Badge>
                  )}
                  {item.campaign_type === "flow" && item.message_type && (
                    <Badge variant="outline" className="text-[9px] bg-accent/50 border-accent">
                      Flow: {item.message_type}
                    </Badge>
                  )}
                  {item.campaign_type === "campaign" && item.message_type && !["Other"].includes(item.message_type) && (
                    <Badge variant="outline" className="text-[9px]">{item.message_type}</Badge>
                  )}
                  {!item.ai_metadata && !item.industry && (
                    <span className="text-[9px] text-muted-foreground italic flex items-center gap-0.5">
                      <Sparkles className="w-2.5 h-2.5" /> Analyzing...
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {campaigns.length === 0 && (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-sm">No reference campaigns yet. Drop some images above to get started.</p>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailItem} onOpenChange={(open) => { if (!open) setDetailItem(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailItem && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detailItem.title}
                  {!detailItem.is_published && <Badge variant="secondary" className="text-[9px]">Draft</Badge>}
                </DialogTitle>
                {detailItem.brand_name && (
                  <p className="text-sm text-muted-foreground">{detailItem.brand_name}</p>
                )}
              </DialogHeader>

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { reanalyze(detailItem); }}>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Re-process
                </Button>
              </div>

              <Tabs defaultValue="overview" className="w-full">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="slices">
                    Slices
                    {detailItem.slicing_status === "complete" && detailItem.image_slice_urls?.length
                      ? ` (${(detailItem.image_slice_urls as any[]).length})`
                      : ""}
                  </TabsTrigger>
                  <TabsTrigger value="metadata">AI Metadata</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="text-muted-foreground">ID</div>
                    <div className="font-mono text-xs break-all cursor-pointer" onClick={() => { navigator.clipboard.writeText(detailItem.id); toast.success("Copied"); }}>{detailItem.id}</div>
                    {detailItem.category && <><div className="text-muted-foreground">Category</div><div>{detailItem.category}</div></>}
                    {detailItem.industry && <><div className="text-muted-foreground">Industry</div><div>{detailItem.industry}</div></>}
                    {detailItem.campaign_type && <><div className="text-muted-foreground">Campaign Type</div><div>{detailItem.campaign_type}</div></>}
                    {detailItem.message_type && <><div className="text-muted-foreground">Message Type</div><div>{detailItem.message_type}</div></>}
                    <div className="text-muted-foreground">Sort Order</div><div>{detailItem.sort_order}</div>
                  </div>
                  {detailItem.tags && detailItem.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {detailItem.tags.map((tag, i) => <Badge key={i} variant="outline" className="text-[10px]">{tag}</Badge>)}
                    </div>
                  )}
                  {detailItem.extracted_copy && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-1">Extracted Copy</h4>
                      <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded p-3 max-h-40 overflow-y-auto">{detailItem.extracted_copy}</p>
                    </div>
                  )}
                  {detailItem.image_urls && detailItem.image_urls.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground mb-2">All Images ({detailItem.image_urls.length})</h4>
                      <div className="space-y-2">
                        {detailItem.image_urls.map((url, i) => (
                          <div key={i} className="border border-border rounded overflow-hidden">
                            <div className="px-2 py-1 bg-muted/30 text-[10px] text-muted-foreground">Image {i + 1}</div>
                            <img src={url} alt={`Image ${i + 1}`} className="w-full" loading="lazy" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="slices">
                  <ReferenceCampaignSlicesTab
                    campaign={{
                      id: detailItem.id,
                      slicing_status: detailItem.slicing_status,
                      image_slice_urls: detailItem.image_slice_urls as any,
                      image_total_height: detailItem.image_total_height,
                    }}
                    onRefresh={loadCampaigns}
                  />
                </TabsContent>

                <TabsContent value="metadata">
                  {detailItem.ai_metadata ? (
                    <pre className="text-xs bg-muted/30 rounded p-3 max-h-96 overflow-auto whitespace-pre-wrap">
                      {JSON.stringify(detailItem.ai_metadata, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">No AI metadata available yet.</p>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit-only modal (for existing campaigns) */}
      <Dialog open={showUpload} onOpenChange={(open) => { if (!open) { setShowUpload(false); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Campaign title" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Brand Name</label>
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. Nike" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Tags (comma-separated)</label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="bold typography, full-bleed, dark" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Add more images</label>
              <input
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                className="text-sm"
              />
              {files.length > 0 && (
                <p className="text-[10px] text-muted-foreground">{files.length} file(s) selected</p>
              )}
              {editingItem && (editingItem.image_urls || []).length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1">
                  {(editingItem.image_urls || []).map((url, i) => (
                    <img key={i} src={url} alt="" className="w-12 h-12 rounded object-cover border border-border" />
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Published</label>
              <Switch checked={isPublished} onCheckedChange={setIsPublished} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUpload(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={uploading}>
              {uploading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
