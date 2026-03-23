import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ThumbsUp, ThumbsDown, ArrowRight, Upload, X } from "lucide-react";
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
  const [answers, setAnswers] = useState<FeedbackAnswer[]>(
    FEEDBACK_QUESTIONS.map((q) => ({ question: q, text: "" }))
  );
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!brandId) return;
    const load = async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: true });
      setCampaigns((data || []) as Campaign[]);
      setLoading(false);
    };
    load();

    // Poll for campaign status updates
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("*")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: true });
      if (data) setCampaigns(data as Campaign[]);
    }, 5000);

    return () => clearInterval(interval);
  }, [brandId]);

  const allReady = campaigns.length > 0 && campaigns.every((c) => c.status === "ready" || c.status === "error");

  const updateAnswer = (index: number, update: Partial<FeedbackAnswer>) => {
    setAnswers((prev) => prev.map((a, i) => (i === index ? { ...a, ...update } : a)));
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

  const submitFeedback = async () => {
    if (!brandId) return;
    setSubmitting(true);
    try {
      // Upload attachments
      const attachmentUrls: string[] = [];
      for (const file of attachments) {
        const path = `feedback/${brandId}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from("brand-assets").upload(path, file);
        if (!error) {
          const { data } = supabase.storage.from("brand-assets").getPublicUrl(path);
          attachmentUrls.push(data.publicUrl);
        }
      }

      // Save feedback
      await supabase.from("brand_feedback").insert({
        brand_id: brandId,
        round: 1,
        feedback: { answers } as any,
        attachment_urls: attachmentUrls.length > 0 ? attachmentUrls : null,
      });

      // Call refine-brand edge function
      const { error } = await supabase.functions.invoke("refine-brand", {
        body: { brandId, feedback: answers, attachmentUrls },
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading campaigns...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold mb-2">Your Starter Campaigns</h1>
        <p className="text-muted-foreground mb-8">
          {allReady
            ? "Review your 3 starter campaigns and provide feedback to refine the design."
            : "Your campaigns are being generated. This usually takes 30-60 seconds."}
        </p>

        {/* Campaign previews */}
        <div className="grid md:grid-cols-3 gap-4 mb-12">
          {campaigns.map((c) => (
            <Card key={c.id} className="bg-card border-border overflow-hidden">
              <div className="p-3 border-b border-border flex items-center justify-between">
                <span className="text-sm font-medium truncate">{c.name}</span>
                <Badge className={`text-[10px] ${c.status === "ready" ? "bg-primary/20 text-primary" : c.status === "error" ? "bg-destructive/20 text-destructive" : "bg-yellow-500/20 text-yellow-400"}`}>
                  {c.status}
                </Badge>
              </div>
              <CardContent className="p-0">
                {c.status === "generating" ? (
                  <div className="p-6 space-y-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : c.html ? (
                  <div className="relative h-[300px] overflow-hidden">
                    <iframe
                      srcDoc={c.html}
                      sandbox="allow-same-origin"
                      className="border-0 w-[375px] h-[800px] bg-white"
                      style={{
                        transform: "scale(0.5)",
                        transformOrigin: "top left",
                      }}
                      title={c.name}
                    />
                  </div>
                ) : (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    {c.status === "error" ? "Generation failed" : "No preview available"}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Feedback section */}
        {allReady && !submitted && (
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold mb-6">Tell us what you think</h2>
            <div className="space-y-6">
              {answers.map((answer, i) => (
                <div key={i} className="space-y-2">
                  <p className="text-sm font-medium">{answer.question}</p>
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => updateAnswer(i, { sentiment: "positive" })}
                      className={`p-2 rounded border transition-all ${
                        answer.sentiment === "positive" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => updateAnswer(i, { sentiment: "negative" })}
                      className={`p-2 rounded border transition-all ${
                        answer.sentiment === "negative" ? "border-destructive bg-destructive/10 text-destructive" : "border-border text-muted-foreground hover:border-destructive/30"
                      }`}
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </button>
                  </div>
                  <Textarea
                    value={answer.text}
                    onChange={(e) => updateAnswer(i, { text: e.target.value })}
                    placeholder="Optional details..."
                    className="bg-card border-border min-h-[60px]"
                  />
                </div>
              ))}

              {/* Attachment uploads */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Attach reference images (optional)</p>
                <div
                  className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => document.getElementById("feedback-upload")?.click()}
                >
                  <Upload className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
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
                      <div key={i} className="relative w-16 h-16 rounded overflow-hidden border border-border group">
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
              </div>

              <Button
                onClick={submitFeedback}
                disabled={submitting}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {submitting ? "Submitting..." : "Submit Feedback & Refine"}
              </Button>
            </div>
          </div>
        )}

        {submitted && (
          <div className="max-w-2xl text-center space-y-4">
            <p className="text-lg font-medium">Brand profile updated!</p>
            <p className="text-sm text-muted-foreground">Your feedback has been applied. Future campaigns will reflect your preferences.</p>
            <Button onClick={() => navigate(`/brands/${brandId}`)} className="bg-primary text-primary-foreground hover:bg-primary/90">
              Go to Campaigns <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {!submitted && (
          <div className="mt-8">
            <Button variant="ghost" onClick={() => navigate(`/brands/${brandId}`)} className="text-muted-foreground">
              Skip feedback — go to campaigns <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
