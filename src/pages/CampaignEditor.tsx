import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ProductSelector, { type SelectedShopifyProduct } from "@/components/brand/ProductSelector";
import SegmentSelector from "@/components/brand/SegmentSelector";
import ReferencePanel, { type SelectedReference } from "@/components/campaign/ReferencePanel";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, Send, Undo2, Zap, Paperclip, X, Image as ImageIcon, ClipboardCheck, Star } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { Campaign, ChatMessage } from "@/lib/types";

async function uploadChatImages(files: File[], brandId: string, campaignId: string): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop() || "png";
    const path = `${brandId}/campaigns/${campaignId}/chat/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("brand-assets").upload(path, file, { contentType: file.type });
    if (error) { console.error("Upload error:", error); continue; }
    const { data } = supabase.storage.from("brand-assets").getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

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
  const speedMode = "normal";
  const [chatAttachments, setChatAttachments] = useState<File[]>([]);
  const [chatAttachmentPreviews, setChatAttachmentPreviews] = useState<string[]>([]);
  const [draftRefImages, setDraftRefImages] = useState<File[]>([]);
  const [draftRefPreviews, setDraftRefPreviews] = useState<string[]>([]);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const draftFileInputRef = useRef<HTMLInputElement>(null);
  const chatDropRef = useRef<HTMLDivElement>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [pinnedAssetUrls, setPinnedAssetUrls] = useState<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [matchProductColors, setMatchProductColors] = useState(false);
  const [selectedShopifyProducts, setSelectedShopifyProducts] = useState<SelectedShopifyProduct[]>([]);
  const [designNotes, setDesignNotes] = useState("");
  const [subjectLine, setSubjectLine] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [starredCampaign, setStarredCampaign] = useState(false);

  // Restore reference panel state from localStorage
  useEffect(() => {
    if (!campaignId) return;
    try {
      const stored = localStorage.getItem(`ref-panel-${campaignId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.selectedReference) setSelectedReference(parsed.selectedReference);
      }
    } catch {}
  }, [campaignId]);

  // Check if campaign is already starred
  useEffect(() => {
    if (!user || !campaignId) return;
    supabase
      .from("saved_references")
      .select("id")
      .eq("user_id", user.id)
      .eq("reference_type", "campaign")
      .eq("reference_id", campaignId)
      .then(({ data }) => {
        setStarredCampaign(!!data && data.length > 0);
      });
  }, [user, campaignId]);
  const [sendListIds, setSendListIds] = useState<string[]>([]);
  const [sendSegmentIds, setSendSegmentIds] = useState<string[]>([]);
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
        const campaign = c as unknown as Campaign;
        setCampaign(campaign);
        setNameValue(campaign.name);
        setBrief(campaign.brief ?? "");
        setGoal(campaign.goal ?? "promotional");
        setExtraCopy(campaign.extra_copy ?? "");
        setSelectedProductIds(Array.isArray(campaign.product_ids) ? campaign.product_ids : []);
        setPinnedAssetUrls(Array.isArray(campaign.pinned_asset_urls) ? campaign.pinned_asset_urls : []);
        setSubjectLine((campaign as any).subject_line || "");
        setPreviewText((campaign as any).preview_text || "");
        setSendListIds(Array.isArray((campaign as any).send_list_ids) ? (campaign as any).send_list_ids : []);
        setSendSegmentIds(Array.isArray((campaign as any).send_segment_ids) ? (campaign as any).send_segment_ids : []);
        // speedMode is always "normal" now
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

  // Attach ResizeObserver to iframe body for continuous height tracking
  const iframeObserverRef = useRef<ResizeObserver | null>(null);
  const setupIframeObserver = useCallback((iframe: HTMLIFrameElement | null) => {
    if (iframeObserverRef.current) {
      iframeObserverRef.current.disconnect();
      iframeObserverRef.current = null;
    }
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      const observer = new ResizeObserver(() => measureIframeHeight(iframe));
      observer.observe(doc.body);
      iframeObserverRef.current = observer;
      // Also re-measure when images inside load
      const images = doc.querySelectorAll("img");
      images.forEach((img) => {
        if (!img.complete) {
          img.addEventListener("load", () => measureIframeHeight(iframe), { once: true });
        }
      });
    } catch {}
  }, [measureIframeHeight]);

  useEffect(() => {
    return () => {
      if (iframeObserverRef.current) iframeObserverRef.current.disconnect();
    };
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

    // Upload any draft reference images
    let draftRefUrls: string[] = [];
    if (draftRefImages.length > 0) {
      draftRefUrls = await uploadChatImages(draftRefImages, brandId, campaignId);
      setDraftRefImages([]);
      setDraftRefPreviews(prev => { prev.forEach(u => URL.revokeObjectURL(u)); return []; });
    }

    const allPinned = [...pinnedAssetUrls, ...draftRefUrls];

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
        pinnedAssetUrls: allPinned.length > 0 ? allPinned : undefined,
        matchProductColors: matchProductColors || undefined,
        designNotes: designNotes.trim() || undefined,
        shopifyProducts: selectedShopifyProducts.length > 0 ? selectedShopifyProducts : undefined,
        reference: selectedReference ? {
          type: selectedReference.type,
          id: selectedReference.id,
          image_urls: selectedReference.image_urls,
          strength: selectedReference.strength,
        } : undefined,
      }),
    }).catch(() => {});

    // Persist all draft preferences to campaign record
    await supabase.from("campaigns").update({
      brief,
      goal,
      extra_copy: extraCopy || null,
      speed_mode: speedMode,
      product_ids: selectedProductIds.length > 0 ? selectedProductIds : null,
      pinned_asset_urls: pinnedAssetUrls.length > 0 ? pinnedAssetUrls : null,
      subject_line: subjectLine || null,
      preview_text: previewText || null,
      send_list_ids: sendListIds.length > 0 ? sendListIds : null,
      send_segment_ids: sendSegmentIds.length > 0 ? sendSegmentIds : null,
    } as any).eq("id", campaignId);

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

  const addChatAttachments = useCallback((files: File[]) => {
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name));
    if (imageFiles.length === 0) return;
    setChatAttachments(prev => [...prev, ...imageFiles]);
    setChatAttachmentPreviews(prev => [...prev, ...imageFiles.map(f => URL.createObjectURL(f))]);
  }, []);

  const removeChatAttachment = useCallback((index: number) => {
    setChatAttachmentPreviews(prev => { URL.revokeObjectURL(prev[index]); return prev.filter((_, i) => i !== index); });
    setChatAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const addDraftRefImages = useCallback((files: File[]) => {
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name));
    if (imageFiles.length === 0) return;
    setDraftRefImages(prev => [...prev, ...imageFiles]);
    setDraftRefPreviews(prev => [...prev, ...imageFiles.map(f => URL.createObjectURL(f))]);
  }, []);

  const removeDraftRefImage = useCallback((index: number) => {
    setDraftRefPreviews(prev => { URL.revokeObjectURL(prev[index]); return prev.filter((_, i) => i !== index); });
    setDraftRefImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const sendMessage = async () => {
    if (!campaignId || !brandId || (!chatInput.trim() && chatAttachments.length === 0) || !campaign?.html) return;
    const userMsg = chatInput.trim();
    const attachedFiles = [...chatAttachments];
    setChatInput("");
    setChatAttachments([]);
    setChatAttachmentPreviews(prev => { prev.forEach(u => URL.revokeObjectURL(u)); return []; });
    setSending(true);

    const displayContent = attachedFiles.length > 0
      ? `${userMsg}${userMsg ? "\n" : ""}[${attachedFiles.length} image${attachedFiles.length > 1 ? "s" : ""} attached]`
      : userMsg;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), campaign_id: campaignId, role: "user", content: displayContent, created_at: new Date().toISOString() },
    ]);
    try {
      // Upload attached images first
      let attachedImageUrls: string[] = [];
      if (attachedFiles.length > 0) {
        attachedImageUrls = await uploadChatImages(attachedFiles, brandId, campaignId);
      }

      const { data, error } = await supabase.functions.invoke("edit-campaign", {
        body: {
          campaignId,
          message: userMsg,
          currentHtml: campaign.html,
          ...(attachedImageUrls.length > 0 ? { attachedImageUrls } : {}),
          ...(selectedReference ? {
            reference: {
              type: selectedReference.type,
              id: selectedReference.id,
              image_urls: selectedReference.image_urls,
              strength: selectedReference.strength,
            },
          } : {}),
        },
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
          <Button
            size="sm"
            onClick={() => navigate(`/brands/${brandId}/campaigns/${campaignId}/qa`)}
            disabled={!campaign?.html}
            className="active:scale-[0.98] transition-all"
          >
            <ClipboardCheck className="w-3 h-3 mr-1" /> Review & Send
          </Button>
        </div>
      </div>

      {/* Main Content — with reference panel + draggable split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Reference Panel */}
        {brandId && campaignId && (
          <ReferencePanel
            brandId={brandId}
            campaignId={campaignId}
            isOpen={refPanelOpen}
            onToggle={() => setRefPanelOpen((o) => !o)}
            selectedReference={selectedReference}
            onSelectReference={setSelectedReference}
          />
        )}

      <PanelGroup direction="horizontal" className="flex-1">
        {/* Left Panel — Preview */}
        <Panel defaultSize={60} minSize={25} maxSize={85}>
          <div ref={previewPanelRef} className="h-full bg-card overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' as any }}>
            {isGenerating ? (
              <div className="max-w-[600px] mx-auto space-y-4 p-8 mt-12">
                <div className="text-center mb-6">
                  <p className="text-lg font-medium text-foreground tabular-nums">{formatTimer(genElapsed)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Generating campaign...</p>
                </div>
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
                      setupIframeObserver(iframe);
                      window.setTimeout(() => measureIframeHeight(iframe), 300);
                      window.setTimeout(() => measureIframeHeight(iframe), 1000);
                      window.setTimeout(() => measureIframeHeight(iframe), 3000);
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
                {/* Reference indicator */}
                {selectedReference && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs">
                    <span className="text-primary font-medium">Reference:</span>
                    <span className="truncate">{selectedReference.title}</span>
                    <Badge className="text-[9px] ml-auto bg-primary/20 text-primary">Strength {selectedReference.strength}</Badge>
                  </div>
                )}
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
                    onShopifyProductsChange={setSelectedShopifyProducts}
                  />
                )}

                {/* Subject Line & Preview Text */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Subject Line</label>
                  <div className="relative">
                    <Input
                      value={subjectLine}
                      onChange={(e) => setSubjectLine(e.target.value)}
                      placeholder="e.g. Don't miss our biggest sale..."
                      className="bg-card border-border pr-12"
                    />
                    <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] tabular-nums ${subjectLine.length > 60 ? "text-amber-400" : "text-muted-foreground"}`}>
                      {subjectLine.length}/60
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Preview Text</label>
                  <div className="relative">
                    <Input
                      value={previewText}
                      onChange={(e) => setPreviewText(e.target.value)}
                      placeholder="Short preview shown in inbox..."
                      className="bg-card border-border pr-12"
                    />
                    <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] tabular-nums ${previewText.length > 90 ? "text-amber-400" : "text-muted-foreground"}`}>
                      {previewText.length}/90
                    </span>
                  </div>
                </div>

                {/* Segment selector */}
                {brandId && (
                  <SegmentSelector
                    brandId={brandId}
                    selectedListIds={sendListIds}
                    selectedSegmentIds={sendSegmentIds}
                    onSelectionChange={(l, s) => { setSendListIds(l); setSendSegmentIds(s); }}
                  />
                )}

                {/* Reference images for this campaign */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Reference images (optional)</label>
                  <div
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); addDraftRefImages(Array.from(e.dataTransfer.files)); }}
                    onClick={() => draftFileInputRef.current?.click()}
                    className="border border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-[11px] text-muted-foreground">Drop reference images or click to browse</p>
                    <input
                      ref={draftFileInputRef}
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.webp,.gif"
                      onChange={(e) => { if (e.target.files) addDraftRefImages(Array.from(e.target.files)); e.target.value = ""; }}
                      className="hidden"
                    />
                  </div>
                  {draftRefPreviews.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {draftRefPreviews.map((src, i) => (
                        <div key={i} className="relative group w-12 h-12 rounded border border-border overflow-hidden">
                          <img src={src} alt="" className="w-full h-full object-cover" />
                          <button
                            onClick={() => removeDraftRefImage(i)}
                            className="absolute top-0 right-0 bg-background/80 rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Branding & Design Adjustments */}
                <div className="space-y-3">
                  <label className="text-xs text-muted-foreground font-medium">Branding & Design</label>
                  <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5">
                    <span className="text-xs text-foreground">Match to Product Color Theme</span>
                    <Switch checked={matchProductColors} onCheckedChange={setMatchProductColors} />
                  </div>
                  <Textarea
                    value={designNotes}
                    onChange={(e) => setDesignNotes(e.target.value)}
                    placeholder="Any design notes — e.g. 'use dark background', 'keep it minimal'..."
                    className="bg-card border-border min-h-[60px] text-sm"
                    rows={2}
                  />
                </div>

                <div className="space-y-3">
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
                {/* Reference indicator in chat mode */}
                {selectedReference && (
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-primary/5 text-xs">
                    <span className="text-muted-foreground">Generating with reference:</span>
                    <span className="font-medium truncate">{selectedReference.title}</span>
                    <span className="text-muted-foreground">(strength {selectedReference.strength})</span>
                  </div>
                )}
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

                <div
                  ref={chatDropRef}
                  className="p-4 border-t border-border"
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); addChatAttachments(Array.from(e.dataTransfer.files)); }}
                >
                  {chatAttachmentPreviews.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {chatAttachmentPreviews.map((src, i) => (
                        <div key={i} className="relative group w-10 h-10 rounded border border-border overflow-hidden">
                          <img src={src} alt="" className="w-full h-full object-cover" />
                          <button
                            onClick={() => removeChatAttachment(i)}
                            className="absolute top-0 right-0 bg-background/80 rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => chatFileInputRef.current?.click()}
                      className="shrink-0 p-2 text-muted-foreground hover:text-foreground transition-colors"
                      title="Attach images"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <input
                      ref={chatFileInputRef}
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.webp,.gif"
                      onChange={(e) => { if (e.target.files) addChatAttachments(Array.from(e.target.files)); e.target.value = ""; }}
                      className="hidden"
                    />
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
                      disabled={(!chatInput.trim() && chatAttachments.length === 0) || sending}
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
    </div>
  );
}