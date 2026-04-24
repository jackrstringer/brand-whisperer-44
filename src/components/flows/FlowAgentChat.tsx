import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  CheckCircle2,
  PencilLine,
} from "lucide-react";
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
  /** When true, render as a centered hero panel instead of a floating dock. */
  centered?: boolean;
  /** When true, render as the persistent right-side flow chat panel. */
  panel?: boolean;
}

interface FlowQuestion {
  question: string;
  helper?: string;
  input_label?: string;
  input_placeholder?: string;
  options?: Array<string | { label: string; description?: string; value?: string }>;
  allow_other?: boolean;
}

const QUESTION_FENCE = /```flow-question\s*([\s\S]*?)```/;
const SYNTH_FENCE = /```flow-synth\s*([\s\S]*?)```/;
const SKELETON_FENCE = /```flow-skeleton[\s\S]*?```/;
const CONTROL_FENCE_START = /```flow-(question|synth|skeleton|setup)/;

function shouldAutoRestart(messages: Msg[], currentSkeleton: string | null): boolean {
  if (currentSkeleton || messages.length !== 1) return false;
  const [first] = messages;
  return first.role === "assistant" && CONTROL_FENCE_START.test(first.content) && !extractQuestion(first.content);
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

function stripFences(content: string): string {
  const withoutCompleteFences = content
    .replace(QUESTION_FENCE, "")
    .replace(SYNTH_FENCE, "")
    .replace(SKELETON_FENCE, "")
    .replace(/```flow-setup\s*[\s\S]*?```/g, "");

  const partialStart = withoutCompleteFences.search(CONTROL_FENCE_START);
  return (partialStart >= 0 ? withoutCompleteFences.slice(0, partialStart) : withoutCompleteFences).trim();
}

const STAGE_META: Record<string, { label: string }> = {
  reading: { label: "Checking brand research" },
  analyzing: { label: "Thinking" },
  strategizing: { label: "Thinking" },
  drafting: { label: "Drafting your skeleton" },
};

export function FlowAgentChat({
  flowId,
  brandId,
  flowType,
  initialMessages,
  currentSkeleton,
  onSkeletonUpdated,
  centered = false,
  panel = false,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuf, setStreamBuf] = useState("");
  const [skeletonStreaming, setSkeletonStreaming] = useState(false);
  const [stages, setStages] = useState<{ key: string; status: "active" | "done" }[]>([]);
  const [docked, setDocked] = useState(false);
  const initFired = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(initialMessages);
    setInput("");
    setStreamBuf("");
    setSkeletonStreaming(false);
    setStages([]);
    setStreaming(false);
    initFired.current = false;
    // Keep in-progress and just-finished local chat stable; realtime refreshes can lag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  useEffect(() => {
    if (initFired.current) return;
    initFired.current = true;
    if (currentSkeleton) return;
    if (shouldAutoRestart(initialMessages, currentSkeleton) && !streaming) {
      setMessages([]);
      sendMessage("__FLOW_RESTART__", true);
    } else if (initialMessages.length === 0 && !streaming) {
      sendMessage("__FLOW_INIT__", true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId, currentSkeleton, initialMessages]);

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
            } else if (evt.type === "skeleton_start") {
              setSkeletonStreaming(true);
              setStages((prev) => {
                const next: { key: string; status: "active" | "done" }[] =
                  prev.map((s) => ({ key: s.key, status: "done" }));
                next.push({ key: "drafting", status: "active" });
                return next;
              });
            } else if (evt.type === "skeleton_chunk") {
              /* canvas listens via realtime */
            } else if (evt.type === "skeleton_end") {
              setSkeletonStreaming(false);
            } else if (evt.type === "text") {
              if (!firstTextReceived) {
                firstTextReceived = true;
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
      setSkeletonStreaming(false);
      if (skeletonUpdated) onSkeletonUpdated();
    } catch (err: any) {
      console.error("[FlowAgentChat]", err);
      setMessages((m) => [
        ...m,
        { role: "system", content: `⚠️ Error: ${err.message || "Unknown error"}` },
      ]);
      setStreamBuf("");
      setStages([]);
      setSkeletonStreaming(false);
    } finally {
      setStreaming(false);
    }
  };

  // Hide all pre-skeleton scaffolding messages once a skeleton exists.
  const lastSetupMessageIndex = currentSkeleton
    ? messages.reduce((lastIndex, message, index) => {
        if (
          message.role === "assistant" &&
          (QUESTION_FENCE.test(message.content) ||
            SYNTH_FENCE.test(message.content) ||
            SKELETON_FENCE.test(message.content))
        ) {
          return index;
        }
        return lastIndex;
      }, -1)
    : -1;

  const visibleMessages = messages.filter((message, index) => {
    if (!currentSkeleton) return true;
    if (index <= lastSetupMessageIndex) return false;
    if (message.role !== "assistant") return true;
    const hasControlFence =
      QUESTION_FENCE.test(message.content) ||
      SYNTH_FENCE.test(message.content) ||
      SKELETON_FENCE.test(message.content);
    if (!hasControlFence) return true;
    return stripFences(message.content).length > 0;
  });

  const lastAssistantIdx = (() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      if (visibleMessages[i].role === "assistant") return i;
    }
    return -1;
  })();

  const currentStageLabel = skeletonStreaming
    ? "Drafting your skeleton"
    : STAGE_META[stages[stages.length - 1]?.key ?? "analyzing"]?.label ?? "Thinking";

  // ---------- Pre-skeleton: centered hero conversation ----------
  if (centered) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-2xl flex flex-col gap-4">
          <div ref={scrollRef} className="max-h-[68vh] overflow-y-auto space-y-3 pr-1">
            {visibleMessages.map((m, i) => {
              const isLastAssistant = i === lastAssistantIdx;
              const question = m.role === "assistant" ? extractQuestion(m.content) : null;
              return (
                <MessageBubble
                  key={i}
                  role={m.role}
                  content={m.content}
                  question={question}
                  showQuestionChips={isLastAssistant && !streaming}
                  onAnswer={(answer) => sendMessage(answer)}
                  disabled={streaming}
                />
              );
            })}
            {streaming && (
              <>
                {streamBuf && stripFences(streamBuf) ? (
                  <MessageBubble
                    role="assistant"
                    content={streamBuf}
                    streaming
                    question={extractQuestion(streamBuf)}
                    showQuestionChips={false}
                    disabled
                  />
                ) : (
                  <InlineShimmer label={currentStageLabel} />
                )}
              </>
            )}
          </div>
          <Composer
            input={input}
            setInput={setInput}
            send={() => sendMessage(input)}
            streaming={streaming}
            placeholder="Describe the flow you want to build…"
          />
        </div>
      </div>
    );
  }

  if (panel) {
    return (
      <aside className="h-full w-full border-l border-border bg-card flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-foreground/70">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-foreground">AI Flow Editor</div>
            <div className="text-[11px] text-muted-foreground">Refine strategy, filters, and messages</div>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {visibleMessages.map((m, i) => {
            const isLastAssistant = i === lastAssistantIdx;
            const question = m.role === "assistant" ? extractQuestion(m.content) : null;
            return (
              <MessageBubble
                key={i}
                role={m.role}
                content={m.content}
                question={null}
                showQuestionChips={isLastAssistant && !streaming && !!question}
                onAnswer={(answer) => sendMessage(answer)}
                disabled={streaming}
              />
            );
          })}
          {streaming && (
            streamBuf && stripFences(streamBuf) ? (
              <MessageBubble
                role="assistant"
                content={streamBuf}
                streaming
                question={null}
                showQuestionChips={false}
                disabled
              />
            ) : (
              <InlineShimmer label={currentStageLabel} />
            )
          )}
        </div>

        <div className="p-3 border-t border-border bg-card">
          <Composer
            input={input}
            setInput={setInput}
            send={() => sendMessage(input)}
            streaming={streaming}
            placeholder="Tell the AI what to change…"
          />
        </div>
      </aside>
    );
  }

  // ---------- Post-skeleton: floating dock at the bottom ----------
  const hasConversation = visibleMessages.length > 0 || streaming;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-6 pb-6">
      <div className="pointer-events-auto w-full max-w-2xl">
        {/* Conversation panel — collapsible */}
        {hasConversation && docked && (
          <div className="mb-3 rounded-2xl border border-foreground/15 bg-card/95 backdrop-blur-xl shadow-[0_8px_32px_-12px_rgba(0,0,0,0.18)] overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-4 py-2 border-b border-foreground/10">
              <div className="flex items-center gap-2 text-[12px] text-foreground/60">
                <MessageSquare className="w-3.5 h-3.5" strokeWidth={2} />
                <span className="font-medium">Conversation</span>
              </div>
              <button
                onClick={() => setDocked(false)}
                className="text-foreground/45 hover:text-foreground transition-colors"
                aria-label="Collapse"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            <div ref={scrollRef} className="max-h-[40vh] overflow-y-auto px-4 py-3 space-y-3">
              {visibleMessages.map((m, i) => {
                const isLastAssistant = i === lastAssistantIdx;
                const question = m.role === "assistant" ? extractQuestion(m.content) : null;
                return (
                  <MessageBubble
                    key={i}
                    role={m.role}
                    content={m.content}
                    question={null}
                    showQuestionChips={isLastAssistant && !streaming && !!question}
                    onAnswer={(answer) => sendMessage(answer)}
                    disabled={streaming}
                  />
                );
              })}
              {streaming && (
                <>
                  {streamBuf && stripFences(streamBuf) ? (
                    <MessageBubble
                      role="assistant"
                      content={streamBuf}
                      streaming
                      question={null}
                      showQuestionChips={false}
                      disabled
                    />
                  ) : (
                    <InlineShimmer label={currentStageLabel} />
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Status pill (when streaming and conversation is collapsed) */}
        {streaming && !docked && (
          <div className="mb-3 flex justify-center">
            <button
              onClick={() => setDocked(true)}
              className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-card/95 backdrop-blur-xl border border-foreground/15 shadow-sm hover:border-foreground/30 transition-colors"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-foreground opacity-50 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-foreground" />
              </span>
              <span className="text-[12px] font-medium text-foreground/75">
                {currentStageLabel}…
              </span>
            </button>
          </div>
        )}

        {/* Composer */}
        <div className="rounded-full border border-foreground/15 bg-card/95 backdrop-blur-xl shadow-[0_4px_24px_-8px_rgba(0,0,0,0.16)] flex items-center gap-2 px-2 py-2">
          {hasConversation && !docked && (
            <button
              onClick={() => setDocked(true)}
              className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-foreground/55 hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Show conversation"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Refine your flow — e.g. add a delay before email 3"
            disabled={streaming}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            rows={1}
            className="min-h-[36px] max-h-[120px] resize-none border-0 bg-transparent px-2 py-2 text-[13px] focus-visible:outline-none focus-visible:border-0 focus-visible:ring-0 shadow-none"
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={streaming || !input.trim()}
            size="icon"
            className="h-9 w-9 rounded-full flex-shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Composer({
  input,
  setInput,
  send,
  streaming,
  placeholder,
}: {
  input: string;
  setInput: (s: string) => void;
  send: () => void;
  streaming: boolean;
  placeholder: string;
}) {
  return (
    <div className="rounded-2xl border border-foreground/15 bg-card shadow-[0_4px_24px_-12px_rgba(0,0,0,0.16)] flex items-end gap-2 px-2 py-2">
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder}
        disabled={streaming}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        rows={2}
        className="min-h-[60px] max-h-[160px] resize-none border-0 bg-transparent px-3 py-2 text-[13.5px] focus-visible:outline-none focus-visible:ring-0 shadow-none"
      />
      <Button
        onClick={send}
        disabled={streaming || !input.trim()}
        size="icon"
        className="h-9 w-9 rounded-full flex-shrink-0 mb-1 mr-1"
      >
        <Send className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function InlineShimmer({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1 animate-fade-in">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-foreground opacity-50 animate-ping" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-foreground" />
      </span>
      <span className="text-[13px] bg-gradient-to-r from-foreground/40 via-foreground to-foreground/40 bg-[length:200%_100%] bg-clip-text text-transparent animate-[flow-shimmer_2.2s_linear_infinite]">
        {label}…
      </span>
      <style>{`@keyframes flow-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}

