import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Brain, RefreshCw, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useCampaignReport } from "@/hooks/useCampaignReport";
import { supabase } from "@/integrations/supabase/client";

export default function IntelligencePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const {
    status,
    reportHtml,
    generatedAt,
    error,
    isLoading,
    generateReport,
  } = useCampaignReport(brandId);

  const [brandName, setBrandName] = useState("");
  const [compiledContext, setCompiledContext] = useState("");
  const [lastCompiledAt, setLastCompiledAt] = useState<string | null>(null);
  const [klaviyoSynced, setKlaviyoSynced] = useState(false);

  useEffect(() => {
    if (!brandId) return;
    supabase
      .from("brands")
      .select("name")
      .eq("id", brandId)
      .maybeSingle()
      .then(({ data }) => setBrandName(data?.name || "Brand"));

    supabase
      .from("brand_intelligence")
      .select("compiled_context, last_compiled_at")
      .eq("brand_id", brandId)
      .maybeSingle()
      .then(({ data }) => {
        setCompiledContext(data?.compiled_context || "");
        setLastCompiledAt(data?.last_compiled_at || null);
      });

    supabase
      .from("klaviyo_connections")
      .select("sync_status")
      .eq("brand_id", brandId)
      .maybeSingle()
      .then(({ data }) => setKlaviyoSynced((data as any)?.sync_status === "complete"));
  }, [brandId]);

  // Auto-expand iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !reportHtml) return;

    const onLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const resize = () => {
        const height = doc.documentElement.scrollHeight;
        iframe.style.height = `${height}px`;
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(doc.documentElement);
      return () => observer.disconnect();
    };

    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [reportHtml]);

  const handleDownloadPdf = () => {
    iframeRef.current?.contentWindow?.print();
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl">
            {brandName ? `${brandName} Intelligence` : "Intelligence"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Campaign performance analysis and brand intelligence
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status === "complete" && (
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Download PDF
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={generateReport}
            disabled={isLoading || status === "generating"}
          >
            {(isLoading || status === "generating") ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating...</>
            ) : (
              <><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Regenerate Report</>
            )}
          </Button>
        </div>
      </div>

      {/* Section A: Brand Intelligence Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              Brand Intelligence
            </CardTitle>
            <div className="flex items-center gap-2">
              {lastCompiledAt && (
                <span className="text-xs text-muted-foreground">
                  Last updated{" "}
                  {formatDistanceToNow(new Date(lastCompiledAt), { addSuffix: true })}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => navigate(`/brands/${brandId}/intelligence`)}
              >
                Update <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </div>
          <CardDescription>AI-compiled brand context used to generate campaign insights</CardDescription>
        </CardHeader>
        <CardContent>
          {compiledContext ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6">
              {compiledContext}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No brand intelligence compiled yet.{" "}
              <button
                className="underline hover:text-foreground"
                onClick={() => navigate(`/brands/${brandId}/intelligence`)}
              >
                Run brand analysis
              </button>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section B: Campaign Performance Report */}
      {renderReportSection({
        status,
        reportHtml,
        error,
        isLoading,
        klaviyoSynced,
        brandId: brandId!,
        iframeRef,
        generateReport,
        navigate,
      })}
    </div>
  );
}

// ─── Report Section Renderer ───

interface ReportSectionProps {
  status: string | null;
  reportHtml: string | null;
  error: string | null;
  isLoading: boolean;
  klaviyoSynced: boolean;
  brandId: string;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  generateReport: () => void;
  navigate: (path: string) => void;
}

function renderReportSection({
  status,
  reportHtml,
  error,
  isLoading,
  klaviyoSynced,
  brandId,
  iframeRef,
  generateReport,
  navigate,
}: ReportSectionProps) {
  if (!klaviyoSynced) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Brain className="w-10 h-10 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Connect Klaviyo to get started</h3>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Connect Klaviyo and sync your campaign data to generate your performance analysis.
          </p>
          <Button onClick={() => navigate(`/brands/${brandId}/integrations`)}>
            Go to Integrations
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!status || status === "pending") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Brain className="w-10 h-10 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Generate Performance Analysis</h3>
          <p className="text-sm text-muted-foreground max-w-md mb-2">
            Analyze 365 days of campaign data, score every campaign by business impact,
            identify top performers and growth opportunities.
          </p>
          <p className="text-xs text-muted-foreground mb-6">Takes about 60 seconds.</p>
          <Button onClick={generateReport} disabled={isLoading}>
            {isLoading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting...</>
            ) : (
              "Generate Performance Analysis"
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === "generating") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Analyzing your campaigns</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Analyzing your campaigns and researching competitors... This takes about 60 seconds.
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
    );
  }

  if (status === "complete" && reportHtml) {
    return (
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
              const height = doc.documentElement.scrollHeight;
              (e.target as HTMLIFrameElement).style.height = `${height}px`;
            }
          }}
        />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <h3 className="text-lg font-medium text-destructive mb-2">Report generation failed</h3>
          {error && (
            <p className="text-sm text-muted-foreground max-w-md mb-6 font-mono bg-muted px-3 py-2 rounded">
              {error}
            </p>
          )}
          <Button variant="outline" onClick={generateReport} disabled={isLoading}>
            {isLoading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Retrying...</>
            ) : (
              "Try Again"
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}
