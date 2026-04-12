import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Check, AlertTriangle, Download, Send, FileUp } from "lucide-react";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import SegmentSelector from "@/components/brand/SegmentSelector";

interface FlowValidationResult {
  issues: { type: string; severity: "error" | "warning"; message: string; variable?: string }[];
  passed: boolean;
  errorCount: number;
  warningCount: number;
}

interface QAResult {
  links: {
    items: { url: string; status: string; inDomain: boolean }[];
    passed: boolean;
    totalCount: number;
    brokenCount: number;
  };
  spelling: {
    bodyIssues: { text: string; suggestion: string; context?: string }[];
    passed: boolean;
  };
  subjectPreview: {
    issues: { text: string; suggestion: string; field: string }[];
    lengthWarnings: { field: string; length: number; recommended: number; status: string }[];
    passed: boolean;
  };
  images: {
    issues: { src: string; issue: string }[];
    passed: boolean;
  };
  flowValidation?: FlowValidationResult;
  overallPassed: boolean;
}

export default function CampaignQA() {
  const { brandId, campaignId } = useParams<{ brandId: string; campaignId: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QAResult | null>(null);
  const [hasKlaviyo, setHasKlaviyo] = useState(false);
  const [pushing, setPushing] = useState(false);

  // Editable fields
  const [subjectLine, setSubjectLine] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [sendListIds, setSendListIds] = useState<string[]>([]);
  const [sendSegmentIds, setSendSegmentIds] = useState<string[]>([]);
  const [excludeListIds, setExcludeListIds] = useState<string[]>([]);
  const [excludeSegmentIds, setExcludeSegmentIds] = useState<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!campaignId || !brandId) return;
    const load = async () => {
      const [{ data: c }, { data: conn }] = await Promise.all([
        supabase.from("campaigns").select("*").eq("id", campaignId).single(),
        supabase.from("klaviyo_connections").select("id").eq("brand_id", brandId).maybeSingle(),
      ]);
      setCampaign(c);
      setSubjectLine(c?.subject_line || "");
      setPreviewText(c?.preview_text || "");
      setSendListIds(c?.send_list_ids || []);
      setSendSegmentIds(c?.send_segment_ids || []);
      setExcludeListIds((c as any)?.exclude_list_ids || []);
      setExcludeSegmentIds((c as any)?.exclude_segment_ids || []);
      setHasKlaviyo(!!conn);
      setLoading(false);
    };
    load();
  }, [brandId, campaignId]);

  const autoSave = useCallback((updates: Record<string, any>) => {
    if (!campaignId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await supabase.from("campaigns").update(updates as any).eq("id", campaignId);
    }, 800);
  }, [campaignId]);

  const handleSubjectLineChange = (val: string) => {
    setSubjectLine(val);
    autoSave({ subject_line: val });
  };

  const handlePreviewTextChange = (val: string) => {
    setPreviewText(val);
    autoSave({ preview_text: val });
  };

  const handleSegmentChange = (listIds: string[], segmentIds: string[], exclListIds?: string[], exclSegmentIds?: string[]) => {
    setSendListIds(listIds);
    setSendSegmentIds(segmentIds);
    setExcludeListIds(exclListIds || []);
    setExcludeSegmentIds(exclSegmentIds || []);
    autoSave({
      send_list_ids: listIds,
      send_segment_ids: segmentIds,
      exclude_list_ids: exclListIds || [],
      exclude_segment_ids: exclSegmentIds || [],
    });
  };

  const runQA = async () => {
    if (!campaign?.html) return;
    setRunning(true);
    try {
      // Build flow config for flow/transactional campaigns
      let flowConfigBody = undefined;
      if (campaign.campaign_mode === "flow" && campaign.flow_config) {
        const fc = campaign.flow_config as any;
        flowConfigBody = {
          event_schema: fc.event_schema || {},
          liquid_variables: fc.liquid_variables || [],
          trigger_metric_name: fc.trigger_metric_name || "",
        };
      }

      const { data, error } = await supabase.functions.invoke("qa-campaign", {
        body: {
          html: campaign.html,
          subjectLine: subjectLine,
          previewText: previewText,
          brandId,
          flowConfig: flowConfigBody,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setResult(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (campaign?.html && !result) runQA();
  }, [campaign]);

  const exportHtml = () => {
    if (!campaign?.html) return;
    const blob = new Blob([campaign.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(campaign.name || "campaign").replace(/\s+/g, "-").toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getKlaviyoErrorMessage = (raw: string) => {
    if (!raw) return "Klaviyo request failed.";

    const wrappedMatch = raw.match(/Error,\s*(\{[\s\S]*\})$/);
    if (wrappedMatch?.[1]) {
      try {
        const parsed = JSON.parse(wrappedMatch[1]);
        if (typeof parsed?.error === "string") return parsed.error;
      } catch {
        return raw;
      }
    }

    return raw;
  };

  const pushToKlaviyo = async (mode: "template" | "campaign") => {
    const includedSegments = (sendSegmentIds || []).filter(Boolean);
    const excludedSegments = (excludeSegmentIds || []).filter(Boolean);

    if (mode === "campaign" && includedSegments.length === 0) {
      toast.error("Select at least one segment before creating a campaign.");
      return;
    }

    setPushing(true);
    try {
      const action = mode === "template" ? "create-template" : "create-campaign";

      const payload = {
        action,
        brandId,
        campaignId,
        name: campaign.name,
        html: campaign.html,
        subjectLine: subjectLine || "",
        previewText: previewText || "",
        listIds: mode === "campaign" ? [] : (sendListIds || []),
        segmentIds: mode === "campaign" ? includedSegments : (sendSegmentIds || []),
        excludeListIds: mode === "campaign" ? [] : (excludeListIds || []),
        excludeSegmentIds: mode === "campaign" ? excludedSegments : (excludeSegmentIds || []),
      };

      const { data, error } = await supabase.functions.invoke("klaviyo-proxy", {
        body: payload,
      });

      if (error || data?.error) {
        throw new Error(getKlaviyoErrorMessage(data?.error || error?.message || ""));
      }

      toast.success(mode === "template" ? "Template pushed to Klaviyo" : "Campaign created in Klaviyo");
      if (mode === "campaign" && data?.klaviyoEditUrl) {
        window.open(data.klaviyoEditUrl, "_blank");
      }

      // Update any linked design_queue_items to 'sent' status
      if (campaignId && (data?.klaviyoCampaignId || data?.klaviyo_campaign_id)) {
        const klaviyoId = data.klaviyoCampaignId || data.klaviyo_campaign_id;
        supabase
          .from("design_queue_items")
          .update({ klaviyo_campaign_id: klaviyoId, status: "sent" } as any)
          .eq("campaign_id", campaignId)
          .then(() => {});
      }
    } catch (e: any) {
      toast.error(getKlaviyoErrorMessage(e?.message || ""));
    } finally {
      setPushing(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  const StatusIcon = ({ passed }: { passed: boolean }) => passed
    ? <Check className="w-4 h-4 text-emerald-400" />
    : <AlertTriangle className="w-4 h-4 text-amber-400" />;

  const slLength = subjectLine.length;
  const ptLength = previewText.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/brands/${brandId}/campaigns/${campaignId}`)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-medium">Review & Send</h1>
          <span className="text-xs text-muted-foreground">— {campaign?.name}</span>
        </div>
      </div>

      <div className="flex h-[calc(100vh-49px)]">
        {/* Left - Preview */}
        <div className="flex-1 overflow-y-auto bg-card p-6">
          {campaign?.html ? (
            <div className="max-w-[600px] mx-auto">
              <iframe
                srcDoc={campaign.html}
                sandbox="allow-same-origin"
                className="w-full border-0 bg-card shadow-lg rounded"
                style={{ minHeight: 800 }}
                title="Campaign Preview"
              />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center mt-20">No campaign HTML found</p>
          )}
        </div>

        {/* Right - Settings & QA */}
        <div className="w-[420px] border-l border-border overflow-y-auto p-5 space-y-5">

          {/* Subject Line */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">Subject Line</label>
              <span className={`text-[10px] ${slLength > 60 ? "text-amber-400" : "text-muted-foreground"}`}>
                {slLength}/60
              </span>
            </div>
            <Input
              value={subjectLine}
              onChange={e => handleSubjectLineChange(e.target.value)}
              placeholder="Enter subject line..."
              className="h-9 text-sm bg-card"
            />
          </div>

          {/* Preview Text */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">Preview Text</label>
              <span className={`text-[10px] ${ptLength > 90 ? "text-amber-400" : "text-muted-foreground"}`}>
                {ptLength}/90
              </span>
            </div>
            <Textarea
              value={previewText}
              onChange={e => handlePreviewTextChange(e.target.value)}
              placeholder="Enter preview text..."
              className="min-h-[60px] text-sm bg-card resize-none"
              rows={2}
            />
          </div>

          {/* Segment Selector */}
          {brandId && (
            <SegmentSelector
              brandId={brandId}
              selectedListIds={sendListIds}
              selectedSegmentIds={sendSegmentIds}
              excludeListIds={excludeListIds}
              excludeSegmentIds={excludeSegmentIds}
              onSelectionChange={handleSegmentChange}
            />
          )}

          {/* Divider */}
          <div className="border-t border-border" />

          {/* QA Checks */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">QA Checks</h2>
            {result && (
              <Badge className={result.overallPassed ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}>
                {result.overallPassed ? "All Passed" : "Issues Found"}
              </Badge>
            )}
          </div>

          {running && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Running QA checks...
            </div>
          )}

          {result && (
            <div className="space-y-2">
              {/* Links */}
              <Collapsible defaultOpen={!result.links.passed}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-card border border-border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <StatusIcon passed={result.links.passed} />
                    <span className="text-sm font-medium">Links</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{result.links.totalCount} found, {result.links.brokenCount} broken</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 space-y-1">
                  {result.links.items.map((link, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded bg-background">
                      <Badge variant="outline" className={`text-[9px] px-1.5 ${
                        link.status === "valid" ? "border-emerald-500/50 text-emerald-400" :
                        link.status === "placeholder" ? "border-blue-500/50 text-blue-400" :
                        "border-red-500/50 text-red-400"
                      }`}>
                        {link.status}
                      </Badge>
                      <span className="truncate flex-1 text-muted-foreground">{link.url}</span>
                      {link.inDomain && <Badge variant="secondary" className="text-[9px]">Brand</Badge>}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              {/* Spelling */}
              <Collapsible defaultOpen={!result.spelling.passed}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-card border border-border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <StatusIcon passed={result.spelling.passed} />
                    <span className="text-sm font-medium">Spelling & Grammar</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{result.spelling.bodyIssues.length} issues</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 space-y-1">
                  {result.spelling.bodyIssues.map((issue, i) => (
                    <div key={i} className="px-3 py-2 text-xs rounded bg-background space-y-0.5">
                      <p><span className="text-red-400 line-through">{issue.text}</span> → <span className="text-emerald-400">{issue.suggestion}</span></p>
                      {issue.context && <p className="text-muted-foreground text-[10px]">...{issue.context}...</p>}
                    </div>
                  ))}
                  {result.spelling.passed && <p className="text-xs text-muted-foreground px-3 py-2">No issues found ✓</p>}
                </CollapsibleContent>
              </Collapsible>

              {/* Subject Line & Preview Text QA */}
              <Collapsible defaultOpen={!result.subjectPreview.passed}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-card border border-border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <StatusIcon passed={result.subjectPreview.passed} />
                    <span className="text-sm font-medium">Subject & Preview Text</span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 space-y-1">
                  {result.subjectPreview.lengthWarnings.map((w, i) => (
                    <div key={i} className="px-3 py-1.5 text-xs rounded bg-background flex items-center justify-between">
                      <span className="capitalize">{w.field.replace("_", " ")}</span>
                      <span className={w.status === "good" ? "text-emerald-400" : "text-amber-400"}>
                        {w.length}/{w.recommended} chars
                      </span>
                    </div>
                  ))}
                  {result.subjectPreview.issues.map((issue, i) => (
                    <div key={i} className="px-3 py-1.5 text-xs rounded bg-background">
                      <span className="text-red-400 line-through">{issue.text}</span> → <span className="text-emerald-400">{issue.suggestion}</span>
                      <Badge variant="outline" className="ml-2 text-[9px]">{issue.field}</Badge>
                    </div>
                  ))}
                  {result.subjectPreview.passed && <p className="text-xs text-muted-foreground px-3 py-2">All good ✓</p>}
                </CollapsibleContent>
              </Collapsible>

              {/* Images */}
              <Collapsible defaultOpen={!result.images.passed}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-card border border-border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <StatusIcon passed={result.images.passed} />
                    <span className="text-sm font-medium">Images</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{result.images.issues.length} issues</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 space-y-1">
                  {result.images.issues.map((issue, i) => (
                    <div key={i} className="px-3 py-1.5 text-xs rounded bg-background">
                      <span className="text-amber-400">{issue.issue}</span>
                      <p className="text-muted-foreground text-[10px] truncate mt-0.5">{issue.src}</p>
                    </div>
                  ))}
                  {result.images.passed && <p className="text-xs text-muted-foreground px-3 py-2">All images OK ✓</p>}
                </CollapsibleContent>
              </Collapsible>

              {/* Flow Validation */}
              {result.flowValidation && (
                <Collapsible defaultOpen={!result.flowValidation.passed}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-card border border-border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <StatusIcon passed={result.flowValidation.passed} />
                      <span className="text-sm font-medium">Flow Validation</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {result.flowValidation.errorCount} errors, {result.flowValidation.warningCount} warnings
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 space-y-1">
                    {result.flowValidation.issues.map((issue, i) => (
                      <div key={i} className="px-3 py-2 text-xs rounded bg-background flex items-start gap-2">
                        <Badge variant="outline" className={`text-[9px] px-1.5 shrink-0 mt-0.5 ${
                          issue.severity === "error" ? "border-red-500/50 text-red-400" : "border-amber-500/50 text-amber-400"
                        }`}>
                          {issue.severity}
                        </Badge>
                        <span className="text-muted-foreground">{issue.message}</span>
                      </div>
                    ))}
                    {result.flowValidation.passed && result.flowValidation.warningCount === 0 && (
                      <p className="text-xs text-muted-foreground px-3 py-2">All flow checks passed ✓</p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}

          {/* Re-run */}
          <Button variant="outline" size="sm" onClick={runQA} disabled={running} className="w-full">
            <Loader2 className={`w-3 h-3 mr-1.5 ${running ? "animate-spin" : ""}`} />
            Re-run QA
          </Button>

          {/* Action buttons */}
          <div className="pt-4 border-t border-border space-y-2">
            <Button variant="outline" size="sm" onClick={exportHtml} className="w-full">
              <Download className="w-3 h-3 mr-1.5" /> Export HTML
            </Button>

            {hasKlaviyo && (
              <>
                <Button variant="outline" size="sm" onClick={() => pushToKlaviyo("template")} disabled={pushing} className="w-full">
                  <FileUp className="w-3 h-3 mr-1.5" /> Export as Klaviyo Template
                </Button>
                <Button size="sm" onClick={() => pushToKlaviyo("campaign")} disabled={pushing} className="w-full">
                  {pushing ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Send className="w-3 h-3 mr-1.5" />}
                  Create Klaviyo Campaign
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
