import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sliceAndUploadReferenceImages, saveSliceUrls } from "@/lib/imageSlicing";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Check, Download, Edit2, RefreshCw, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const AUDIT_MESSAGES = [
  "Scanning layouts...",
  "Analyzing typography...",
  "Extracting color palettes...",
  "Inspecting CTA buttons...",
  "Mapping design patterns...",
  "Synthesizing findings...",
];

const GUIDE_MESSAGES = [
  "Building brand spec...",
  "Generating design system...",
  "Creating brand guide...",
  "Finalizing documentation...",
];

const AUDIT_SECTIONS = [
  { key: "logo", title: "Logo Treatment" },
  { key: "colors", title: "Color Palette" },
  { key: "typography_headlines", title: "Typography — Headlines" },
  { key: "typography_body", title: "Typography — Body" },
  { key: "typography_subheads", title: "Typography — Subheads" },
  { key: "cta_buttons", title: "CTA Buttons" },
  { key: "image_treatment", title: "Image Treatment" },
  { key: "card_container_design", title: "Card / Container Design" },
  { key: "section_dividers", title: "Section Dividers" },
  { key: "footer", title: "Footer" },
  { key: "icons_decorative", title: "Icons & Decorative Elements" },
  { key: "voice", title: "Voice & Tone" },
] as const;

type Phase = "idle" | "fetching" | "auditing" | "audit_review" | "generating_guide" | "guide_review";

interface ReanalyzeBrandProps {
  brandId: string;
  brandName: string;
  industry: string;
}

