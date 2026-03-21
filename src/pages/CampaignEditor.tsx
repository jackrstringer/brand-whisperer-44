import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Monitor, Smartphone, Download, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import type { Campaign, ChatMessage } from "@/lib/types";

export default function CampaignEditor() {
  const { brandId, campaignId } = useParams<{ brandId: string; campaignId: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  // Brief form state
  const [brief, setBrief] = useState("");
  const [goal, setGoal] = useState("promotional");
  const [extraCopy, setExtraCopy] = useState("");
  const [generating, setGenerating] = useState(false);

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const previewPanelRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [containerWidth, setContainerWidth] = useState(0);
  const [iframeContentHeight, setIframeContentHeight] = useState(800);
  const [mobileWindowWidth, setMobileWindowWidth] = useState(375);
  const [desktopWindowWidth, setDesktopWindowWidth] = useState(600);
  const [mobileZoom, setMobileZoom] = useState(1);
  const [desktopZoom, setDesktopZoom] = useState(1);

  useEffect(() => {
    if (!campaignId) return;
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
      setMessages((msgs || []) as ChatMessage[]);
      setLoading(false);
    };
    load();
  }, [campaignId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Measure preview panel width via ResizeObserver
  useEffect(() => {
    const el = previewPanelRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const measureIframeHeight = useCallback((iframe: HTMLIFrameElement | null) => {
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const bodyHeight = doc.body?.scrollHeight ?? 0;
      const docHeight = doc.documentElement?.scrollHeight ?? 0;
      setIframeContentHeight(Math.max(bodyHeight, docHeight, 800));
    } catch {
      // ignore cross-document access errors
    }
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const t = window.setTimeout(() => measureIframeHeight(iframe), 0);
    return () => window.clearTimeout(t);
  }, [previewMode, campaign?.html, measureIframeHeight]);

  const saveName = async () => {
    if (!campaignId || !nameValue.trim()) return;
    setEditingName(false);
    await supabase.from("campaigns").update({ name: nameValue.trim() }).eq("id", campaignId);
    setCampaign((c) => c ? { ...c, name: nameValue.trim() } : c);
  };

  const generateCampaign = async () => {
    if (!brandId || !campaignId || !brief.trim()) return;
    setGenerating(true);
    setCampaign((c) => c ? { ...c, status: "generating" } : c);

    try {
      const { data, error } = await supabase.functions.invoke("generate-campaign", {
        body: { brandId, campaignId, brief, goal, copy: extraCopy || undefined },
      });

      if (error) throw new Error(error.message || "Generation failed");
      if (data?.error) throw new Error(data.error);

      setCampaign((c) => c ? { ...c, html: data.html, status: "ready", brief, goal } : c);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), campaign_id: campaignId, role: "system", content: "Campaign generated", created_at: new Date().toISOString() },
      ]);
    } catch (err: any) {
      toast.error(err.message);
      setCampaign((c) => c ? { ...c, status: "draft" } : c);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), campaign_id: campaignId, role: "system", content: `Generation failed: ${err.message}`, created_at: new Date().toISOString() },
      ]);
    } finally {
      setGenerating(false);
    }
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

  const mobileIframeWidth = 375;
  const desktopIframeWidth = 600;
  const panelHorizontalPadding = 64; // p-8 both sides
  const availablePreviewWidth = Math.max(containerWidth - panelHorizontalPadding, 280);

  const baseViewportWidth = previewMode === "mobile" ? mobileIframeWidth : desktopIframeWidth;
  const minWindowWidth = previewMode === "mobile" ? 260 : 360;
  const maxWindowWidth = Math.max(minWindowWidth, Math.floor(availablePreviewWidth));
  const requestedWindowWidth = previewMode === "mobile" ? mobileWindowWidth : desktopWindowWidth;
  const previewWindowWidth = Math.min(requestedWindowWidth, maxWindowWidth);

  const zoomValue = previewMode === "mobile" ? mobileZoom : desktopZoom;
  const scaleFactor = (previewWindowWidth / baseViewportWidth) * zoomValue;
  const scaledPreviewHeight = Math.max(1, Math.round(iframeContentHeight * scaleFactor));
  const renderedWidth = Math.round(baseViewportWidth * scaleFactor);

  const handleWindowWidthChange = (next: number) => {
    const clamped = Math.max(minWindowWidth, Math.min(maxWindowWidth, next));
    if (previewMode === "mobile") {
      setMobileWindowWidth(clamped);
    } else {
      setDesktopWindowWidth(clamped);
    }
  };

  const handleZoomChange = (nextPercent: number) => {
    const clampedPercent = Math.max(50, Math.min(200, nextPercent));
    const nextZoom = clampedPercent / 100;
    if (previewMode === "mobile") {
      setMobileZoom(nextZoom);
    } else {
      setDesktopZoom(nextZoom);
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 gap-3">
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

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPreviewMode("desktop")}
            className={previewMode === "desktop" ? "text-foreground" : "text-muted-foreground"}
          >
            <Monitor className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPreviewMode("mobile")}
            className={previewMode === "mobile" ? "text-foreground" : "text-muted-foreground"}
          >
            <Smartphone className="w-4 h-4" />
          </Button>

          <div className="flex items-center gap-2 px-2 py-1 rounded border border-border bg-card">
            <span className="text-[11px] text-muted-foreground">Window</span>
            <input
              type="range"
              min={minWindowWidth}
              max={maxWindowWidth}
              value={previewWindowWidth}
              onChange={(e) => handleWindowWidthChange(Number(e.target.value))}
              className="w-28 accent-primary"
            />
            <span className="text-[11px] tabular-nums text-foreground">{Math.round(previewWindowWidth)}px</span>
          </div>

          <div className="flex items-center gap-2 px-2 py-1 rounded border border-border bg-card">
            <span className="text-[11px] text-muted-foreground">Zoom</span>
            <input
              type="range"
              min={50}
              max={200}
              value={Math.round(zoomValue * 100)}
              onChange={(e) => handleZoomChange(Number(e.target.value))}
              className="w-24 accent-primary"
            />
            <span className="text-[11px] tabular-nums text-foreground">{Math.round(zoomValue * 100)}%</span>
          </div>

          <div className="text-[11px] text-muted-foreground tabular-nums px-2">
            Viewport {baseViewportWidth}px · Scale {Math.round(scaleFactor * 100)}% · Render {renderedWidth}px
          </div>

          <Button variant="outline" size="sm" onClick={exportHtml} disabled={!campaign?.html} className="active:scale-[0.98] transition-all">
            <Download className="w-3 h-3 mr-1" /> Export HTML
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel — Preview */}
        <div ref={previewPanelRef} className="w-[60%] bg-card overflow-y-auto p-8 scrollbar-hide">
          {isGenerating ? (
            <div className="w-[600px] mx-auto space-y-4 mt-12">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-10 w-1/3" />
            </div>
          ) : campaign?.html ? (
            <div className="flex justify-center">
              <div
                className="bg-white shadow-2xl overflow-hidden"
                style={{
                  width: previewWindowWidth,
                  height: scaledPreviewHeight,
                  borderRadius: previewMode === "mobile" ? 0 : 4,
                }}
              >
                <div
                  style={{
                    width: baseViewportWidth,
                    transform: `scale(${scaleFactor})`,
                    transformOrigin: "top left",
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    key={`${previewMode}-${baseViewportWidth}`}
                    srcDoc={campaign.html}
                    sandbox="allow-same-origin"
                    className="border-0 block bg-white"
                    style={{ width: baseViewportWidth, height: iframeContentHeight }}
                    title="Email Preview"
                    onLoad={(e) => {
                      const iframe = e.currentTarget;
                      measureIframeHeight(iframe);
                      window.setTimeout(() => measureIframeHeight(iframe), 120);
                      window.setTimeout(() => measureIframeHeight(iframe), 500);
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Generate a campaign to see the preview
            </div>
          )}
        </div>

        {/* Right Panel */}
        <div className="w-[40%] border-l border-border flex flex-col">
          {isDraft && !isGenerating ? (
            /* Brief Form */
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
              <Button
                onClick={generateCampaign}
                disabled={!brief.trim() || generating}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all"
              >
                {generating ? "Generating..." : "Generate Campaign"}
              </Button>
            </div>
          ) : (
            /* Chat Interface */
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
      </div>
    </div>
  );
}
