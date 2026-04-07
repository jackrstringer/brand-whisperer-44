import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Loader2, BookOpen, Sparkles } from "lucide-react";
import BrandResearchReport from "@/components/brand/BrandResearchReport";

export default function BrandGuide() {
  const { brandId } = useParams<{ brandId: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [brandName, setBrandName] = useState("");
  const [intel, setIntel] = useState<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(800);

  useEffect(() => {
    if (!brandId) return;
    const load = async () => {
      const [{ data: profile }, { data: brand }, { data: intelligence }] = await Promise.all([
        supabase.from("brand_profiles").select("brand_guide_html").eq("brand_id", brandId).single(),
        supabase.from("brands").select("name").eq("id", brandId).single(),
        supabase.from("brand_intelligence").select("*").eq("brand_id", brandId).single(),
      ]);
      setHtml((profile as any)?.brand_guide_html || null);
      setBrandName(brand?.name || "");
      setIntel(intelligence);
      setLoading(false);
    };
    load();
  }, [brandId]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    // Inject CSS overrides to cap cover/title section height and kill 100vh
    const fixCss = `<style>
      /* Fix oversized cover/title pages */
      section:first-of-type, .cover, [class*="cover"], [class*="hero"], header:first-of-type {
        min-height: unset !important;
        max-height: 420px !important;
        height: auto !important;
      }
      * { min-height: unset !important; }
      html, body { height: auto !important; min-height: unset !important; }
    </style>`;

    doc.open();
    doc.write(html.replace("</head>", fixCss + "</head>"));
    doc.close();

    const poll = setInterval(() => {
      const h = doc.documentElement?.scrollHeight;
      if (h && h > 100) {
        setIframeHeight(h);
        clearInterval(poll);
      }
    }, 200);
    return () => clearInterval(poll);
  }, [html]);

  const downloadGuide = () => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brandName || "brand"}-design-guide.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasGuide = !!html;
  const hasIntel = intel?.ai_research;
  const defaultTab = hasGuide ? "guide" : hasIntel ? "intelligence" : "guide";

  if (!hasGuide && !hasIntel) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">No brand guide or intelligence data yet.</p>
        <p className="text-sm text-muted-foreground">Run brand analysis from Brand Settings to generate these.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">{brandName} — Brand Guide</h1>
        {hasGuide && (
          <Button variant="outline" onClick={downloadGuide}>
            <Download className="w-4 h-4 mr-1.5" /> Download HTML
          </Button>
        )}
      </div>

      {hasGuide && hasIntel ? (
        <Tabs defaultValue={defaultTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="guide" className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Design Guide
            </TabsTrigger>
            <TabsTrigger value="intelligence" className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Intelligence Report
            </TabsTrigger>
          </TabsList>

          <TabsContent value="guide">
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

          <TabsContent value="intelligence">
            <BrandResearchReport
              research={intel.ai_research}
              confidence={intel.ai_research_confidence}
              lastResearchedAt={intel.last_researched_at}
            />
          </TabsContent>
        </Tabs>
      ) : hasGuide ? (
        <div className="border border-border rounded-lg overflow-hidden bg-white">
          <iframe
            ref={iframeRef}
            title="Brand Guide"
            className="w-full"
            style={{ height: iframeHeight, border: "none" }}
            sandbox="allow-same-origin"
          />
        </div>
      ) : (
        <BrandResearchReport
          research={intel.ai_research}
          confidence={intel.ai_research_confidence}
          lastResearchedAt={intel.last_researched_at}
        />
      )}
    </div>
  );
}
