import { useEffect, useState, useRef } from "react";
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
  // Desktop: render email at native 600px. Mobile: scale 600px email down to 375px like Gmail on iPhone.
  const emailNativeWidth = 600;
  const mobileViewportWidth = 375;
  const mobileScale = mobileViewportWidth / emailNativeWidth; // 0.625

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
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
            <button onClick={() => setEditingName(true)} className="text-sm font-medium hover:text-primary transition-colors">
              {campaign?.name}
            </button>
          )}
          <Badge className={`text-[10px] ${campaign?.status === "ready" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
            {campaign?.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="sm" onClick={exportHtml} disabled={!campaign?.html} className="active:scale-[0.98] transition-all">
            <Download className="w-3 h-3 mr-1" /> Export HTML
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel — Preview */}
        <div className="w-[60%] bg-[#1a1a1a] overflow-y-auto flex justify-center p-8 scrollbar-hide">
          {isGenerating ? (
            <div className="w-[600px] space-y-4 mt-12">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-10 w-1/3" />
            </div>
          ) : campaign?.html ? (
            <div
              className="bg-white rounded-[2rem] shadow-2xl overflow-hidden"
              style={{ width: previewMode === "desktop" ? 632 : 407 }}
            >
              {/* iPhone-style status bar */}
              <div className="bg-[#f2f2f7] px-5 py-1.5 flex items-center justify-between">
                <span className="text-[#1c1c1e] text-[11px] font-semibold">9:41</span>
                <div className="flex items-center gap-1">
                  <svg width="16" height="10" viewBox="0 0 16 10" fill="none"><rect x="0" y="3" width="3" height="7" rx="0.5" fill="#1c1c1e"/><rect x="4" y="2" width="3" height="8" rx="0.5" fill="#1c1c1e"/><rect x="8" y="1" width="3" height="9" rx="0.5" fill="#1c1c1e"/><rect x="12" y="0" width="3" height="10" rx="0.5" fill="#1c1c1e"/></svg>
                  <svg width="15" height="10" viewBox="0 0 15 10" fill="none"><path d="M7.5 2C9.5 2 11.3 2.8 12.6 4.1L14 2.7C12.3 1 10 0 7.5 0S2.7 1 1 2.7L2.4 4.1C3.7 2.8 5.5 2 7.5 2Z" fill="#1c1c1e"/><path d="M7.5 5C8.9 5 10.1 5.5 11 6.4L12.4 5C11.1 3.7 9.4 3 7.5 3S3.9 3.7 2.6 5L4 6.4C4.9 5.5 6.1 5 7.5 5Z" fill="#1c1c1e"/><circle cx="7.5" cy="8.5" r="1.5" fill="#1c1c1e"/></svg>
                  <svg width="24" height="10" viewBox="0 0 24 10" fill="none"><rect x="0" y="0" width="21" height="10" rx="2" stroke="#1c1c1e" strokeWidth="1"/><rect x="1.5" y="1.5" width="15" height="7" rx="1" fill="#1c1c1e"/><rect x="22" y="3" width="2" height="4" rx="0.5" fill="#1c1c1e"/></svg>
                </div>
              </div>
              {/* Gmail-style nav bar */}
              <div className="bg-[#f2f2f7] px-4 pb-2 flex items-center gap-2 border-b border-[#c6c6c8]">
                <span className="text-[#007aff] text-[13px] font-normal">‹ Inbox</span>
                <div className="flex-1" />
                <span className="text-[#007aff] text-[13px]">⬆</span>
                <span className="text-[#007aff] text-[13px]">🗑</span>
              </div>
              {/* Email header */}
              <div className="bg-white px-4 py-3 border-b border-[#e5e5ea]">
                <p className="text-[#1c1c1e] text-[15px] font-semibold truncate">{campaign?.name || "Campaign Preview"}</p>
                <div className="flex items-center gap-1 mt-1">
                  <div className="w-6 h-6 rounded-full bg-[#34c759] flex items-center justify-center text-white text-[10px] font-bold shrink-0">B</div>
                  <div className="min-w-0">
                    <p className="text-[#1c1c1e] text-[13px] font-medium truncate">Brand <span className="text-[#8e8e93] font-normal">&lt;noreply@brand.com&gt;</span></p>
                    <p className="text-[#8e8e93] text-[11px]">to me</p>
                  </div>
                </div>
              </div>
              <iframe
                srcDoc={campaign.html}
                sandbox="allow-same-origin"
                className="w-full border-0 block"
                style={{ width: iframeWidth, minHeight: 800, margin: "0 auto" }}
                title="Email Preview"
                onLoad={(e) => {
                  const iframe = e.target as HTMLIFrameElement;
                  try {
                    const doc = iframe.contentDocument;
                    if (doc?.body) {
                      iframe.style.height = doc.body.scrollHeight + "px";
                    }
                  } catch {}
                }}
              />
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
