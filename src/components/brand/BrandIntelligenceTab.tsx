import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Edit2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import BrandIntelligenceWizard from "./BrandIntelligenceWizard";

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
  };

  useEffect(() => { fetchIntel(); }, [brandId]);

  const rerunResearch = async () => {
    setRerunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("research-brand", {
        body: { brand_id: brandId, brand_name: brandName, domain: domain || brandName },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);

      // Then recompile
      await supabase.functions.invoke("compile-brand-context", {
        body: { brand_id: brandId },
      });

      toast.success("AI research updated and context recompiled");
      await fetchIntel();
    } catch (err: any) {
      toast.error(err.message || "Research failed");
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

  // No intel yet or user wants to edit
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

  // Show status + compiled context
  const statusColors: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    ai_complete: "bg-yellow-100 text-yellow-800",
    survey_complete: "bg-blue-100 text-blue-800",
    complete: "bg-green-100 text-green-800",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Brand Intelligence</h3>
          <Badge className={statusColors[intel.research_status] || ""}>
            {intel.research_status === "complete" ? "Complete" : intel.research_status?.replace("_", " ")}
          </Badge>
        </div>
      </div>

      {intel.last_researched_at && (
        <p className="text-xs text-muted-foreground">
          Last researched: {new Date(intel.last_researched_at).toLocaleDateString()}
          {intel.ai_research_confidence && ` · Confidence: ${intel.ai_research_confidence}`}
        </p>
      )}

      {intel.compiled_context && (
        <div>
          <Label>Compiled Context (injected into every campaign)</Label>
          <Textarea
            value={intel.compiled_context}
            readOnly
            className="mt-1 min-h-[300px] text-xs font-mono bg-muted/30"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={rerunResearch} disabled={rerunning}>
          {rerunning ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Re-run AI Research
        </Button>
        <Button variant="outline" onClick={() => setShowWizard(true)}>
          <Edit2 className="w-4 h-4 mr-1" /> Edit Survey Answers
        </Button>
        <Button variant="outline" onClick={recompileContext} disabled={recompiling}>
          {recompiling ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
          Recompile Context
        </Button>
      </div>
    </div>
  );
}
