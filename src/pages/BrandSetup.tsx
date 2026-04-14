import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Check, AlertTriangle, Download, Edit2 } from "lucide-react";
import { toast } from "sonner";
import SourceQuiz, { type SourceType } from "@/components/brand/SourceQuiz";
import ResourceUploader from "@/components/brand/ResourceUploader";
import AssetCategoryUploader, { type AssetCategory } from "@/components/brand/AssetCategoryUploader";
import type { BrandExtraction } from "@/lib/types";
import { sliceAndUploadReferenceImages, saveSliceUrls } from "@/lib/imageSlicing";
import BrandProcessingScreen from "@/components/brand/BrandProcessingScreen";

type Step = "info" | "sources" | "uploads" | "processing" | "guide_review";

const emptyCategory = () => ({ files: [] as File[], previews: [] as string[] });

// Audit section display config
const AUDIT_SECTIONS = [
  { key: "logo", title: "Logo Treatment", icon: "🎨" },
  { key: "colors", title: "Color Palette", icon: "🎨" },
  { key: "typography_headlines", title: "Typography — Headlines", icon: "🔤" },
  { key: "typography_body", title: "Typography — Body", icon: "🔤" },
  { key: "typography_subheads", title: "Typography — Subheads", icon: "🔤" },
  { key: "cta_buttons", title: "CTA Buttons", icon: "🔘" },
  { key: "image_treatment", title: "Image Treatment", icon: "🖼" },
  { key: "card_container_design", title: "Card / Container Design", icon: "📦" },
  { key: "section_dividers", title: "Section Dividers", icon: "➖" },
  { key: "footer", title: "Footer", icon: "📄" },
  { key: "icons_decorative", title: "Icons & Decorative Elements", icon: "✨" },
  { key: "voice", title: "Voice & Tone", icon: "💬" },
] as const;

