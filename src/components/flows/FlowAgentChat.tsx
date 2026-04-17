import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Sparkles, BookOpen, BarChart3, Wand2, Check } from "lucide-react";
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
  /** When true, constrain chat to a centered, narrower column (used pre-skeleton). */
  centered?: boolean;
}

interface FlowQuestion {
  question: string;
  options?: string[];
  allow_other?: boolean;
}

interface FlowSynth {
  headline?: string;
  facts?: { label: string; value: string }[];
  plan?: string[];
}

const QUESTION_FENCE = /```flow-question\s*([\s\S]*?)```/;
const SYNTH_FENCE = /```flow-synth\s*([\s\S]*?)```/;
const SKELETON_FENCE = /```flow-skeleton[\s\S]*?```/;

function shouldAutoRestart(messages: Msg[], currentSkeleton: string | null): boolean {
  if (currentSkeleton || messages.length !== 1) return false;
  const [first] = messages;
  return first.role === "assistant" && QUESTION_FENCE.test(first.content);
}

function extractQuestion(content: string): FlowQuestion | null {
  const m = content.match(QUESTION_FENCE);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1].trim());
    if (parsed && typeof parsed.question === "string") return parsed as FlowQuestion;
  } catch {
    /* ignore */
  }
  return null;
}

function extractSynth(content: string): FlowSynth | null {
  const m = content.match(SYNTH_FENCE);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1].trim());
    if (parsed && typeof parsed === "object") return parsed as FlowSynth;
  } catch {
    /* ignore */
  }
  return null;
}

function stripFences(content: string): string {
  return content
    .replace(QUESTION_FENCE, "")
    .replace(SYNTH_FENCE, "")
    .replace(SKELETON_FENCE, "_(skeleton updated — see the canvas)_")
    .trim();
}

const STAGE_META: Record<string, { label: string; icon: typeof BookOpen }> = {
  reading: { label: "Reading brand research", icon: BookOpen },
  analyzing: { label: "Analyzing performance data", icon: BarChart3 },
  strategizing: { label: "Designing flow strategy", icon: Wand2 },
  drafting: { label: "Drafting your skeleton", icon: Sparkles },
};

const STAGE_ORDER = ["reading", "analyzing", "strategizing", "drafting"];

