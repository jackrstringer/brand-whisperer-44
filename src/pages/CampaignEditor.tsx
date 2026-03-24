import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ProductSelector from "@/components/brand/ProductSelector";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, Send, Undo2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { Campaign, ChatMessage } from "@/lib/types";

const IMG_SRC_TAG_REGEX = /<img\b([^>]*?)\bsrc=(["'])(.*?)\2([^>]*)>/gi;
const BROKEN_IMAGE_HOST_REGEX = /^(https?:\/\/(images\.unsplash\.com|source\.unsplash\.com|picsum\.photos))/i;

function replaceLikelyBrokenImageUrls(html: string, fallbackUrls: string[]): string {
  if (!html || fallbackUrls.length === 0) return html;

  let fallbackIndex = 0;
  return html.replace(IMG_SRC_TAG_REGEX, (fullTag, beforeSrc, quote, src, afterSrc) => {
    const currentSrc = String(src || "").trim();
    if (!currentSrc || !BROKEN_IMAGE_HOST_REGEX.test(currentSrc)) {
      return fullTag;
    }

    const fallbackUrl = fallbackUrls[fallbackIndex % fallbackUrls.length];
    fallbackIndex += 1;
    return `<img${beforeSrc}src=${quote}${fallbackUrl}${quote}${afterSrc}>`;
  });
}

export default function CampaignEditor() {
  const { brandId, campaignId } = useParams<{ brandId: string; campaignId: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop"); // kept for key
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  const [brief, setBrief] = useState("");
  const [goal, setGoal] = useState("promotional");
  const [extraCopy, setExtraCopy] = useState("");
  const [generating, setGenerating] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [speedMode, setSpeedMode] = useState<"normal" | "fast" | "faster">("normal");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [pinnedAssetUrls, setPinnedAssetUrls] = useState<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const previewPanelRef = useRef<HTMLDivElement>(null);

  const [renderWidth, setRenderWidth] = useState(470);
  const [viewportWidth, setViewportWidth] = useState(470);
  const [screenZoom, setScreenZoom] = useState(100);
  const [iframeContentHeight, setIframeContentHeight] = useState(800);
  const [previewFallbackUrls, setPreviewFallbackUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!campaignId || !brandId) return;
    const load = async () => {
      const { data: c } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();
      if (c) {
        const campaign = c as Campaign;
        setCampaign(campaign);
        setNameValue(campaign.name);
        const history = campaign.html_history;
        setCanUndo(Array.isArray(history) && history.length > 0);
      }
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: true });

      const { data: brandProfile } = await supabase
        .from("brand_profiles")
        .select("reference_image_urls")
        .eq("brand_id", brandId)
        .single();

      const fallbackUrls = Array.isArray(brandProfile?.reference_image_urls)
        ? brandProfile.reference_image_urls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
        : [];

      setPreviewFallbackUrls(fallbackUrls);
      setMessages((msgs || []) as ChatMessage[]);
      setLoading(false);
    };
    load();
  }, [brandId, campaignId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);



  const measureIframeHeight = useCallback((iframe: HTMLIFrameElement | null) => {
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const h = Math.max(doc.body?.scrollHeight ?? 0, doc.documentElement?.scrollHeight ?? 0, 800);
      setIframeContentHeight(h);
    } catch {}
  }, []);

  const saveName = async () => {
    if (!campaignId || !nameValue.trim()) return;
    setEditingName(false);
    await supabase.from("campaigns").update({ name: nameValue.trim() }).eq("id", campaignId);
    setCampaign((c) => c ? { ...c, name: nameValue.trim() } : c);
  };

  const [genStartTime, setGenStartTime] = useState<number | null>(null);
  const [genElapsed, setGenElapsed] = useState(0);

  useEffect(() => {
    if (!genStartTime) return;
    const interval = setInterval(() => {
      setGenElapsed(Math.floor((Date.now() - genStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [genStartTime]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const generateCampaign = async () => {
    if (!brandId || !campaignId || !brief.trim()) return;
    setGenerating(true);
    setGenStartTime(Date.now());
    setGenElapsed(0);
    setCampaign((c) => c ? { ...c, status: "generating" } : c);

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-campaign`;
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      },
      body: JSON.stringify({
        brandId, campaignId, brief, goal, copy: extraCopy || undefined, speedMode,
        productIds: selectedProductIds.length > 0 ? selectedProductIds : undefined,
        pinnedAssetUrls: pinnedAssetUrls.length > 0 ? pinnedAssetUrls : undefined,
      }),
    }).catch(() => {});

    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", campaignId)
        .single();
      if (!data) return;
      if (data.status === "ready") {
        clearInterval(pollInterval);
        setCampaign(data as Campaign);
        setGenerating(false);
        const elapsed = genStartTime ? Math.floor((Date.now() - genStartTime) / 1000) : 0;
        setGenStartTime(null);
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), campaign_id: campaignId, role: "system", content: `Campaign generated in ${formatTimer(elapsed)}`, created_at: new Date().toISOString() },
        ]);
      } else if (data.status === "error") {
        clearInterval(pollInterval);
        setCampaign(data as Campaign);
        setGenerating(false);
        setGenStartTime(null);
        toast.error("Campaign generation failed. Please try again.");
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), campaign_id: campaignId, role: "system", content: "Generation failed", created_at: new Date().toISOString() },
        ]);
      }
    }, 4000);

    setTimeout(() => {
      clearInterval(pollInterval);
      setGenerating(false);
      setGenStartTime(null);
      setCampaign((c) => c ? { ...c, status: "draft" } : c);
      toast.error("Generation timed out. Please try again.");
    }, 300000);
  };

  const sendMessage = async () => {
    if (!campaignId || !chatInput.trim() || !campaign?.html) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), campaign_id: campaignId, role: "user", content: userMsg, created_at: new Date().toISOString() },
    ]);
    try {
      const { data, error } = await supabase.functions.invoke("edit-campaign", {
        body: { campaignId, message: userMsg, currentHtml: campaign.html },
      });
      if (error) throw new Error(error.message || "Edit failed");
      if (data?.error) throw new Error(data.error);
      setCampaign((c) => c ? { ...c, html: data.html } : c);
      setCanUndo(true);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), campaign_id: campaignId, role: "assistant", content: "Changes applied.", created_at: new Date().toISOString() },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), campaign_id: campaignId, role: "system", content: `Change failed: ${err.message}`, created_at: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleUndo = async () => {
    if (!campaign || !campaignId) return;
    const history = campaign.html_history;
    if (!Array.isArray(history) || history.length === 0) return;
    const previousHtml = history[history.length - 1];
    const newHistory = history.slice(0, -1);
    await supabase.from("campaigns").update({ html: previousHtml, html_history: newHistory }).eq("id", campaignId);
    setCampaign((c) => c ? { ...c, html: previousHtml as string, html_history: newHistory } : c);
    setCanUndo(newHistory.length > 0);
    toast.success("Undo successful");
  };

  const exportHtml = () => {
    if (!campaign?.html) return;
    const blob = new Blob([campaign.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${campaign.name.replace(/\s+/g, "-").toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  }

  const isDraft = !campaign?.html || campaign?.status === "draft";
  const isGenerating = campaign?.status === "generating" || generating;

  const zoomScale = screenZoom / 100;
  const renderedWidth = Math.round(viewportWidth * zoomScale);
  const renderedHeight = Math.round(iframeContentHeight * zoomScale);

  const htmlForPreview = campaign?.html
    ? replaceLikelyBrokenImageUrls(campaign.html, previewFallbackUrls)
    : "";

  const srcdocHtml = htmlForPreview
    ? htmlForPreview.replace(
        /(<head[^>]*>)/i,
        '$1<meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0;scrollbar-width:none;-ms-overflow-style:none;}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none;}table{max-width:100%!important;width:100%!important;box-sizing:border-box!important;}img{max-width:100%!important;height:auto!important;}td{box-sizing:border-box!important;}</style>'
      )
    : "";

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(`/brands/${brandId}`)} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          {editingName ? (
            <input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && saveName()}
              className="bg-transparent border-b border-primary text-sm font-medium outline-none"
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="text-sm font-medium hover:text-primary transition-colors truncate">
              {campaign?.name}
            </button>
          )}
          <Badge className={`text-[10px] ${campaign?.status === "ready" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
            {campaign?.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 px-3 py-1.5 rounded border border-border bg-card text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Render:</span>
              <input
                type="number"
                value={renderWidth}
                onChange={(e) => setRenderWidth(Math.max(200, Math.min(1200, Number(e.target.value) || 431)))}
                className="w-14 bg-transparent border-b border-border text-foreground text-center tabular-nums outline-none focus:border-primary"
                step={10}
              />
              <span className="text-muted-foreground">px</span>
            </label>
            <span className="text-border">|</span>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Viewport:</span>
              <input
                type="number"
                value={viewportWidth}
                onChange={(e) => setViewportWidth(Math.max(200, Math.min(1200, Number(e.target.value) || 431)))}
                className="w-14 bg-transparent border-b border-border text-foreground text-center tabular-nums outline-none focus:border-primary"
                step={10}
              />
              <span className="text-muted-foreground">px</span>
            </label>
            <span className="text-border">|</span>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Zoom:</span>
              <input
                type="number"
                value={screenZoom}
                onChange={(e) => setScreenZoom(Math.max(25, Math.min(300, Number(e.target.value) || 100)))}
                className="w-12 bg-transparent border-b border-border text-foreground text-center tabular-nums outline-none focus:border-primary"
                step={5}
              />
              <span className="text-muted-foreground">%</span>
            </label>
          </div>

          <Button variant="outline" size="sm" onClick={exportHtml} disabled={!campaign?.html} className="active:scale-[0.98] transition-all">
            <Download className="w-3 h-3 mr-1" /> Export HTML
          </Button>
        </div>
      </div>

      {/* Main Content — draggable split */}
      <PanelGroup direction="horizontal" className="flex-1">
        {/* Left Panel — Preview */}
        <Panel defaultSize={60} minSize={25} maxSize={85}>
          <div ref={previewPanelRef} className="h-full bg-card overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' as any }}>
            {isGenerating ? (
              <div className="max-w-[600px] mx-auto space-y-4 p-8 mt-12">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-10 w-1/3" />
              </div>
            ) : campaign?.html ? (
              <div className="flex justify-center p-8">
                <div
                  className="overflow-hidden"
                  style={{
                    width: renderedWidth,
                    height: renderedHeight,
                  }}
                >
                  <iframe
                    key={`${renderWidth}-${viewportWidth}`}
                    srcDoc={srcdocHtml}
                    sandbox="allow-same-origin"
                    className="border-0 block bg-white shadow-2xl"
                    style={{
                      width: renderWidth,
                      height: iframeContentHeight,
                      transform: `scale(${zoomScale})`,
                      transformOrigin: "top left",
                    }}
                    title="Email Preview"
                    onLoad={(e) => {
                      const iframe = e.currentTarget;
                      measureIframeHeight(iframe);
                      window.setTimeout(() => measureIframeHeight(iframe), 150);
                      window.setTimeout(() => measureIframeHeight(iframe), 600);
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Generate a campaign to see the preview
              </div>
            )}
          </div>
        </Panel>

        {/* Drag handle */}
        <PanelResizeHandle className="w-1.5 bg-border hover:bg-primary/40 transition-colors cursor-col-resize" />

        {/* Right Panel */}
        <Panel defaultSize={40} minSize={15} maxSize={75}>
          <div className="h-full flex flex-col overflow-hidden">
            {isDraft && !isGenerating ? (
              <div className="p-6 space-y-5 overflow-y-auto flex-1">
                <div>
                  <h2 className="text-sm font-medium mb-4">Campaign Brief</h2>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">What's this campaign about?</label>
                  <Textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder="Describe the campaign..."
                    className="bg-card border-border min-h-[100px]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Campaign goal</label>
                  <Select value={goal} onValueChange={setGoal}>
                    <SelectTrigger className="bg-card border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="promotional">Promotional</SelectItem>
                      <SelectItem value="educational">Educational</SelectItem>
                      <SelectItem value="re-engagement">Re-engagement</SelectItem>
                      <SelectItem value="seasonal">Seasonal</SelectItem>
                      <SelectItem value="welcome">Welcome</SelectItem>
                      <SelectItem value="social_proof">Social Proof</SelectItem>
                      <SelectItem value="highlight">Highlight</SelectItem>
                      <SelectItem value="product_launch">Product Launch</SelectItem>
                      <SelectItem value="abandoned_cart">Abandoned Cart</SelectItem>
                      <SelectItem value="win_back">Win-back</SelectItem>
                      <SelectItem value="newsletter">Newsletter</SelectItem>
                      <SelectItem value="announcement">Announcement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Any specific copy to include? (optional)</label>
                  <Textarea
                    value={extraCopy}
                    onChange={(e) => setExtraCopy(e.target.value)}
                    placeholder="Paste specific copy here..."
                    className="bg-card border-border"
                  />
                </div>
                {brandId && (
                  <ProductSelector
                    brandId={brandId}
                    selectedProductIds={selectedProductIds}
                    pinnedAssetUrls={pinnedAssetUrls}
                    onSelectionChange={(ids, pinned) => {
                      setSelectedProductIds(ids);
                      setPinnedAssetUrls(pinned);
                    }}
                  />
                )}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-background">
                    <Zap className={`w-4 h-4 ${speedMode !== "normal" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-xs text-muted-foreground">Speed:</span>
                    <div className="flex gap-1 flex-1">
                      {(["normal", "fast", "faster"] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setSpeedMode(mode)}
                          className={`flex-1 text-xs py-1.5 px-2 rounded-md transition-all capitalize ${
                            speedMode === mode
                              ? "bg-primary text-primary-foreground font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted"
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">
                    {speedMode === "normal" ? "Opus 4.6 — highest quality" : speedMode === "fast" ? "Sonnet 4.6 — good quality, faster" : "Haiku 4.5 — fastest, lower quality"}
                  </p>
                  <Button
                    onClick={generateCampaign}
                    disabled={!brief.trim() || generating}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all"
                  >
                    {generating ? "Generating..." : "Generate Campaign"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                  {messages.map((msg) => {
                    if (msg.role === "system") {
                      return (
                        <div key={msg.id} className="text-center">
                          <span className={`text-xs px-2 py-1 rounded ${msg.content.includes("failed") || msg.content.includes("error") ? "text-red-400" : "text-muted-foreground"}`}>
                            {msg.content}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-background text-foreground"
                            : "bg-card text-foreground"
                        }`}>
                          {msg.content}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>

                {canUndo && (
                  <div className="px-4 pb-2">
                    <Button variant="ghost" size="sm" onClick={handleUndo} className="text-muted-foreground hover:text-foreground">
                      <Undo2 className="w-3 h-3 mr-1" /> Undo last change
                    </Button>
                  </div>
                )}

                <div className="p-4 border-t border-border">
                  <div className="flex gap-2">
                    <Textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder="Describe the change..."
                      className="bg-card border-border min-h-[44px] max-h-[120px] resize-none"
                      disabled={sending}
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={!chatInput.trim() || sending}
                      size="icon"
                      className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 active:scale-[0.98] transition-all"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}