import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Link, Clipboard, Loader2, Crop } from "lucide-react";
import { Input } from "@/components/ui/input";
import { autoCropPadding } from "@/lib/autoCropPadding";

interface ReferenceUploadZoneProps {
  onUploaded: () => void;
  campaignCount: number;
}

export default function ReferenceUploadZone({ onUploaded, campaignCount }: ReferenceUploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(0);
  const [urlValue, setUrlValue] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Process image files into reference campaigns
  const processFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      toast.error("No image files detected");
      return;
    }

    setProcessing(prev => prev + imageFiles.length);

    for (const file of imageFiles) {
      try {
        const id = crypto.randomUUID();
        const ext = "png"; // always PNG after potential crop

        // Auto-crop padding before upload
        const cropResult = await autoCropPadding(file);
        const uploadBlob = cropResult.blob;
        if (cropResult.cropped) {
          toast.info(`Auto-cropped ${cropResult.left + cropResult.right}px horizontal + ${cropResult.top + cropResult.bottom}px vertical padding from ${file.name}`);
        }

        const path = `${id}/${crypto.randomUUID()}.${ext}`;

        // Upload to storage
        const { error: uploadErr } = await supabase.storage
          .from("reference-campaigns")
          .upload(path, uploadBlob, { contentType: "image/png" });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage
          .from("reference-campaigns")
          .getPublicUrl(path);
        const publicUrl = urlData.publicUrl;

        // Create reference campaign with auto title
        const title = file.name
          .replace(/\.[^.]+$/, "")
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase())
          .substring(0, 60) || "Untitled Campaign";

        await supabase.from("reference_campaigns").insert({
          id,
          title,
          thumbnail_url: publicUrl,
          image_urls: [publicUrl],
          is_published: true,
          sort_order: campaignCount,
        });

        // Fire-and-forget AI analysis
        supabase.functions.invoke("analyze-reference", {
          body: { referenceId: id, imageUrls: [publicUrl] },
        }).then(({ error }) => {
          if (error) console.error("AI analysis error:", error);
          else onUploaded();
        });

        // Fire-and-forget slicing
        supabase.functions.invoke("slice-reference", {
          body: { referenceCampaignId: id },
        }).then(({ error }) => {
          if (error) console.error("Slice-reference error:", error);
          else onUploaded();
        });

        toast.success(`Uploaded: ${title}`);
      } catch (err: any) {
        console.error(err);
        toast.error(`Failed to upload ${file.name}`);
      } finally {
        setProcessing(prev => prev - 1);
      }
    }

    onUploaded();
  }, [campaignCount, onUploaded]);

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) processFiles(files);
  }, [processFiles]);

  // Clipboard paste handler (global)
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        toast.info(`Pasting ${imageFiles.length} image(s)...`);
        processFiles(imageFiles);
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [processFiles]);

  // URL submission
  const handleUrlSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const url = urlValue.trim();
    if (!url) return;

    setUrlLoading(true);
    setUrlValue("");

    try {
      const { data, error } = await supabase.functions.invoke("capture-reference-url", {
        body: { url },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Post-process: auto-crop the captured image if it's an image URL
      if (data?.id && data?.metadata?.image_urls?.length) {
        try {
          const imgUrl = data.metadata.image_urls[0];
          const imgResp = await fetch(imgUrl);
          if (imgResp.ok) {
            const blob = await imgResp.blob();
            const cropResult = await autoCropPadding(blob);
            if (cropResult.cropped) {
              // Re-upload the cropped version
              const path = `${data.id}/${crypto.randomUUID()}.png`;
              const { error: upErr } = await supabase.storage
                .from("reference-campaigns")
                .upload(path, cropResult.blob, { contentType: "image/png" });
              if (!upErr) {
                const { data: urlData } = supabase.storage
                  .from("reference-campaigns")
                  .getPublicUrl(path);
                await supabase.from("reference_campaigns")
                  .update({ thumbnail_url: urlData.publicUrl, image_urls: [urlData.publicUrl] })
                  .eq("id", data.id);
                toast.info(`Auto-cropped ${cropResult.left + cropResult.right}px horizontal + ${cropResult.top + cropResult.bottom}px vertical padding`);
              }
            }
          }
        } catch (cropErr) {
          console.error("Post-capture auto-crop failed:", cropErr);
        }
      }

      toast.success("Campaign captured from URL");
      onUploaded();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to capture from URL");
    } finally {
      setUrlLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        ref={dropRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
          ${dragOver
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-primary/50 hover:bg-muted/30"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length > 0) processFiles(files);
            e.target.value = "";
          }}
        />

        {processing > 0 ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing {processing} file(s)...
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Upload className="w-5 h-5" />
              <span className="text-sm font-medium">
                Drop images here, click to browse, or{" "}
                <span className="inline-flex items-center gap-1">
                  <Clipboard className="w-3.5 h-3.5 inline" /> paste from clipboard
                </span>
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              JPG, PNG, WEBP — each image becomes a reference campaign and is auto-analyzed by AI
            </p>
          </div>
        )}
      </div>

      {/* URL input */}
      <form onSubmit={handleUrlSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="Paste an email campaign URL and press Enter..."
            className="pl-9 text-sm"
            disabled={urlLoading}
          />
        </div>
        {urlLoading && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground self-center" />}
      </form>
    </div>
  );
}