function MessageBubble({
  role,
  content,
  streaming,
  question,
  showQuestionChips,
  onAnswer,
  disabled,
}: {
  role: string;
  content: string;
  streaming?: boolean;
  question: FlowQuestion | null;
  showQuestionChips: boolean;
  onAnswer?: (answer: string) => void;
  disabled?: boolean;
}) {
  const isUser = role === "user";
  const isSystem = role === "system";
  if (isSystem) {
    return (
      <div className="text-[12px] text-foreground/70 bg-muted rounded-lg px-3 py-2">
        {content}
      </div>
    );
  }

  const cleanContent = stripFences(content);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-[13.5px] ${
          isUser
            ? "bg-foreground text-background"
            : "bg-muted text-foreground"
        }`}
      >
        {question ? (
          <div className="mb-2">
            <div className="font-semibold text-foreground">{question.question}</div>
            {question.helper && <div className="mt-1 text-[12.5px] leading-relaxed text-foreground/60">{question.helper}</div>}
          </div>
        ) : cleanContent ? (
          <div className="prose prose-sm dark:prose-invert max-w-none [&>*]:my-1.5">
            <ReactMarkdown>{cleanContent}</ReactMarkdown>
          </div>
        ) : null}

        {question && showQuestionChips && onAnswer && (
          <QuestionChips
            options={question.options || []}
            allowOther={question.allow_other !== false}
            onAnswer={onAnswer}
            disabled={disabled}
          />
        )}

        {streaming && (
          <span className="inline-block w-1.5 h-3 bg-current ml-0.5 animate-pulse" />
        )}
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
  options: Array<string | { label: string; description?: string; value?: string }>;
  allowOther: boolean;
  onAnswer: (answer: string) => void;
  disabled?: boolean;
}) {
  const [showOther, setShowOther] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [selectedOption, setSelectedOption] = useState<{ label: string; value: string } | null>(null);
  const [contextText, setContextText] = useState("");

  const submitSelected = () => {
    if (!selectedOption) return;
    const extra = contextText.trim();
    onAnswer(extra ? `${selectedOption.value}\n\nAdditional context: ${extra}` : selectedOption.value);
    setSelectedOption(null);
    setContextText("");
  };

  return (
    <div className="mt-3 space-y-2">
      {!selectedOption && <div className="grid gap-1.5">
        {options.map((opt) => {
          const option = typeof opt === "string" ? { label: opt, value: opt } : opt;
          return (
          <button
            key={`${option.label}:${option.value || option.label}`}
            disabled={disabled}
            onClick={() => setSelectedOption({ label: option.label, value: option.value || option.label })}
            className="group text-left px-3 py-2.5 text-[12.5px] font-medium rounded-xl bg-card border border-foreground/15 hover:bg-muted hover:border-foreground/35 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-foreground"
          >
            <span className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-foreground/35 group-hover:text-foreground/70 flex-shrink-0" />
              <span className="min-w-0">
                <span className="block leading-snug">{option.label}</span>
                {option.description && (
                  <span className="block mt-1 text-[11.5px] leading-relaxed text-foreground/55 font-normal">
                    {option.description}
                  </span>
                )}
              </span>
            </span>
          </button>
          );
        })}
        {allowOther && !showOther && (
          <button
            disabled={disabled}
            onClick={() => setShowOther(true)}
            className="text-left px-3 py-2.5 text-[12.5px] font-medium rounded-xl bg-card border border-dashed border-foreground/20 hover:border-foreground/40 transition-colors disabled:opacity-50 text-foreground/70"
          >
            <span className="flex items-center gap-2"><PencilLine className="w-3.5 h-3.5" /> Enter different details</span>
          </button>
        )}
      </div>}
      {selectedOption && (
        <div className="rounded-xl bg-card border border-foreground/15 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12.5px] font-medium text-foreground truncate">{selectedOption.label}</div>
            <button
              type="button"
              onClick={() => {
                setSelectedOption(null);
                setContextText("");
              }}
              disabled={disabled}
              className="text-[11.5px] text-foreground/50 hover:text-foreground transition-colors disabled:opacity-50"
            >
              Change
            </button>
          </div>
          <textarea
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submitSelected();
              }
            }}
            disabled={disabled}
            placeholder="Add optional context…"
            rows={2}
            className="w-full resize-none px-3 py-2 text-[12.5px] rounded-lg bg-muted border border-foreground/10 focus:outline-none focus:border-foreground/35 text-foreground placeholder:text-foreground/35"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={disabled}
              onClick={submitSelected}
              className="h-7 px-3 text-[12px] rounded-full"
            >
              Send
            </Button>
          </div>
        </div>
      )}
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
            placeholder={"Type your answer…"}
            className="flex-1 px-3 py-2 text-[12.5px] rounded-xl bg-card border border-foreground/15 focus:outline-none focus:border-foreground/45 text-foreground"
          />
          <Button
            size="sm"
            disabled={disabled || !otherText.trim()}
            onClick={() => {
              onAnswer(otherText.trim());
              setOtherText("");
              setShowOther(false);
            }}
            className="h-7 px-3 text-[12px] rounded-full"
          >
            Send
          </Button>
        </div>
      )}
    </div>
  );
}
