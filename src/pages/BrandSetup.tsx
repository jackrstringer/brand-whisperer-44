import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Upload, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { BrandExtraction } from "@/lib/types";

const PROGRESS_MESSAGES = [
  "Scanning layouts...",
  "Extracting colors...",
  "Identifying typography...",
  "Mapping layout patterns...",
  "Building brand profile...",
];

export default function BrandSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [extraction, setExtraction] = useState<BrandExtraction | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) =>
      /\.(jpg|jpeg|png|pdf|html?)$/i.test(f.name)
    );
    addFiles(droppedFiles);
  }, [files]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
  };

  const addFiles = (newFiles: File[]) => {
    const combined = [...files, ...newFiles];
    setFiles(combined);
    const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setFiles((f) => f.filter((_, i) => i !== index));
    setPreviews((p) => p.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const analyzeBrand = async () => {
    if (!brandName.trim()) {
      toast.error("Please enter a brand name.");
      return;
    }
    setAnalyzing(true);
    setProgressValue(0);
    setProgressMessage(PROGRESS_MESSAGES[0]);

    const interval = setInterval(() => {
      setProgressValue((v) => {
        const next = Math.min(v + 2, 95);
        const msgIndex = Math.min(Math.floor(next / 20), PROGRESS_MESSAGES.length - 1);
        setProgressMessage(PROGRESS_MESSAGES[msgIndex]);
        return next;
      });
    }, 300);

    try {
      const imageFiles = files.filter((f) => /\.(jpg|jpeg|png)$/i.test(f.name));
      const base64Images = await Promise.all(imageFiles.map(fileToBase64));

      const { data, error } = await supabase.functions.invoke("extract-brand", {
        body: { images: base64Images, brandName, industry },
      });

      clearInterval(interval);

      if (error) throw new Error(error.message || "Extraction failed");
      if (data?.error) throw new Error(data.error);

      setExtraction(data.extraction);
      setSystemPrompt(data.system_prompt);
      setProgressValue(100);
      setProgressMessage("Done!");

      setTimeout(() => setStep(2), 500);
    } catch (err: any) {
      clearInterval(interval);
      toast.error(err.message || "Failed to analyze brand");
    } finally {
      setAnalyzing(false);
    }
  };

  const saveBrand = async () => {
    if (!user || !extraction) return;
    setSaving(true);
    try {
      // Upload files to storage
      const imageUrls: string[] = [];
      for (const file of files.filter((f) => /\.(jpg|jpeg|png)$/i.test(f.name))) {
        const path = `${user.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("brand-references")
          .upload(path, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("brand-references").getPublicUrl(path);
        imageUrls.push(urlData.publicUrl);
      }

      // Create brand
      const { data: brand, error: brandError } = await supabase
        .from("brands")
        .insert({ name: brandName, industry: industry || null, user_id: user.id })
        .select()
        .single();
      if (brandError) throw brandError;

      // Create brand profile
      const { error: profileError } = await supabase.from("brand_profiles").insert({
        brand_id: brand.id,
        system_prompt: systemPrompt,
        raw_extraction: extraction as any,
        reference_image_urls: imageUrls,
      });
      if (profileError) throw profileError;

      toast.success("Brand saved!");
      navigate(`/brands/${brand.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save brand");
    } finally {
      setSaving(false);
    }
  };

  if (step === 2 && extraction) {
    const lowFields = extraction.confidence?.low_confidence_fields || [];
    return (
      <div className="min-h-screen bg-background p-6 md:p-12">
        <button onClick={() => setStep(1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="text-2xl font-semibold mb-2">Review Brand Profile</h1>
        <p className="text-muted-foreground mb-8">Edit any values before saving. Yellow badges indicate low confidence.</p>

        <div className="grid gap-6 md:grid-cols-2 max-w-4xl">
          {/* Colors */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base">Colors</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {Object.entries(extraction.colors).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded border border-border" style={{ backgroundColor: val }} />
                  <div>
                    <p className="text-xs text-muted-foreground">{key}</p>
                    <p className="text-sm font-mono">{val}</p>
                  </div>
                  {lowFields.includes(`colors.${key}`) && <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 text-[10px]">Needs review</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Typography */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base">Typography</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Heading</p>
                <p className="text-sm">{extraction.fonts.heading}</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">{extraction.fonts.heading_stack}</p>
                {lowFields.includes("fonts.heading") && <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 text-[10px] mt-1">Needs review</Badge>}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Body</p>
                <p className="text-sm">{extraction.fonts.body}</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">{extraction.fonts.body_stack}</p>
              </div>
            </CardContent>
          </Card>

          {/* Layout */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base">Layout</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(extraction.spacing).map(([key, val]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{key.replace(/_/g, " ")}</span>
                  <span className="text-sm font-mono">{val}px</span>
                </div>
              ))}
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">contrast sections</span>
                <span className="text-sm">{extraction.layout.contrast_sections}</span>
              </div>
            </CardContent>
          </Card>

          {/* Voice */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base">Voice</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Tone</p>
                <p className="text-sm">{extraction.voice.tone}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Headline structure</p>
                <p className="text-sm">{extraction.voice.headline_structure}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Urgency</p>
                <p className="text-sm">{extraction.voice.urgency_level}</p>
                {lowFields.includes("voice.urgency_level") && <Badge variant="outline" className="text-yellow-400 border-yellow-400/50 text-[10px] mt-1">Needs review</Badge>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 max-w-4xl">
          <Button
            onClick={saveBrand}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            {saving ? "Saving..." : "Save Brand"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-12">
      <h1 className="text-2xl font-semibold mb-2">New Brand</h1>
      <p className="text-muted-foreground mb-8">
        Upload at least 3 reference campaigns to extract your brand's design system.
      </p>

      <div className="max-w-2xl space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Brand Name</Label>
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Acme Corp" className="bg-card border-border" />
          </div>
          <div className="space-y-2">
            <Label>Industry (optional)</Label>
            <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="E-commerce, SaaS..." className="bg-card border-border" />
          </div>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop files here or click to browse
          </p>
          <p className="text-xs text-muted-foreground mt-1">JPG, PNG, PDF, HTML</p>
          <input
            id="file-input"
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.pdf,.html,.htm"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {previews.length > 0 && (
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              {files.length} file{files.length !== 1 ? "s" : ""} uploaded
              {files.length < 3 && <span className="text-yellow-400"> — minimum 3 required</span>}
            </p>
            <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
              {previews.map((src, i) => (
                <div key={i} className="relative group aspect-square rounded-md overflow-hidden border border-border bg-card">
                  {/\.(jpg|jpeg|png)$/i.test(files[i]?.name || "") ? (
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                      {files[i]?.name?.split(".").pop()?.toUpperCase()}
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {analyzing && (
          <div className="space-y-2">
            <Progress value={progressValue} className="h-1.5" />
            <p className="text-sm text-muted-foreground">{progressMessage}</p>
          </div>
        )}

        <Button
          onClick={analyzeBrand}
          disabled={files.length < 3 || analyzing || !brandName.trim()}
          className="bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          {analyzing ? "Analyzing..." : "Analyze Brand"}
        </Button>
      </div>
    </div>
  );
}
