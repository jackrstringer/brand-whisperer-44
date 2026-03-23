import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

export default function BrandGuide() {
  const { brandId } = useParams<{ brandId: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [brandName, setBrandName] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(800);

  useEffect(() => {
    if (!brandId) return;
    const load = async () => {
      const [{ data: profile }, { data: brand }] = await Promise.all([
        supabase.from("brand_profiles").select("brand_guide_html").eq("brand_id", brandId).single(),
        supabase.from("brands").select("name").eq("id", brandId).single(),
      ]);
      setHtml((profile as any)?.brand_guide_html || null);
      setBrandName(brand?.name || "");
      setLoading(false);
    };
    load();
  }, [brandId]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !html) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
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

  if (!html) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">No brand guide has been generated yet.</p>
        <p className="text-sm text-muted-foreground">Generate one by re-running brand analysis from Brand Settings.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">{brandName} — Design Guide</h1>
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
    </div>
  );
}
