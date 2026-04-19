import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sliceAndUploadReferenceImages, saveSliceUrls } from "@/lib/imageSlicing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, Download, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";
import ProcessingStatusPanel, { type DebugLogEntry } from "@/components/brand/ProcessingStatusPanel";
import { getExtractionSources, isImageUrl } from "@/lib/brandSetupPersistence";

type Phase = "idle" | "preflight" | "processing" | "guide_review";

interface ReanalyzeBrandProps {
  brandId: string;
  brandName: string;
  industry: string;
  websiteUrl?: string;
  figmaUrl?: string;
}

interface PreflightSummary {
  refCount: number;
  categories: Record<string, number>;
  hasWebsite: boolean;
  hasFigma: boolean;
  hasStoredConfirmedProps: boolean;
  extractionSources: string[];
}

export default function ReanalyzeBrand({ brandId, brandName, industry, websiteUrl, figmaUrl }: ReanalyzeBrandProps) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [auditFindings, setAuditFindings] = useState<any>(null);
  const [brandGuideHtml, setBrandGuideHtml] = useState("");
  const [summary, setSummary] = useState<PreflightSummary | null>(null);
  const [figmaToken, setFigmaToken] = useState("");
  const [pipelineEvents, setPipelineEvents] = useState<DebugLogEntry[]>([]);
  const guideIframeRef = useRef<HTMLIFrameElement>(null);
  const [guideIframeHeight, setGuideIframeHeight] = useState(800);

  const pushEvent = (event: string, detail: string) => {
    setPipelineEvents((prev) => [...prev, { timestamp: Date.now(), event, detail }]);
  };


  const sliceImageFromUrl = (
    url: string,
    maxSliceHeight = 2400,
    maxWidth = 800,
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

  // Step 1: Load existing inputs and show what will be replayed
  const loadPreflight = async () => {
    setPhase("preflight");
    const { data: profile, error } = await supabase
      .from("brand_profiles")
      .select("reference_image_urls, reference_image_categories, confirmed_properties, extraction_sources")
      .eq("brand_id", brandId)
      .single();

    if (error || !profile) {
      toast.error("Could not load brand profile.");
      setPhase("idle");
      return;
    }

    const cats = ((profile as any).reference_image_categories || {}) as Record<string, string[]>;
    const flat = ((profile as any).reference_image_urls || []) as string[];
    const categoryCounts: Record<string, number> = {};
    let total = 0;
    for (const [k, v] of Object.entries(cats)) {
      const n = Array.isArray(v) ? v.length : 0;
      if (n > 0) categoryCounts[k] = n;
      total += n;
    }
    if (total === 0) {
      // Fall back to flat list
      total = flat.length;
      if (total > 0) categoryCounts.campaign = total;
    }

    setSummary({
      refCount: total,
      categories: categoryCounts,
      hasWebsite: !!websiteUrl?.trim(),
      hasFigma: !!figmaUrl?.trim(),
      hasStoredConfirmedProps: !!(profile as any).confirmed_properties,
      extractionSources: ((profile as any).extraction_sources || []) as string[],
    });
  };

  // Step 2: Run the full pipeline replay
  const startReanalysis = async () => {
    if (!summary) return;
    if (summary.refCount < 3) {
      toast.error("This brand has fewer than 3 reference images stored. Cannot re-process.");
      return;
    }

    // Switch to unified processing screen IMMEDIATELY so user sees progress + debug log
    setPipelineEvents([]);
    setPhase("processing");
    pushEvent("phase", "loading reference inputs");

    try {
      pushEvent("db_read", `table=brand_profiles brand_id=${brandId}`);
      const { data: profile, error: profileError } = await supabase
        .from("brand_profiles")
        .select("reference_image_urls, reference_image_categories, confirmed_properties")
        .eq("brand_id", brandId)
        .single();

      if (profileError) {
        pushEvent("db_error", `table=brand_profiles msg=${profileError.message}`);
        throw new Error(profileError.message);
      }

      const cats = ((profile as any)?.reference_image_categories || {}) as Record<string, string[]>;
      const flat = ((profile as any)?.reference_image_urls || []) as string[];
      const orderedUrls: string[] = [];
      for (const key of ["campaign", "brand_deck", "misc", "mockup"]) {
        if (Array.isArray(cats[key])) orderedUrls.push(...cats[key]);
      }
      if (orderedUrls.length === 0) orderedUrls.push(...flat);
      const imageOnlyUrls = orderedUrls.filter(isImageUrl);
      pushEvent("inputs", `references=${imageOnlyUrls.length} (${Object.keys(cats).join(",") || "flat"})`);

      const storedProps = (profile as any)?.confirmed_properties || null;

      const extractionSources = getExtractionSources([
        ...(websiteUrl?.trim() ? ["website"] : []),
        ...(figmaUrl?.trim() ? ["figma"] : []),
      ] as any);
      const extractionPromises: Promise<any>[] = [];

      if (websiteUrl?.trim()) {
        pushEvent("fn_invoke", `name=extract-website-fonts url=${websiteUrl.trim()}`);
        const startedAt = Date.now();
        extractionPromises.push(
          supabase.functions
            .invoke("extract-website-fonts", { body: { url: websiteUrl.trim() } })
            .then(({ data, error }) => {
              const ms = Date.now() - startedAt;
              if (error || data?.error) {
                pushEvent("fn_response", `name=extract-website-fonts ms=${ms} error=${error?.message || data?.error}`);
                return null;
              }
              if (data?.warning) pushEvent("fn_warning", `name=extract-website-fonts ${data.warning}`);
              else pushEvent("fn_response", `name=extract-website-fonts ms=${ms} ok`);
              return { source: "website", ...data };
            })
            .catch((err) => {
              pushEvent("fn_error", `name=extract-website-fonts msg=${err?.message}`);
              return null;
            }),
        );
      }

      if (figmaUrl?.trim() && figmaToken.trim()) {
        pushEvent("fn_invoke", `name=extract-figma url=${figmaUrl.trim()}`);
        const startedAt = Date.now();
        extractionPromises.push(
          supabase.functions
            .invoke("extract-figma", { body: { figma_url: figmaUrl.trim(), figma_token: figmaToken.trim() } })
            .then(({ data, error }) => {
              const ms = Date.now() - startedAt;
              if (error || data?.error) {
                pushEvent("fn_response", `name=extract-figma ms=${ms} error=${error?.message || data?.error}`);
                return null;
              }
              pushEvent("fn_response", `name=extract-figma ms=${ms} ok`);
              return { source: "figma", ...data };
            })
            .catch((err) => {
              pushEvent("fn_error", `name=extract-figma msg=${err?.message}`);
              return null;
            }),
        );
      }

      pushEvent("phase", "slicing reference images");
      const slicedImages: any[] = [];
      const refUrls = imageOnlyUrls.slice(0, 10);
      for (let ci = 0; ci < refUrls.length; ci++) {
        try {
          const slices = await sliceImageFromUrl(refUrls[ci]);
          for (const slice of slices) slicedImages.push({ ...slice, campaignIndex: ci });
        } catch (e: any) {
          pushEvent("slice_warn", `idx=${ci} msg=${e?.message}`);
        }
      }
      if (slicedImages.length === 0) {
        throw new Error("Could not load any reference images from storage.");
      }
      pushEvent("slice_done", `total_slices=${slicedImages.length}`);

      const extractionResults = await Promise.all(extractionPromises);

      let merged: any = storedProps ? { ...storedProps } : null;
      const websiteResult = extractionResults.find((r) => r?.source === "website");
      const figmaResult = extractionResults.find((r) => r?.source === "figma");
      if (websiteResult?.confirmed_properties) {
        merged = { ...(merged || {}), ...websiteResult.confirmed_properties };
      }
      if (figmaResult?.confirmed_properties) {
        merged = { ...(merged || {}), ...figmaResult.confirmed_properties };
        if (figmaResult.confirmed_properties.fonts) merged.fonts = figmaResult.confirmed_properties.fonts;
        if (figmaResult.confirmed_properties.colors) {
          merged.colors = { ...(merged.colors || {}), ...figmaResult.confirmed_properties.colors };
        }
      }

      pushEvent("fn_invoke", `name=audit-brand slices=${slicedImages.length}`);
      const auditStart = Date.now();
      const { data, error } = await supabase.functions.invoke("audit-brand", {
        body: { images: slicedImages, brandName, industry, confirmed_properties: merged, brandId },
      });
      pushEvent("fn_response", `name=audit-brand ms=${Date.now() - auditStart} ${error || data?.error ? "ERROR" : "ok"}`);

      if (error) throw new Error(error.message || "Audit failed");
      if (data?.error) throw new Error(data.error);

      setAuditFindings(data.audit);

      pushEvent("db_write", `table=brand_profiles op=update brand_id=${brandId} (audit + status=running_spec)`);
      const { error: updErr } = await supabase
        .from("brand_profiles")
        .update({
          audit_findings: data.audit,
          confirmed_properties: merged,
          extraction_sources: extractionSources,
          reference_image_urls: orderedUrls,
          brand_guide_html: null,
          processing_status: "running_spec",
          processing_error: null,
        } as any)
        .eq("brand_id", brandId);
      if (updErr) {
        pushEvent("db_error", `table=brand_profiles msg=${updErr.message}`);
        throw new Error(updErr.message);
      }

      if (user?.id) {
        sliceAndUploadReferenceImages(user.id, brandId, imageOnlyUrls)
          .then((sliceUrls) => saveSliceUrls(brandId, sliceUrls))
          .catch((e) => pushEvent("bg_warn", `slice re-upload failed: ${e?.message}`));
      }

      if (websiteUrl?.trim()) {
        supabase.functions
          .invoke("research-brand", {
            body: { brand_id: brandId, brand_name: brandName, domain: websiteUrl.trim(), industry: industry || null },
          })
          .catch((e) => pushEvent("bg_warn", `research-brand failed: ${e?.message}`));
      }

      pushEvent("fn_invoke", `name=extract-brand step=spec`);
      const specStart = Date.now();
      const { error: specError } = await supabase.functions.invoke("extract-brand", {
        body: { auditFindings: data.audit, brandName, industry, brandId, step: "spec", confirmed_properties: merged },
      });
      pushEvent("fn_response", `name=extract-brand step=spec ms=${Date.now() - specStart} ${specError ? "ERROR" : "ok"}`);
      if (specError) {
        await supabase
          .from("brand_profiles")
          .update({ processing_status: "failed", processing_error: specError.message } as any)
          .eq("brand_id", brandId);
        throw new Error(specError.message);
      }

      pushEvent("fn_stream", `name=extract-brand step=guide event=open`);
      try {
        const session = await supabase.auth.getSession();
        const accessToken = session.data.session?.access_token || "";
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const guideResponse = await fetch(`${supabaseUrl}/functions/v1/extract-brand`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({ auditFindings: data.audit, brandName, industry, brandId, step: "guide" }),
        });
        let bytes = 0;
        if (guideResponse.body) {
          const reader = guideResponse.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (value) bytes += value.length;
            if (done) break;
          }
        }
        pushEvent("fn_stream", `name=extract-brand step=guide event=end bytes=${bytes}`);
      } catch (err: any) {
        pushEvent("fn_stream", `name=extract-brand step=guide event=error msg=${err?.message}`);
      }
    } catch (err: any) {
      pushEvent("error", `scope=reanalyze msg=${err?.message}`);
      toast.error(err.message || "Re-analysis failed");
      setPhase("idle");
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
      if (h && h > 100) {
        setGuideIframeHeight(h);
        clearInterval(poll);
      }
    }, 200);
    return () => clearInterval(poll);
  }, [brandGuideHtml, phase]);

  if (phase === "idle") {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium mb-1">Re-process Brand</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Re-runs the full original pipeline using the inputs you provided when this brand was created — reference
            images, website, Figma (if you re-supply the token), brand intelligence research, audit, spec extraction,
            and brand guide generation.
          </p>
        </div>
        <Button onClick={loadPreflight} variant="outline">
          <RefreshCw className="w-4 h-4 mr-1.5" /> Re-process Brand
        </Button>
      </div>
    );
  }

  if (phase === "preflight" && summary) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Info className="w-4 h-4 text-muted-foreground" />
              Inputs to be replayed
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reference images</span>
                <span className="font-mono">{summary.refCount}</span>
              </div>
              {Object.entries(summary.categories).map(([cat, n]) => (
                <div key={cat} className="flex items-center justify-between pl-3">
                  <span className="text-muted-foreground">↳ {cat.replace(/_/g, " ")}</span>
                  <span className="font-mono">{n}</span>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Website re-extraction</span>
                {summary.hasWebsite ? (
                  <Badge variant="outline" className="text-[10px]">
                    <Check className="w-3 h-3 mr-1" /> {websiteUrl}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">none</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Figma re-extraction</span>
                {summary.hasFigma ? (
                  <Badge variant="outline" className="text-[10px]">
                    {figmaToken ? <Check className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                    {figmaToken ? "token provided" : "needs token"}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">not configured</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Stored confirmed properties</span>
                <span className="font-mono">{summary.hasStoredConfirmedProps ? "yes (fallback)" : "no"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Original extraction sources</span>
                <span className="font-mono">{summary.extractionSources.join(", ") || "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {summary.hasFigma && (
          <div className="space-y-1.5">
            <Label htmlFor="figma-token" className="text-xs">
              Figma personal access token (optional — for live re-extraction)
            </Label>
            <Input
              id="figma-token"
              type="password"
              placeholder="figd_..."
              value={figmaToken}
              onChange={(e) => setFigmaToken(e.target.value)}
              className="text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Tokens are never stored. If left blank we'll fall back to the confirmed properties saved during the original
              run.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={startReanalysis} disabled={summary.refCount < 3}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Run full pipeline
          </Button>
          <Button variant="outline" onClick={() => setPhase("idle")}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "fetching" || phase === "auditing") {
    return (
      <div className="space-y-6 py-8 text-center">
        <h3 className="text-lg font-semibold">Re-running Brand Pipeline</h3>
        <p className="text-sm text-muted-foreground">{progressMessage}</p>
        <Progress value={progressValue} className="h-1.5 max-w-md mx-auto" />
      </div>
    );
  }

  if (phase === "generating_guide") {
    return (
      <div className="space-y-6 py-8 flex flex-col items-center">
        <ProcessingStatusPanel
          brandId={brandId}
          title="Re-processing Brand"
          subtitle="Running full brand pipeline — spec extraction then guide generation. This takes 5–10 minutes."
          brandContext={{ auditFindings, brandName, industry }}
          onComplete={(guideHtml) => {
            setBrandGuideHtml(guideHtml);
            setProgressValue(100);
            toast.success("Brand profile updated!");
            setTimeout(() => setPhase("guide_review"), 500);
          }}
          onFailed={(error) => {
            toast.error(error);
            setPhase("idle");
          }}
          onTimeout={() => {
            toast.error("Brand processing timed out after 15 minutes. Please try again.");
            setPhase("idle");
          }}
        />
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const blob = new Blob([brandGuideHtml], { type: "text/html" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${brandName}-design-guide.html`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="w-4 h-4 mr-1.5" /> Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPhase("idle");
                setBrandGuideHtml("");
                setAuditFindings(null);
              }}
            >
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
