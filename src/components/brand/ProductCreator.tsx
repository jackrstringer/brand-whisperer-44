import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ResourceUploader from "./ResourceUploader";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface BucketFiles {
  files: File[];
  previews: string[];
}

interface ProductCreatorProps {
  brandId: string;
  onCreated: () => void;
  onCancel: () => void;
}

const BUCKETS = [
  { id: "transparent_bg" as const, title: "Transparent BG PNGs", description: "Product images with transparent backgrounds", accept: ".png,.webp" },
  { id: "lifestyle" as const, title: "Lifestyle", description: "In-context lifestyle photography", accept: ".jpg,.jpeg,.png,.webp" },
  { id: "hero_shots" as const, title: "Misc Product Hero Shots", description: "General product photos and renders", accept: ".jpg,.jpeg,.png,.webp" },
];

export default function ProductCreator({ brandId, onCreated, onCancel }: ProductCreatorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [bucketFiles, setBucketFiles] = useState<Record<string, BucketFiles>>({
    transparent_bg: { files: [], previews: [] },
    lifestyle: { files: [], previews: [] },
    hero_shots: { files: [], previews: [] },
  });

  const handleAdd = useCallback((bucketId: string, newFiles: File[]) => {
    setBucketFiles((prev) => {
      const existing = prev[bucketId];
      const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
      return {
        ...prev,
        [bucketId]: {
          files: [...existing.files, ...newFiles],
          previews: [...existing.previews, ...newPreviews],
        },
      };
    });
  }, []);

  const handleRemove = useCallback((bucketId: string, index: number) => {
    setBucketFiles((prev) => {
      const existing = prev[bucketId];
      URL.revokeObjectURL(existing.previews[index]);
      return {
        ...prev,
        [bucketId]: {
          files: existing.files.filter((_, i) => i !== index),
          previews: existing.previews.filter((_, i) => i !== index),
        },
      };
    });
  }, []);

  const totalFiles = Object.values(bucketFiles).reduce((sum, b) => sum + b.files.length, 0);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Product name is required"); return; }
    if (totalFiles === 0) { toast.error("Upload at least one image"); return; }
    setSaving(true);

    try {
      // Create product record
      const { data: product, error: prodErr } = await supabase
        .from("products")
        .insert({ brand_id: brandId, name: name.trim(), description: description.trim() || null })
        .select("id")
        .single();

      if (prodErr || !product) throw new Error(prodErr?.message || "Failed to create product");

      // Upload all files and create product_asset records
      for (const bucket of BUCKETS) {
        const bf = bucketFiles[bucket.id];
        for (const file of bf.files) {
          const ext = file.name.split(".").pop() || "png";
          const path = `${brandId}/products/${product.id}/${bucket.id}/${crypto.randomUUID()}.${ext}`;

          const { error: uploadErr } = await supabase.storage
            .from("brand-assets")
            .upload(path, file, { contentType: file.type });

          if (uploadErr) { console.error("Upload error:", uploadErr); continue; }

          const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);
          const publicUrl = urlData.publicUrl;

          // Insert product_asset record
          await supabase.from("product_assets").insert({
            product_id: product.id,
            brand_id: brandId,
            bucket: bucket.id,
            url: publicUrl,
            filename: file.name,
          });

          // Fire-and-forget: analyze asset via AI
          supabase.functions.invoke("analyze-asset", {
            body: { imageUrl: publicUrl, filename: file.name, userCategory: bucket.id },
          }).then(async ({ data }) => {
            if (data && !data.error) {
              await supabase.from("product_assets").update({
                description: data.description || null,
                dominant_colors: data.dominant_colors || null,
                ai_category: data.suggested_category || null,
                composition_notes: data.composition_notes || null,
                transparent_bg: data.transparent_bg ?? false,
              }).eq("url", publicUrl);
            }
          }).catch(() => {});
        }
      }

      toast.success(`Product "${name.trim()}" created`);
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "Failed to create product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 border border-border rounded-lg p-4 bg-card">
      <div className="space-y-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product name (e.g. Chrome Showerhead)"
          className="bg-background"
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief product description (optional)"
          className="bg-background min-h-[60px]"
        />
      </div>

      {BUCKETS.map((bucket) => (
        <ResourceUploader
          key={bucket.id}
          title={bucket.title}
          description={bucket.description}
          accept={bucket.accept}
          files={bucketFiles[bucket.id].files}
          previews={bucketFiles[bucket.id].previews}
          onAdd={(files) => handleAdd(bucket.id, files)}
          onRemove={(index) => handleRemove(bucket.id, index)}
        />
      ))}

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving || !name.trim() || totalFiles === 0} className="flex-1">
          {saving ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...</> : "Save Product"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </div>
  );
}
