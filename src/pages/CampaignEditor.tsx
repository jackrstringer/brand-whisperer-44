import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ProductSelector, { type SelectedShopifyProduct } from "@/components/brand/ProductSelector";
import SegmentSelector from "@/components/brand/SegmentSelector";
import ReferencePanel, { type SelectedReference } from "@/components/campaign/ReferencePanel";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, Send, Undo2, Zap, Paperclip, X, Image as ImageIcon, ClipboardCheck, Star, Eye, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";


import type { Campaign, ChatMessage, VariantOption } from "@/lib/types";
import VariantCards from "@/components/brand/VariantCards";
import { captureEmailScreenshots } from "@/lib/visualQaCapture";

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
  const { user } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [selectedReference, setSelectedReference] = useState<SelectedReference | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop"); // kept for key
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");

  const [brief, setBrief] = useState("");
  const [goal, setGoal] = useState("promotional");
  const [extraCopy, setExtraCopy] = useState("");
  const [generating, setGenerating] = useState(false);
  const [visualQaRunning, setVisualQaRunning] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const streamingTextRef = useRef("");
  const [agentState, setAgentState] = useState<"idle" | "thinking" | "editing">("idle");
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
  const [activeVersionIndex, setActiveVersionIndex] = useState<number | null>(null); // null = latest
  const [matchProductColors, setMatchProductColors] = useState(false);
  const [selectedShopifyProducts, setSelectedShopifyProducts] = useState<SelectedShopifyProduct[]>([]);
  const [designNotes, setDesignNotes] = useState("");
  const [subjectLine, setSubjectLine] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [starredCampaign, setStarredCampaign] = useState(false);
  const [showReferenceDialog, setShowReferenceDialog] = useState(false);
  const refScrollRef = useRef<HTMLDivElement>(null);
  const [syncingScroll, setSyncingScroll] = useState(false);

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

      // Restore variant messages from tool_calls JSONB
      const restoredMessages: ChatMessage[] = (msgs || []).map((m: any) => {
        const msg: ChatMessage = {
          id: m.id,
          campaign_id: m.campaign_id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        };
        if (m.tool_calls?.type === "variants" && m.tool_calls?.data) {
          msg.message_type = "variants";
          msg.variant_data = m.tool_calls.data;
        }
        return msg;
      });

      const { data: brandProfile } = await supabase
        .from("brand_profiles")
        .select("reference_image_urls")
        .eq("brand_id", brandId)
        .single();

      const fallbackUrls = Array.isArray(brandProfile?.reference_image_urls)
        ? brandProfile.reference_image_urls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0)
        : [];

      setPreviewFallbackUrls(fallbackUrls);
      setMessages(restoredMessages);
      setLoading(false);
    };
    load();
  }, [brandId, campaignId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);



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

  const runVisualQa = useCallback(async (campaignData: Campaign) => {
    if (!campaignData.html || !campaignId) return;
    setVisualQaRunning(true);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), campaign_id: campaignId, role: "system", content: "Running visual QA check...", created_at: new Date().toISOString() },
    ]);

    try {
      const { slices } = await captureEmailScreenshots(campaignData.html);
      console.log(`[visual-qa] Captured ${slices.length} slices`);

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/visual-qa`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          campaignId,
          html: campaignData.html,
          slices,
        }),
      });

      if (!resp.ok) throw new Error(`Visual QA failed: ${resp.status}`);

      const result = await resp.json();
      const issueCount = result.issues?.length || 0;
      const fixCount = result.fixes_applied || 0;

      if (result.html && fixCount > 0) {
        // Refresh campaign with fixed HTML
        const { data: updated } = await supabase.from("campaigns").select("*").eq("id", campaignId).single();
        if (updated) setCampaign(updated as Campaign);

        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), campaign_id: campaignId, role: "system", content: `Visual QA: score ${result.overall_score}/10 — ${fixCount} fix${fixCount !== 1 ? "es" : ""} auto-applied. ${result.summary || ""}`, created_at: new Date().toISOString() },
        ]);
        toast.success(`Visual QA applied ${fixCount} fix${fixCount !== 1 ? "es" : ""}`);
      } else if (issueCount > 0) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), campaign_id: campaignId, role: "system", content: `Visual QA: score ${result.overall_score}/10 — ${issueCount} issue${issueCount !== 1 ? "s" : ""} found (no auto-fix available). ${result.summary || ""}`, created_at: new Date().toISOString() },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), campaign_id: campaignId, role: "system", content: `Visual QA passed ✓ Score: ${result.overall_score}/10. ${result.summary || ""}`, created_at: new Date().toISOString() },
        ]);
      }
    } catch (err) {
      console.error("[visual-qa] Error:", err);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), campaign_id: campaignId, role: "system", content: "Visual QA check failed — campaign is still usable.", created_at: new Date().toISOString() },
      ]);
    } finally {
      setVisualQaRunning(false);
    }
  }, [campaignId]);

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
          mode: selectedReference.mode,
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

        // === PASS 3: Visual QA — capture screenshots and send to AI ===
        if (data.html) {
          runVisualQa(data as Campaign);
        }
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
    setAgentState("thinking");
    setStreamingText("");
    streamingTextRef.current = "";
    setActiveVersionIndex(null); // snap back to latest when sending new edit

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

      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/edit-campaign`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
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
                mode: selectedReference.mode,
              },
            } : {}),
          }),
        }
      );

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(errBody || `Edit failed: ${response.status}`);
      }

      // Check if response is SSE stream or JSON fallback
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let serverReply: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse complete SSE events (separated by double newline)
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() || "";

          for (const block of blocks) {
            if (!block.trim()) continue;
            const eventLine = block.split("\n").find(l => l.startsWith("event:"));
            const dataLine = block.split("\n").find(l => l.startsWith("data:"));
            if (!eventLine || !dataLine) continue;

            const eventType = eventLine.replace("event:", "").trim();
            let data: any;
            try {
              data = JSON.parse(dataLine.replace("data:", "").trim());
            } catch { continue; }

            if (eventType === "text_delta") {
              setAgentState("thinking");
              const newText = streamingTextRef.current + data.content;
              streamingTextRef.current = newText;
              setStreamingText(newText);
            }

            if (eventType === "html_patch") {
              setAgentState("editing");
              setCampaign(c => c ? { ...c, html: data.html } : c);
              setCanUndo(true);
            }

            if (eventType === "no_change") {
              const noChangeText = data?.message ? `No change applied. ${data.message}` : "No change applied.";
              serverReply = noChangeText;
              streamingTextRef.current = noChangeText;
              setStreamingText(noChangeText);
            }

            if (eventType === "variants") {
              setAgentState("idle");
              const variantMsg: ChatMessage = {
                id: crypto.randomUUID(),
                campaign_id: campaignId,
                role: "assistant",
                content: data.message || "Here are some options:",
                created_at: new Date().toISOString(),
                message_type: "variants",
                variant_data: { message: data.message, variants: data.variants, applied_index: null },
              };
              setMessages(prev => [...prev, variantMsg]);
              setStreamingText("");
              streamingTextRef.current = "";
              // Skip the normal done handler for variants
              serverReply = data.message;
            }

            if (eventType === "done") {
              setAgentState("idle");
              // Skip adding another message if variants already handled it
              if (data?.isVariants) {
                setStreamingText("");
                streamingTextRef.current = "";
              } else {
                const finalText =
                  (typeof data?.reply === "string" && data.reply.trim()) ||
                  serverReply ||
                  streamingTextRef.current ||
                  "Changes applied.";
                setMessages(prev => [
                  ...prev,
                  { id: crypto.randomUUID(), campaign_id: campaignId, role: "assistant", content: finalText, created_at: new Date().toISOString() },
                ]);
                setStreamingText("");
                streamingTextRef.current = "";
              }
            }

            if (eventType === "error") {
              setAgentState("idle");
              setMessages(prev => [
                ...prev,
                { id: crypto.randomUUID(), campaign_id: campaignId, role: "system", content: `Error: ${data.message}`, created_at: new Date().toISOString() },
              ]);
            }
          }
        }
      } else {
        // JSON fallback (shouldn't happen but handle gracefully)
        const data = await response.json();
        if (data?.error) throw new Error(data.error);
        setCampaign(c => c ? { ...c, html: data.html } : c);
        setCanUndo(true);
        setMessages(prev => [
          ...prev,
          { id: crypto.randomUUID(), campaign_id: campaignId, role: "assistant", content: "Changes applied.", created_at: new Date().toISOString() },
        ]);
      }
    } catch (err: any) {
      setAgentState("idle");
      setMessages(prev => [
        ...prev,
        { id: crypto.randomUUID(), campaign_id: campaignId, role: "system", content: `Change failed: ${err.message}`, created_at: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
      setAgentState("idle");
    }
  };
  const handleApplyVariant = async (variant: VariantOption, index: number, messageId: string) => {
    if (!campaign?.html || !campaignId) return;
    const html = campaign.html;
    if (!html.includes(variant.find)) {
      toast.error("Could not find the text to replace — it may have already changed.");
      return;
    }
    const newHtml = html.replace(variant.find, variant.replace);
    // Save to history
    const history = Array.isArray(campaign.html_history) ? [...campaign.html_history] : [];
    history.push(html);
    await supabase.from("campaigns").update({ html: newHtml, html_history: history }).eq("id", campaignId);
    setCampaign(c => c ? { ...c, html: newHtml, html_history: history } : c);
    setCanUndo(true);

    // Update the message's applied_index
    setMessages(prev => prev.map(m => {
      if (m.id === messageId && m.variant_data) {
        return { ...m, variant_data: { ...m.variant_data, applied_index: index } };
      }
      return m;
    }));

    // Persist applied_index to DB
    await supabase.from("chat_messages").update({
      tool_calls: { type: "variants", data: { message: messages.find(m => m.id === messageId)?.variant_data?.message || "", variants: messages.find(m => m.id === messageId)?.variant_data?.variants || [], applied_index: index } },
    } as any).eq("id", messageId);

    toast.success(`Applied: ${variant.label}`);
  };


  const allVersions: string[] = (() => {
    const history = Array.isArray(campaign?.html_history) ? campaign.html_history as string[] : [];
    const current = campaign?.html || "";
    return [...history, current];
  })();
  // The active version index (null = latest = allVersions.length - 1)
  const resolvedActiveIndex = activeVersionIndex ?? allVersions.length - 1;

  const handleUndo = async () => {
    if (!campaign || !campaignId) return;
    const history = campaign.html_history;
    if (!Array.isArray(history) || history.length === 0) return;
    const previousHtml = history[history.length - 1];
    const newHistory = history.slice(0, -1);
    await supabase.from("campaigns").update({ html: previousHtml, html_history: newHistory }).eq("id", campaignId);
    setCampaign((c) => c ? { ...c, html: previousHtml as string, html_history: newHistory } : c);
    setCanUndo(newHistory.length > 0);
    setActiveVersionIndex(null);
    toast.success("Undo successful");
  };

  const handleSwitchToVersion = (versionIndex: number) => {
    if (versionIndex === resolvedActiveIndex) return;
    if (versionIndex < 0 || versionIndex >= allVersions.length) return;
    setActiveVersionIndex(versionIndex === allVersions.length - 1 ? null : versionIndex);
    toast.success(versionIndex === allVersions.length - 1 ? "Switched to latest version" : `Switched to version ${versionIndex + 1}`);
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

  // When viewing a past version, show that version; otherwise show current
  const displayHtml = activeVersionIndex !== null ? allVersions[activeVersionIndex] : campaign?.html;
  const htmlForPreview = displayHtml
    ? replaceLikelyBrokenImageUrls(displayHtml, previewFallbackUrls)
    : "";

  const srcdocHtml = htmlForPreview
    ? htmlForPreview.replace(
        /(<head[^>]*>)/i,
        '$1<meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0;scrollbar-width:none;-ms-overflow-style:none;}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none;}table{max-width:100%!important;width:100%!important;box-sizing:border-box!important;}img{max-width:100%;height:auto!important;}td{box-sizing:border-box!important;}</style>'
      )
    : "";

  return (
    <>
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
          {/* Star button — only post-generation */}
          {campaign?.html && user && (
            <button
              onClick={async () => {
                if (!campaignId) return;
                if (starredCampaign) {
                  setStarredCampaign(false);
                  toast("Removed from favorites");
                  await supabase.from("saved_references").delete().eq("user_id", user.id).eq("reference_type", "campaign").eq("reference_id", campaignId);
                } else {
                  setStarredCampaign(true);
                  toast("Saved to favorites");
                  await supabase.from("saved_references").insert({ user_id: user.id, reference_type: "campaign", reference_id: campaignId });
                }
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title={starredCampaign ? "Remove from favorites" : "Save to favorites"}
            >
              <Star className={`w-4 h-4 ${starredCampaign ? "fill-amber-400 text-amber-400" : ""}`} />
            </button>
          )}
          {/* View Reference button — only post-generation when a reference was used */}
          {campaign?.html && selectedReference && (
            <button
              onClick={() => setShowReferenceDialog(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="View reference campaign"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
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

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel — Preview or Inspiration — fixed 65% */}
        <div className="h-full overflow-hidden flex" style={{ width: '65%', minWidth: 0 }}>
          {/* Reference side-by-side (when toggled on post-generation) */}
          {showReferenceDialog && campaign?.html && selectedReference && (
            <>
              <div
                ref={refScrollRef}
                className="h-full overflow-y-auto bg-muted/30 border-r border-border"
                style={{ width: '50%', scrollbarWidth: 'none', msOverflowStyle: 'none' as any }}
                onScroll={(e) => {
                  if (syncingScroll) return;
                  setSyncingScroll(true);
                  const el = e.currentTarget;
                  const panel = previewPanelRef.current;
                  if (panel) {
                    const ratio = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
                    panel.scrollTop = ratio * (panel.scrollHeight - panel.clientHeight);
                  }
                  requestAnimationFrame(() => setSyncingScroll(false));
                }}
              >
                <div className="flex justify-end p-1 pr-0.5 pt-4">
                  <div style={{ width: renderedWidth }}>
                    
                    {selectedReference.image_urls?.length ? (
                      selectedReference.image_urls.map((url, i) => (
                        <img key={i} src={url} alt="" className="w-full h-auto block" loading="lazy" />
                      ))
                    ) : selectedReference.thumbnail_url ? (
                      <img src={selectedReference.thumbnail_url} alt="" className="w-full h-auto block" />
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-12">No reference preview</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Campaign preview / Inspiration panel */}
          <div
            ref={previewPanelRef}
            className="h-full min-w-0 bg-card overflow-y-auto scrollbar-hide"
            style={{
              width: showReferenceDialog && campaign?.html && selectedReference ? '50%' : '100%',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none' as any,
            }}
            onScroll={(e) => {
              if (!showReferenceDialog || syncingScroll) return;
              setSyncingScroll(true);
              const el = e.currentTarget;
              const refEl = refScrollRef.current;
              if (refEl) {
                const ratio = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
                refEl.scrollTop = ratio * (refEl.scrollHeight - refEl.clientHeight);
              }
              requestAnimationFrame(() => setSyncingScroll(false));
            }}
          >
            {isGenerating ? (
              <div className="max-w-[600px] mx-auto space-y-4 p-8 mt-12">
                <div className="text-center mb-6">
                  <p className="text-lg font-medium text-foreground tabular-nums">{formatTimer(genElapsed)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{visualQaRunning ? "Running visual QA..." : "Generating campaign..."}</p>
                </div>
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-10 w-1/3" />
              </div>
            ) : campaign?.html ? (
              <div className={`flex ${showReferenceDialog && selectedReference ? 'justify-start p-1 pl-0.5 pt-4' : 'justify-center p-8'}`}>
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
            ) : brandId && campaignId ? (
              <ReferencePanel
                brandId={brandId}
                campaignId={campaignId}
                selectedReference={selectedReference}
                onSelectReference={setSelectedReference}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Generate a campaign to see the preview
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-border shrink-0" />

        {/* Right Panel — fixed 35% */}
        <div className="h-full overflow-hidden" style={{ width: '35%', minWidth: 0 }}>
          <div className="h-full flex flex-col overflow-hidden">
            {isDraft && !isGenerating ? (
              <div className="p-6 space-y-5 overflow-y-auto flex-1">
                {/* Reference indicator */}
                {selectedReference && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs">
                    <span className="text-primary font-medium">Reference:</span>
                    <span className="truncate">{selectedReference.title}</span>
                    <Badge className="text-[9px] ml-auto bg-primary/20 text-primary">{selectedReference.mode === "dupe" ? "Dupe" : "Reference"}</Badge>
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
                    <span className="text-muted-foreground">({selectedReference.mode === "dupe" ? "Dupe" : "Reference"})</span>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                  {(() => {
                    let editCount = 0;
                    const totalVersions = allVersions.length;
                    return messages.map((msg) => {
                      if (msg.role === "system") {
                        return (
                          <div key={msg.id} className="text-center">
                            <span className={`text-xs px-2 py-1 rounded ${msg.content.includes("failed") || msg.content.includes("error") ? "text-red-400" : "text-muted-foreground"}`}>
                              {msg.content}
                            </span>
                          </div>
                        );
                      }
                      if (msg.role === "assistant") {
                        const thisEditIndex = editCount;
                        editCount++;
                        // Version index: editIndex + 1 maps to allVersions index (history[0]=v0, history[1]=v1 after edit 0, etc.)
                        const versionIndex = thisEditIndex + 1;
                        const isActive = versionIndex === resolvedActiveIndex;
                        const canSwitch = totalVersions > 1 && versionIndex < totalVersions && !isActive;
                        return (
                          <div key={msg.id} className="flex justify-start group/msg">
                            <div className="max-w-[80%]">
                              <div className={`rounded-lg px-3 py-2 text-sm bg-card text-foreground ${isActive && activeVersionIndex !== null ? "ring-1 ring-primary/40" : ""}`}>
                                {msg.content}
                              </div>
                              {canSwitch && (
                                <button
                                  onClick={() => handleSwitchToVersion(versionIndex)}
                                  className="flex items-center gap-1 mt-1 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground opacity-0 group-hover/msg:opacity-100 transition-opacity"
                                >
                                  <RotateCcw className="w-2.5 h-2.5" />
                                  Switch to this version
                                </button>
                              )}
                              {isActive && activeVersionIndex !== null && (
                                <span className="text-[10px] text-primary/70 px-2 mt-0.5 block">Viewing this version</span>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={msg.id} className="flex justify-end">
                          <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-background text-foreground">
                            {msg.content}
                          </div>
                        </div>
                      );
                    });
                  })()}
                  {/* Streaming assistant message */}
                  {streamingText && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-card text-foreground">
                        {streamingText}
                        <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse" />
                      </div>
                    </div>
                  )}
                  {/* Agent state indicator */}
                  {agentState !== "idle" && !streamingText && (
                    <div className="flex justify-start">
                      <div className="rounded-lg px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
                        {agentState === "thinking" && (
                          <><span className="animate-pulse">•••</span></>
                        )}
                        {agentState === "editing" && (
                          <><span className="inline-block w-3 h-3">✏️</span> Editing...</>
                        )}
                      </div>
                    </div>
                  )}
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
        </div>
      </div>
    </div>

  </>
  );
}