export default function BrandSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("info");

  // Step 1: Brand info
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("");

  // Step 2: Source selection
  const [selectedSources, setSelectedSources] = useState<SourceType[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [figmaUrl, setFigmaUrl] = useState("");
  const [figmaToken, setFigmaToken] = useState("");

  // Step 3: Uploads
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

  // Guide review state
  const [extraction, setExtraction] = useState<BrandExtraction | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [brandGuideHtml, setBrandGuideHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const guideIframeRef = useRef<HTMLIFrameElement>(null);
  const [guideIframeHeight, setGuideIframeHeight] = useState(800);
  const [earlyBrandId, setEarlyBrandId] = useState<string | null>(null);

  // Processing key to force remount on retry
  const [processingKey, setProcessingKey] = useState(0);

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

  const sliceImage = (
    file: File,
    maxSliceHeight = 1300,
    maxWidth = 900,
  ): Promise<Array<{ data: string; mediaType: string; sliceIndex: number; totalSlices: number }>> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          const ratio = maxWidth / width;
          width = maxWidth;
          height = Math.round(height * ratio);
        }
        const totalSlices = Math.max(1, Math.ceil(height / maxSliceHeight));
        const sliceHeight = Math.ceil(height / totalSlices);
        const results: Array<{ data: string; mediaType: string; sliceIndex: number; totalSlices: number }> = [];
        for (let i = 0; i < totalSlices; i++) {
          const sy = i * sliceHeight;
          const sh = Math.min(sliceHeight, height - sy);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = sh;
          const ctx = canvas.getContext("2d")!;
          const origRatio = img.naturalWidth / width;
          ctx.drawImage(img, 0, sy * origRatio, img.naturalWidth, sh * origRatio, 0, 0, width, sh);
          const dataUrl = canvas.toDataURL("image/png");
          results.push({ data: dataUrl.split(",")[1], mediaType: "image/png", sliceIndex: i, totalSlices });
        }
        URL.revokeObjectURL(img.src);
        resolve(results);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });

  const getReferenceImageFiles = (): File[] => {
    const all: File[] = [];
    all.push(...campaignFiles.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name)));
    all.push(...brandDeckFiles.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name)));
    all.push(...miscRefFiles.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name)));
    all.push(...mockupFiles.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name)));
    return all;
  };

  const getAllImageFiles = (): File[] => {
    const all = getReferenceImageFiles();
    Object.values(assetCategories).forEach((cat) => {
      all.push(...cat.files.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name)));
    });
    return all;
  };

  // === Audit callback for BrandProcessingScreen ===
  const handleRunAudit = useCallback(async (log: (msg: string, level?: "info" | "error" | "success") => void) => {
    const extractionPromises: Promise<any>[] = [];
    const extractionSources: string[] = ["screenshots"];

    // Figma extraction
    if (selectedSources.includes("figma") && figmaUrl && figmaToken) {
      extractionSources.push("figma");
      log("Extracting design tokens from Figma...");
      extractionPromises.push(
        supabase.functions.invoke("extract-figma", {
          body: { figma_url: figmaUrl, figma_token: figmaToken },
        }).then(({ data, error }) => {
          if (error) { log(`Figma extraction failed: ${error.message}`, "error"); return null; }
          if (data?.error) { log(`Figma extraction error: ${data.error}`, "error"); return null; }
          log("Figma extraction complete", "success");
          return { source: "figma", ...data };
        }).catch((err) => { log(`Figma extraction failed: ${err.message}`, "error"); return null; })
      );
    }

    // Website extraction
    if (selectedSources.includes("website") && websiteUrl) {
      extractionSources.push("website");
      log("Extracting fonts and styles from website...");
      extractionPromises.push(
        supabase.functions.invoke("extract-website-fonts", {
          body: { url: websiteUrl },
        }).then(({ data, error }) => {
          if (error) { log(`Website extraction failed: ${error.message}`, "error"); return null; }
          if (data?.error) { log(`Website extraction error: ${data.error}`, "error"); return null; }
          log("Website extraction complete", "success");
          return { source: "website", ...data };
        }).catch((err) => { log(`Website extraction failed: ${err.message}`, "error"); return null; })
      );
    }

    // Image slicing
    const refFiles = getReferenceImageFiles().slice(0, 8);
    if (refFiles.length === 0) {
      const fallbackFiles = Object.values(assetCategories)
        .flatMap((cat) => cat.files.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name)))
        .slice(0, 5);
      refFiles.push(...fallbackFiles);
    }

    let slicedImages: any[] = [];
    if (refFiles.length >= 3) {
      log(`Slicing ${refFiles.length} reference images...`);
      for (let ci = 0; ci < refFiles.length; ci++) {
        log(`Slicing image ${ci + 1} of ${refFiles.length}...`);
        const slices = await sliceImage(refFiles[ci]);
        for (const slice of slices) {
          slicedImages.push({ ...slice, campaignIndex: ci });
        }
      }
      log(`Created ${slicedImages.length} slices total`, "success");
    }

    // Wait for parallel extractions
    const extractionResults = await Promise.all(extractionPromises);

    // Merge confirmed properties
    let merged: any = null;
    const websiteResult = extractionResults.find((r) => r?.source === "website");
    const figmaResult = extractionResults.find((r) => r?.source === "figma");

    if (websiteResult?.confirmed_properties) {
      merged = { ...websiteResult.confirmed_properties };
    }
    if (figmaResult?.confirmed_properties) {
      merged = { ...(merged || {}), ...figmaResult.confirmed_properties };
      if (figmaResult.confirmed_properties.fonts) {
        merged.fonts = figmaResult.confirmed_properties.fonts;
      }
      if (figmaResult.confirmed_properties.colors) {
        merged.colors = { ...(merged.colors || {}), ...figmaResult.confirmed_properties.colors };
      }
    }

    if (slicedImages.length === 0 && !merged) {
      throw new Error("Need at least 3 reference images or a Figma/website source.");
    }

    // If no images but have confirmed props, skip visual audit
    if (slicedImages.length === 0) {
      const minimalAudit = { confirmed_properties: merged, _note: "No screenshots provided, using Figma/website data only" };
      log("Using Figma/website data only (no screenshots)", "info");
      return { auditFindings: minimalAudit, confirmedProperties: merged, extractionSources };
    }

    log(`Sending ${slicedImages.length} slices to Claude for visual audit...`);
    const { data, error } = await supabase.functions.invoke("audit-brand", {
      body: { images: slicedImages, brandName, industry, confirmed_properties: merged },
    });

    if (error) throw new Error(error.message || "Audit failed");
    if (data?.error) throw new Error(data.error);

    log(`Audit found ${Object.keys(data.audit || {}).length} design categories`, "success");
    return { auditFindings: data.audit, confirmedProperties: merged, extractionSources };
  }, [selectedSources, figmaUrl, figmaToken, websiteUrl, assetCategories, brandName, industry, campaignFiles, brandDeckFiles, miscRefFiles, mockupFiles]);

  // === Create brand callback for BrandProcessingScreen ===
  const handleCreateBrand = useCallback(async (
    auditFindings: any,
    confirmedProperties: any,
    extractionSources: string[],
    log: (msg: string, level?: "info" | "error" | "success") => void,
  ): Promise<string> => {
    if (!user) throw new Error("Not authenticated");

    log("Uploading images to storage...");
    const imageUrls: string[] = [];
    const allImageFiles = getAllImageFiles();
    for (const file of allImageFiles) {
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("brand-references").upload(path, file);
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from("brand-references").getPublicUrl(path);
        imageUrls.push(urlData.publicUrl);
      }
    }
    log(`Uploaded ${imageUrls.length} images`, "success");

    log("Creating brand record...");
    const { data: brand, error: brandError } = await supabase
      .from("brands")
      .insert({ name: brandName, industry: industry || null, user_id: user.id, website_url: websiteUrl || null, source_types: selectedSources, figma_url: figmaUrl || null } as any)
      .select()
      .single();
    if (brandError) throw brandError;
    const brandId = brand.id;
    setEarlyBrandId(brandId);

    log("Creating brand profile...");
    const { error: profileError } = await supabase.from("brand_profiles").insert({
      brand_id: brandId,
      reference_image_urls: imageUrls,
      audit_findings: auditFindings,
      confirmed_properties: confirmedProperties || null,
      extraction_sources: extractionSources,
      processing_status: "running_spec",
    } as any);
    if (profileError) throw profileError;

    // Fire-and-forget: slice reference images
    sliceAndUploadReferenceImages(user.id, brandId, [...imageUrls])
      .then((sliceUrls) => saveSliceUrls(brandId, sliceUrls))
      .catch((e) => console.warn("Slice upload failed (non-blocking):", e));

    // Fire-and-forget: start brand intelligence AI research
    if (websiteUrl?.trim()) {
      log("Starting background brand intelligence research...");
      supabase.functions.invoke("research-brand", {
        body: { brand_id: brandId, brand_name: brandName, domain: websiteUrl },
      }).catch((e) => console.warn("Brand intelligence research failed (non-blocking):", e));
    }

    // Fire-and-forget: upload asset files
    const assetBrandId = brandId;
    (async () => {
      try {
        const assetInserts: { brand_id: string; category: string; url: string; filename: string; description?: string; dominant_colors?: string[]; ai_category?: string }[] = [];
        const uploadPromises: Promise<void>[] = [];
        for (const [category, catData] of Object.entries(assetCategories)) {
          for (const file of catData.files) {
            const path = `${user.id}/${assetBrandId}/${category}/${Date.now()}-${file.name}`;
            uploadPromises.push((async () => {
              const { error: uploadErr } = await supabase.storage.from("brand-assets").upload(path, file);
              if (uploadErr) return;
              const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);
              const publicUrl = urlData.publicUrl;

              let description: string | undefined;
              let dominant_colors: string[] | undefined;
              let ai_category: string | undefined;
              try {
                const { data: analysis } = await supabase.functions.invoke("analyze-asset", {
                  body: { imageUrl: publicUrl, filename: file.name, userCategory: category },
                });
                if (analysis && !analysis.error) {
                  description = analysis.description;
                  dominant_colors = analysis.dominant_colors;
                  ai_category = analysis.suggested_category;
                }
              } catch {}

              assetInserts.push({ brand_id: assetBrandId, category, url: publicUrl, filename: file.name, description, dominant_colors, ai_category });
            })());
          }
        }
        await Promise.all(uploadPromises);
        if (assetInserts.length > 0) {
          const { data: insertedAssets } = await supabase.from("brand_assets").insert(assetInserts).select("id, url");
          if (insertedAssets) {
            for (const asset of insertedAssets) {
              supabase.functions.invoke("analyze-asset-composition", {
                body: { imageUrl: (asset as any).url, assetId: (asset as any).id },
              }).catch(() => {});
            }
          }
        }
        console.log(`Background asset upload complete: ${assetInserts.length} assets`);
      } catch (err) {
        console.warn("Background asset upload failed (non-blocking):", err);
      }
    })();

    // Fire spec phase
    log("Starting brand spec generation...");
    supabase.functions.invoke("extract-brand", {
      body: { auditFindings, brandName, industry, brandId, step: "spec", confirmed_properties: confirmedProperties },
    }).then(({ error: invokeError }) => {
      if (invokeError) console.log("[BrandSetup] extract-brand spec invoke returned error:", invokeError.message);
    }).catch((err: any) => {
      console.log("[BrandSetup] extract-brand spec invoke timed out (expected):", err?.message);
    });

    return brandId;
  }, [user, brandName, industry, websiteUrl, selectedSources, figmaUrl, assetCategories, campaignFiles, brandDeckFiles, miscRefFiles, mockupFiles]);

  // Render guide HTML in iframe
  useEffect(() => {
    const iframe = guideIframeRef.current;
    if (!iframe || !brandGuideHtml || step !== "guide_review") return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(brandGuideHtml);
    doc.close();
    const poll = setInterval(() => {
      const h = doc.documentElement?.scrollHeight;
      if (h && h > 100) { setGuideIframeHeight(h); clearInterval(poll); }
    }, 200);
    return () => clearInterval(poll);
  }, [brandGuideHtml, step]);

  // === Save brand ===
  const saveBrand = async () => {
    if (!user || !earlyBrandId) return;
    setSaving(true);
    try {
      toast.success("Brand saved! Generating starter campaigns...");

      const starterCampaigns = [
        { name: "Welcome Email", goal: "welcome", brief: "Warm welcome for new subscribers introducing the brand with a compelling CTA." },
        { name: "Social Proof", goal: "social_proof", brief: "Build trust with testimonials and reviews. Highlight key benefits." },
        { name: "Brand Highlight", goal: "highlight", brief: "Showcase top products/services with compelling visuals and copy." },
      ];

      for (const sc of starterCampaigns) {
        const { data: camp, error: campErr } = await supabase
          .from("campaigns")
          .insert({ brand_id: earlyBrandId, name: sc.name, status: "generating", brief: sc.brief, goal: sc.goal })
          .select()
          .single();
        if (campErr) continue;
        supabase.functions.invoke("generate-campaign", {
          body: { brandId: earlyBrandId, campaignId: camp.id, brief: sc.brief, goal: sc.goal },
        }).catch(() => {});
      }

      navigate(`/brands/${earlyBrandId}/onboarding`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save brand");
    } finally {
      setSaving(false);
    }
  };

  const totalImageCount = getAllImageFiles().length;

  const startProcessing = () => {
    if (!brandName.trim()) { toast.error("Please enter a brand name."); return; }
    const allImages = getAllImageFiles();
    if (allImages.length < 3 && !selectedSources.includes("website") && !selectedSources.includes("figma")) {
      toast.error("Please upload at least 3 images."); return;
    }
    setProcessingKey((k) => k + 1);
    setStep("processing");
  };

  // ============ RENDER STEPS ============

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

  if (step === "sources") {
    return (
      <div className="min-h-screen bg-background p-6 md:p-12">
        <button onClick={() => setStep("info")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="max-w-xl">
          <SourceQuiz selected={selectedSources} onToggle={toggleSource} websiteUrl={websiteUrl} onWebsiteUrlChange={setWebsiteUrl} figmaUrl={figmaUrl} onFigmaUrlChange={setFigmaUrl} figmaToken={figmaToken} onFigmaTokenChange={setFigmaToken} />
          <div className="mt-8">
            <Button onClick={() => setStep("uploads")} disabled={selectedSources.length === 0} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Next <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
            <ResourceUploader title="Past Email Campaigns" description="Upload screenshots or images of your previous email campaigns" accept=".jpg,.jpeg,.png,.webp,.pdf,.html,.htm" files={campaignFiles} previews={campaignPreviews} onAdd={addFiles(setCampaignFiles, setCampaignPreviews)} onRemove={removeFile(campaignFiles, setCampaignFiles, campaignPreviews, setCampaignPreviews)} minFiles={3} />
          )}
          {selectedSources.includes("brand_deck") && (
            <ResourceUploader title="Brand Deck / Guidelines" description="Upload your brand guide — PDFs or images" accept=".jpg,.jpeg,.png,.webp,.pdf" files={brandDeckFiles} previews={brandDeckPreviews} onAdd={addFiles(setBrandDeckFiles, setBrandDeckPreviews)} onRemove={removeFile(brandDeckFiles, setBrandDeckFiles, brandDeckPreviews, setBrandDeckPreviews)} />
          )}
          {selectedSources.includes("misc_references") && (
            <ResourceUploader title="Misc Branding References" description="Any other visual references" accept=".jpg,.jpeg,.png,.webp" files={miscRefFiles} previews={miscRefPreviews} onAdd={addFiles(setMiscRefFiles, setMiscRefPreviews)} onRemove={removeFile(miscRefFiles, setMiscRefFiles, miscRefPreviews, setMiscRefPreviews)} />
          )}
          {selectedSources.includes("product_mockups") && (
            <ResourceUploader title="Product Mockups" description="Upload product mockup images" accept=".jpg,.jpeg,.png,.webp" files={mockupFiles} previews={mockupPreviews} onAdd={addFiles(setMockupFiles, setMockupPreviews)} onRemove={removeFile(mockupFiles, setMockupFiles, mockupPreviews, setMockupPreviews)} />
          )}
          {selectedSources.includes("image_assets") && (
            <AssetCategoryUploader categories={assetCategories} onUpdate={(cat, files, previews) => setAssetCategories((prev) => ({ ...prev, [cat]: { files, previews } }))} />
          )}
          {selectedSources.includes("website") && !selectedSources.some((s) => s !== "website") && (
            <p className="text-sm text-muted-foreground">Website analysis will be included. You can proceed.</p>
          )}
          <div className="flex items-center gap-4">
            <Button onClick={startProcessing} disabled={totalImageCount < 3 && !selectedSources.includes("website")} className="bg-primary text-primary-foreground hover:bg-primary/90">
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

  if (step === "processing") {
    return (
      <BrandProcessingScreen
        key={processingKey}
        brandName={brandName}
        brandContext={{ auditFindings: {}, brandName, industry }}
        onRunAudit={handleRunAudit}
        onCreateBrand={handleCreateBrand}
        onComplete={(bId, guideHtml, rawExtraction, sysPrompt) => {
          setEarlyBrandId(bId);
          setExtraction(rawExtraction as any);
          setSystemPrompt(sysPrompt || "");
          setBrandGuideHtml(guideHtml);
        }}
        onRetry={() => {
          setEarlyBrandId(null);
          setProcessingKey((k) => k + 1);
        }}
        onContinue={(bId) => {
          if (brandGuideHtml) {
            setStep("guide_review");
          } else {
            navigate(`/brands/${bId}`);
          }
        }}
      />
    );
  }

  if (step === "guide_review" && brandGuideHtml) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-12">
        <div className="flex items-center justify-between mb-6 max-w-5xl">
          <div>
            <h1 className="text-2xl font-semibold">Brand Design Guide</h1>
            <p className="text-muted-foreground text-sm mt-1">Review your generated email design system</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => {
              if (!brandGuideHtml) return;
              const blob = new Blob([brandGuideHtml], { type: "text/html" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${brandName}-design-guide.html`;
              a.click();
              URL.revokeObjectURL(url);
            }}>
              <Download className="w-4 h-4 mr-1.5" /> Download
            </Button>
          </div>
        </div>

        {extraction && (
          <div className="flex flex-wrap gap-3 mb-6 max-w-5xl">
            {Object.entries(extraction.colors || {}).map(([key, val]) => (
              <div key={key} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border">
                <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: val as string }} />
                <span className="text-xs text-muted-foreground">{key.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        )}

        <div className="border border-border rounded-lg overflow-hidden bg-card max-w-5xl">
          <iframe
            ref={guideIframeRef}
            title="Brand Guide Preview"
            className="w-full"
            style={{ height: Math.min(guideIframeHeight, 2000), border: "none" }}
            sandbox="allow-same-origin"
          />
        </div>

        <div className="mt-8 max-w-5xl">
          <Button onClick={saveBrand} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? "Saving & Generating Campaigns..." : "Save Brand & Generate Starter Campaigns"}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
