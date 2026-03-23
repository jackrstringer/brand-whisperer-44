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
import { ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import SourceQuiz, { type SourceType } from "@/components/brand/SourceQuiz";
import ResourceUploader from "@/components/brand/ResourceUploader";
import AssetCategoryUploader, { type AssetCategory } from "@/components/brand/AssetCategoryUploader";
import type { BrandExtraction } from "@/lib/types";

type Step = "info" | "sources" | "uploads" | "analyzing" | "review";

const PROGRESS_MESSAGES = [
  "Scanning layouts...",
  "Extracting colors...",
  "Identifying typography...",
  "Mapping layout patterns...",
  "Building brand profile...",
];

const emptyCategory = () => ({ files: [] as File[], previews: [] as string[] });

export default function BrandSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Step tracking
  const [step, setStep] = useState<Step>("info");

  // Step 1: Brand info
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("");

  // Step 2: Source selection
  const [selectedSources, setSelectedSources] = useState<SourceType[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState("");

  // Step 3: Uploads per source type
  const [campaignFiles, setCampaignFiles] = useState<File[]>([]);
  const [campaignPreviews, setCampaignPreviews] = useState<string[]>([]);
  const [brandDeckFiles, setBrandDeckFiles] = useState<File[]>([]);
  const [brandDeckPreviews, setBrandDeckPreviews] = useState<string[]>([]);
  const [miscRefFiles, setMiscRefFiles] = useState<File[]>([]);
  const [miscRefPreviews, setMiscRefPreviews] = useState<string[]>([]);
  const [mockupFiles, setMockupFiles] = useState<File[]>([]);
  const [mockupPreviews, setMockupPreviews] = useState<string[]>([]);
  const [assetCategories, setAssetCategories] = useState<Record<AssetCategory, { files: File[]; previews: string[] }>>({
    logo: emptyCategory(),
    product_imagery: emptyCategory(),
    hero_shots: emptyCategory(),
    lifestyle: emptyCategory(),
  });

  // Analysis
  const [progressValue, setProgressValue] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [extraction, setExtraction] = useState<BrandExtraction | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleSource = (source: SourceType) => {
    setSelectedSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
  };

  const addFiles = (setter: React.Dispatch<React.SetStateAction<File[]>>, previewSetter: React.Dispatch<React.SetStateAction<string[]>>) =>
    (newFiles: File[]) => {
      setter((prev) => [...prev, ...newFiles]);
      const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
      previewSetter((prev) => [...prev, ...newPreviews]);
    };

  const removeFile = (
    files: File[], setFiles: React.Dispatch<React.SetStateAction<File[]>>,
    previews: string[], setPreviews: React.Dispatch<React.SetStateAction<string[]>>
  ) => (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setFiles(files.filter((_, i) => i !== index));
    setPreviews(previews.filter((_, i) => i !== index));
  };

  // Resize image to max dimension and return as base64 JPEG to reduce payload
  const resizeAndConvert = (file: File, maxDim = 800): Promise<{ data: string; mediaType: string }> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        resolve({ data: dataUrl.split(",")[1], mediaType: "image/jpeg" });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });

  // Only gather REFERENCE images for brand style analysis (campaigns, brand deck, misc refs, mockups)
  // NOT product/lifestyle assets — those are stored but not analyzed for style
  const getReferenceImageFiles = (): File[] => {
    const all: File[] = [];
    all.push(...campaignFiles.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name)));
    all.push(...brandDeckFiles.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name)));
    all.push(...miscRefFiles.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name)));
    all.push(...mockupFiles.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name)));
    return all;
  };

  // Gather ALL image files (for storage upload and minimum count check)
  const getAllImageFiles = (): File[] => {
    const all = getReferenceImageFiles();
    Object.values(assetCategories).forEach((cat) => {
      all.push(...cat.files.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name)));
    });
    return all;
  };

  const analyzeBrand = async () => {
    if (!brandName.trim()) {
      toast.error("Please enter a brand name.");
      return;
    }

    const allImages = getAllImageFiles();
    if (allImages.length < 3) {
      toast.error("Please upload at least 3 images across your selected sources.");
      return;
    }

    setStep("analyzing");
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
      // Only send reference images for style analysis (max 5, resized to 800px)
      const refFiles = getReferenceImageFiles().slice(0, 5);
      if (refFiles.length === 0) {
        // If no reference images, grab a few from asset categories as fallback
        const fallbackFiles = Object.values(assetCategories)
          .flatMap((cat) => cat.files.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name)))
          .slice(0, 5);
        refFiles.push(...fallbackFiles);
      }

      if (refFiles.length < 3) {
        clearInterval(interval);
        toast.error("Need at least 3 reference images (campaigns, brand deck, or misc references) for analysis.");
        setStep("uploads");
        return;
      }

      const base64Images = await Promise.all(refFiles.map((f) => resizeAndConvert(f, 800)));

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
      setTimeout(() => setStep("review"), 500);
    } catch (err: any) {
      clearInterval(interval);
      toast.error(err.message || "Failed to analyze brand");
      setStep("uploads");
    }
  };

  const saveBrand = async () => {
    if (!user || !extraction) return;
    setSaving(true);
    try {
      // Upload campaign reference images to storage
      const imageUrls: string[] = [];
      const allImageFiles = getAllImageFiles();
      for (const file of allImageFiles) {
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
        .insert({
          name: brandName,
          industry: industry || null,
          user_id: user.id,
          website_url: websiteUrl || null,
          source_types: selectedSources,
        })
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

      // Save categorized assets to brand_assets table
      const assetInserts: { brand_id: string; category: string; url: string; filename: string }[] = [];

      // Upload asset category files to brand-assets bucket
      for (const [category, catData] of Object.entries(assetCategories)) {
        for (const file of catData.files) {
          const path = `${user.id}/${brand.id}/${category}/${Date.now()}-${file.name}`;
          const { error: uploadErr } = await supabase.storage.from("brand-assets").upload(path, file);
          if (uploadErr) continue;
          const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);
          assetInserts.push({
            brand_id: brand.id,
            category,
            url: urlData.publicUrl,
            filename: file.name,
          });
        }
      }

      if (assetInserts.length > 0) {
        await supabase.from("brand_assets").insert(assetInserts);
      }

      toast.success("Brand saved! Generating starter campaigns...");

      // Auto-generate 3 starter campaigns
      const starterCampaigns = [
        { name: "Welcome Campaign", goal: "welcome", brief: "Create a warm welcome email for new subscribers. Introduce the brand, set expectations, and include a compelling CTA." },
        { name: "Social Proof Campaign", goal: "social_proof", brief: "Build trust with customer testimonials, reviews, and social proof. Highlight key benefits and include a strong call to action." },
        { name: "General Highlight Campaign", goal: "highlight", brief: "Showcase the brand's key products/services with compelling visuals and copy. Drive engagement and conversions." },
      ];

      const campaignIds: string[] = [];
      for (const sc of starterCampaigns) {
        const { data: camp, error: campErr } = await supabase
          .from("campaigns")
          .insert({ brand_id: brand.id, name: sc.name, status: "generating", brief: sc.brief, goal: sc.goal })
          .select()
          .single();
        if (campErr) continue;
        campaignIds.push(camp.id);

        // Fire and forget generation
        supabase.functions.invoke("generate-campaign", {
          body: { brandId: brand.id, campaignId: camp.id, brief: sc.brief, goal: sc.goal },
        }).catch(() => {});
      }

      navigate(`/brands/${brand.id}/onboarding`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save brand");
    } finally {
      setSaving(false);
    }
  };

  // Has enough for next step
  const hasUploadSources = selectedSources.filter((s) => s !== "website").length > 0 || selectedSources.includes("website");
  const totalImageCount = getAllImageFiles().length;

  // STEP: Brand info
  if (step === "info") {
    return (
      <div className="min-h-screen bg-background p-6 md:p-12">
        <h1 className="text-2xl font-semibold mb-2">New Brand</h1>
        <p className="text-muted-foreground mb-8">Let's set up your brand's email design system.</p>
        <div className="max-w-lg space-y-6">
          <div className="space-y-2">
            <Label>Brand Name</Label>
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Acme Corp" className="bg-card border-border" />
          </div>
          <div className="space-y-2">
            <Label>Industry (optional)</Label>
            <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="E-commerce, SaaS..." className="bg-card border-border" />
          </div>
          <Button onClick={() => setStep("sources")} disabled={!brandName.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
            Next <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  // STEP: Source selection
  if (step === "sources") {
    return (
      <div className="min-h-screen bg-background p-6 md:p-12">
        <button onClick={() => setStep("info")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="max-w-xl">
          <SourceQuiz
            selected={selectedSources}
            onToggle={toggleSource}
            websiteUrl={websiteUrl}
            onWebsiteUrlChange={setWebsiteUrl}
          />
          <div className="mt-8">
            <Button
              onClick={() => setStep("uploads")}
              disabled={selectedSources.length === 0}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Next <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // STEP: Upload resources
  if (step === "uploads") {
    return (
      <div className="min-h-screen bg-background p-6 md:p-12">
        <button onClick={() => setStep("sources")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="text-2xl font-semibold mb-2">Upload Your Resources</h1>
        <p className="text-muted-foreground mb-8">Upload at least 3 images total across your selected sources.</p>

        <div className="max-w-2xl space-y-8">
          {selectedSources.includes("past_campaigns") && (
            <ResourceUploader
              title="Past Email Campaigns"
              description="Upload screenshots or images of your previous email campaigns"
              accept=".jpg,.jpeg,.png,.webp,.pdf,.html,.htm"
              files={campaignFiles}
              previews={campaignPreviews}
              onAdd={addFiles(setCampaignFiles, setCampaignPreviews)}
              onRemove={removeFile(campaignFiles, setCampaignFiles, campaignPreviews, setCampaignPreviews)}
              minFiles={3}
            />
          )}

          {selectedSources.includes("brand_deck") && (
            <ResourceUploader
              title="Brand Deck / Guidelines"
              description="Upload your brand guide — PDFs or images"
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              files={brandDeckFiles}
              previews={brandDeckPreviews}
              onAdd={addFiles(setBrandDeckFiles, setBrandDeckPreviews)}
              onRemove={removeFile(brandDeckFiles, setBrandDeckFiles, brandDeckPreviews, setBrandDeckPreviews)}
            />
          )}

          {selectedSources.includes("misc_references") && (
            <ResourceUploader
              title="Misc Branding References"
              description="Any other visual references you'd like us to consider"
              accept=".jpg,.jpeg,.png,.webp"
              files={miscRefFiles}
              previews={miscRefPreviews}
              onAdd={addFiles(setMiscRefFiles, setMiscRefPreviews)}
              onRemove={removeFile(miscRefFiles, setMiscRefFiles, miscRefPreviews, setMiscRefPreviews)}
            />
          )}

          {selectedSources.includes("product_mockups") && (
            <ResourceUploader
              title="Product Mockups"
              description="Upload product mockup images"
              accept=".jpg,.jpeg,.png,.webp"
              files={mockupFiles}
              previews={mockupPreviews}
              onAdd={addFiles(setMockupFiles, setMockupPreviews)}
              onRemove={removeFile(mockupFiles, setMockupFiles, mockupPreviews, setMockupPreviews)}
            />
          )}

          {selectedSources.includes("image_assets") && (
            <AssetCategoryUploader
              categories={assetCategories}
              onUpdate={(cat, files, previews) =>
                setAssetCategories((prev) => ({ ...prev, [cat]: { files, previews } }))
              }
            />
          )}

          {selectedSources.includes("website") && !selectedSources.some((s) => s !== "website") && (
            <p className="text-sm text-muted-foreground">Website analysis will be included. You can proceed to analysis.</p>
          )}

          <div className="flex items-center gap-4">
            <Button
              onClick={analyzeBrand}
              disabled={totalImageCount < 3 && !selectedSources.includes("website")}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Analyze Brand
            </Button>
            <span className="text-xs text-muted-foreground">
              {totalImageCount} image{totalImageCount !== 1 ? "s" : ""} selected
              {totalImageCount < 3 && <span className="text-yellow-400"> — minimum 3 needed</span>}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // STEP: Analyzing
  if (step === "analyzing") {
    return (
      <div className="min-h-screen bg-background p-6 md:p-12 flex flex-col items-center justify-center">
        <div className="max-w-md w-full space-y-6 text-center">
          <h2 className="text-xl font-semibold">Analyzing your brand...</h2>
          <Progress value={progressValue} className="h-1.5" />
          <p className="text-sm text-muted-foreground">{progressMessage}</p>
        </div>
      </div>
    );
  }

  // STEP: Review
  if (step === "review" && extraction) {
    const lowFields = extraction.confidence?.low_confidence_fields || [];
    return (
      <div className="min-h-screen bg-background p-6 md:p-12">
        <button onClick={() => setStep("uploads")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="text-2xl font-semibold mb-2">Review Brand Profile</h1>
        <p className="text-muted-foreground mb-8">Review extracted values. Yellow badges indicate low confidence.</p>

        <div className="grid gap-6 md:grid-cols-2 max-w-4xl">
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

          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base">Typography</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Heading</p>
                <p className="text-sm">{extraction.fonts.heading}</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">{extraction.fonts.heading_stack}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Body</p>
                <p className="text-sm">{extraction.fonts.body}</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">{extraction.fonts.body_stack}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base">Layout</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(extraction.spacing).map(([key, val]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{key.replace(/_/g, " ")}</span>
                  <span className="text-sm font-mono">{val}px</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-base">Voice</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div><p className="text-xs text-muted-foreground">Tone</p><p className="text-sm">{extraction.voice.tone}</p></div>
              <div><p className="text-xs text-muted-foreground">Headline structure</p><p className="text-sm">{extraction.voice.headline_structure}</p></div>
              <div><p className="text-xs text-muted-foreground">Urgency</p><p className="text-sm">{extraction.voice.urgency_level}</p></div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 max-w-4xl">
          <Button onClick={saveBrand} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? "Saving & Generating..." : "Save Brand & Generate Starter Campaigns"}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
