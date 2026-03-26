import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

type Step = "info" | "sources" | "uploads" | "auditing" | "audit_review" | "generating_guide" | "guide_review";

const AUDIT_MESSAGES = [
  "Scanning layouts...",
  "Analyzing typography...",
  "Extracting color palettes...",
  "Inspecting CTA buttons...",
  "Mapping design patterns...",
  "Synthesizing findings...",
];

const GUIDE_MESSAGES = [
  "Phase 1: Analyzing campaigns...",
  "Phase 2: Building brand spec...",
  "Phase 3: Generating brand guide (3-5 min)...",
  "Finalizing documentation...",
];

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

  // Audit state
  const [progressValue, setProgressValue] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [auditFindings, setAuditFindings] = useState<any>(null);
  const [inconsistencies, setInconsistencies] = useState<any[]>([]);
  const [needsConfirmation, setNeedsConfirmation] = useState<any[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Guide state
  const [extraction, setExtraction] = useState<BrandExtraction | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [brandGuideHtml, setBrandGuideHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const guideIframeRef = useRef<HTMLIFrameElement>(null);
  const guideStartTimeRef = useRef<number>(Date.now());
  const [guideIframeHeight, setGuideIframeHeight] = useState(800);

  // Sliced images cache for reuse across passes
  const [slicedImagesCache, setSlicedImagesCache] = useState<any[]>([]);
  // Confirmed properties from Figma/website extraction
  const [confirmedProperties, setConfirmedProperties] = useState<any>(null);

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
    maxWidth = 600,
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

  // === PASS 1: Deep Audit ===
  const startAudit = async () => {
    if (!brandName.trim()) { toast.error("Please enter a brand name."); return; }
    const allImages = getAllImageFiles();
    if (allImages.length < 3 && !selectedSources.includes("website") && !selectedSources.includes("figma")) {
      toast.error("Please upload at least 3 images."); return;
    }

    setStep("auditing");
    setProgressValue(0);
    setProgressMessage(AUDIT_MESSAGES[0]);

    // Slow, realistic progress: takes ~3 min to reach 90%, then crawls
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000; // seconds
      // Logarithmic curve: fast to 30%, slows to 60%, crawls to 90%
      // At 30s → ~30%, at 60s → ~50%, at 120s → ~70%, at 180s → ~85%, caps at 90%
      const progress = Math.min(90, 30 * Math.log10(1 + elapsed / 10));
      const msgIndex = Math.min(Math.floor(progress / 16), AUDIT_MESSAGES.length - 1);
      setProgressMessage(AUDIT_MESSAGES[msgIndex]);
      setProgressValue(progress);
    }, 1000);

    try {
      // === Parallel extraction: Figma + Website + Image slicing ===
      const extractionPromises: Promise<any>[] = [];
      const extractionSources: string[] = ["screenshots"];

      // Figma extraction
      if (selectedSources.includes("figma") && figmaUrl && figmaToken) {
        extractionSources.push("figma");
        extractionPromises.push(
          supabase.functions.invoke("extract-figma", {
            body: { figma_url: figmaUrl, figma_token: figmaToken },
          }).then(({ data, error }) => {
            if (error) { console.warn("Figma extraction failed:", error); return null; }
            if (data?.error) { console.warn("Figma extraction error:", data.error); return null; }
            return { source: "figma", ...data };
          }).catch((err) => { console.warn("Figma extraction failed:", err); return null; })
        );
      }

      // Website extraction
      if (selectedSources.includes("website") && websiteUrl) {
        extractionSources.push("website");
        extractionPromises.push(
          supabase.functions.invoke("extract-website-fonts", {
            body: { url: websiteUrl },
          }).then(({ data, error }) => {
            if (error) { console.warn("Website extraction failed:", error); return null; }
            if (data?.error) { console.warn("Website extraction error:", data.error); return null; }
            return { source: "website", ...data };
          }).catch((err) => { console.warn("Website extraction failed:", err); return null; })
        );
      }

      // Image slicing (always)
      const refFiles = getReferenceImageFiles().slice(0, 8);
      if (refFiles.length === 0) {
        const fallbackFiles = Object.values(assetCategories)
          .flatMap((cat) => cat.files.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f.name)))
          .slice(0, 5);
        refFiles.push(...fallbackFiles);
      }

      let slicedImages: any[] = [];
      if (refFiles.length >= 3) {
        for (let ci = 0; ci < refFiles.length; ci++) {
          const slices = await sliceImage(refFiles[ci]);
          for (const slice of slices) {
            slicedImages.push({ ...slice, campaignIndex: ci });
          }
        }
        setSlicedImagesCache(slicedImages);
      }

      // Wait for parallel extractions
      const extractionResults = await Promise.all(extractionPromises);

      // Merge confirmed properties (Figma > Website)
      let merged: any = null;
      const websiteResult = extractionResults.find((r) => r?.source === "website");
      const figmaResult = extractionResults.find((r) => r?.source === "figma");

      if (websiteResult?.confirmed_properties) {
        merged = { ...websiteResult.confirmed_properties };
      }
      if (figmaResult?.confirmed_properties) {
        // Figma overrides website
        merged = { ...(merged || {}), ...figmaResult.confirmed_properties };
        if (figmaResult.confirmed_properties.fonts) {
          merged.fonts = figmaResult.confirmed_properties.fonts;
        }
        if (figmaResult.confirmed_properties.colors) {
          merged.colors = { ...(merged.colors || {}), ...figmaResult.confirmed_properties.colors };
        }
      }

      setConfirmedProperties(merged);

      if (slicedImages.length === 0 && !merged) {
        clearInterval(interval);
        toast.error("Need at least 3 reference images or a Figma/website source.");
        setStep("uploads");
        return;
      }

      // If we have no images but have confirmed props, skip audit and go straight to guide
      if (slicedImages.length === 0) {
        clearInterval(interval);
        // Use confirmed properties as a minimal audit
        const minimalAudit = { confirmed_properties: merged, _note: "No screenshots provided, using Figma/website data only" };
        setAuditFindings(minimalAudit);
        setProgressValue(100);
        setProgressMessage("Extraction complete! Generating brand guide...");
        setTimeout(() => generateGuideFromAudit(minimalAudit, merged, extractionSources), 500);
        return;
      }

      console.log(`Sending ${slicedImages.length} slices from ${refFiles.length} refs to audit`);

      const { data, error } = await supabase.functions.invoke("audit-brand", {
        body: { images: slicedImages, brandName, industry, confirmed_properties: merged },
      });

      clearInterval(interval);
      if (error) throw new Error(error.message || "Audit failed");
      if (data?.error) throw new Error(data.error);

      setAuditFindings(data.audit);
      setInconsistencies(data.inconsistencies || []);
      setNeedsConfirmation(data.needs_confirmation || []);
      setProgressValue(100);
      setProgressMessage("Audit complete! Generating brand guide...");
      // Skip audit review — go straight to guide generation
      setTimeout(() => generateGuideFromAudit(data.audit, merged, extractionSources), 500);
    } catch (err: any) {
      clearInterval(interval);
      toast.error(err.message || "Audit failed");
      setStep("uploads");
    }
  };

  // Brand ID created early for async guide generation
  const [earlyBrandId, setEarlyBrandId] = useState<string | null>(null);

  // === PASS 2+3: Spec + Guide (async with polling) ===
  const generateGuideFromAudit = async (findings?: any, mergedProps?: any, sources?: string[]) => {
    const auditData = findings || auditFindings;
    const props = mergedProps || confirmedProperties;
    const extractionSrcs = sources || ["screenshots"];
    if (!auditData || !user) { toast.error("No audit data available"); return; }

    setStep("generating_guide");
    guideStartTimeRef.current = Date.now();
    setProgressValue(0);
    setProgressMessage(GUIDE_MESSAGES[0]);

    const guideStartTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - guideStartTime) / 1000;
      const progress = Math.min(90, 25 * Math.log10(1 + elapsed / 8));
      const msgIndex = Math.min(Math.floor(progress / 25), GUIDE_MESSAGES.length - 1);
      setProgressMessage(GUIDE_MESSAGES[msgIndex]);
      setProgressValue(progress);
    }, 1000);

    try {
      // Step 1: Upload images and create brand + profile early
      let brandId = earlyBrandId;
      if (!brandId) {
        setProgressMessage("Uploading images...");
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

        const { data: brand, error: brandError } = await supabase
          .from("brands")
          .insert({ name: brandName, industry: industry || null, user_id: user.id, website_url: websiteUrl || null, source_types: selectedSources, figma_url: figmaUrl || null } as any)
          .select()
          .single();
        if (brandError) throw brandError;
        brandId = brand.id;
        setEarlyBrandId(brandId);

        // Create profile with audit findings
        const { error: profileError } = await supabase.from("brand_profiles").insert({
          brand_id: brandId,
          reference_image_urls: imageUrls,
          audit_findings: auditData,
          confirmed_properties: props || null,
          extraction_sources: extractionSrcs,
        } as any);
        if (profileError) throw profileError;

        // Fire-and-forget: slice reference images for generation use
        const sliceBrandId = brandId!;
        const sliceImageUrls = [...imageUrls];
        sliceAndUploadReferenceImages(user.id, sliceBrandId, sliceImageUrls)
          .then((sliceUrls) => saveSliceUrls(sliceBrandId, sliceUrls))
          .catch((e) => console.warn("Slice upload failed (non-blocking):", e));

        // Fire-and-forget: upload asset files and analyze with AI in background
        // This does NOT block guide generation — results are needed later for campaign building
        const assetBrandId = brandId!;
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
              await supabase.from("brand_assets").insert(assetInserts);
            }
            console.log(`Background asset upload complete: ${assetInserts.length} assets`);
          } catch (err) {
            console.warn("Background asset upload failed (non-blocking):", err);
          }
        })();
      }

      setProgressMessage("Building brand spec...");
      const { error: specError } = await supabase.functions.invoke("extract-brand", {
        body: { auditFindings: auditData, brandName, industry, brandId, step: "spec", confirmed_properties: props },
      });
      if (specError) throw new Error(specError.message || "Failed to build brand spec");

      setProgressMessage("Generating brand guide...");
      const { error: guideStartError } = await supabase.functions.invoke("extract-brand", {
        body: { auditFindings: auditData, brandName, industry, brandId, step: "guide" },
      });
      if (guideStartError) throw new Error(guideStartError.message || "Failed to start guide generation");

      // Step 3: Poll brand_profiles for brand_guide_html
      const POLL_INTERVAL = 5000;
      const MAX_POLL_TIME = 15 * 60 * 1000; // 15 minutes
      const startTime = Date.now();

      const pollForGuide = () => {
        const pollTimer = setInterval(async () => {
          try {
            const { data: profile } = await supabase
              .from("brand_profiles")
              .select("brand_guide_html, system_prompt, raw_extraction, audit_findings")
              .eq("brand_id", brandId!)
              .single();

            // Check for error state
            const findings = profile?.audit_findings as any;
            if (findings?._error) {
              clearInterval(pollTimer);
              clearInterval(interval);
              toast.error(findings._error || "Guide generation failed");
              setStep("uploads");
              return;
            }

            if (profile?.brand_guide_html) {
              clearInterval(pollTimer);
              clearInterval(interval);
              setExtraction(profile.raw_extraction as any);
              setSystemPrompt(profile.system_prompt || "");
              setBrandGuideHtml(profile.brand_guide_html);
              setProgressValue(100);
              setProgressMessage("Guide ready!");
              setTimeout(() => setStep("guide_review"), 500);
              return;
            }

            if (Date.now() - startTime > MAX_POLL_TIME) {
              clearInterval(pollTimer);
              clearInterval(interval);
              toast.error("Guide generation timed out. Please try again.");
              setStep("uploads");
            }
          } catch {
            // Keep polling on transient errors
          }
        }, POLL_INTERVAL);
      };

      pollForGuide();
    } catch (err: any) {
      clearInterval(interval);
      toast.error(err.message || "Guide generation failed");
      setStep("uploads");
    }
  };

  // Keep old name for any other references
  const generateGuide = () => generateGuideFromAudit();

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

  // === Save brand (brand already created early, just generate starter campaigns) ===
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

  // Helper to render audit findings as readable key-value pairs
  const renderAuditSection = (sectionKey: string, data: any) => {
    if (!data) return <p className="text-sm text-muted-foreground">No data</p>;

    if (Array.isArray(data)) {
      return (
        <div className="space-y-2">
          {data.map((item: any, i: number) => (
            <div key={i} className="p-2 rounded bg-muted/30 text-sm">
              {typeof item === "object" ? (
                <div>
                  {item.name && <p className="font-medium">{item.name}</p>}
                  {item.description && <p className="text-muted-foreground">{item.description}</p>}
                  {!item.name && !item.description && <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(item, null, 2)}</pre>}
                </div>
              ) : (
                <span>{String(item)}</span>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (typeof data === "object") {
      return (
        <div className="space-y-1.5">
          {Object.entries(data).map(([key, val]) => {
            const isColor = typeof val === "string" && /^#[0-9a-fA-F]{3,8}$/.test(val);
            const fieldPath = `${sectionKey}.${key}`;
            const needsConf = needsConfirmation.some((nc) => nc.element === fieldPath);

            return (
              <div key={key} className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground min-w-[140px] shrink-0">{key.replace(/_/g, " ")}</span>
                {isColor && <div className="w-5 h-5 rounded border border-border shrink-0" style={{ backgroundColor: val }} />}
                {editingField === fieldPath ? (
                  <div className="flex items-center gap-1 flex-1">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-7 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          // Apply edit to audit findings
                          const keys = fieldPath.split(".");
                          const updated = { ...auditFindings };
                          let obj = updated;
                          for (let i = 0; i < keys.length - 1; i++) {
                            obj[keys[i]] = { ...obj[keys[i]] };
                            obj = obj[keys[i]];
                          }
                          obj[keys[keys.length - 1]] = editValue;
                          setAuditFindings(updated);
                          setEditingField(null);
                        }
                        if (e.key === "Escape") setEditingField(null);
                      }}
                    />
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingField(null)}>✓</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 flex-1">
                    {typeof val === "object" && val !== null ? (
                      <div className="text-xs">
                        {renderAuditSection(fieldPath, val)}
                      </div>
                    ) : (
                      <span className="font-mono text-xs">{String(val)}</span>
                    )}
                    {needsConf && (
                      <Badge variant="outline" className="text-yellow-500 border-yellow-500/50 text-[10px] shrink-0">
                        Needs review
                      </Badge>
                    )}
                    <button
                      onClick={() => { setEditingField(fieldPath); setEditValue(String(val)); }}
                      className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    return <span className="text-sm font-mono">{String(data)}</span>;
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
            <Button onClick={startAudit} disabled={totalImageCount < 3 && !selectedSources.includes("website")} className="bg-primary text-primary-foreground hover:bg-primary/90">
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

  if (step === "auditing") {
    return (
      <div className="min-h-screen bg-background p-6 md:p-12 flex flex-col items-center justify-center">
        <div className="max-w-md w-full space-y-6 text-center">
          <h2 className="text-xl font-semibold">Deep Visual Audit</h2>
          <p className="text-sm text-muted-foreground">Analyzing each campaign individually, then synthesizing patterns...</p>
          <Progress value={progressValue} className="h-1.5" />
          <p className="text-sm text-muted-foreground">{progressMessage}</p>
        </div>
      </div>
    );
  }

  if (step === "audit_review" && auditFindings) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-12">
        <button onClick={() => setStep("uploads")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to uploads
        </button>
        <h1 className="text-2xl font-semibold mb-2">Review Brand Audit</h1>
        <p className="text-muted-foreground mb-2">Review the extracted design attributes below. Click any value to edit it.</p>

        {needsConfirmation.length > 0 && (
          <div className="mb-6 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <span className="text-sm font-medium text-yellow-500">Items needing confirmation</span>
            </div>
            <ul className="space-y-1">
              {needsConfirmation.map((nc, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  <span className="font-mono text-xs">{nc.element}</span> — {nc.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {inconsistencies.length > 0 && (
          <div className="mb-6 p-4 rounded-lg border border-blue-500/30 bg-blue-500/5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-blue-500">Inconsistencies between campaigns</span>
            </div>
            <ul className="space-y-1">
              {inconsistencies.map((inc, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  <span className="font-mono text-xs">{inc.element}</span> — {inc.description}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 max-w-5xl">
          {AUDIT_SECTIONS.map(({ key, title }) => {
            const sectionData = auditFindings[key];
            if (!sectionData) return null;
            return (
              <Card key={key} className="bg-card border-border group">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderAuditSection(key, sectionData)}
                </CardContent>
              </Card>
            );
          })}

          {auditFindings.special_patterns && auditFindings.special_patterns.length > 0 && (
            <Card className="bg-card border-border md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Special Patterns</CardTitle>
              </CardHeader>
              <CardContent>
                {renderAuditSection("special_patterns", auditFindings.special_patterns)}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="mt-8 flex gap-3 max-w-5xl">
          <Button onClick={generateGuide} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Check className="w-4 h-4 mr-1.5" /> Confirm & Generate Brand Guide
          </Button>
          <Button variant="outline" onClick={() => { setAuditFindings(null); setStep("uploads"); }}>
            Re-analyze
          </Button>
        </div>
      </div>
    );
  }

  if (step === "generating_guide") {
    const elapsed = Math.round((Date.now() - (guideStartTimeRef.current || Date.now())) / 1000);
    const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    const phases = [
      { label: "Analyzing campaigns", status: progressValue < 30 ? "running" : "complete" },
      { label: "Building brand spec", status: progressValue < 30 ? "pending" : progressValue < 60 ? "running" : "complete" },
      { label: "Generating brand guide (3-5 min)", status: progressValue < 60 ? "pending" : progressValue < 95 ? "running" : "complete" },
    ];
    return (
      <div className="min-h-screen bg-background p-6 md:p-12 flex flex-col items-center justify-center">
        <div className="max-w-lg w-full space-y-6 text-center">
          <h2 className="text-xl font-semibold">Deep Brand Analysis</h2>
          <p className="text-sm text-muted-foreground">
            Deep brand analysis in progress. This typically takes 5-10 minutes for a complete brand guide. You can leave this page — we'll notify you here when it's ready.
          </p>
          <Progress value={progressValue} className="h-1.5" />
          <div className="space-y-2 text-left">
            {phases.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {p.status === "complete" && <Check className="w-4 h-4 text-green-500 shrink-0" />}
                {p.status === "running" && <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />}
                {p.status === "pending" && <div className="w-4 h-4 rounded-full border border-muted-foreground/30 shrink-0" />}
                <span className={p.status === "pending" ? "text-muted-foreground" : ""}>{p.label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Elapsed: {formatTime(elapsed)}</p>
          {earlyBrandId && (
            <Button variant="outline" onClick={() => navigate(`/brands/${earlyBrandId}`)} className="mt-2">
              Go to dashboard
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (step === "guide_review" && brandGuideHtml) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-12">
        <button onClick={() => setStep("uploads")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to audit
        </button>
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

        {/* Key values summary */}
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

        <div className="border border-border rounded-lg overflow-hidden bg-white max-w-5xl">
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
