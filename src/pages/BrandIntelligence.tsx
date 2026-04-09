import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Brain, RefreshCw, Download, ChevronDown } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import BrandIntelligenceWizard from "@/components/brand/BrandIntelligenceWizard";
import BrandResearchReport from "@/components/brand/BrandResearchReport";
import { useCampaignReport } from "@/hooks/useCampaignReport";

export default function BrandIntelligencePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);

  const [brand, setBrand] = useState<any>(null);
  const [intel, setIntel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [klaviyoSynced, setKlaviyoSynced] = useState(false);

  // Report history
  const [reportHistory, setReportHistory] = useState<any[]>([]);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

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

  // Fetch report history
  const fetchHistory = useCallback(async () => {
    if (!brandId) return;
    const { data } = await supabase
      .from("campaign_reports")
      .select("id, campaign_count, date_range_days, created_at")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false });
    setReportHistory(data || []);
  }, [brandId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, reportStatus]);

  // Shadow DOM rendering for current report
  useEffect(() => {
    if (!reportRef.current || !reportHtml) return;
    let shadow = reportRef.current.shadowRoot;
    if (!shadow) {
      shadow = reportRef.current.attachShadow({ mode: "open" });
    }
    shadow.innerHTML = reportHtml;
  }, [reportHtml]);

  const handleDownloadPdf = useCallback((html: string) => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  }, []);

  const handleViewHistoryReport = useCallback(async (reportId: string) => {
    if (expandedReportId === reportId) {
      setExpandedReportId(null);
      return;
    }
    setExpandedReportId(reportId);
  }, [expandedReportId]);

  const handleDownloadHistoryReport = useCallback(async (reportId: string) => {
    const { data } = await supabase
      .from("campaign_reports")
      .select("report_html")
      .eq("id", reportId)
      .single();
    if (data?.report_html) {
      handleDownloadPdf(data.report_html);
    }
  }, [handleDownloadPdf]);

  if (loading || !brandId) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Skip the most recent history entry since it matches the current report
  const olderReports = reportHistory.slice(1);

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
              <>
                <Button variant="outline" size="sm" onClick={() => reportHtml && handleDownloadPdf(reportHtml)}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateReport}
                  disabled={reportLoading}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Generate New Report
                </Button>
              </>
            )}
            {klaviyoSynced && (!reportStatus || reportStatus === "pending" || reportStatus === "failed") && (
              <Button onClick={generateReport} disabled={reportLoading} size="sm">
                {reportLoading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Starting...</>
                ) : (
                  "Generate Report"
                )}
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

        {/* Complete — Shadow DOM render */}
        {reportStatus === "complete" && reportHtml && (
          <div className="space-y-2">
            {generatedAt && (
              <p className="text-xs text-muted-foreground">
                Generated {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}
              </p>
            )}
            <div className="rounded-lg border border-border overflow-hidden bg-card">
              <div ref={reportRef} className="w-full" />
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

        {/* Previous Reports */}
        {olderReports.length > 0 && (
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span>Previous Reports ({olderReports.length})</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 mt-2">
              {olderReports.map((report) => (
                <HistoryReportCard
                  key={report.id}
                  report={report}
                  isExpanded={expandedReportId === report.id}
                  onView={() => handleViewHistoryReport(report.id)}
                  onDownload={() => handleDownloadHistoryReport(report.id)}
                />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}

function HistoryReportCard({
  report,
  isExpanded,
  onView,
  onDownload,
}: {
  report: any;
  isExpanded: boolean;
  onView: () => void;
  onDownload: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loadingHtml, setLoadingHtml] = useState(false);

  useEffect(() => {
    if (!isExpanded || html) return;
    setLoadingHtml(true);
    supabase
      .from("campaign_reports")
      .select("report_html")
      .eq("id", report.id)
      .single()
      .then(({ data }) => {
        setHtml(data?.report_html || null);
        setLoadingHtml(false);
      });
  }, [isExpanded, html, report.id]);

  useEffect(() => {
    if (!containerRef.current || !html) return;
    let shadow = containerRef.current.shadowRoot;
    if (!shadow) {
      shadow = containerRef.current.attachShadow({ mode: "open" });
    }
    shadow.innerHTML = html;
  }, [html]);

  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="font-medium">
              Report — {format(new Date(report.created_at), "MMMM d, yyyy")}
            </span>
            <span className="text-muted-foreground ml-2">
              · {report.campaign_count} campaigns
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onView}>
              {isExpanded ? "Hide" : "View"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDownload}>
              <Download className="w-3.5 h-3.5 mr-1" />
              Download
            </Button>
          </div>
        </div>
        {isExpanded && (
          <div className="mt-3 rounded-lg border border-border overflow-hidden bg-card">
            {loadingHtml ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div ref={containerRef} className="w-full" />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
