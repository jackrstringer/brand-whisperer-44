import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Msg {
  role: "user" | "assistant" | "system";
  content: string;
  ts?: string;
}

interface Props {
  flowId: string;
  brandId: string;
  flowType: string;
  initialMessages: Msg[];
  currentSkeleton: string | null;
  onSkeletonUpdated: () => void;
}

export function FlowAgentChat({
  flowId,
  brandId,
  flowType,
  initialMessages,
  currentSkeleton,
  onSkeletonUpdated,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuf, setStreamBuf] = useState("");
  const initFired = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-init if no messages yet
  useEffect(() => {
    if (initFired.current) return;
    if (initialMessages.length === 0 && !streaming) {
      initFired.current = true;
      sendMessage("__FLOW_INIT__", true);
    } else {
      initFired.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamBuf]);

  const sendMessage = async (text: string, isInit = false) => {
    if (streaming) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!isInit) {
      setMessages((m) => [...m, { role: "user", content: trimmed }]);
      setInput("");
    }
    setStreaming(true);
    setStreamBuf("");

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co/flow-agent`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          flow_id: flowId,
          brand_id: brandId,
          flow_type: flowType,
          message: trimmed,
          current_skeleton: currentSkeleton,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Agent error: ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let full = "";
      let skeletonUpdated = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "text") {
              full += evt.content;
              setStreamBuf(full);
            } else if (evt.type === "done") {
              skeletonUpdated = !!evt.skeleton_updated;
            } else if (evt.type === "error") {
              throw new Error(evt.error);
            }
          } catch (e) {
            console.error("parse err", e);
          }
        }
      }

      setMessages((m) => [
        ...m,
        ...(isInit && initialMessages.length === 0 ? [] : []),
        { role: "assistant", content: full },
      ]);
      setStreamBuf("");
      if (skeletonUpdated) onSkeletonUpdated();
    } catch (err: any) {
      console.error("[FlowAgentChat]", err);
      setMessages((m) => [
        ...m,
        { role: "system", content: `⚠️ Error: ${err.message || "Unknown error"}` },
      ]);
      setStreamBuf("");
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && !streaming && (
          <div className="text-sm text-muted-foreground text-center py-8">
            Starting agent…
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} content={m.content} />
        ))}
        {streaming && streamBuf && <MessageBubble role="assistant" content={streamBuf} streaming />}
        {streaming && !streamBuf && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
          </div>
        )}
      </div>
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Reply to the agent…"
            disabled={streaming}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            className="min-h-[60px] max-h-[160px] resize-none"
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={streaming || !input.trim()}
            size="icon"
            className="h-auto self-stretch"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  streaming,
}: {
  role: string;
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === "user";
  const isSystem = role === "system";
  if (isSystem) {
    return (
      <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 rounded-lg px-3 py-2">
        {content}
      </div>
    );
  }
  // Hide raw flow-skeleton blocks from chat — the visualizer renders them.
  const cleanContent = content.replace(/```flow-skeleton[\s\S]*?```/g, "_(skeleton updated — see the canvas)_");
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        <div className="prose prose-sm dark:prose-invert max-w-none [&>*]:my-1.5">
          <ReactMarkdown>{cleanContent}</ReactMarkdown>
        </div>
        {streaming && <span className="inline-block w-1.5 h-3 bg-current ml-0.5 animate-pulse" />}
      </div>
    </div>
  );
}
