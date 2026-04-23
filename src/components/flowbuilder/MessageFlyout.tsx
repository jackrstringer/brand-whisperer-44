import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Monitor, Smartphone, Wand2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FlowCanvasNode, FlowNodeData, NODE_KIND_META } from "./types";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface MessageFlyoutProps {
  node: FlowCanvasNode | null;
  brandId: string;
  flowId: string;
  flowType: string;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<FlowNodeData>) => void;
}

const TABS = ["Preview", "Content", "Analytics", "Activity", "Notes"] as const;
type Tab = typeof TABS[number];

export function MessageFlyout({ node, brandId, flowId, flowType, onClose, onUpdate }: MessageFlyoutProps) {
  const [tab, setTab] = useState<Tab>("Preview");
  const [device, setDevice] = useState<"desktop" | "mobile">("mobile");
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(900);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setPreviewHeight(900);
  }, [node?.id, node?.data.html]);

  if (!node) return null;
  const d = node.data;
  const meta = NODE_KIND_META[d.kind];
  const Icon = meta.icon;
  const isMessage = d.kind === "email" || d.kind === "sms" || d.kind === "push";
  const canGenerate = d.kind === "email";
  const isBusy = isGenerating || d.generation_status === "generating";

  const pollCampaign = async (campaignId: string) => {
    for (let i = 0; i < 90; i += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const { data, error } = await supabase
        .from("campaigns")
        .select("html,status,last_error")
        .eq("id", campaignId)
        .single();
      if (error) throw error;
      if (data?.status === "ready" && data.html) return data.html;
      if (data?.status === "error") throw new Error(data.last_error || "Generation failed");
    }
    throw new Error("Generation is still running. Reopen this email in a moment.");
  };

  const ensureFlowEmail = async (campaignId: string) => {
    if (d.flow_email_id) {
      await supabase
        .from("flow_emails")
        .update({ campaign_id: campaignId, generation_status: "generating" })
        .eq("id", d.flow_email_id);
      return d.flow_email_id;
    }

    const { data, error } = await supabase
      .from("flow_emails")
      .insert({
        brand_id: brandId,
        flow_id: flowId,
        campaign_id: campaignId,
        node_type: d.kind,
        label: d.label,
        job: d.job || null,
        notes: d.notes || null,
        subject_direction: d.subject_direction || null,
        sections: (d.sections as any) || null,
        node_config: (d.node_config as any) || {},
        sequence_index: Number(d.sequence_index || 0),
        generation_status: "generating",
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message || "Failed to save flow message");
    return data.id;
  };

  const handleGenerate = async () => {
    if (!canGenerate || isBusy) return;
    setIsGenerating(true);
    onUpdate(node.id, { generation_status: "generating" });

    try {
      const { data: campaign, error: campErr } = await supabase
        .from("campaigns")
        .insert({
          brand_id: brandId,
          name: d.label || "Flow Email",
          brief: d.job || d.notes || d.label || null,
          goal: flowType || "flow",
          extra_copy: d.notes || null,
          subject_line: d.subject_direction || null,
          status: "generating",
          campaign_mode: "flow",
          generation_started_at: new Date().toISOString(),
          flow_config: {
            flowId,
            nodeId: node.id,
            nodeType: d.kind,
            trigger: flowType,
          } as any,
        })
        .select("id")
        .single();

      if (campErr || !campaign) throw new Error(campErr?.message || "Failed to create campaign");

      const flowEmailId = await ensureFlowEmail(campaign.id);
      onUpdate(node.id, { campaign_id: campaign.id, flow_email_id: flowEmailId, generation_status: "generating" });

      const session = (await supabase.auth.getSession()).data.session;
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-campaign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          brandId,
          campaignId: campaign.id,
          brief: d.job || d.notes || d.label,
          goal: flowType || "flow",
          copy: d.notes || undefined,
          subjectLine: d.subject_direction || undefined,
          campaignMode: "flow",
          flowConfig: { flowId, nodeId: node.id, nodeType: d.kind, trigger: flowType },
        }),
      });

      if (!resp.ok && resp.status !== 202) throw new Error(await resp.text());

      const html = await pollCampaign(campaign.id);
      await supabase
        .from("flow_emails")
        .update({ html, campaign_id: campaign.id, generation_status: "complete" })
        .eq("id", flowEmailId);
      onUpdate(node.id, { html, campaign_id: campaign.id, flow_email_id: flowEmailId, generation_status: "complete" });
      setTab("Preview");
      toast.success("Flow email generated");
    } catch (err: any) {
      onUpdate(node.id, { generation_status: "failed" });
      toast.error(err?.message || "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      className="absolute top-14 right-0 bottom-0 w-[560px] z-30 flex flex-col border-l border-border bg-card shadow-xl"
      style={{ animation: "peekSlide 200ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
    >
      <div className="flex items-center justify-between px-4 h-12 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="h-7 w-7">
            <X className="w-3.5 h-3.5" />
          </Button>
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <Icon className="w-3.5 h-3.5 text-foreground/70" strokeWidth={2} />
          </div>
          <span className="text-[13px] font-semibold tracking-tight text-foreground truncate">
            {d.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {canGenerate && (
            <Button size="sm" onClick={handleGenerate} disabled={isBusy} className="h-7 gap-1.5 text-[11px]">
              {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              {d.html ? "Regenerate" : "Generate"}
            </Button>
          )}
          {isMessage && d.campaign_id && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/brands/${brandId}/campaigns/${d.campaign_id}`)}
              className="h-7 gap-1 text-[11px]"
            >
              Edit
              <ExternalLink className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex border-b border-border px-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 h-9 text-[11.5px] font-medium border-b-2 transition-colors -mb-px",
              tab === t
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "Preview" && (
          <div className="p-4">
            {d.kind === "email" ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-mono font-semibold">
                    Preview
                  </span>
                  <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 bg-background">
                    <button
                      onClick={() => setDevice("mobile")}
                      className={cn(
                        "w-7 h-6 rounded flex items-center justify-center transition-colors",
                        device === "mobile" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Smartphone className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setDevice("desktop")}
                      className={cn(
                        "w-7 h-6 rounded flex items-center justify-center transition-colors",
                        device === "desktop" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Monitor className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {d.html ? (
                  <iframe
                    title="Email preview"
                    srcDoc={d.html}
                    sandbox="allow-same-origin"
                    onLoad={(e) => {
                      const doc = e.currentTarget.contentDocument;
                      const height = Math.max(
                        doc?.documentElement?.scrollHeight || 0,
                        doc?.body?.scrollHeight || 0,
                        900,
                      );
                      setPreviewHeight(height + 24);
                    }}
                    style={{
                      width: device === "mobile" ? 390 : "100%",
                      height: previewHeight,
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      background: "white",
                      margin: device === "mobile" ? "0 auto" : 0,
                      display: "block",
                    }}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center text-[12px] text-muted-foreground">
                    No HTML yet — generate this email to see the preview.
                  </div>
                )}
              </>
            ) : (
              <div className="text-[12px] text-muted-foreground">
                Preview not yet supported for this node type.
              </div>
            )}
          </div>
        )}

        {tab === "Content" && (
          <div className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Label</Label>
              <Input value={d.label} onChange={(e) => onUpdate(node.id, { label: e.target.value })} className="h-8 text-[12px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Subject Direction</Label>
              <Input
                value={d.subject_direction || ""}
                onChange={(e) => onUpdate(node.id, { subject_direction: e.target.value })}
                className="h-8 text-[12px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Job</Label>
              <Textarea
                value={d.job || ""}
                onChange={(e) => onUpdate(node.id, { job: e.target.value })}
                rows={3}
                className="text-[12px] resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Notes</Label>
              <Textarea
                value={d.notes || ""}
                onChange={(e) => onUpdate(node.id, { notes: e.target.value })}
                rows={4}
                className="text-[12px] resize-none"
              />
            </div>
          </div>
        )}

        {tab === "Analytics" && (
          <div className="p-4 text-[12px] text-muted-foreground">
            Analytics will populate once this flow is live and Klaviyo data is wired.
          </div>
        )}

        {tab === "Activity" && (
          <div className="p-4 text-[12px] text-muted-foreground">No activity yet.</div>
        )}

        {tab === "Notes" && d.flow_email_id && (
          <NotesTab flowEmailId={d.flow_email_id} flowId={node.id} />
        )}
        {tab === "Notes" && !d.flow_email_id && (
          <div className="p-4 text-[12px] text-muted-foreground">
            Notes are available after this node is saved as a flow message.
          </div>
        )}
      </div>
    </div>
  );
}

function NotesTab({ flowEmailId, flowId }: { flowEmailId: string; flowId: string }) {
  const [comments, setComments] = useState<any[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("flow_node_comments")
        .select("*")
        .eq("flow_email_id", flowEmailId)
        .order("created_at", { ascending: true });
      if (!cancelled) setComments(data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [flowEmailId]);

  const post = async () => {
    if (!draft.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("flow_node_comments")
      .insert({
        flow_email_id: flowEmailId,
        flow_id: flowId,
        author_id: user.id,
        author_name: user.email || "User",
        content: draft.trim(),
      })
      .select()
      .single();
    if (error) return;
    setComments((c) => [...c, data]);
    setDraft("");
  };

  return (
    <div className="p-4 space-y-3">
      {comments.length === 0 && (
        <div className="text-[12px] text-muted-foreground">No notes yet.</div>
      )}
      {comments.map((c) => (
        <div key={c.id} className="text-[12px]">
          <div className="text-muted-foreground mb-0.5">
            <span className="font-semibold text-foreground/85">{c.author_name || "User"}</span>
            {" · "}
            {new Date(c.created_at).toLocaleString()}
          </div>
          <div className="text-foreground/90">{c.content}</div>
        </div>
      ))}
      <div className="pt-2 border-t border-border">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Add a note…"
          className="text-[12px] resize-none"
        />
        <Button onClick={post} size="sm" className="mt-2 h-7 text-[11px]">
          Post
        </Button>
      </div>
    </div>
  );
}
