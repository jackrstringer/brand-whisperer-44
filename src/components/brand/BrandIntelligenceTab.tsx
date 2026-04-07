import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Edit2, Sparkles, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import BrandIntelligenceWizard from "./BrandIntelligenceWizard";
import BrandResearchReport from "./BrandResearchReport";

interface Props {
  brandId: string;
  brandName: string;
  domain?: string;
}

export default function BrandIntelligenceTab({ brandId, brandName, domain }: Props) {
  const [intel, setIntel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rerunning, setRerunning] = useState(false);
  const [recompiling, setRecompiling] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const fetchIntel = async () => {
    const { data } = await supabase
      .from("brand_intelligence")
      .select("*")
      .eq("brand_id", brandId)
      .single();
    setIntel(data);
    setLoading(false);

    // If currently researching, poll
    if (data?.research_status === "researching") {
      startPolling();
    }
  };

  const startPolling = () => {
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("brand_intelligence")
        .select("research_status")
        .eq("brand_id", brandId)
        .single();
      if (data?.research_status !== "researching") {
        clearInterval(interval);
        fetchIntel();
        if (data?.research_status === "ai_complete") {
          toast.success("AI research completed!");
        } else if (data?.research_status === "failed") {
          toast.error("AI research failed.");
        }
      }
    }, 3000);
    return interval;
  };

  useEffect(() => { fetchIntel(); }, [brandId]);

  const rerunResearch = async () => {
    if (!domain?.trim()) {
      toast.error("Please set a website URL in the Info tab before running research.");
      return;
    }
    setRerunning(true);
    try {
      const { error } = await supabase.functions.invoke("research-brand", {
        body: { brand_id: brandId, brand_name: brandName, domain },
      });
      if (error) throw error;
      toast.success("Research started — this takes about 30-60 seconds.");
      startPolling();
    } catch (err: any) {
      toast.error(err.message || "Research failed to start");
    } finally {
      setRerunning(false);
    }
  };

  const recompileContext = async () => {
    setRecompiling(true);
    try {
      const { error } = await supabase.functions.invoke("compile-brand-context", {
        body: { brand_id: brandId },
      });
      if (error) throw error;
      toast.success("Context recompiled");
      await fetchIntel();
    } catch (err: any) {
      toast.error(err.message || "Recompile failed");
    } finally {
      setRecompiling(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!intel || showWizard) {
    return (
      <BrandIntelligenceWizard
        brandId={brandId}
        brandName={brandName}
        domain={domain}
        existingIntel={intel}
        editMode={!!intel}
        onComplete={() => { setShowWizard(false); fetchIntel(); }}
      />
    );
  }

  const isResearching = intel.research_status === "researching";

  const statusLabels: Record<string, string> = {
    pending: "Pending",
    researching: "Researching…",
    ai_complete: "AI Complete",
    survey_complete: "Survey Complete",
    complete: "Complete",
    failed: "Failed",
  };

  const statusColors: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    researching: "bg-blue-100 text-blue-800",
    ai_complete: "bg-yellow-100 text-yellow-800",
    survey_complete: "bg-blue-100 text-blue-800",
    complete: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Brand Intelligence</h3>
          <Badge className={statusColors[intel.research_status] || ""}>
            {isResearching && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            {statusLabels[intel.research_status] || intel.research_status}
          </Badge>
        </div>
      </div>

      {intel.last_researched_at && (
        <p className="text-xs text-muted-foreground">
          Last researched: {new Date(intel.last_researched_at).toLocaleDateString()}
          {intel.ai_research_confidence && ` · Confidence: ${intel.ai_research_confidence}`}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={rerunResearch} disabled={rerunning || isResearching}>
          {rerunning || isResearching ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Re-run AI Research
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowWizard(true)}>
          <Edit2 className="w-4 h-4 mr-1" /> Edit Survey
        </Button>
        <Button variant="outline" size="sm" onClick={recompileContext} disabled={recompiling}>
          {recompiling ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
          Recompile Context
        </Button>
      </div>

      {/* Tabbed view: Report vs Compiled Context */}
      <Tabs defaultValue="report" className="w-full">
        <TabsList>
          <TabsTrigger value="report" className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" /> Research Report
          </TabsTrigger>
          <TabsTrigger value="context" className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Compiled Context
          </TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="mt-4">
          {intel.ai_research ? (
            <BrandResearchReport
              research={intel.ai_research}
              confidence={intel.ai_research_confidence}
              lastResearchedAt={intel.last_researched_at}
            />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No research data yet. Run AI Research to generate a report.
            </p>
          )}
        </TabsContent>

        <TabsContent value="context" className="mt-4">
          {intel.compiled_context ? (
            <Textarea
              value={intel.compiled_context}
              readOnly
              className="min-h-[400px] text-xs font-mono bg-muted/30"
            />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No compiled context yet. Complete the survey and recompile.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
