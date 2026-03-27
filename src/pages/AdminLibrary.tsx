import { useEffect, useState, useCallback } from "react";
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
import { Plus, MoreVertical, Trash2, Pencil, Eye, EyeOff, GripVertical } from "lucide-react";
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
}

export default function AdminLibrary() {
  const navigate = useNavigate();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [campaigns, setCampaigns] = useState<RefCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [editingItem, setEditingItem] = useState<RefCampaign | null>(null);

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
    if (data) setCampaigns(data as RefCampaign[]);
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
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
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

  if (adminLoading || loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/dashboard")} className="text-sm text-muted-foreground hover:text-foreground">← Dashboard</button>
          <h1 className="text-lg font-semibold">Reference Library</h1>
        </div>
        <Button onClick={() => { resetForm(); setShowUpload(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Upload Campaign
        </Button>
      </header>

      <div className="p-6">
        <div className="grid grid-cols-3 gap-4">
          {campaigns.map((item) => (
            <div key={item.id} className="rounded-lg border border-border overflow-hidden bg-card group">
              <div className="relative">
                <img src={item.thumbnail_url} alt={item.title} className="w-full h-[200px] object-cover object-top" />
                <div className="absolute top-2 right-2">
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
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Badge variant={item.is_published ? "default" : "secondary"} className="text-[9px]">
                    {item.is_published ? "Published" : "Draft"}
                  </Badge>
                  {item.category && (
                    <Badge variant="outline" className="text-[9px]">{item.category}</Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {campaigns.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground">No reference campaigns yet.</p>
            <Button className="mt-4" onClick={() => { resetForm(); setShowUpload(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Upload your first campaign
            </Button>
          </div>
        )}
      </div>

      {/* Upload / Edit modal */}
      <Dialog open={showUpload} onOpenChange={(open) => { if (!open) { setShowUpload(false); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Campaign" : "Upload Campaign"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Title *</label>
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
              <label className="text-xs text-muted-foreground">Campaign Images</label>
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
              {uploading ? "Uploading..." : editingItem ? "Save" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
