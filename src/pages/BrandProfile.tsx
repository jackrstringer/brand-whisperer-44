import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import AssetManager from "@/components/brand/AssetManager";
import ProductManager from "@/components/brand/ProductManager";
import ShopifyProductGrid from "@/components/brand/ShopifyProductGrid";
import ReanalyzeBrand from "@/components/brand/ReanalyzeBrand";
import ProcessingStatusPanel from "@/components/brand/ProcessingStatusPanel";

interface BrandAsset {
  id: string;
  url: string;
  category: string;
  filename: string | null;
  description: string | null;
  dominant_colors: string[] | null;
  ai_category: string | null;
}

export default function BrandProfile() {
  const { brandId } = useParams<{ brandId: string }>();
  const [loading, setLoading] = useState(true);
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [guideHtml, setGuideHtml] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [auditFindings, setAuditFindings] = useState<any>(null);

  const fetchData = async () => {
    if (!brandId) return;
    const [{ data: brand }, { data: brandAssets }, { data: profile }] = await Promise.all([
      supabase.from("brands").select("*").eq("id", brandId).single(),
      supabase.from("brand_assets").select("*").eq("brand_id", brandId),
      supabase.from("brand_profiles").select("brand_guide_html, processing_status, audit_findings").eq("brand_id", brandId).single(),
    ]);
    if (brand) {
      setBrandName(brand.name);
      setIndustry(brand.industry || "");
      setWebsiteUrl(brand.website_url || "");
    }
    setAssets((brandAssets || []) as BrandAsset[]);
    const status = (profile as any)?.processing_status as string | null;
    setProcessingStatus(status || null);
    setGuideHtml((profile as any)?.brand_guide_html || null);
    setLoading(false);

    supabase.functions.invoke("reprocess-asset-compositions", { body: { brandId } }).catch(() => {});
  };

  useEffect(() => {
    fetchData();
  }, [brandId]);

  const guideSrcDoc = guideHtml ? guideHtml.replace("</head>", `<style>
    section:first-of-type, .cover, [class*="cover"], [class*="hero"], header:first-of-type {
      min-height: unset !important; max-height: 420px !important; height: auto !important;
    }
    * { min-height: unset !important; }
    html, body { height: auto !important; min-height: unset !important; overflow: visible !important; }
  </style></head>`) : null;

  const downloadGuide = () => {
    if (!guideHtml) return;
    const blob = new Blob([guideHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brandName || "brand"}-design-guide.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isProcessing = processingStatus && !["idle", "complete", "failed"].includes(processingStatus);

  if (loading || !brandId) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (isProcessing) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <ProcessingStatusPanel
          brandId={brandId}
          title="Brand Processing In Progress"
          subtitle="Your brand analysis is still running. You can stay on this page — it will update automatically when complete."
          onComplete={(html) => {
            setGuideHtml(html);
            setProcessingStatus("complete");
          }}
          onFailed={(error) => {
            setProcessingStatus("failed");
            toast.error(error);
          }}
          onTimeout={() => {
            setProcessingStatus("failed");
            toast.error("Brand processing timed out. Please try re-analyzing from the Analysis tab.");
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Brand</h1>

      <Tabs defaultValue="assets" className="space-y-6">
        <TabsList>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          {guideHtml && <TabsTrigger value="guide">Brand Guide</TabsTrigger>}
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="assets">
          <AssetManager brandId={brandId} assets={assets} setAssets={setAssets} />
        </TabsContent>

        <TabsContent value="products" className="space-y-6">
          <ProductManager brandId={brandId} />
          <ShopifyProductGrid brandId={brandId} />
        </TabsContent>

        {guideHtml && (
          <TabsContent value="guide">
            <div className="flex justify-end mb-4">
              <Button variant="outline" onClick={downloadGuide}>
                <Download className="w-4 h-4 mr-1.5" /> Download HTML
              </Button>
            </div>
            <div className="border border-border rounded-lg overflow-hidden bg-card">
              <iframe
                title="Brand Guide"
                className="w-full"
                style={{ minHeight: 800, border: "none" }}
                sandbox="allow-same-origin"
                srcDoc={guideSrcDoc || undefined}
              />
            </div>
          </TabsContent>
        )}

        <TabsContent value="analysis">
          <ReanalyzeBrand brandId={brandId} brandName={brandName} industry={industry} websiteUrl={websiteUrl} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
