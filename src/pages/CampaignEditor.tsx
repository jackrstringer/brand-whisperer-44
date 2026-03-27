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
import { ArrowLeft, Download, Send, Undo2, Redo2, Zap, Paperclip, X, Image as ImageIcon, ClipboardCheck, Star, Eye, RotateCcw, Link2, Loader2 } from "lucide-react";
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
  const [previewHtml, setPreviewHtml] = useState<string | null>(null); // temporary hover preview
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
  const [loadingMoreVariants, setLoadingMoreVariants] = useState<string | null>(null); // messageId being loaded
  const streamingVariantMsgIdRef = useRef<string | null>(null);
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
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const ideatePayloadRef = useRef<{ realPrompt: string; displayText: string } | null>(null);
  const [ideateMessageId, setIdeateMessageId] = useState<string | null>(null); // tracks which variant msg is currently generating
  const [ideateActive, setIdeateActive] = useState(false); // true while an ideate request is in flight (before variants arrive)
  const [activeVersionIndex, setActiveVersionIndex] = useState<number | null>(null); // null = latest
  const [matchProductColors, setMatchProductColors] = useState(false);
  const [selectedShopifyProducts, setSelectedShopifyProducts] = useState<SelectedShopifyProduct[]>([]);
  const [selectedElementContext, setSelectedElementContext] = useState<{ tagName: string; text: string; outerHTML: string; isRegion?: boolean; elements?: { tagName: string; text: string }[] } | null>(null);
  const [designNotes, setDesignNotes] = useState("");
  const [clickupUrl, setClickupUrl] = useState("");
  const [clickupLoading, setClickupLoading] = useState(false);
  const [subjectLine, setSubjectLine] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [starredCampaign, setStarredCampaign] = useState(false);
  const [showReferenceDialog, setShowReferenceDialog] = useState(false);
  const refScrollRef = useRef<HTMLDivElement>(null);
  const [syncingScroll, setSyncingScroll] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeReadyRef = useRef(false);
  const pendingHtmlRef = useRef<string | null>(null);
  const prevHtmlForPreviewRef = useRef<string>("");

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
    // Check for ideate override first
    const ideateOverride = ideatePayloadRef.current;
    ideatePayloadRef.current = null;

    if (!campaignId || !brandId || !(iframeOwnedHtmlRef.current || campaign?.html)) return;
    if (!ideateOverride && !chatInput.trim() && chatAttachments.length === 0) return;

    const userMsg = ideateOverride ? ideateOverride.realPrompt : (() => {
      const raw = chatInput.trim();
      if (selectedElementContext && raw) {
        const truncatedText = selectedElementContext.text.length > 200 ? selectedElementContext.text.slice(0, 200) + '…' : selectedElementContext.text;
        if (selectedElementContext.isRegion && selectedElementContext.elements) {
          const elDesc = selectedElementContext.elements.map(e => `<${e.tagName}>`).join(', ');
          return `[Targeting region with elements: ${elDesc}]\n\n${raw}`;
        }
        return `[Targeting <${selectedElementContext.tagName}> element: "${truncatedText}"]\nElement HTML: ${selectedElementContext.outerHTML.slice(0, 500)}\n\n${raw}`;
      }
      return raw;
    })();
    const displayContent = ideateOverride
      ? ideateOverride.displayText
      : chatAttachments.length > 0
        ? `${chatInput.trim()}${chatInput.trim() ? "\n" : ""}[${chatAttachments.length} image${chatAttachments.length > 1 ? "s" : ""} attached]`
        : chatInput.trim();

    const attachedFiles = ideateOverride ? [] : [...chatAttachments];
    if (!ideateOverride) {
      setChatInput("");
      setChatAttachments([]);
      setChatAttachmentPreviews(prev => { prev.forEach(u => URL.revokeObjectURL(u)); return []; });
      setSelectedElementContext(null);
    }
    setSending(true);
    setAgentState("thinking");
    setStreamingText("");
    streamingTextRef.current = "";
    setActiveVersionIndex(null);
    if (!ideateOverride) { setIdeateMessageId(null); setIdeateActive(false); }

    // Don't show a user message bubble for ideate requests
    if (!ideateOverride) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), campaign_id: campaignId, role: "user", content: displayContent, created_at: new Date().toISOString() },
      ]);
    }

    try {
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
            currentHtml: iframeOwnedHtmlRef.current || campaign.html,
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

        let receivedDone = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Process any remaining buffer before exiting
            if (buffer.trim()) {
              buffer += "\n\n"; // ensure trailing delimiter for parser
            } else {
              break;
            }
          } else {
            buffer += decoder.decode(value, { stream: true });
          }

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
              iframeOwnedHtmlRef.current = null; // clear iframe ownership on chat edit
              setCampaign(c => c ? { ...c, html: data.html } : c);
              setCanUndo(true);
              setRedoStack([]);
            }

            if (eventType === "no_change") {
              const noChangeText = data?.message ? `No change applied. ${data.message}` : "No change applied.";
              serverReply = noChangeText;
              streamingTextRef.current = noChangeText;
              setStreamingText(noChangeText);
            }

            if (eventType === "variants_start") {
              // New streaming variant mode — create the message shell
              setStreamingText("");
              streamingTextRef.current = "";
              setAgentState("idle");
              setIdeateActive(false);
              serverReply = "__VARIANTS_HANDLED__";
              const msgId = crypto.randomUUID();
              streamingVariantMsgIdRef.current = msgId;
              setIdeateMessageId(msgId); // this specific message gets the pill
              const variantMsg: ChatMessage = {
                id: msgId,
                campaign_id: campaignId,
                role: "assistant",
                content: data.message || "Here are some options:",
                created_at: new Date().toISOString(),
                message_type: "variants",
                variant_data: { message: data.message || "Here are some options:", variants: [], applied_index: null },
              };
              setMessages(prev => [...prev, variantMsg]);
            }

            if (eventType === "variant_item") {
              // Append a single variant to the streaming message
              const msgId = streamingVariantMsgIdRef.current;
              if (msgId && data.variant) {
                setMessages(prev => prev.map(m => {
                  if (m.id === msgId && m.variant_data) {
                    return { ...m, variant_data: { ...m.variant_data, variants: [...m.variant_data.variants, data.variant] } };
                  }
                  return m;
                }));
              }
            }

            if (eventType === "variants_done") {
              // Finalize the variant message with all variants
              const msgId = streamingVariantMsgIdRef.current;
              if (msgId && data.variants) {
                setMessages(prev => prev.map(m => {
                  if (m.id === msgId && m.variant_data) {
                    return { ...m, variant_data: { ...m.variant_data, message: data.message, variants: data.variants } };
                  }
                  return m;
                }));
              }
              streamingVariantMsgIdRef.current = null;
              serverReply = "__VARIANTS_HANDLED__";
            }

            if (eventType === "variants") {
              // Legacy non-streaming variant event
              setStreamingText("");
              streamingTextRef.current = "";
              serverReply = "__VARIANTS_HANDLED__";
              setAgentState("idle");
              setIdeateActive(false);
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
            }

            if (eventType === "done") {
              receivedDone = true;
              setAgentState("idle");
              // Skip adding another message if variants already handled it
              if (data?.isVariants || serverReply === "__VARIANTS_HANDLED__") {
                setStreamingText("");
                streamingTextRef.current = "";
              } else {
                const finalText =
                  (typeof data?.reply === "string" && data.reply.trim()) ||
                  (serverReply && serverReply !== "__VARIANTS_HANDLED__" ? serverReply : null) ||
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
          // If we were processing leftover buffer after done=true, break now
          if (done) break;
        }
        // Fallback: stream ended without a done event
        if (!receivedDone && serverReply !== "__VARIANTS_HANDLED__") {
          setAgentState("idle");
          if (streamingTextRef.current) {
            setMessages(prev => [
              ...prev,
              { id: crypto.randomUUID(), campaign_id: campaignId!, role: "assistant", content: streamingTextRef.current, created_at: new Date().toISOString() },
            ]);
            setStreamingText("");
            streamingTextRef.current = "";
          }
        }
      } else {
        // JSON fallback (shouldn't happen but handle gracefully)
        const data = await response.json();
        if (data?.error) throw new Error(data.error);
        setCampaign(c => c ? { ...c, html: data.html } : c);
        setCanUndo(true);
        setRedoStack([]);
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
  // Helper: scan the current HTML to find what text is actually live for a variant set.
  // This handles cross-set applies where the original `find` text has been replaced by another set.
  const findLiveTarget = useCallback((variantData: NonNullable<ChatMessage['variant_data']>, html: string): string | null => {
    const originalFind = variantData.variants[0]?.find;
    if (!originalFind) return null;

    // 1. Original text still present — nothing has changed it
    if (html.includes(originalFind)) return originalFind;

    // 2. Check currently applied variant's replace text (most likely match after same-set switch)
    const appliedTexts = variantData.applied_texts || {};
    const appliedIdx = variantData.applied_index;
    if (appliedIdx !== null && appliedIdx !== undefined) {
      const liveText = appliedTexts[appliedIdx] || variantData.variants[appliedIdx]?.replace;
      if (liveText && html.includes(liveText)) return liveText;
    }

    // 3. Check all variant replace texts (cross-set apply may have used one from this set)
    for (const v of variantData.variants) {
      if (html.includes(v.replace)) return v.replace;
    }

    // 4. Check all tracked applied texts
    for (const text of Object.values(appliedTexts)) {
      if (typeof text === 'string' && html.includes(text)) return text;
    }

    return null;
  }, []);

  const handleApplyVariant = async (variant: VariantOption, index: number, messageId: string) => {
    if (!campaign?.html || !campaignId) return;
    const html = campaign.html;

    const msg = messages.find(m => m.id === messageId);
    if (!msg?.variant_data) return;

    const findTarget = findLiveTarget(msg.variant_data, html);
    if (!findTarget) {
      toast.error("Could not find the text to replace — it may have already changed.");
      return;
    }

    const useAll = variant.apply_all === true;
    const newHtml = useAll ? html.split(findTarget).join(variant.replace) : html.replace(findTarget, variant.replace);
    // Save to history
    const history = Array.isArray(campaign.html_history) ? [...campaign.html_history] : [];
    history.push(html);
    await supabase.from("campaigns").update({ html: newHtml, html_history: history }).eq("id", campaignId);
    setCampaign(c => c ? { ...c, html: newHtml, html_history: history } : c);
    setCanUndo(true);
    setRedoStack([]);

    // Track which text is now live for this variant index
    const appliedTexts = msg.variant_data.applied_texts || {};
    const newAppliedTexts = { ...appliedTexts, [index]: variant.replace };

    // Update this message's applied_index and applied_texts
    setMessages(prev => prev.map(m => {
      if (m.id === messageId && m.variant_data) {
        return { ...m, variant_data: { ...m.variant_data, applied_index: index, applied_texts: newAppliedTexts } };
      }
      return m;
    }));

    // Cross-set sync: update any OTHER variant messages that share the same original find text
    // so they can locate the new live text on their next apply/preview
    setMessages(prev => prev.map(m => {
      if (m.id === messageId || !m.variant_data || m.message_type !== 'variants') return m;
      const otherOriginal = m.variant_data.variants[0]?.find;
      if (!otherOriginal) return m;
      // Check if this other set targets the same text we just replaced
      const otherLive = findLiveTarget(m.variant_data, html);
      if (otherLive === findTarget) {
        // This set's live text was just replaced — record the new text so findLiveTarget can find it
        const otherAppliedTexts = { ...(m.variant_data.applied_texts || {}), _crossSetLive: variant.replace };
        return { ...m, variant_data: { ...m.variant_data, applied_texts: otherAppliedTexts } };
      }
      return m;
    }));

    // Persist to DB
    const variantData = msg.variant_data;
    await supabase.from("chat_messages").update({
      tool_calls: { type: "variants", data: { message: variantData.message || "", variants: variantData.variants || [], applied_index: index, applied_texts: newAppliedTexts } },
    } as any).eq("id", messageId);

    toast.success(`Applied: ${variant.label}`);
  };

  const handlePreviewVariant = useCallback((variant: VariantOption, index: number, messageId: string) => {
    const html = iframeOwnedHtmlRef.current || campaign?.html;
    if (!html) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.variant_data) return;

    const findTarget = findLiveTarget(msg.variant_data, html);
    if (!findTarget) return; // silently skip — text no longer in HTML

    const useAll = variant.apply_all === true;
    setPreviewHtml(useAll ? html.split(findTarget).join(variant.replace) : html.replace(findTarget, variant.replace));
  }, [campaign?.html, messages, findLiveTarget]);

  const handlePreviewClear = useCallback(() => {
    setPreviewHtml(null);
  }, []);

  const handleMoreVariants = useCallback(async (messageId: string) => {
    if (!campaignId || !brandId || !campaign?.html) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg?.variant_data) return;

    // Find the original user message that triggered these variants
    const msgIndex = messages.findIndex(m => m.id === messageId);
    let originalUserMsg = "";
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        originalUserMsg = messages[i].content;
        break;
      }
    }
    if (!originalUserMsg) return;

    setLoadingMoreVariants(messageId);

    try {
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
            message: originalUserMsg,
            currentHtml: campaign.html,
            moreVariants: true,
          }),
        }
      );

      if (!response.ok) throw new Error(`Failed: ${response.status}`);

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream") && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Create the new variant message immediately
        const newMsgId = crypto.randomUUID();
        const variantMsg: ChatMessage = {
          id: newMsgId,
          campaign_id: campaignId,
          role: "assistant",
          content: "Generating more options...",
          created_at: new Date().toISOString(),
          message_type: "variants",
          variant_data: { message: "Generating more options...", variants: [], applied_index: null },
        };
        setMessages(prev => [...prev, variantMsg]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.trim()) buffer += "\n\n";
            else break;
          } else {
            buffer += decoder.decode(value, { stream: true });
          }

          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() || "";

          for (const block of blocks) {
            if (!block.trim()) continue;
            const eventLine = block.split("\n").find(l => l.startsWith("event:"));
            const dataLine = block.split("\n").find(l => l.startsWith("data:"));
            if (!eventLine || !dataLine) continue;

            const eventType = eventLine.replace("event:", "").trim();
            let data: any;
            try { data = JSON.parse(dataLine.replace("data:", "").trim()); } catch { continue; }

            if (eventType === "variants_start") {
              setMessages(prev => prev.map(m => {
                if (m.id === newMsgId && m.variant_data) {
                  return { ...m, content: data.message, variant_data: { ...m.variant_data, message: data.message } };
                }
                return m;
              }));
            }

            if (eventType === "variant_item" && data.variant) {
              setMessages(prev => prev.map(m => {
                if (m.id === newMsgId && m.variant_data) {
                  return { ...m, variant_data: { ...m.variant_data, variants: [...m.variant_data.variants, data.variant] } };
                }
                return m;
              }));
            }

            if (eventType === "variants_done" && data.variants) {
              setMessages(prev => prev.map(m => {
                if (m.id === newMsgId && m.variant_data) {
                  return { ...m, content: data.message, variant_data: { ...m.variant_data, message: data.message, variants: data.variants } };
                }
                return m;
              }));
            }
          }
          if (done) break;
        }
      }
    } catch (err: any) {
      toast.error(`Failed to generate more options: ${err.message}`);
    } finally {
      setLoadingMoreVariants(null);
    }
  }, [campaignId, brandId, campaign?.html, messages]);



  const allVersions: string[] = (() => {
    const history = Array.isArray(campaign?.html_history) ? campaign.html_history as string[] : [];
    const current = campaign?.html || "";
    return [...history, current];
  })();
  // The active version index (null = latest = allVersions.length - 1)
  const resolvedActiveIndex = activeVersionIndex ?? allVersions.length - 1;

  const handleUndo = useCallback(async () => {
    if (!campaign || !campaignId) return;
    const history = campaign.html_history;
    if (!Array.isArray(history) || history.length === 0) return;
    const currentHtml = iframeOwnedHtmlRef.current || campaign.html || "";
    iframeOwnedHtmlRef.current = null; // flush iframe ownership
    const previousHtml = history[history.length - 1];
    const newHistory = history.slice(0, -1);
    await supabase.from("campaigns").update({ html: previousHtml, html_history: newHistory }).eq("id", campaignId);
    setCampaign((c) => c ? { ...c, html: previousHtml as string, html_history: newHistory } : c);
    setCanUndo(newHistory.length > 0);
    setActiveVersionIndex(null);
    setRedoStack(prev => [...prev, currentHtml]);
    toast.success("Undo successful");
  }, [campaign, campaignId]);

  const handleRedo = useCallback(async () => {
    if (!campaign || !campaignId || redoStack.length === 0) return;
    const redoHtml = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);
    const history = Array.isArray(campaign.html_history) ? [...campaign.html_history] : [];
    history.push(campaign.html || "");
    await supabase.from("campaigns").update({ html: redoHtml, html_history: history }).eq("id", campaignId);
    setCampaign((c) => c ? { ...c, html: redoHtml, html_history: history } : c);
    setCanUndo(true);
    setRedoStack(newRedoStack);
    setActiveVersionIndex(null);
    toast.success("Redo successful");
  }, [campaign, campaignId, redoStack]);

  // Keyboard shortcuts: Cmd/Ctrl+Z for undo, Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y for redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea in the parent
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || (ae as HTMLElement).isContentEditable)) return;
      // Skip if iframe has focus (user is editing inside preview)
      if (ae && ae.tagName === 'IFRAME') return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if (e.key === 'z' && e.shiftKey) { e.preventDefault(); handleRedo(); }
      if (e.key === 'y') { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

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
  // Debounced inline-edit save
  const inlineEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track iframe-owned HTML to avoid reloading iframe on every keystroke
  const iframeOwnedHtmlRef = useRef<string | null>(null);

  // Background edit: sends instruction to AI silently (no chat message)
  const sendBackgroundEdit = useCallback(async (instruction: string, onComplete?: () => void) => {
    if (!campaignId || !brandId || !(iframeOwnedHtmlRef.current || campaign?.html)) return;
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/edit-campaign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            campaignId,
            message: instruction,
            currentHtml: iframeOwnedHtmlRef.current || campaign.html,
            silent: true,
          }),
        }
      );
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';
        for (const block of blocks) {
          const eventLine = block.split('\n').find(l => l.startsWith('event:'));
          const dataLine = block.split('\n').find(l => l.startsWith('data:'));
          if (!eventLine || !dataLine) continue;
          const eventType = eventLine.replace('event:', '').trim();
          let data: any;
          try { data = JSON.parse(dataLine.replace('data:', '').trim()); } catch { continue; }
          if (eventType === 'html_patch' && data.html) {
            setCampaign(c => c ? { ...c, html: data.html } : c);
            setCanUndo(true);
            setRedoStack([]);
          }
        }
      }
    } catch (err) {
      console.error('Background edit failed:', err);
    } finally {
      onComplete?.();
    }
  }, [campaignId, brandId, campaign?.html]);

  // Color replace: Tier 1 instant change
  const handleColorReplace = useCallback(async (oldHex: string, newHex: string) => {
    if (!campaign?.html || !campaignId) return;
    const currentHtml = campaign.html;
    let newHtml = currentHtml.split(oldHex).join(newHex);
    newHtml = newHtml.split(oldHex.toUpperCase()).join(newHex);
    newHtml = newHtml.split(oldHex.toLowerCase()).join(newHex);
    if (newHtml === currentHtml) return;
    const history = Array.isArray(campaign.html_history) ? [...campaign.html_history] : [];
    history.push(currentHtml);
    setCampaign(c => c ? { ...c, html: newHtml, html_history: history } : c);
    setCanUndo(true);
    setRedoStack([]);
    if (inlineEditTimerRef.current) clearTimeout(inlineEditTimerRef.current);
    inlineEditTimerRef.current = setTimeout(async () => {
      await supabase.from("campaigns").update({ html: newHtml, html_history: history }).eq("id", campaignId);
    }, 500);
  }, [campaign, campaignId]);

  // Listen for postMessage from iframe for inline text edits + section events
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'undo') { handleUndo(); return; }
      if (e.data?.type === 'redo') { handleRedo(); return; }

      // Section reorder — Tier 2
      if (e.data?.type === 'sectionReordered') {
        const { movedSection, fromIndex, toIndex } = e.data;
        const direction = toIndex < fromIndex ? 'up' : 'down';
        const positions = Math.abs(toIndex - fromIndex);
        const instruction = `Move the ${movedSection} section ${direction} by ${positions} position${positions > 1 ? 's' : ''}`;
        setIsSyncing(true);
        sendBackgroundEdit(instruction, () => setIsSyncing(false));
        return;
      }

      // Section duplicated — Tier 2
      if (e.data?.type === 'sectionDuplicated') {
        setIsSyncing(true);
        sendBackgroundEdit(`Duplicate the ${e.data.sectionName} section`, () => setIsSyncing(false));
        return;
      }

      // Section deleted — already removed from DOM, sync HTML comes via textEdited
      if (e.data?.type === 'sectionDeleted') {
        // The syncHtml() in iframe already fires textEdited, which handles the save
        return;
      }

      // Ideate element from floating toolbar — auto-send
      if (e.data?.type === 'ideateElement') {
        const { text, tagName, innerHTML, outerHTML, elementStyle } = e.data;
        const hasInlineStyles = innerHTML && innerHTML !== text && /<[^>]+style/i.test(innerHTML);
        const styleContext = hasInlineStyles
          ? `\n\nIMPORTANT: The original element contains inline styling (e.g. highlighted text, colored spans, background colors). Here is the original HTML:\n\`\`\`\n${outerHTML}\n\`\`\`\nPreserve any inline styling patterns (like background-color highlights, colored text spans, etc.) in your alternatives. Each variant's "replace" value must include the same HTML/inline-style structure.`
          : '';
        let realPrompt = '';
        if (/^H[1-6]$/.test(tagName)) realPrompt = `Give me 5 alternative headline options for: "${text}"${styleContext}`;
        else if (tagName === 'A' || tagName === 'BUTTON') realPrompt = `Give me 5 alternative CTA button text options for: "${text}"${styleContext}`;
        else realPrompt = `Give me 5 alternative copy options for this text: "${text}"${styleContext}`;

        const shortText = text.length > 40 ? text.slice(0, 40) + '…' : text;
        const typeLabel = /^H[1-6]$/.test(tagName) ? 'headline' : (tagName === 'A' || tagName === 'BUTTON') ? 'CTA' : 'copy';
        const displayText = `✨ Ideate ${typeLabel}: "${shortText}"`;

        ideatePayloadRef.current = { realPrompt, displayText };
        setIdeateActive(true);
        sendMessage();
        return;
      }

      // Color replace from iframe
      if (e.data?.type === 'colorReplace') {
        handleColorReplace(e.data.oldHex, e.data.newHex);
        return;
      }

      // Element selection from iframe
      if (e.data?.type === 'elementSelected') {
        setSelectedElementContext({ tagName: e.data.tagName, text: e.data.text, outerHTML: e.data.outerHTML });
        return;
      }
      if (e.data?.type === 'elementDeselected') {
        setSelectedElementContext(null);
        return;
      }
      if (e.data?.type === 'regionSelected') {
        setSelectedElementContext({
          tagName: 'REGION',
          text: e.data.elements.map((el: any) => el.text).join(' | '),
          outerHTML: '',
          isRegion: true,
          elements: e.data.elements,
        });
        return;
      }

      if (e.data?.type !== "textEdited" || !e.data?.html) return;
      if (!campaignId || !campaign) return;
      const newHtml = e.data.html as string;
      const currentHtml = iframeOwnedHtmlRef.current || campaign.html || "";
      if (newHtml === currentHtml) return;

      // Track iframe's live HTML WITHOUT updating campaign state (prevents iframe reload)
      iframeOwnedHtmlRef.current = newHtml;

      // Push to history for undo
      const history = Array.isArray(campaign.html_history) ? [...campaign.html_history] : [];
      history.push(currentHtml);
      // Update history in state (but NOT html — that would reload iframe)
      setCampaign(c => c ? { ...c, html_history: history } : c);
      setCanUndo(true);
      setRedoStack([]); // clear redo on new edit

      // Debounced DB save — persist both html and history
      if (inlineEditTimerRef.current) clearTimeout(inlineEditTimerRef.current);
      inlineEditTimerRef.current = setTimeout(async () => {
        await supabase.from("campaigns").update({ html: newHtml, html_history: history }).eq("id", campaignId);
        // Silently sync campaign.html to match DB without triggering srcdoc recompute
        // (srcdocHtml won't change because displayHtml hasn't changed)
        setCampaign(c => c ? { ...c, html: newHtml } : c);
        iframeOwnedHtmlRef.current = null;
      }, 2000);
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (inlineEditTimerRef.current) clearTimeout(inlineEditTimerRef.current);
    };
  }, [campaignId, campaign, handleUndo, handleRedo, sendBackgroundEdit, handleColorReplace]);

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  }

  const isDraft = !campaign?.html || campaign?.status === "draft";
  const isGenerating = campaign?.status === "generating" || generating;

  const importFromClickUp = async () => {
    if (!clickupUrl.trim() || !brandId) return;
    setClickupLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clickup-fetch-task`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ brandId, taskUrl: clickupUrl.trim() }),
        }
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Import failed" }));
        throw new Error(err.error || `Error ${resp.status}`);
      }
      const data = await resp.json();
      if (data.name) setNameValue(data.name);
      if (data.brief) setBrief(data.brief);
      if (data.copy) setExtraCopy(data.copy);
      if (data.suggestedGoal) setGoal(data.suggestedGoal);
      toast.success("Imported from ClickUp");
    } catch (err: any) {
      toast.error(err.message || "Failed to import from ClickUp");
    } finally {
      setClickupLoading(false);
    }
  };

  const zoomScale = screenZoom / 100;
  const renderedWidth = Math.round(viewportWidth * zoomScale);
  const renderedHeight = Math.round(iframeContentHeight * zoomScale);

  const displayHtml = previewHtml || (activeVersionIndex !== null ? allVersions[activeVersionIndex] : campaign?.html);
  const htmlForPreview = displayHtml
    ? replaceLikelyBrokenImageUrls(displayHtml, previewFallbackUrls)
    : "";


  const srcdocHtml = htmlForPreview
    ? htmlForPreview.replace(
        /(<head[^>]*>)/i,
        `$1<meta name="viewport" content="width=device-width, initial-scale=1"><script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"><\/script><style>html,body{margin:0;padding:0;scrollbar-width:none;-ms-overflow-style:none;}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none;}h1,h2,h3,h4,h5,h6,p,span,a,li,label{text-wrap:balance;}table{max-width:100%!important;width:100%!important;box-sizing:border-box!important;}img{max-width:100%;height:auto!important;}td{box-sizing:border-box!important;}[contenteditable]:hover{outline:1px dashed rgba(128,128,128,0.4);outline-offset:2px;cursor:text;}[contenteditable]:focus{outline:2px solid rgba(99,102,241,0.5);outline-offset:2px;background:rgba(99,102,241,0.04);}.section-drag-ghost{opacity:0.4;}.section-drag-handle{cursor:grab;}.section-drag-handle:active{cursor:grabbing;}.section-handle-bar{position:absolute;top:0;left:0;right:0;height:32px;z-index:9999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:space-between;padding:0 8px;opacity:0;transition:opacity 0.15s;pointer-events:none;}.section-wrap:hover .section-handle-bar{opacity:1;pointer-events:auto;}.section-handle-bar span{color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;opacity:0.8;}.section-handle-bar button{background:none;border:none;color:#fff;cursor:pointer;padding:4px;opacity:0.7;font-size:14px;}.section-handle-bar button:hover{opacity:1;}.ftb{position:fixed;z-index:99998;background:rgba(18,18,20,0.97);backdrop-filter:blur(16px) saturate(1.4);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:4px 6px;display:flex;align-items:center;gap:2px;box-shadow:0 8px 32px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.04) inset;animation:ftb-in 0.18s cubic-bezier(0.16,1,0.3,1);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;}@keyframes ftb-in{from{opacity:0;transform:translateY(6px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}.ftb-btn{background:none;border:none;color:rgba(255,255,255,0.55);width:30px;height:30px;border-radius:6px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all 0.12s;padding:0;}.ftb-btn:hover{background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.9);}.ftb-btn.active{background:rgba(99,102,241,0.2);color:#a5b4fc;}.ftb-sep{width:1px;height:18px;background:rgba(255,255,255,0.08);margin:0 4px;flex-shrink:0;}.ftb-tag{font-size:9px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.08em;padding:2px 8px;white-space:nowrap;font-weight:600;}.ftb-select{background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.75);border:1px solid rgba(255,255,255,0.1);border-radius:6px;font-size:11px;padding:3px 6px;cursor:pointer;outline:none;height:28px;font-weight:500;transition:all 0.12s;-webkit-appearance:none;appearance:none;}.ftb-select:hover{border-color:rgba(255,255,255,0.25);background:rgba(255,255,255,0.1);}.ftb-select:focus{border-color:rgba(99,102,241,0.5);}.ftb-swatch{width:24px;height:24px;border-radius:6px;border:2px solid rgba(255,255,255,0.15);cursor:pointer;position:relative;transition:all 0.12s;}.ftb-swatch:hover{border-color:rgba(255,255,255,0.4);transform:scale(1.1);}.ftb-cpanel{position:absolute;top:calc(100% + 8px);background:rgba(18,18,20,0.98);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px;box-shadow:0 12px 40px rgba(0,0,0,0.6);min-width:200px;animation:ftb-in 0.12s cubic-bezier(0.16,1,0.3,1);}.ftb-cpanel-label{font-size:9px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.08em;margin:6px 0 4px;font-weight:600;}.ftb-cpanel-label:first-child{margin-top:0;}.ftb-cpanel-row{display:flex;flex-wrap:wrap;gap:4px;}.ftb-cpanel-swatch{width:26px;height:26px;border-radius:5px;border:2px solid transparent;cursor:pointer;transition:all 0.12s;position:relative;}.ftb-cpanel-swatch:hover{border-color:rgba(255,255,255,0.4);transform:scale(1.12);}.ftb-cpanel-swatch.active{border-color:#818cf8;box-shadow:0 0 0 2px rgba(129,140,248,0.3);}.ftb-cpanel-swatch.active::after{content:'✓';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.5);}.ftb-hex-row{display:flex;gap:4px;margin-top:8px;align-items:center;}.ftb-hex-input{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:rgba(255,255,255,0.8);font-size:11px;padding:4px 6px;width:72px;outline:none;font-family:monospace;}.ftb-hex-input:focus{border-color:rgba(99,102,241,0.5);}.ftb-hex-native{width:28px;height:28px;border:none;padding:0;background:none;cursor:pointer;border-radius:4px;}.ftb-ideate{background:transparent;color:#c8f135;border:1.5px solid transparent;border-radius:7px;padding:4px 12px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;white-space:nowrap;transition:all 0.15s;position:relative;background-image:linear-gradient(rgba(18,18,20,0.97),rgba(18,18,20,0.97)),linear-gradient(135deg,#c8f135,#a5b4fc,#c8f135);background-origin:border-box;background-clip:padding-box,border-box;}.ftb-ideate:hover{background-image:linear-gradient(rgba(200,241,53,0.08),rgba(200,241,53,0.08)),linear-gradient(135deg,#c8f135,#a5b4fc,#c8f135);color:#d4f55a;box-shadow:0 0 16px rgba(200,241,53,0.2);}</style>`
      ).replace(
        /<\/body>/i,
        `<style>.el-selected{outline:2px solid rgba(200,241,53,0.6)!important;outline-offset:2px;}.region-select-overlay{position:fixed;border:1.5px dashed rgba(200,241,53,0.5);background:rgba(200,241,53,0.05);pointer-events:none;z-index:99997;}.ftb-pad-btn{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);border-radius:5px;font-size:11px;width:26px;height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.12s;padding:0;}.ftb-pad-btn:hover{background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.9);}</style><script>
(function(){
  /* --- TEXT EDITING --- */
  var blocks = ['TABLE','TR','TD','TH','DIV','UL','OL','IMG'];
  document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,a,li,button,label').forEach(function(el){
    if(el.querySelector('img,table,div')) return;
    var hasBlock = Array.from(el.children).some(function(c){ return blocks.indexOf(c.tagName)>=0; });
    if(hasBlock) return;
    if(!el.textContent.trim()) return;
    el.contentEditable = 'true';
    el.style.cursor = 'text';
  });
  document.addEventListener('paste', function(e){
    if(!e.target.isContentEditable) return;
    e.preventDefault();
    var text = (e.clipboardData||window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  document.addEventListener('keydown', function(e){
    var ae = document.activeElement;
    var isEditing = ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA');
    if((e.metaKey || e.ctrlKey) && e.key === 'z'){
      if(isEditing) return;
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ type: e.shiftKey ? 'redo' : 'undo' }, '*');
    }
    if((e.metaKey || e.ctrlKey) && e.key === 'y'){
      if(isEditing) return;
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ type: 'redo' }, '*');
    }
    if((e.metaKey || e.ctrlKey) && e.key === 'a' && isEditing){
      e.preventDefault();
      e.stopPropagation();
      var range = document.createRange();
      range.selectNodeContents(ae);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
  var timer = null;
  function syncHtml(){
    clearTimeout(timer);
    timer = setTimeout(function(){
      var clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('script').forEach(function(s){ s.remove(); });
      clone.querySelectorAll('[contenteditable]').forEach(function(el){
        el.removeAttribute('contenteditable');
        el.style.removeProperty('cursor');
      });
      clone.querySelectorAll('.section-handle-bar').forEach(function(el){ el.remove(); });
      clone.querySelectorAll('.section-wrap').forEach(function(el){
        el.classList.remove('section-wrap');
        el.style.removeProperty('position');
        el.removeAttribute('data-section-name');
      });
      clone.querySelectorAll('.ctx-menu').forEach(function(el){ el.remove(); });
      clone.querySelectorAll('.ftb').forEach(function(el){ el.remove(); });
      clone.querySelectorAll('.ftb-cpanel').forEach(function(el){ el.remove(); });
      clone.querySelectorAll('.el-selected').forEach(function(el){ el.classList.remove('el-selected'); });
      clone.querySelectorAll('.region-select-overlay').forEach(function(el){ el.remove(); });
      clone.querySelectorAll('style').forEach(function(s){
        if(s.textContent && (s.textContent.indexOf('[contenteditable]')>=0 || s.textContent.indexOf('section-drag')>=0 || s.textContent.indexOf('.ctx-menu')>=0 || s.textContent.indexOf('.ftb')>=0)) s.remove();
      });
      clone.querySelectorAll('font').forEach(function(f){
        var span = document.createElement('span');
        span.innerHTML = f.innerHTML;
        if(f.color) span.style.color = f.color;
        if(f.size) { var sizes = {1:'10px',2:'13px',3:'16px',4:'18px',5:'24px',6:'32px',7:'48px'}; span.style.fontSize = sizes[f.size]||f.size+'px'; }
        f.replaceWith(span);
      });
      window.parent.postMessage({ type: 'textEdited', html: clone.outerHTML }, '*');
    }, 1500);
  }
  document.addEventListener('input', syncHtml);

  /* --- SELECTION PERSISTENCE --- */
  var savedRange = null;
  document.addEventListener('selectionchange', function(){
    var sel = window.getSelection();
    if(sel && sel.rangeCount > 0){
      var r = sel.getRangeAt(0);
      if(ftbTarget && ftbTarget.contains(r.startContainer)){
        savedRange = r.cloneRange();
      }
    }
    if(ftbEl) updateBIUState(ftbEl);
  });

  function restoreSelection(){
    if(!savedRange) return false;
    try {
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
      return true;
    } catch(e){ return false; }
  }

  function applyCommand(cmd, value){
    if(!ftbTarget) return;
    restoreSelection();
    ftbTarget.focus();
    try { document.execCommand(cmd, false, value || null); } catch(e){}
    syncHtml();
    // Re-save the range after command
    var sel = window.getSelection();
    if(sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();
  }

  /* --- FLOATING TOOLBAR --- */
  var ftbEl = null;
  var ftbTarget = null;
  var ftbBlurTimer = null;
  var ftbColorPanel = null;
  var recentColors = [];

  function removeFtb(){
    if(ftbEl){ ftbEl.remove(); ftbEl = null; }
    if(ftbColorPanel){ ftbColorPanel.remove(); ftbColorPanel = null; }
    ftbTarget = null;
    savedRange = null;
  }

  function getTagLabel(el){
    var t = el.tagName;
    if(/^H[1-6]$/.test(t)) return 'Heading';
    if(t === 'A') return 'Link';
    if(t === 'BUTTON') return 'Button';
    if(t === 'LI') return 'List';
    if(t === 'LABEL') return 'Label';
    if(t === 'SPAN' && el.closest('a')) return 'Link';
    return 'Body';
  }

  function positionFtb(bar, el){
    var r = el.getBoundingClientRect();
    var bw = bar.offsetWidth || 380;
    var bh = bar.offsetHeight || 38;
    var left = Math.max(4, Math.min(r.left + r.width/2 - bw/2, window.innerWidth - bw - 4));
    if(r.top > bh + 12){
      bar.style.top = (r.top - bh - 8) + 'px';
    } else {
      bar.style.top = (r.bottom + 8) + 'px';
    }
    bar.style.left = left + 'px';
  }

  function extractEmailColors(){
    var colors = new Set();
    document.querySelectorAll('*').forEach(function(el){
      var s = el.style;
      if(s.color){ var c = rgbToHex(s.color); if(c) colors.add(c); }
      if(s.backgroundColor){ var c = rgbToHex(s.backgroundColor); if(c) colors.add(c); }
    });
    var fromAttrs = document.querySelectorAll('[color],[bgcolor]');
    fromAttrs.forEach(function(el){
      if(el.getAttribute('color')){ var c = normalizeHex(el.getAttribute('color')); if(c) colors.add(c); }
      if(el.getAttribute('bgcolor')){ var c = normalizeHex(el.getAttribute('bgcolor')); if(c) colors.add(c); }
    });
    return Array.from(colors).filter(function(c){ return c && c.length === 7; }).slice(0, 16);
  }

  function rgbToHex(rgb){
    if(!rgb) return null;
    if(rgb.charAt(0)==='#') return normalizeHex(rgb);
    var m = rgb.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if(!m) return null;
    return '#' + [m[1],m[2],m[3]].map(function(x){ return parseInt(x).toString(16).padStart(2,'0'); }).join('');
  }

  function normalizeHex(h){
    if(!h) return null;
    h = h.trim();
    if(h.charAt(0)!=='#') h = '#' + h;
    if(h.length === 4) h = '#' + h[1]+h[1]+h[2]+h[2]+h[3]+h[3];
    return h.toLowerCase();
  }

  function getCurrentFontSize(el){
    return parseInt(window.getComputedStyle(el).fontSize) || 16;
  }

  function getCurrentAlignment(el){
    var a = window.getComputedStyle(el).textAlign;
    if(a === 'center') return 'center';
    if(a === 'right' || a === 'end') return 'right';
    return 'left';
  }

  function updateBIUState(bar){
    try {
      var bBtn = bar.querySelector('[data-ftb="bold"]');
      var iBtn = bar.querySelector('[data-ftb="italic"]');
      var uBtn = bar.querySelector('[data-ftb="underline"]');
      if(bBtn) bBtn.classList.toggle('active', document.queryCommandState('bold'));
      if(iBtn) iBtn.classList.toggle('active', document.queryCommandState('italic'));
      if(uBtn) uBtn.classList.toggle('active', document.queryCommandState('underline'));
    } catch(e){}
  }

  function addRecentColor(hex){
    hex = hex.toLowerCase();
    recentColors = recentColors.filter(function(c){ return c !== hex; });
    recentColors.unshift(hex);
    if(recentColors.length > 8) recentColors = recentColors.slice(0, 8);
  }

  function showColorPanel(swatchWrap, swatch, el){
    if(ftbColorPanel){ ftbColorPanel.remove(); ftbColorPanel = null; return; }
    var panel = document.createElement('div');
    panel.className = 'ftb-cpanel';
    var currentColor = rgbToHex(window.getComputedStyle(el).color) || '#000000';

    function applyColor(hex){
      addRecentColor(hex);
      restoreSelection();
      el.focus();
      var sel = window.getSelection();
      if(!sel || !sel.rangeCount || sel.isCollapsed){
        el.style.color = hex;
      } else {
        document.execCommand('foreColor', false, hex);
      }
      swatch.style.backgroundColor = hex;
      if(ftbColorPanel){ ftbColorPanel.remove(); ftbColorPanel = null; }
      syncHtml();
    }

    function makeSwatchEl(hex, isActive){
      var cs = document.createElement('div');
      cs.className = 'ftb-cpanel-swatch' + (isActive ? ' active' : '');
      cs.style.backgroundColor = hex;
      cs.title = hex;
      cs.addEventListener('mousedown', function(ev){ ev.preventDefault(); ev.stopPropagation(); });
      cs.addEventListener('click', function(ev){ ev.stopPropagation(); applyColor(hex); });
      return cs;
    }

    // Default colors
    var defaults = ['#000000','#ffffff','#333333','#666666','#999999','#cc0000','#ff6600','#ffcc00','#33cc33','#0066cc','#6633cc','#cc33cc'];
    var defLabel = document.createElement('div');
    defLabel.className = 'ftb-cpanel-label';
    defLabel.textContent = 'Default';
    panel.appendChild(defLabel);
    var defRow = document.createElement('div');
    defRow.className = 'ftb-cpanel-row';
    defaults.forEach(function(hex){ defRow.appendChild(makeSwatchEl(hex, currentColor === hex)); });
    panel.appendChild(defRow);

    // Document colors
    var docColors = extractEmailColors();
    if(docColors.length > 0){
      var docLabel = document.createElement('div');
      docLabel.className = 'ftb-cpanel-label';
      docLabel.textContent = 'Document';
      panel.appendChild(docLabel);
      var docRow = document.createElement('div');
      docRow.className = 'ftb-cpanel-row';
      docColors.forEach(function(hex){ docRow.appendChild(makeSwatchEl(hex, currentColor === hex)); });
      panel.appendChild(docRow);
    }

    // Recent colors
    if(recentColors.length > 0){
      var recLabel = document.createElement('div');
      recLabel.className = 'ftb-cpanel-label';
      recLabel.textContent = 'Recent';
      panel.appendChild(recLabel);
      var recRow = document.createElement('div');
      recRow.className = 'ftb-cpanel-row';
      recentColors.forEach(function(hex){ recRow.appendChild(makeSwatchEl(hex, currentColor === hex)); });
      panel.appendChild(recRow);
    }

    // Hex input + native picker
    var hexRow = document.createElement('div');
    hexRow.className = 'ftb-hex-row';
    var hexLabel = document.createElement('span');
    hexLabel.style.cssText = 'color:rgba(255,255,255,0.35);font-size:10px;font-weight:600;';
    hexLabel.textContent = '#';
    hexRow.appendChild(hexLabel);
    var hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'ftb-hex-input';
    hexInput.value = currentColor.replace('#','');
    hexInput.maxLength = 6;
    hexInput.placeholder = '000000';
    hexInput.addEventListener('mousedown', function(ev){ ev.stopPropagation(); });
    hexInput.addEventListener('keydown', function(ev){
      ev.stopPropagation();
      if(ev.key === 'Enter'){
        var val = hexInput.value.trim().replace('#','');
        if(/^[0-9a-fA-F]{3,6}$/.test(val)){
          var hex = normalizeHex('#'+val);
          applyColor(hex);
        }
      }
    });
    hexRow.appendChild(hexInput);
    var nativePicker = document.createElement('input');
    nativePicker.type = 'color';
    nativePicker.className = 'ftb-hex-native';
    nativePicker.value = currentColor;
    nativePicker.addEventListener('mousedown', function(ev){ ev.stopPropagation(); });
    nativePicker.addEventListener('input', function(){
      hexInput.value = nativePicker.value.replace('#','');
    });
    nativePicker.addEventListener('change', function(){
      applyColor(nativePicker.value);
    });
    hexRow.appendChild(nativePicker);
    panel.appendChild(hexRow);

    swatchWrap.appendChild(panel);
    ftbColorPanel = panel;
  }

  function showBgColorPanel(swatchWrap, swatch, el){
    if(ftbColorPanel){ ftbColorPanel.remove(); ftbColorPanel = null; return; }
    var panel = document.createElement('div');
    panel.className = 'ftb-cpanel';
    var currentBg = rgbToHex(window.getComputedStyle(el).backgroundColor) || '';

    function applyBg(hex){
      addRecentColor(hex);
      el.style.backgroundColor = hex;
      if(el.hasAttribute('bgcolor')) el.setAttribute('bgcolor', hex);
      swatch.style.backgroundColor = hex;
      swatch.style.backgroundImage = 'none';
      if(ftbColorPanel){ ftbColorPanel.remove(); ftbColorPanel = null; }
      syncHtml();
    }

    function makeBgSwatch(hex, isActive){
      var cs = document.createElement('div');
      cs.className = 'ftb-cpanel-swatch' + (isActive ? ' active' : '');
      cs.style.backgroundColor = hex;
      cs.title = hex;
      cs.addEventListener('mousedown', function(ev){ ev.preventDefault(); ev.stopPropagation(); });
      cs.addEventListener('click', function(ev){ ev.stopPropagation(); applyBg(hex); });
      return cs;
    }

    var defaults = ['#000000','#ffffff','#333333','#666666','#999999','#cc0000','#ff6600','#ffcc00','#33cc33','#0066cc','#6633cc','#cc33cc'];
    var defLabel = document.createElement('div');
    defLabel.className = 'ftb-cpanel-label';
    defLabel.textContent = 'Default';
    panel.appendChild(defLabel);
    var defRow = document.createElement('div');
    defRow.className = 'ftb-cpanel-row';
    defaults.forEach(function(hex){ defRow.appendChild(makeBgSwatch(hex, currentBg === hex)); });
    panel.appendChild(defRow);

    var docColors = extractEmailColors();
    if(docColors.length > 0){
      var docLabel = document.createElement('div');
      docLabel.className = 'ftb-cpanel-label';
      docLabel.textContent = 'Document';
      panel.appendChild(docLabel);
      var docRow = document.createElement('div');
      docRow.className = 'ftb-cpanel-row';
      docColors.forEach(function(hex){ docRow.appendChild(makeBgSwatch(hex, currentBg === hex)); });
      panel.appendChild(docRow);
    }

    var hexRow = document.createElement('div');
    hexRow.className = 'ftb-hex-row';
    var hexLabel = document.createElement('span');
    hexLabel.style.cssText = 'color:rgba(255,255,255,0.35);font-size:10px;font-weight:600;';
    hexLabel.textContent = '#';
    hexRow.appendChild(hexLabel);
    var hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.className = 'ftb-hex-input';
    hexInput.value = currentBg ? currentBg.replace('#','') : '';
    hexInput.maxLength = 6;
    hexInput.placeholder = '000000';
    hexInput.addEventListener('mousedown', function(ev){ ev.stopPropagation(); });
    hexInput.addEventListener('keydown', function(ev){
      ev.stopPropagation();
      if(ev.key === 'Enter'){
        var val = hexInput.value.trim().replace('#','');
        if(/^[0-9a-fA-F]{3,6}$/.test(val)) applyBg(normalizeHex('#'+val));
      }
    });
    hexRow.appendChild(hexInput);
    var nativePicker = document.createElement('input');
    nativePicker.type = 'color';
    nativePicker.className = 'ftb-hex-native';
    nativePicker.value = currentBg || '#ffffff';
    nativePicker.addEventListener('mousedown', function(ev){ ev.stopPropagation(); });
    nativePicker.addEventListener('input', function(){ hexInput.value = nativePicker.value.replace('#',''); });
    nativePicker.addEventListener('change', function(){ applyBg(nativePicker.value); });
    hexRow.appendChild(nativePicker);
    panel.appendChild(hexRow);

    swatchWrap.appendChild(panel);
    ftbColorPanel = panel;
  }

  function showFtb(el){
    removeFtb();
    ftbTarget = el;

    var bar = document.createElement('div');
    bar.className = 'ftb';

    // Tag label
    var tag = document.createElement('span');
    tag.className = 'ftb-tag';
    tag.textContent = getTagLabel(el);
    bar.appendChild(tag);

    bar.appendChild(makeSep());

    // Font size select
    var sizeSelect = document.createElement('select');
    sizeSelect.className = 'ftb-select';
    sizeSelect.title = 'Font size';
    var sizes = [10,12,13,14,16,18,20,24,28,32,40,48,64];
    var currentSize = getCurrentFontSize(el);
    sizes.forEach(function(s){
      var opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s + 'px';
      if(s === currentSize) opt.selected = true;
      sizeSelect.appendChild(opt);
    });
    if(sizes.indexOf(currentSize) < 0){
      var opt = document.createElement('option');
      opt.value = currentSize;
      opt.textContent = currentSize + 'px';
      opt.selected = true;
      sizeSelect.insertBefore(opt, sizeSelect.firstChild);
    }
    sizeSelect.addEventListener('mousedown', function(e){ e.stopPropagation(); });
    sizeSelect.addEventListener('change', function(){
      restoreSelection();
      el.focus();
      var sel = window.getSelection();
      if(!sel || !sel.rangeCount || sel.isCollapsed){
        el.style.fontSize = sizeSelect.value + 'px';
      } else {
        document.execCommand('fontSize', false, '7');
        el.querySelectorAll('font[size="7"]').forEach(function(f){
          var span = document.createElement('span');
          span.style.fontSize = sizeSelect.value + 'px';
          span.innerHTML = f.innerHTML;
          f.replaceWith(span);
        });
      }
      syncHtml();
    });
    bar.appendChild(sizeSelect);

    // Text color swatch
    var currentColor = window.getComputedStyle(el).color;
    var swatchWrap = document.createElement('div');
    swatchWrap.style.position = 'relative';
    var swatch = document.createElement('div');
    swatch.className = 'ftb-swatch';
    swatch.style.backgroundColor = currentColor;
    swatch.title = 'Text color';
    swatch.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
    swatch.addEventListener('click', function(e){
      e.stopPropagation();
      showColorPanel(swatchWrap, swatch, el);
    });
    swatchWrap.appendChild(swatch);
    bar.appendChild(swatchWrap);

    // Background color swatch
    var currentBg = window.getComputedStyle(el).backgroundColor;
    var bgSwatchWrap = document.createElement('div');
    bgSwatchWrap.style.position = 'relative';
    var bgSwatch = document.createElement('div');
    bgSwatch.className = 'ftb-swatch';
    var bgHex = rgbToHex(currentBg);
    bgSwatch.style.backgroundColor = bgHex && currentBg !== 'rgba(0, 0, 0, 0)' ? currentBg : 'transparent';
    if(!bgHex || currentBg === 'rgba(0, 0, 0, 0)'){
      bgSwatch.style.backgroundImage = 'linear-gradient(45deg,#555 25%,transparent 25%,transparent 75%,#555 75%),linear-gradient(45deg,#555 25%,transparent 25%,transparent 75%,#555 75%)';
      bgSwatch.style.backgroundSize = '8px 8px';
      bgSwatch.style.backgroundPosition = '0 0,4px 4px';
    }
    bgSwatch.title = 'Background color';
    bgSwatch.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
    bgSwatch.addEventListener('click', function(e){
      e.stopPropagation();
      showBgColorPanel(bgSwatchWrap, bgSwatch, el);
    });
    bgSwatchWrap.appendChild(bgSwatch);
    bar.appendChild(bgSwatchWrap);

    bar.appendChild(makeSep());

    // Bold
    var boldBtn = makeBtn('<b style="font-size:13px;">B</b>', 'Bold');
    boldBtn.setAttribute('data-ftb', 'bold');
    boldBtn.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
    boldBtn.addEventListener('click', function(e){ e.stopPropagation(); applyCommand('bold'); updateBIUState(bar); });
    bar.appendChild(boldBtn);

    // Italic
    var italicBtn = makeBtn('<i style="font-size:13px;font-family:Georgia,serif;">I</i>', 'Italic');
    italicBtn.setAttribute('data-ftb', 'italic');
    italicBtn.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
    italicBtn.addEventListener('click', function(e){ e.stopPropagation(); applyCommand('italic'); updateBIUState(bar); });
    bar.appendChild(italicBtn);

    // Underline
    var underlineBtn = makeBtn('<u style="font-size:13px;">U</u>', 'Underline');
    underlineBtn.setAttribute('data-ftb', 'underline');
    underlineBtn.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
    underlineBtn.addEventListener('click', function(e){ e.stopPropagation(); applyCommand('underline'); updateBIUState(bar); });
    bar.appendChild(underlineBtn);

    bar.appendChild(makeSep());

    // Text align — SVG icons
    var alignSvgs = {
      left: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>',
      center: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
      right: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>'
    };
    var currentAlign = getCurrentAlignment(el);
    var alignBtn = makeBtn(alignSvgs[currentAlign] || alignSvgs.left, 'Alignment');
    alignBtn.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
    alignBtn.addEventListener('click', function(e){
      e.stopPropagation();
      var next = currentAlign === 'left' ? 'center' : currentAlign === 'center' ? 'right' : 'left';
      el.style.textAlign = next;
      currentAlign = next;
      alignBtn.innerHTML = alignSvgs[next];
      syncHtml();
      restoreSelection();
      el.focus();
    });
    bar.appendChild(alignBtn);

    bar.appendChild(makeSep());

    // Padding controls
    var padLabel = document.createElement('span');
    padLabel.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.35);letter-spacing:0.05em;font-weight:600;padding:0 2px;';
    padLabel.textContent = 'PAD';
    bar.appendChild(padLabel);
    var padMinus = document.createElement('button');
    padMinus.className = 'ftb-pad-btn';
    padMinus.innerHTML = '−';
    padMinus.title = 'Decrease padding';
    padMinus.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
    padMinus.addEventListener('click', function(e){
      e.stopPropagation();
      var cur = parseInt(window.getComputedStyle(el).paddingTop) || 0;
      el.style.padding = Math.max(0, cur - 4) + 'px';
      syncHtml();
    });
    bar.appendChild(padMinus);
    var padPlus = document.createElement('button');
    padPlus.className = 'ftb-pad-btn';
    padPlus.innerHTML = '+';
    padPlus.title = 'Increase padding';
    padPlus.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
    padPlus.addEventListener('click', function(e){
      e.stopPropagation();
      var cur = parseInt(window.getComputedStyle(el).paddingTop) || 0;
      el.style.padding = (cur + 4) + 'px';
      syncHtml();
    });
    bar.appendChild(padPlus);

    bar.appendChild(makeSep());

    // Ideate button — stroke-only gradient border
    var ideateBtn = document.createElement('button');
    ideateBtn.className = 'ftb-ideate';
    ideateBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg> Ideate';
    ideateBtn.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
    ideateBtn.addEventListener('click', function(e){
      e.stopPropagation();
      // Capture innerHTML to preserve inline styling (highlights, colors, etc.)
      var innerHTML = el.innerHTML;
      var outerHTML = el.outerHTML;
      var styles = el.getAttribute('style') || '';
      window.parent.postMessage({ type: 'ideateElement', text: el.textContent.trim(), tagName: el.tagName, innerHTML: innerHTML, outerHTML: outerHTML, elementStyle: styles }, '*');
    });
    bar.appendChild(ideateBtn);

    document.body.appendChild(bar);
    ftbEl = bar;
    positionFtb(bar, el);
    updateBIUState(bar);
  }

  function makeBtn(html, title){
    var btn = document.createElement('button');
    btn.className = 'ftb-btn';
    btn.innerHTML = html;
    btn.title = title;
    return btn;
  }
  function makeSep(){
    var sep = document.createElement('div');
    sep.className = 'ftb-sep';
    return sep;
  }

  // Show toolbar on focus of editable elements
  document.addEventListener('focus', function(e){
    if(e.target && e.target.isContentEditable){
      clearTimeout(ftbBlurTimer);
      showFtb(e.target);
    }
  }, true);

  // Hide toolbar on blur (delayed to allow toolbar button clicks)
  document.addEventListener('blur', function(e){
    if(e.target && e.target.isContentEditable){
      ftbBlurTimer = setTimeout(function(){
        removeFtb();
      }, 300);
    }
  }, true);

  // Keep toolbar alive when interacting with it
  document.addEventListener('mousedown', function(e){
    if(ftbEl && (ftbEl.contains(e.target) || (ftbColorPanel && ftbColorPanel.contains(e.target)))){
      e.preventDefault();
      clearTimeout(ftbBlurTimer);
    }
  });

  // Reposition on scroll
  document.addEventListener('scroll', function(){
    if(ftbEl && ftbTarget) positionFtb(ftbEl, ftbTarget);
  }, true);

  // Dismiss on Escape
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && ftbEl){
      removeFtb();
      if(document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
    }
  });

  /* --- RIGHT-CLICK CONTEXT MENU --- */
  var ctxMenu = null;
  var ctxTarget = null;
  function removeCtxMenu(){ if(ctxMenu){ ctxMenu.remove(); ctxMenu = null; } ctxTarget = null; }
  document.addEventListener('click', removeCtxMenu);
  document.addEventListener('scroll', removeCtxMenu, true);

  document.addEventListener('contextmenu', function(e){
    e.preventDefault();
    removeCtxMenu();
    var el = e.target;
    while(el && el !== document.body){
      if(el.tagName && /^(H[1-6]|P|SPAN|A|LI|BUTTON|LABEL|TD|TH|TR|TABLE|DIV|IMG)$/i.test(el.tagName)) break;
      el = el.parentElement;
    }
    if(!el || el === document.body) return;
    ctxTarget = el;

    var menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.style.cssText = 'position:fixed;z-index:99999;background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:4px 0;min-width:160px;box-shadow:0 8px 24px rgba(0,0,0,0.4);font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    function addItem(label, icon, fn){
      var item = document.createElement('div');
      item.style.cssText = 'padding:6px 12px;color:#e0e0e0;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:8px;';
      item.innerHTML = '<span style="opacity:0.6;font-size:13px;">' + icon + '</span>' + label;
      item.addEventListener('mouseenter', function(){ item.style.background = '#333'; });
      item.addEventListener('mouseleave', function(){ item.style.background = 'none'; });
      item.addEventListener('click', function(ev){ ev.stopPropagation(); removeCtxMenu(); fn(); });
      menu.appendChild(item);
    }
    function addSep(){
      var sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:#333;margin:4px 0;';
      menu.appendChild(sep);
    }

    /* Edit text — focus the element */
    if(el.isContentEditable || /^(H[1-6]|P|SPAN|A|LI|BUTTON|LABEL)$/i.test(el.tagName)){
      addItem('Edit Text', '✏️', function(){
        el.contentEditable = 'true';
        el.focus();
        var range = document.createRange();
        range.selectNodeContents(el);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });
    }

    /* Copy text */
    if(el.textContent && el.textContent.trim()){
      addItem('Copy Text', '📋', function(){
        navigator.clipboard.writeText(el.textContent.trim()).catch(function(){});
      });
    }

    addSep();

    /* Duplicate element */
    addItem('Duplicate', '⧉', function(){
      var cloned = el.cloneNode(true);
      el.parentNode.insertBefore(cloned, el.nextSibling);
      syncHtml();
    });

    /* Delete element */
    addItem('Delete', '🗑️', function(){
      el.remove();
      syncHtml();
    });

    document.body.appendChild(menu);
    ctxMenu = menu;

    /* Keep menu in viewport */
    var rect = menu.getBoundingClientRect();
    if(rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if(rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
  });

  /* --- SECTION DETECTION --- */
  var sections = [];
  var walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_COMMENT, null, false);
  var node;
  while(node = walker.nextNode()){
    var val = node.nodeValue.trim();
    var match = val.match(/^SECTION:\\s*(.+)/i);
    if(match){
      var name = match[1].trim();
      var el = node.nextElementSibling;
      if(el) sections.push({ name: name, el: el, comment: node });
    }
  }

  if(sections.length > 0){
    var container = sections[0].el.parentElement;
    sections.forEach(function(sec){
      var el = sec.el;
      el.style.position = 'relative';
      el.classList.add('section-wrap');
      el.setAttribute('data-section-name', sec.name);

      var bar = document.createElement('div');
      bar.className = 'section-handle-bar section-drag-handle';
      bar.innerHTML = '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:14px;cursor:grab;">⠿</span><span>' + sec.name + '</span></div><div style="display:flex;gap:2px;"><button class="sec-dup" title="Duplicate">⧉</button><button class="sec-del" title="Delete">✕</button></div>';
      el.insertBefore(bar, el.firstChild);

      bar.querySelector('.sec-dup').addEventListener('click', function(e){
        e.stopPropagation();
        window.parent.postMessage({ type: 'sectionDuplicated', sectionName: sec.name }, '*');
      });
      bar.querySelector('.sec-del').addEventListener('click', function(e){
        e.stopPropagation();
        el.remove();
        syncHtml();
        window.parent.postMessage({ type: 'sectionDeleted', sectionName: sec.name }, '*');
      });
    });

    /* --- SORTABLEJS --- */
    if(container && typeof Sortable !== 'undefined'){
      Sortable.create(container, {
        handle: '.section-drag-handle',
        animation: 150,
        ghostClass: 'section-drag-ghost',
        onEnd: function(evt){
          var newOrder = [];
          container.querySelectorAll('[data-section-name]').forEach(function(el){
            newOrder.push(el.dataset.sectionName);
          });
          syncHtml();
          window.parent.postMessage({
            type: 'sectionReordered',
            newOrder: newOrder,
            movedSection: evt.item.dataset.sectionName,
            fromIndex: evt.oldIndex,
            toIndex: evt.newIndex
          }, '*');
        }
      });
    }
  }
})();
<\/script></body>`
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
          {isSyncing && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" /> Syncing…
            </span>
          )}
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
          {campaign?.html && (
            <div className="flex items-center gap-1 mr-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleUndo} disabled={!canUndo} title="Undo">
                <Undo2 className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRedo} disabled={redoStack.length === 0} title="Redo">
                <Redo2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
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

          {campaign?.html && (
            <>
              <Button variant="outline" size="sm" onClick={exportHtml} className="active:scale-[0.98] transition-all">
                <Download className="w-3 h-3 mr-1" /> Export HTML
              </Button>
              <Button
                size="sm"
                onClick={() => navigate(`/brands/${brandId}/campaigns/${campaignId}/qa`)}
                className="active:scale-[0.98] transition-all"
              >
                <ClipboardCheck className="w-3 h-3 mr-1" /> Review & Send
              </Button>
            </>
          )}
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
                    sandbox="allow-same-origin allow-scripts allow-forms"
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
                {/* Import from ClickUp */}
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Link2 className="w-3 h-3" /> Import from ClickUp (optional)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={clickupUrl}
                      onChange={(e) => setClickupUrl(e.target.value)}
                      placeholder="Paste ClickUp task URL..."
                      className="bg-card border-border text-sm"
                      onKeyDown={(e) => e.key === "Enter" && importFromClickUp()}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={importFromClickUp}
                      disabled={!clickupUrl.trim() || clickupLoading}
                      className="shrink-0"
                    >
                      {clickupLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Import"}
                    </Button>
                  </div>
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
                        // Variant messages don't count as edit versions
                        if (msg.message_type === "variants" && msg.variant_data) {
                          const isThisMsgGenerating = ideateMessageId === msg.id && msg.variant_data.variants.length === 0;
                          const showPill = ideateMessageId === msg.id || msg.variant_data.variants.length > 0;
                          const pillState = isThisMsgGenerating ? "thinking" : "done";
                          const pillEl = showPill ? (
                            <div className="flex justify-start my-2">
                              <div
                                className="relative rounded-full px-6 py-2 text-xs font-medium flex items-center gap-2.5 overflow-hidden"
                                style={{
                                  background: pillState === "done"
                                    ? 'linear-gradient(135deg, rgba(200,241,53,0.12), rgba(99,102,241,0.06))'
                                    : 'linear-gradient(135deg, rgba(200,241,53,0.08), rgba(99,102,241,0.08))',
                                  border: '1px solid rgba(200,241,53,0.2)',
                                  ...(pillState === "thinking" ? { animation: 'ideate-pill-pulse 2s ease-in-out infinite' } : {}),
                                }}
                              >
                                {pillState === "thinking" && (
                                  <span
                                    className="absolute inset-0 rounded-full opacity-40"
                                    style={{
                                      background: 'linear-gradient(90deg, transparent, rgba(200,241,53,0.15), transparent)',
                                      animation: 'ideate-pill-shimmer 2s ease-in-out infinite',
                                    }}
                                  />
                                )}
                                <Zap className="relative w-3 h-3" style={{ color: 'rgba(200,241,53,0.9)' }} />
                                <span className="relative" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                  {pillState === "thinking" ? (
                                    <>Generating options<span className="inline-block w-4 text-left animate-pulse">...</span></>
                                  ) : "Options generated"}
                                </span>
                              </div>
                            </div>
                          ) : null;
                          return (
                            <div key={msg.id}>
                              {pillEl}
                              <div className="flex justify-start">
                                <div className="max-w-[90%] rounded-lg px-3 py-2 bg-card text-foreground">
                                  <VariantCards
                                    variantData={msg.variant_data}
                                    onApply={(variant, idx) => handleApplyVariant(variant, idx, msg.id)}
                                    onPreview={(variant, idx) => handlePreviewVariant(variant, idx, msg.id)}
                                    onPreviewClear={handlePreviewClear}
                                    onMore={() => handleMoreVariants(msg.id)}
                                    loadingMore={loadingMoreVariants === msg.id}
                                    disabled={agentState !== "idle"}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        }
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
                  {/* Ideate indicator pill (shown while thinking, before variants arrive) */}
                  {ideateActive && !ideateMessageId && (
                    <div className="flex justify-start my-2">
                      <div
                        className="relative rounded-full px-6 py-2 text-xs font-medium flex items-center gap-2.5 overflow-hidden"
                        style={{
                          background: 'linear-gradient(135deg, rgba(200,241,53,0.08), rgba(99,102,241,0.08))',
                          border: '1px solid rgba(200,241,53,0.2)',
                          animation: 'ideate-pill-pulse 2s ease-in-out infinite',
                        }}
                      >
                        <span
                          className="absolute inset-0 rounded-full opacity-40"
                          style={{
                            background: 'linear-gradient(90deg, transparent, rgba(200,241,53,0.15), transparent)',
                            animation: 'ideate-pill-shimmer 2s ease-in-out infinite',
                          }}
                        />
                        <Zap className="relative w-3 h-3" style={{ color: 'rgba(200,241,53,0.9)' }} />
                        <span className="relative" style={{ color: 'rgba(255,255,255,0.6)' }}>
                          Generating options<span className="inline-block w-4 text-left animate-pulse">...</span>
                        </span>
                      </div>
                    </div>
                  )}
                  {/* Agent state indicator (non-ideate) */}
                  {agentState !== "idle" && !streamingText && !ideateActive && (
                    <div className="flex justify-start my-2">
                      <div
                        className="relative rounded-full px-6 py-2 text-xs font-medium flex items-center gap-2.5 overflow-hidden"
                        style={{
                          background: 'linear-gradient(135deg, rgba(200,241,53,0.08), rgba(99,102,241,0.08))',
                          border: '1px solid rgba(200,241,53,0.2)',
                          animation: 'ideate-pill-pulse 2s ease-in-out infinite',
                        }}
                      >
                        <span
                          className="absolute inset-0 rounded-full opacity-40"
                          style={{
                            background: 'linear-gradient(90deg, transparent, rgba(200,241,53,0.15), transparent)',
                            animation: 'ideate-pill-shimmer 2s ease-in-out infinite',
                          }}
                        />
                        <Zap className="relative w-3 h-3" style={{ color: 'rgba(200,241,53,0.9)' }} />
                        <span className="relative" style={{ color: 'rgba(255,255,255,0.6)' }}>
                          {agentState === "thinking" ? "Thinking" : "Editing"}
                          <span className="inline-block w-4 text-left animate-pulse">...</span>
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>



                {/* Quick prompt chips */}
                {campaign?.html && agentState === "idle" && !sending && (
                  <div className="px-4 pt-2 flex gap-1.5 flex-wrap">
                    {["3 headline ideas", "CTA alternatives", "Vary the tone"].map((chip) => (
                      <button
                        key={chip}
                        onClick={() => { setChatInput(chip); }}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                      >
                        {chip}
                      </button>
                    ))}
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
                      data-send-btn
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