export default function ReanalyzeBrand({ brandId, brandName, industry }: ReanalyzeBrandProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progressValue, setProgressValue] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [auditFindings, setAuditFindings] = useState<any>(null);
  const [inconsistencies, setInconsistencies] = useState<any[]>([]);
  const [needsConfirmation, setNeedsConfirmation] = useState<any[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [brandGuideHtml, setBrandGuideHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const guideIframeRef = useRef<HTMLIFrameElement>(null);
  const [guideIframeHeight, setGuideIframeHeight] = useState(800);

  const sliceImageFromUrl = (
    url: string,
    maxSliceHeight = 1300,
    maxWidth = 600,
  ): Promise<Array<{ data: string; mediaType: string; sliceIndex: number; totalSlices: number }>> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
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
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          results.push({ data: dataUrl.split(",")[1], mediaType: "image/jpeg", sliceIndex: i, totalSlices });
        }
        resolve(results);
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });

  const startReanalysis = async () => {
    setPhase("fetching");
    setProgressValue(0);
    setProgressMessage("Loading reference images...");

    try {
      const { data: profile } = await supabase
        .from("brand_profiles")
        .select("reference_image_urls, confirmed_properties")
        .eq("brand_id", brandId)
        .single();

      const urls: string[] = (profile as any)?.reference_image_urls || [];
      if (urls.length < 3) {
        toast.error("This brand has fewer than 3 reference images stored. Please re-create the brand with more images.");
        setPhase("idle");
        return;
      }

      setPhase("auditing");
      setProgressMessage(AUDIT_MESSAGES[0]);

      const interval = setInterval(() => {
        setProgressValue((v) => {
          const next = Math.min(v + 1.5, 95);
          const msgIndex = Math.min(Math.floor(next / 16), AUDIT_MESSAGES.length - 1);
          setProgressMessage(AUDIT_MESSAGES[msgIndex]);
          return next;
        });
      }, 400);

      // Slice images from URLs
      const slicedImages: any[] = [];
      const refUrls = urls.slice(0, 10);
      for (let ci = 0; ci < refUrls.length; ci++) {
        try {
          const slices = await sliceImageFromUrl(refUrls[ci]);
          for (const slice of slices) {
            slicedImages.push({ ...slice, campaignIndex: ci });
          }
        } catch (e) {
          console.warn(`Skipping image ${ci}:`, e);
        }
      }

      if (slicedImages.length === 0) {
        clearInterval(interval);
        toast.error("Could not load any reference images. They may have been deleted.");
        setPhase("idle");
        return;
      }

      const savedProps = (profile as any)?.confirmed_properties || null;
      const { data, error } = await supabase.functions.invoke("audit-brand", {
        body: { images: slicedImages, brandName, industry, confirmed_properties: savedProps },
      });

      clearInterval(interval);
      if (error) throw new Error(error.message || "Audit failed");
      if (data?.error) throw new Error(data.error);

      setAuditFindings(data.audit);
      setInconsistencies(data.inconsistencies || []);
      setNeedsConfirmation(data.needs_confirmation || []);
      setProgressValue(100);
      setProgressMessage("Audit complete!");
      setTimeout(() => setPhase("audit_review"), 500);
    } catch (err: any) {
      toast.error(err.message || "Re-analysis failed");
      setPhase("idle");
    }
  };

  const generateGuide = async () => {
    setPhase("generating_guide");
    setProgressValue(0);
    setProgressMessage(GUIDE_MESSAGES[0]);

    const interval = setInterval(() => {
      setProgressValue((v) => {
        const next = Math.min(v + 0.8, 95);
        const msgIndex = Math.min(Math.floor(next / 25), GUIDE_MESSAGES.length - 1);
        setProgressMessage(GUIDE_MESSAGES[msgIndex]);
        return next;
      });
    }, 500);

    try {
      // Save current audit findings to profile first
      await supabase
        .from("brand_profiles")
        .update({ audit_findings: auditFindings, brand_guide_html: null } as any)
        .eq("brand_id", brandId);

      setProgressMessage("Building brand spec...");
      const { error: specError } = await supabase.functions.invoke("extract-brand", {
        body: { auditFindings, brandName, industry, brandId, step: "spec" },
      });
      if (specError) throw new Error(specError.message || "Failed to build brand spec");

      setProgressMessage("Generating brand guide...");
      const { error: guideStartError } = await supabase.functions.invoke("extract-brand", {
        body: { auditFindings, brandName, industry, brandId, step: "guide" },
      });
      if (guideStartError) throw new Error(guideStartError.message || "Failed to start guide generation");

      // Poll for results
      const POLL_INTERVAL = 5000;
      const MAX_POLL_TIME = 5 * 60 * 1000;
      const startTime = Date.now();

      const pollTimer = setInterval(async () => {
        try {
          const { data: profile } = await supabase
            .from("brand_profiles")
            .select("brand_guide_html, audit_findings")
            .eq("brand_id", brandId)
            .single();

          const findings = profile?.audit_findings as any;
          if (findings?._error) {
            clearInterval(pollTimer);
            clearInterval(interval);
            toast.error(findings._error || "Guide generation failed");
            setPhase("audit_review");
            return;
          }

          if (profile?.brand_guide_html) {
            clearInterval(pollTimer);
            clearInterval(interval);
            setBrandGuideHtml(profile.brand_guide_html);
            setProgressValue(100);
            setProgressMessage("Guide ready!");
            toast.success("Brand profile updated!");
            setTimeout(() => setPhase("guide_review"), 500);
            return;
          }

          if (Date.now() - startTime > MAX_POLL_TIME) {
            clearInterval(pollTimer);
            clearInterval(interval);
            toast.error("Guide generation timed out. Please try again.");
            setPhase("audit_review");
          }
        } catch {
          // Keep polling on transient errors
        }
      }, POLL_INTERVAL);
    } catch (err: any) {
      clearInterval(interval);
      toast.error(err.message || "Guide generation failed");
      setPhase("audit_review");
    }
  };

  // Render guide in iframe
  useEffect(() => {
    const iframe = guideIframeRef.current;
    if (!iframe || !brandGuideHtml || phase !== "guide_review") return;
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
  }, [brandGuideHtml, phase]);

  const renderAuditValue = (sectionKey: string, data: any): JSX.Element => {
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
              ) : <span>{String(item)}</span>}
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
              <div key={key} className="flex items-start gap-2 text-sm group">
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
                      <div className="text-xs">{renderAuditValue(fieldPath, val)}</div>
                    ) : (
                      <span className="font-mono text-xs">{String(val)}</span>
                    )}
                    {needsConf && (
                      <Badge variant="outline" className="text-yellow-500 border-yellow-500/50 text-[10px] shrink-0">Needs review</Badge>
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

  if (phase === "idle") {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium mb-1">Re-analyze Brand</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Re-run the visual audit and regenerate the brand guide using the existing reference images. 
            This updates the system prompt and design system without re-uploading anything.
          </p>
        </div>
        <Button onClick={startReanalysis} variant="outline">
          <RefreshCw className="w-4 h-4 mr-1.5" /> Re-analyze Brand
        </Button>
      </div>
    );
  }

  if (phase === "fetching" || phase === "auditing" || phase === "generating_guide") {
    return (
      <div className="space-y-6 py-8 text-center">
        <h3 className="text-lg font-semibold">
          {phase === "fetching" ? "Loading References" : phase === "auditing" ? "Deep Visual Audit" : "Generating Brand Guide"}
        </h3>
        <p className="text-sm text-muted-foreground">{progressMessage}</p>
        <Progress value={progressValue} className="h-1.5 max-w-md mx-auto" />
      </div>
    );
  }

  if (phase === "audit_review" && auditFindings) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Audit Results</h3>
            <p className="text-sm text-muted-foreground">Review and edit findings, then regenerate the guide.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setAuditFindings(null); setPhase("idle"); }}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Cancel
          </Button>
        </div>

        {needsConfirmation.length > 0 && (
          <div className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
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
          <div className="p-4 rounded-lg border border-blue-500/30 bg-blue-500/5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-blue-500">Inconsistencies</span>
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

        <div className="grid gap-4 md:grid-cols-2">
          {AUDIT_SECTIONS.map(({ key, title }) => {
            const sectionData = auditFindings[key];
            if (!sectionData) return null;
            return (
              <Card key={key} className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{title}</CardTitle>
                </CardHeader>
                <CardContent>{renderAuditValue(key, sectionData)}</CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex gap-3">
          <Button onClick={generateGuide} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Check className="w-4 h-4 mr-1.5" /> Confirm & Regenerate Guide
          </Button>
          <Button variant="outline" onClick={startReanalysis}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Re-run Audit
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "guide_review" && brandGuideHtml) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Updated Brand Guide</h3>
            <p className="text-sm text-muted-foreground">Your brand profile has been updated.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => {
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
            <Button variant="outline" size="sm" onClick={() => { setPhase("idle"); setBrandGuideHtml(""); setAuditFindings(null); }}>
              Done
            </Button>
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden bg-white">
          <iframe
            ref={guideIframeRef}
            title="Brand Guide Preview"
            className="w-full"
            style={{ height: Math.min(guideIframeHeight, 2000), border: "none" }}
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    );
  }

  return null;
}
