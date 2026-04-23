import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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
  const [expanded, setExpanded] = useState(false);
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
        className="absolute top-1/2 -translate-y-1/2 right-0 w-12 h-32 z-20 flex flex-col items-center justify-center gap-2 border-l border-t border-b border-border bg-card rounded-l-xl hover:bg-muted hover:border-foreground/30 hover:w-[52px] transition-all duration-200 shadow-sm hover:shadow-md"
        aria-label="Open AI assistant"
      >
        <Sparkles className="w-3.5 h-3.5 text-foreground/70" />
        <span
          className="text-[10px] uppercase tracking-[0.18em] font-mono font-semibold text-muted-foreground"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          AI
        </span>
      </button>
    );
  }

  return (
    <aside className="absolute top-14 right-0 bottom-0 w-[420px] z-20 flex flex-col border-l border-border bg-card shadow-xl">
      <div className="flex items-center justify-between px-4 h-11 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-foreground/70" />
          <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-mono font-semibold">
            AI Assistant
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setExpanded(false)} className="h-7 w-7" aria-label="Collapse">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="space-y-2">
            <div className="text-[11px] text-muted-foreground px-1 pb-1">Try one of these:</div>
            {SUGGESTED.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="w-full text-left px-3 py-2 rounded-lg border border-border bg-background text-[12px] text-foreground/80 hover:border-foreground/30 hover:bg-muted hover:text-foreground transition-all duration-150"
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
                ? "bg-foreground text-background ml-6"
                : "bg-muted text-foreground/90 mr-6"
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground px-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
          </div>
        )}
        {error && (
          <div className="px-3 py-2 rounded-lg text-[12px] bg-destructive/10 text-destructive border border-destructive/30">
            {error}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border">
        <div className="flex items-end gap-2">
          <Textarea
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
            className="flex-1 text-[12.5px] resize-none min-h-0"
          />
          <Button
            onClick={() => send(draft)}
            disabled={sending || !draft.trim()}
            size="icon"
            className="h-9 w-9 flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
