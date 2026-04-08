import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import BrandIntelligenceWizard from "@/components/brand/BrandIntelligenceWizard";
import BrandResearchReport from "@/components/brand/BrandResearchReport";

export default function BrandIntelligencePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const [brand, setBrand] = useState<any>(null);
  const [intel, setIntel] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!brandId) return;
    (async () => {
      const [{ data: b }, { data: i }] = await Promise.all([
        supabase.from("brands").select("*").eq("id", brandId).single(),
        supabase.from("brand_intelligence").select("*").eq("brand_id", brandId).single(),
      ]);
      setBrand(b);
      setIntel(i);
      setLoading(false);
    })();
  }, [brandId]);

  if (loading || !brandId) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <BrandIntelligenceWizard
        brandId={brandId}
        brandName={brand?.name || ""}
        domain={brand?.website_url || ""}
        existingIntel={intel}
        onComplete={() => navigate(`/brands/${brandId}/intelligence`)}
      />

      {intel?.ai_research && (
        <div className="p-6 md:p-10 max-w-5xl mx-auto">
          <BrandResearchReport
            research={intel.ai_research}
            confidence={intel.ai_research_confidence}
            lastResearchedAt={intel.last_researched_at}
          />
        </div>
      )}
    </div>
  );
}
