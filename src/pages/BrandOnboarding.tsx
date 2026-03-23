import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, ArrowRight, ArrowLeft, ChevronRight, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Campaign } from "@/lib/types";

interface FeedbackAnswer {
  question: string;
  sentiment?: "positive" | "negative";
  text: string;
}

const FEEDBACK_QUESTIONS = [
  "How do you feel about the overall design direction?",
  "Any changes to colors or typography?",
  "How's the copy tone and voice?",
  "Anything specific you'd like changed?",
];

export default function BrandOnboarding() {
  const { brandId } = useParams<{ brandId: string }>();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentCampaign, setCurrentCampaign] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [allAnswers, setAllAnswers] = useState<Record<string, FeedbackAnswer[]>>({});
  const [completedCampaigns, setCompletedCampaigns] = useState<Set<string>>(new Set());
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(800);

  useEffect(() => {
    if (!brandId) return;
    const load = async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: true });
      const campaignData = (data || []) as Campaign[];
      setCampaigns(campaignData);
      // Initialize answers for each campaign
      const initial: Record<string, FeedbackAnswer[]> = {};
      campaignData.forEach((c) => {
        initial[c.id] = FEEDBACK_QUESTIONS.map((q) => ({ question: q, text: "" }));
      });
      setAllAnswers(initial);
      setLoading(false);
    };
    load();

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: true });
      if (data) {
        setCampaigns(data as Campaign[]);
        // Add any new campaign IDs to answers
        setAllAnswers((prev) => {
          const updated = { ...prev };
          data.forEach((c: any) => {
            if (!updated[c.id]) {
              updated[c.id] = FEEDBACK_QUESTIONS.map((q) => ({ question: q, text: "" }));
            }
          });
          return updated;
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [brandId]);

  const allReady = campaigns.length > 0 && campaigns.every((c) => c.status === "ready" || c.status === "error");
  const activeCampaign = campaigns[currentCampaign];
  const campaignAnswers = activeCampaign ? allAnswers[activeCampaign.id] : undefined;

  // Measure iframe content height
  useEffect(() => {
    if (!activeCampaign?.html) return;
    const timer = setTimeout(() => {
      try {
        const doc = iframeRef.current?.contentDocument;
        if (doc?.body) {
          setIframeHeight(doc.body.scrollHeight || 800);
        }
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [activeCampaign?.html, currentCampaign]);

  const updateCurrentAnswer = (update: Partial<FeedbackAnswer>) => {
    if (!activeCampaign) return;
    setAllAnswers((prev) => {
      const updated = { ...prev };
      const answers = [...(updated[activeCampaign.id] || [])];
      answers[currentQuestion] = { ...answers[currentQuestion], ...update };
      updated[activeCampaign.id] = answers;
      return updated;
    });
  };

  const handleNext = () => {
    if (currentQuestion < FEEDBACK_QUESTIONS.length - 1) {
      setCurrentQuestion((q) => q + 1);
    } else {
      // Mark this campaign as reviewed
      if (activeCampaign) {
        setCompletedCampaigns((prev) => new Set([...prev, activeCampaign.id]));
      }
      // Move to next campaign
      if (currentCampaign < campaigns.length - 1) {
        setCurrentCampaign((c) => c + 1);
        setCurrentQuestion(0);
      }
    }
  };

  const goToCampaign = (index: number) => {
    setCurrentCampaign(index);
    setCurrentQuestion(0);
  };

  const addAttachments = (files: File[]) => {
    setAttachments((prev) => [...prev, ...files]);
    setAttachmentPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
  };

  const removeAttachment = (index: number) => {
    URL.revokeObjectURL(attachmentPreviews[index]);
    setAttachments((prev) => prev.filter((_, i) => i !== index));
    setAttachmentPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const allCampaignsReviewed = campaigns.length > 0 && campaigns.every((c) => completedCampaigns.has(c.id));

  const submitFeedback = async () => {
    if (!brandId) return;
    setSubmitting(true);
    try {
      const attachmentUrls: string[] = [];
      for (const file of attachments) {
        const path = `feedback/${brandId}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from("brand-assets").upload(path, file);
        if (!error) {
          const { data } = supabase.storage.from("brand-assets").getPublicUrl(path);
          attachmentUrls.push(data.publicUrl);
        }
      }

      await supabase.from("brand_feedback").insert({
        brand_id: brandId,
        round: 1,
        feedback: { answers: allAnswers } as any,
        attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : null,
      });

      const { error } = await supabase.functions.invoke("refine-brand", {
        body: { brandId, feedback: allAnswers, attachmentUrls },
      });

      if (error) throw error;

      toast.success("Feedback submitted! Brand profile updated.");
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  // Inject CSS to prevent scrollbar & enforce box-sizing in iframe
  const getIframeSrcDoc = (html: string) => {
    const cssOverride = `<style>
      html, body { margin:0; padding:0; overflow:hidden !important; }
      *, *::before, *::after { box-sizing: border-box !important; }
      table { max-width: 100% !important; }
      ::-webkit-scrollbar { display: none !important; }
    </style>`;
    if (html.includes("<head>")) {
      return html.replace("<head>", `<head>${cssOverride}`);
    }
    return cssOverride + html;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Generating state
  if (!allReady) {
    const readyCount = campaigns.filter((c) => c.status === "ready").length;
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <h2 className="text-lg font-semibold">Generating your campaigns...</h2>
        <p className="text-sm text-muted-foreground">
          {readyCount} of {campaigns.length} ready — this usually takes 30–60 seconds
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold">Brand profile updated!</h2>
        <p className="text-sm text-muted-foreground">Your feedback has been applied. Future campaigns will reflect your preferences.</p>
        <Button onClick={() => navigate(`/brands/${brandId}`)} className="mt-2">
          Go to Campaigns <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Review Your Campaigns</h1>
          <p className="text-sm text-muted-foreground">
            Campaign {currentCampaign + 1} of {campaigns.length}
            {activeCampaign && ` — ${activeCampaign.name}`}
          </p>
        </div>
        <Button variant="ghost" onClick={() => navigate(`/brands/${brandId}`)} className="text-muted-foreground text-sm">
          Skip feedback <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Campaign preview — left/main area */}
        <div className="flex-1 flex flex-col items-center overflow-y-auto py-6 px-4 bg-muted/30">
          {/* Campaign navigation */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => goToCampaign(Math.max(0, currentCampaign - 1))}
              disabled={currentCampaign === 0}
              className="p-2 rounded-full border border-border bg-card hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            {/* Dot indicators */}
            <div className="flex gap-2">
              {campaigns.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => goToCampaign(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-colors ${
                    i === currentCampaign
                      ? "bg-primary"
                      : completedCampaigns.has(c.id)
                      ? "bg-primary/40"
                      : "bg-border"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={() => goToCampaign(Math.min(campaigns.length - 1, currentCampaign + 1))}
              disabled={currentCampaign === campaigns.length - 1}
              className="p-2 rounded-full border border-border bg-card hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Status badge */}
          {activeCampaign && activeCampaign.status === "error" && (
            <Badge variant="destructive" className="mb-3 text-xs">Generation failed</Badge>
          )}

          {/* Iframe preview */}
          {activeCampaign?.html ? (
            <div
              className="bg-white rounded-lg shadow-sm border border-border"
              style={{ width: 470, maxWidth: "100%" }}
            >
              <iframe
                ref={iframeRef}
                srcDoc={getIframeSrcDoc(activeCampaign.html)}
                sandbox="allow-same-origin"
                className="border-0"
                style={{
                  width: 470,
                  height: iframeHeight,
                  maxWidth: "100%",
                  display: "block",
                }}
                title={activeCampaign.name}
                onLoad={() => {
                  try {
                    const doc = iframeRef.current?.contentDocument;
                    if (doc?.body) {
                      setIframeHeight(doc.body.scrollHeight || 800);
                    }
                  } catch {}
                }}
              />
            </div>
          ) : activeCampaign?.status === "error" ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              This campaign failed to generate.
            </div>
          ) : null}
        </div>

        {/* Feedback panel — right side */}
        <div className="w-full lg:w-[380px] border-t lg:border-t-0 lg:border-l border-border bg-card flex flex-col shrink-0">
          <div className="p-5 border-b border-border">
            <h2 className="text-sm font-semibold mb-1">Feedback for Campaign {currentCampaign + 1}</h2>
            <div className="flex gap-1">
              {FEEDBACK_QUESTIONS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i < currentQuestion
                      ? "bg-primary"
                      : i === currentQuestion
                      ? "bg-primary/60"
                      : "bg-border"
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex-1 p-5 flex flex-col">
            {campaignAnswers && (
              <div className="flex-1 flex flex-col">
                <p className="text-sm font-medium mb-4">
                  {campaignAnswers[currentQuestion]?.question}
                </p>

                {/* Sentiment buttons */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => updateCurrentAnswer({ sentiment: "positive" })}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all ${
                      campaignAnswers[currentQuestion]?.sentiment === "positive"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4" /> Looks good
                  </button>
                  <button
                    onClick={() => updateCurrentAnswer({ sentiment: "negative" })}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all ${
                      campaignAnswers[currentQuestion]?.sentiment === "negative"
                        ? "border-destructive bg-destructive/10 text-destructive"
                        : "border-border text-muted-foreground hover:border-destructive/30"
                    }`}
                  >
                    <ThumbsDown className="w-4 h-4" /> Needs work
                  </button>
                </div>

                {/* Text input */}
                <Textarea
                  value={campaignAnswers[currentQuestion]?.text || ""}
                  onChange={(e) => updateCurrentAnswer({ text: e.target.value })}
                  placeholder="Optional details..."
                  className="bg-background border-border min-h-[80px] flex-1 resize-none"
                />

                {/* Next / complete button */}
                <Button
                  onClick={handleNext}
                  className="mt-4 w-full"
                >
                  {currentQuestion < FEEDBACK_QUESTIONS.length - 1 ? (
                    <>Next Question <ChevronRight className="w-4 h-4 ml-1" /></>
                  ) : currentCampaign < campaigns.length - 1 ? (
                    <>Next Campaign <ArrowRight className="w-4 h-4 ml-1" /></>
                  ) : (
                    "Finish Review"
                  )}
                </Button>
              </div>
            )}

            {/* Attachments section — only show after all reviewed */}
            {allCampaignsReviewed && (
              <div className="mt-4 pt-4 border-t border-border space-y-3">
                <p className="text-sm font-medium">Reference images (optional)</p>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => document.getElementById("feedback-upload")?.click()}
                >
                  <Upload className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Drop or click to upload</p>
                  <input
                    id="feedback-upload"
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp"
                    onChange={(e) => e.target.files && addAttachments(Array.from(e.target.files))}
                    className="hidden"
                  />
                </div>
                {attachmentPreviews.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {attachmentPreviews.map((src, i) => (
                      <div key={i} className="relative w-12 h-12 rounded overflow-hidden border border-border group">
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeAttachment(i)}
                          className="absolute top-0 right-0 bg-background/80 rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  onClick={submitFeedback}
                  disabled={submitting}
                  className="w-full"
                >
                  {submitting ? "Submitting..." : "Submit All Feedback & Refine"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
