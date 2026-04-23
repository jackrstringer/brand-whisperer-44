import { useEffect, useState } from "react";
import { X, Smartphone, Monitor, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FlowCanvasNode, FlowNodeData, NODE_KIND_META } from "./types";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface MessageFlyoutProps {
  node: FlowCanvasNode | null;
  brandId: string;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<FlowNodeData>) => void;
}

const TABS = ["Preview", "Content", "Analytics", "Activity", "Notes"] as const;
type Tab = typeof TABS[number];

export function MessageFlyout({ node, brandId, onClose, onUpdate }: MessageFlyoutProps) {
  const [tab, setTab] = useState<Tab>("Preview");
  const [device, setDevice] = useState<"desktop" | "mobile">("mobile");
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!node) return null;
  const d = node.data;
  const meta = NODE_KIND_META[d.kind];
  const Icon = meta.icon;
  const isMessage = d.kind === "email" || d.kind === "sms" || d.kind === "push";

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
        {isMessage && d.campaign_id && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/brands/${brandId}/campaigns/${d.campaign_id}`)}
            className="h-7 gap-1 text-[11px]"
          >
            Open in Editor
            <ExternalLink className="w-3 h-3" />
          </Button>
        )}
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
                    style={{
                      width: device === "mobile" ? 390 : "100%",
                      height: 600,
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
