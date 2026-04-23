import { useEffect, useState } from "react";
import { X, Smartphone, Monitor } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FlowCanvasNode, FlowNodeData } from "./types";
import { useNavigate } from "react-router-dom";

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
  const isMessage = d.kind === "email" || d.kind === "sms" || d.kind === "push";

  return (
    <div
      className="absolute top-14 right-0 bottom-0 w-[560px] z-30 flex flex-col border-l shadow-2xl"
      style={{ background: "hsl(var(--flow-card))", borderColor: "hsl(var(--flow-border))" }}
    >
      <div
        className="flex items-center justify-between px-4 h-12 border-b"
        style={{ borderColor: "hsl(var(--flow-border))" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-foreground/55 hover:bg-foreground/10 hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <span className="text-[13px] font-mono font-semibold text-foreground truncate">
            {d.label}
          </span>
        </div>
        {isMessage && d.campaign_id && (
          <button
            onClick={() => navigate(`/brands/${brandId}/campaigns/${d.campaign_id}`)}
            className="text-[11px] text-[hsl(var(--flow-action))] hover:opacity-70"
          >
            Open in Editor →
          </button>
        )}
      </div>

      <div className="flex border-b" style={{ borderColor: "hsl(var(--flow-border))" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 h-9 text-[11.5px] font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-[hsl(var(--flow-select))] text-foreground"
                : "border-transparent text-foreground/55 hover:text-foreground/80"
            }`}
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
                  <span className="text-[10px] uppercase tracking-wider text-foreground/45 font-semibold">
                    Preview
                  </span>
                  <div className="flex items-center gap-1 rounded-md border p-0.5" style={{ borderColor: "hsl(var(--flow-border))" }}>
                    <button
                      onClick={() => setDevice("mobile")}
                      className={`w-7 h-6 rounded flex items-center justify-center ${
                        device === "mobile" ? "bg-foreground/10 text-foreground" : "text-foreground/45"
                      }`}
                    >
                      <Smartphone className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setDevice("desktop")}
                      className={`w-7 h-6 rounded flex items-center justify-center ${
                        device === "desktop" ? "bg-foreground/10 text-foreground" : "text-foreground/45"
                      }`}
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
                      border: "1px solid hsl(var(--flow-border))",
                      borderRadius: 8,
                      background: "white",
                      margin: device === "mobile" ? "0 auto" : 0,
                      display: "block",
                    }}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed p-8 text-center text-[12px] text-foreground/45" style={{ borderColor: "hsl(var(--flow-border))" }}>
                    No HTML yet — generate this email to see the preview.
                  </div>
                )}
              </>
            ) : (
              <div className="text-[12px] text-foreground/55">
                Preview not yet supported for this node type.
              </div>
            )}
          </div>
        )}

        {tab === "Content" && (
          <div className="p-4 space-y-3">
            <Field label="Label">
              <input
                value={d.label}
                onChange={(e) => onUpdate(node.id, { label: e.target.value })}
                className="fly-input"
              />
            </Field>
            <Field label="Subject Direction">
              <input
                value={d.subject_direction || ""}
                onChange={(e) => onUpdate(node.id, { subject_direction: e.target.value })}
                className="fly-input"
              />
            </Field>
            <Field label="Job">
              <textarea
                value={d.job || ""}
                onChange={(e) => onUpdate(node.id, { job: e.target.value })}
                rows={3}
                className="fly-input resize-none"
              />
            </Field>
            <Field label="Notes">
              <textarea
                value={d.notes || ""}
                onChange={(e) => onUpdate(node.id, { notes: e.target.value })}
                rows={4}
                className="fly-input resize-none"
              />
            </Field>
            <style>{`
              .fly-input {
                width: 100%;
                padding: 8px 10px;
                background: hsl(var(--flow-canvas));
                border: 1px solid hsl(var(--flow-border));
                border-radius: 6px;
                color: hsl(var(--foreground));
                font-size: 12.5px;
                outline: none;
              }
              .fly-input:focus { border-color: hsl(var(--flow-action)); }
            `}</style>
          </div>
        )}

        {tab === "Analytics" && (
          <div className="p-4 text-[12px] text-foreground/55">
            Analytics will populate once this flow is live and Klaviyo data is wired.
          </div>
        )}

        {tab === "Activity" && (
          <div className="p-4 text-[12px] text-foreground/55">
            No activity yet.
          </div>
        )}

        {tab === "Notes" && d.flow_email_id && (
          <NotesTab flowEmailId={d.flow_email_id} flowId={node.id /* placeholder */} />
        )}
        {tab === "Notes" && !d.flow_email_id && (
          <div className="p-4 text-[12px] text-foreground/55">
            Notes are available after this node is saved as a flow message.
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] text-foreground/45 font-semibold mb-1.5">
        {label}
      </div>
      {children}
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
        <div className="text-[12px] text-foreground/45">No notes yet.</div>
      )}
      {comments.map((c) => (
        <div key={c.id} className="text-[12px]">
          <div className="text-foreground/60 mb-0.5">
            <span className="font-semibold text-foreground/80">{c.author_name || "User"}</span>{" "}
            · {new Date(c.created_at).toLocaleString()}
          </div>
          <div className="text-foreground/85">{c.content}</div>
        </div>
      ))}
      <div className="pt-2 border-t" style={{ borderColor: "hsl(var(--flow-border))" }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Add a note…"
          className="w-full px-2.5 py-2 rounded-md text-[12px] outline-none resize-none"
          style={{
            background: "hsl(var(--flow-canvas))",
            border: "1px solid hsl(var(--flow-border))",
            color: "hsl(var(--foreground))",
          }}
        />
        <button
          onClick={post}
          className="mt-2 px-3 h-7 rounded-md text-[11px] font-medium bg-foreground text-background hover:opacity-90"
        >
          Post
        </button>
      </div>
    </div>
  );
}
