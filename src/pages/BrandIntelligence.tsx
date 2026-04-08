import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Brain, RefreshCw, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import BrandIntelligenceWizard from "@/components/brand/BrandIntelligenceWizard";
import BrandResearchReport from "@/components/brand/BrandResearchReport";
import { useCampaignReport } from "@/hooks/useCampaignReport";

export default function BrandIntelligencePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [brand, setBrand] = useState<any>(null);
  const [intel, setIntel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [klaviyoSynced, setKlaviyoSynced] = useState(false);

  const {
    status: reportStatus,
    reportHtml,
    generatedAt,
    error: reportError,
    isLoading: reportLoading,
    generateReport,
  } = useCampaignReport(brandId);

  useEffect(() => {
    if (!brandId) return;
    (async () => {
      const [{ data: b }, { data: i }, { data: k }] = await Promise.all([
        supabase.from("brands").select("*").eq("id", brandId).single(),
        supabase.from("brand_intelligence").select("*").eq("brand_id", brandId).single(),
        supabase.from("klaviyo_connections").select("sync_status").eq("brand_id", brandId).maybeSingle(),
      ]);
      setBrand(b);
      setIntel(i);
      setKlaviyoSynced((k as any)?.sync_status === "complete");
      setLoading(false);
    })();
  }, [brandId]);

  // Auto-expand iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !reportHtml) return;
    const onLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const resize = () => {
        iframe.style.height = `${doc.documentElement.scrollHeight}px`;
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(doc.documentElement);
      return () => observer.disconnect();
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [reportHtml]);

  if (loading || !brandId) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Section 1: Brand Intelligence Wizard */}
      <BrandIntelligenceWizard
        brandId={brandId}
        brandName={brand?.name || ""}
        domain={brand?.website_url || ""}
        existingIntel={intel}
        onComplete={() => navigate(`/brands/${brandId}/intelligence`)}
      />

      {/* Section 2: Brand Research Report */}
      {intel?.ai_research && (
        <BrandResearchReport
          research={intel.ai_research}
          confidence={intel.ai_research_confidence}
          lastResearchedAt={intel.last_researched_at}
        />
      )}

      {/* Section 3: Campaign Performance Report */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl">Campaign Performance Report</h2>
            <p className="text-sm text-muted-foreground mt-1">
              AI-scored analysis of your email campaigns with competitor research
            </p>
          </div>
          <div className="flex items-center gap-2">
            {reportStatus === "complete" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => iframeRef.current?.contentWindow?.print()}
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Download PDF
              </Button>
            )}
            {reportStatus === "complete" && (
              <Button
                variant="outline"
                size="sm"
                onClick={generateReport}
                disabled={reportLoading}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Regenerate
              </Button>
            )}
          </div>
        </div>

        {/* Not connected */}
        {!klaviyoSynced && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Brain className="w-10 h-10 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Connect Klaviyo to unlock</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Connect Klaviyo and sync your campaign data to generate a performance analysis.
              </p>
              <Button onClick={() => navigate(`/brands/${brandId}/integrations`)}>
                Go to Integrations
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Pending */}
        {klaviyoSynced && (!reportStatus || reportStatus === "pending") && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Brain className="w-10 h-10 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Generate Performance Analysis</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-2">
                Score every campaign by business impact, identify top performers, and get competitor insights.
              </p>
              <p className="text-xs text-muted-foreground mb-6">Takes about 60 seconds.</p>
              <Button onClick={generateReport} disabled={reportLoading}>
                {reportLoading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting...</>
                ) : (
                  "Generate Performance Analysis"
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Generating */}
        {reportStatus === "generating" && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Analyzing your campaigns</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Scoring campaigns and researching competitors... ~60 seconds.
              </p>
              <div className="w-full max-w-xs">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-foreground rounded-full"
                    style={{ animation: "report-progress 60s ease-out forwards" }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Complete */}
        {reportStatus === "complete" && reportHtml && (
          <div className="space-y-2">
            {generatedAt && (
              <p className="text-xs text-muted-foreground">
                Generated {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}
              </p>
            )}
            <div className="rounded-lg border border-border overflow-hidden bg-card">
              <iframe
                ref={iframeRef}
                srcDoc={reportHtml}
                className="w-full border-0"
                style={{ minHeight: "800px" }}
                sandbox="allow-same-origin allow-popups"
                onLoad={(e) => {
                  const doc = (e.target as HTMLIFrameElement).contentDocument;
                  if (doc) {
                    (e.target as HTMLIFrameElement).style.height = `${doc.documentElement.scrollHeight}px`;
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Failed */}
        {reportStatus === "failed" && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <h3 className="text-lg font-medium text-destructive mb-2">Report generation failed</h3>
              {reportError && (
                <p className="text-sm text-muted-foreground max-w-md mb-6 font-mono bg-muted px-3 py-2 rounded">
                  {reportError}
                </p>
              )}
              <Button variant="outline" onClick={generateReport} disabled={reportLoading}>
                {reportLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Retrying...</>
                ) : (
                  "Try Again"
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
