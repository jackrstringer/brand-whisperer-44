import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ChatPanelProps {
  flowId: string;
  brandId: string;
  flowType: string;
  initialMessages: any[];
  onSkeletonUpdated: () => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED = [
  "Build a welcome series with 3 emails and a conditional split",
  "Add a 3-day delay after the first email",
  "What's underperforming in this flow?",
  "Add a sunset path for unengaged subscribers",
];

export function ChatPanel({ flowId, brandId, flowType, initialMessages, onSkeletonUpdated }: ChatPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>(
    Array.isArray(initialMessages) ? initialMessages : []
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending]);

  const send = async (text: string) => {
    if (!text.trim() || sending) return;
    setError(null);
    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    setMessages((m) => [...m, userMsg]);
    setDraft("");
    setSending(true);
    try {
      const { data, error: e } = await supabase.functions.invoke("flow-agent", {
        body: {
          flowId,
          brandId,
          flowType,
          messages: [...messages, userMsg],
        },
      });
      if (e) throw e;
      const reply: ChatMessage = {
        role: "assistant",
        content: data?.reply || data?.assistant || "(no reply)",
      };
      setMessages((m) => [...m, reply]);
      if (data?.skeletonUpdated) onSkeletonUpdated();
    } catch (err: any) {
      setError(err.message || "Chat failed");
    } finally {
      setSending(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="absolute top-1/2 -translate-y-1/2 right-0 w-12 z-20 flex flex-col items-center justify-center py-4 border-l border-t border-b rounded-l-lg hover:bg-foreground/5"
        style={{ background: "hsl(var(--flow-card))", borderColor: "hsl(var(--flow-border))" }}
        aria-label="Open chat"
      >
        <MessageSquare className="w-4 h-4 text-foreground/70" />
      </button>
    );
  }

  return (
    <aside
      className="absolute top-14 right-0 bottom-0 w-[420px] z-20 flex flex-col border-l"
      style={{ background: "hsl(var(--flow-card))", borderColor: "hsl(var(--flow-border))" }}
    >
      <div
        className="flex items-center justify-between px-4 h-11 border-b"
        style={{ borderColor: "hsl(var(--flow-border))" }}
      >
        <div className="text-[10px] uppercase tracking-[0.1em] text-foreground/55 font-semibold">
          AI Assistant
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="w-7 h-7 rounded-md flex items-center justify-center text-foreground/55 hover:bg-foreground/10"
          aria-label="Collapse"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="space-y-2">
            <div className="text-[11px] text-foreground/45 px-1">Try one of these:</div>
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="w-full text-left px-3 py-2 rounded-md border text-[12px] text-foreground/75 hover:border-foreground/35 hover:text-foreground transition-colors"
                style={{ borderColor: "hsl(var(--flow-border))" }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`px-3 py-2 rounded-lg text-[12.5px] leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "bg-[hsl(var(--flow-action))]/15 text-foreground ml-6"
                : "bg-foreground/5 text-foreground/85 mr-6"
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-[12px] text-foreground/55 px-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
          </div>
        )}
        {error && (
          <div className="px-3 py-2 rounded-lg text-[12px] bg-destructive/15 text-destructive border border-destructive/30">
            {error}
          </div>
        )}
      </div>

      <div
        className="p-3 border-t"
        style={{ borderColor: "hsl(var(--flow-border))" }}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={2}
            placeholder="Ask me to build, edit, or analyze…"
            className="flex-1 px-2.5 py-2 rounded-md text-[12.5px] outline-none resize-none"
            style={{
              background: "hsl(var(--flow-canvas))",
              border: "1px solid hsl(var(--flow-border))",
              color: "hsl(var(--foreground))",
            }}
          />
          <button
            onClick={() => send(draft)}
            disabled={sending || !draft.trim()}
            className="w-9 h-9 rounded-md bg-foreground text-background flex items-center justify-center hover:opacity-90 disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