export function FlowAgentChat({
  flowId,
  brandId,
  flowType,
  initialMessages,
  currentSkeleton,
  onSkeletonUpdated,
  centered = false,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuf, setStreamBuf] = useState("");
  const [skeletonStreaming, setSkeletonStreaming] = useState(false);
  const [stages, setStages] = useState<{ key: string; status: "active" | "done" }[]>([]);
  const initFired = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initFired.current) return;
    if (shouldAutoRestart(initialMessages, currentSkeleton) && !streaming) {
      initFired.current = true;
      setMessages([]);
      sendMessage("__FLOW_RESTART__", true);
    } else if (initialMessages.length === 0 && !streaming) {
      initFired.current = true;
      sendMessage("__FLOW_INIT__", true);
    } else {
      initFired.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamBuf, stages]);

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
    setSkeletonStreaming(false);
    setStages([]);

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
      let firstTextReceived = false;
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
            if (evt.type === "progress") {
              setStages((prev) => {
                const next: { key: string; status: "active" | "done" }[] =
                  prev.map((s) => ({ key: s.key, status: "done" }));
                next.push({ key: evt.stage, status: "active" });
                return next;
              });
            } else if (evt.type === "text") {
              if (!firstTextReceived) {
                firstTextReceived = true;
                setStages((prev) => {
                  const next: { key: string; status: "active" | "done" }[] =
                    prev.map((s) => ({ key: s.key, status: "done" }));
                  next.push({ key: "drafting", status: "active" });
                  return next;
                });
              }
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

      setMessages((m) => [...m, { role: "assistant", content: full }]);
      setStreamBuf("");
      setStages([]);
      if (skeletonUpdated) onSkeletonUpdated();
    } catch (err: any) {
      console.error("[FlowAgentChat]", err);
      setMessages((m) => [
        ...m,
        { role: "system", content: `⚠️ Error: ${err.message || "Unknown error"}` },
      ]);
      setStreamBuf("");
      setStages([]);
    } finally {
      setStreaming(false);
    }
  };

  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  })();

  return (
    <div className="flex flex-col h-full bg-background">
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto px-5 py-6 ${
          centered ? "flex justify-center" : ""
        }`}
      >
        <div className={`w-full ${centered ? "max-w-2xl" : ""} space-y-4`}>
          {messages.map((m, i) => {
            const isLastAssistant = i === lastAssistantIdx;
            const question = m.role === "assistant" ? extractQuestion(m.content) : null;
            const synth = m.role === "assistant" ? extractSynth(m.content) : null;
            return (
              <MessageBubble
                key={i}
                role={m.role}
                content={m.content}
                question={question}
                synth={synth}
                showQuestionChips={isLastAssistant && !streaming}
                onAnswer={(answer) => sendMessage(answer)}
                disabled={streaming}
              />
            );
          })}
          {streaming && (streamBuf || stages.length > 0) && (
            <>
              {stages.length > 0 && !streamBuf && <ProgressStages stages={stages} />}
              {streamBuf && (
                <MessageBubble
                  role="assistant"
                  content={streamBuf}
                  streaming
                  question={extractQuestion(streamBuf)}
                  synth={extractSynth(streamBuf)}
                  showQuestionChips={false}
                  disabled
                />
              )}
            </>
          )}
          {streaming && !streamBuf && stages.length === 0 && (
            <ProgressStages stages={[{ key: "reading", status: "active" }]} />
          )}
        </div>
      </div>
      <div className={`border-t border-border p-3 ${centered ? "flex justify-center" : ""}`}>
        <div className={`flex gap-2 w-full ${centered ? "max-w-2xl" : ""}`}>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your answer…"
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

function ProgressStages({ stages }: { stages: { key: string; status: "active" | "done" }[] }) {
  // Show all stages up through the latest one — completed get a check, active gets a spinner.
  const latestIdx = STAGE_ORDER.indexOf(stages[stages.length - 1]?.key ?? "");
  const visible = STAGE_ORDER.slice(0, Math.max(latestIdx + 1, 1)).map((key) => {
    const found = stages.find((s) => s.key === key);
    const status = found?.status ?? "done";
    return { key, status };
  });

  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4 max-w-md animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
        <span className="text-xs font-medium text-foreground">Building your flow</span>
      </div>
      <div className="space-y-2">
        {visible.map((s) => {
          const meta = STAGE_META[s.key] || STAGE_META.reading;
          const Icon = meta.icon;
          const isActive = s.status === "active";
          return (
            <div
              key={s.key}
              className={`flex items-center gap-2.5 text-xs transition-opacity ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {isActive ? (
                  <Icon className="w-3 h-3 animate-pulse" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
              </span>
              <span className={isActive ? "font-medium" : ""}>{meta.label}</span>
              {isActive && <PulseDots />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PulseDots() {
  return (
    <span className="inline-flex gap-0.5 ml-1">
      <span className="w-1 h-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-1 h-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "120ms" }} />
      <span className="w-1 h-1 rounded-full bg-current opacity-60 animate-bounce" style={{ animationDelay: "240ms" }} />
    </span>
  );
}

function SynthCard({ synth }: { synth: FlowSynth }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3 animate-fade-in">
      {synth.headline && (
        <div className="flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-sm font-medium text-foreground leading-snug">{synth.headline}</p>
        </div>
      )}
      {synth.facts && synth.facts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {synth.facts.map((f, i) => (
            <div
              key={i}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-xs"
            >
              <span className="text-muted-foreground">{f.label}:</span>
              <span className="font-medium text-foreground">{f.value}</span>
            </div>
          ))}
        </div>
      )}
      {synth.plan && synth.plan.length > 0 && (
        <div className="pt-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Plan
          </div>
          <ol className="space-y-1">
            {synth.plan.map((step, i) => (
              <li key={i} className="flex gap-2 text-xs text-foreground">
                <span className="text-muted-foreground flex-shrink-0">{i + 1}.</span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  role,
  content,
  streaming,
  question,
  synth,
  showQuestionChips,
  onAnswer,
  disabled,
}: {
  role: string;
  content: string;
  streaming?: boolean;
  question: FlowQuestion | null;
  synth: FlowSynth | null;
  showQuestionChips: boolean;
  onAnswer?: (answer: string) => void;
  disabled?: boolean;
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

  const cleanContent = stripFences(content);

  // Assistant: render synth card outside the bubble for a richer layout
  if (!isUser && synth) {
    return (
      <div className="space-y-3">
        <SynthCard synth={synth} />
        {(question || cleanContent) && (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-2xl px-4 py-2.5 text-sm bg-muted text-foreground">
              {question ? (
                <div className="font-medium text-foreground mb-2">{question.question}</div>
              ) : null}
              {cleanContent && (
                <div className="prose prose-sm dark:prose-invert max-w-none [&>*]:my-1.5">
                  <ReactMarkdown>{cleanContent}</ReactMarkdown>
                </div>
              )}
              {question && showQuestionChips && onAnswer && (
                <QuestionChips
                  options={question.options || []}
                  allowOther={question.allow_other !== false}
                  onAnswer={onAnswer}
                  disabled={disabled}
                />
              )}
              {streaming && <span className="inline-block w-1.5 h-3 bg-current ml-0.5 animate-pulse" />}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        {question ? (
          <div className="font-medium text-foreground mb-2">{question.question}</div>
        ) : cleanContent ? (
          <div className="prose prose-sm dark:prose-invert max-w-none [&>*]:my-1.5">
            <ReactMarkdown>{cleanContent}</ReactMarkdown>
          </div>
        ) : null}

        {question && cleanContent && (
          <div className="prose prose-sm dark:prose-invert max-w-none [&>*]:my-1.5 mt-2 text-muted-foreground">
            <ReactMarkdown>{cleanContent}</ReactMarkdown>
          </div>
        )}

        {question && showQuestionChips && onAnswer && (
          <QuestionChips
            options={question.options || []}
            allowOther={question.allow_other !== false}
            onAnswer={onAnswer}
            disabled={disabled}
          />
        )}

        {streaming && <span className="inline-block w-1.5 h-3 bg-current ml-0.5 animate-pulse" />}
      </div>
    </div>
  );
}

function QuestionChips({
  options,
  allowOther,
  onAnswer,
  disabled,
}: {
  options: string[];
  allowOther: boolean;
  onAnswer: (answer: string) => void;
  disabled?: boolean;
}) {
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState("");

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            disabled={disabled}
            onClick={() => onAnswer(opt)}
            className="px-3 py-1.5 text-xs font-medium rounded-full bg-background border border-border hover:bg-accent hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
          >
            {opt}
          </button>
        ))}
        {allowOther && !showOther && (
          <button
            disabled={disabled}
            onClick={() => setShowOther(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-full bg-background border border-dashed border-border hover:border-primary/40 transition-colors disabled:opacity-50 text-muted-foreground"
          >
            Something else?
          </button>
        )}
      </div>
      {showOther && (
        <div className="flex gap-1.5">
          <input
            autoFocus
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && otherText.trim()) {
                onAnswer(otherText.trim());
                setOtherText("");
                setShowOther(false);
              }
            }}
            disabled={disabled}
            placeholder="Type your answer…"
            className="flex-1 px-3 py-1.5 text-xs rounded-full bg-background border border-border focus:outline-none focus:border-primary/60 text-foreground"
          />
          <Button
            size="sm"
            disabled={disabled || !otherText.trim()}
            onClick={() => {
              onAnswer(otherText.trim());
              setOtherText("");
              setShowOther(false);
            }}
            className="h-7 px-3 text-xs rounded-full"
          >
            Send
          </Button>
        </div>
      )}
    </div>
  );
}
