import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import AssetManager from "@/components/brand/AssetManager";
import ProductManager from "@/components/brand/ProductManager";
import ShopifyProductGrid from "@/components/brand/ShopifyProductGrid";
import ReanalyzeBrand from "@/components/brand/ReanalyzeBrand";
import BrandResearchReport from "@/components/brand/BrandResearchReport";

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

  useEffect(() => {
    if (!brandId) return;
    (async () => {
      const [{ data: brand }, { data: brandAssets }, { data: profile }] = await Promise.all([
        supabase.from("brands").select("*").eq("id", brandId).single(),
        supabase.from("brand_assets").select("*").eq("brand_id", brandId),
        supabase.from("brand_profiles").select("brand_guide_html").eq("brand_id", brandId).single(),
      ]);
      if (brand) {
        setBrandName(brand.name);
        setIndustry(brand.industry || "");
        setWebsiteUrl(brand.website_url || "");
      }
      setAssets((brandAssets || []) as BrandAsset[]);
      setGuideHtml((profile as any)?.brand_guide_html || null);
      setIntel(intelligence);
      setLoading(false);

      supabase.functions.invoke("reprocess-asset-compositions", { body: { brandId } }).catch(() => {});
    })();
  }, [brandId]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !guideHtml) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    const fixCss = `<style>
      section:first-of-type, .cover, [class*="cover"], [class*="hero"], header:first-of-type {
        min-height: unset !important; max-height: 420px !important; height: auto !important;
      }
      * { min-height: unset !important; }
      html, body { height: auto !important; min-height: unset !important; }
    </style>`;
    doc.open();
    doc.write(guideHtml.replace("</head>", fixCss + "</head>"));
    doc.close();
    const poll = setInterval(() => {
      const h = doc.documentElement?.scrollHeight;
      if (h && h > 100) { setIframeHeight(h); clearInterval(poll); }
    }, 200);
    return () => clearInterval(poll);
  }, [guideHtml]);

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

  if (loading || !brandId) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
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
            <div className="border border-border rounded-lg overflow-hidden bg-white">
              <iframe
                ref={iframeRef}
                title="Brand Guide"
                className="w-full"
                style={{ height: iframeHeight, border: "none" }}
                sandbox="allow-same-origin"
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
