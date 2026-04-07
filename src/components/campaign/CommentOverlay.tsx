import { useState, useRef, useEffect } from "react";
import { CornerDownRight, RefreshCw, Lightbulb } from "lucide-react";

/* ── Data model ──────────────────────────────────────────── */
export interface CommentAuthor {
  name: string;
  initials: string;
  bgColor: string;
}

export interface ThreadComment {
  id: string;
  author: CommentAuthor;
  body: string;
  time: string;
}

export interface CommentElementInfo {
  tagName: string;
  text: string;
  outerHTML: string;
  elements?: { tagName: string; text: string; outerHTML: string }[];
}

export interface CommentThread {
  id: string;
  pin: { x: number; y: number; regionW?: number; regionH?: number; elementInfo?: CommentElementInfo };
  comments: ThreadComment[];
  resolved: boolean;
  isTemporary?: boolean;
}

/* ── Cursor SVG data URI ─────────────────────────────────── */
export const COMMENT_CURSOR_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='19' viewBox='0 0 12 19'%3E%3Cpath d='M1 1 L1 16.5 L4 12.5 L7 18.5 L9 17.5 L6 11.5 L10.5 11 Z' fill='%23db2777' stroke='%23222' stroke-width='0.6' stroke-linejoin='round'/%3E%3C/svg%3E") 1 1, default`;

/* ── Spring animation keyframes ─────────────────────────── */
const SPRING_ANIMATION = "popIn 0.18s cubic-bezier(0.34,1.56,0.64,1) forwards";
const SPRING_STYLE = `
@keyframes popIn {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes tooltipFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`;

/* ── Props ────────────────────────────────────────────────── */
interface CommentOverlayProps {
  threads: CommentThread[];
  composerThreadId: string | null;
  zoom: number;
  onSubmitNew: (threadId: string, body: string) => void;
  onCancelComposer: (threadId: string) => void;
  onSwap?: (threadId: string) => void;
  onIdeate?: (threadId: string) => void;
}

/* ── Composer (new comment) ──────────────────────────────── */
function ComposerPopover({
  thread,
  zoom,
  onSubmit,
  onCancel,
  onSwap,
  onIdeate,
}: {
  thread: CommentThread;
  zoom: number;
  onSubmit: (body: string) => void;
  onCancel: () => void;
  onSwap?: () => void;
  onIdeate?: () => void;
}) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const hasText = text.trim().length > 0;

  const actionBtnStyle: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 8,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "rgba(255,255,255,0.5)", flexShrink: 0,
    transition: "all 0.15s ease",
    backdropFilter: "blur(4px)",
  };

  return (
    <div
      data-comment-overlay
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: thread.pin.x + 36 / zoom,
        top: thread.pin.y - 8 / zoom,
        zIndex: 63,
        transform: `scale(${1 / zoom})`,
        transformOrigin: "0 0",
        width: 270,
        background: "rgba(15,15,15,0.92)",
        backdropFilter: "blur(20px) saturate(1.4)",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset",
        animation: SPRING_ANIMATION,
        padding: 12,
      }}
    >
      {/* Quick action buttons */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button
          onClick={onSwap}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(59,130,246,0.15)"; e.currentTarget.style.borderColor = "rgba(59,130,246,0.3)"; e.currentTarget.style.color = "#60A5FA"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
          style={actionBtnStyle}
          title="Swap — auto-replace with a new option"
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={onIdeate}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(200,241,53,0.12)"; e.currentTarget.style.borderColor = "rgba(200,241,53,0.3)"; e.currentTarget.style.color = "#c8f135"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
          style={actionBtnStyle}
          title="Ideate — generate options for this area"
        >
          <Lightbulb size={14} />
        </button>
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          borderRadius: 10,
          border: `1px solid ${hasText ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.08)"}`,
          padding: "6px 10px",
          display: "flex",
          alignItems: "flex-end",
          gap: 6,
          transition: "border-color 0.15s",
        }}
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (hasText) onSubmit(text.trim());
            }
            if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
          }}
          placeholder="Add a comment…"
          rows={1}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            fontSize: 13,
            color: "rgba(255,255,255,0.9)",
            minHeight: 22,
            maxHeight: 160,
            overflowY: "auto",
            lineHeight: 1.4,
          }}
        />
        {hasText && (
          <button
            onClick={() => onSubmit(text.trim())}
            style={{
              width: 26, height: 26, borderRadius: 7,
              background: "#3B82F6", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", flexShrink: 0,
              animation: "tooltipFadeIn 120ms ease forwards",
            }}
          >
            <CornerDownRight size={13} />
          </button>
        )}
      </div>
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 6, marginBottom: 0 }}>
        Enter to send · Esc to cancel
      </p>
    </div>
  );
}

/* ── Region highlight ────────────────────────────────────── */
function RegionHighlight({ thread }: { thread: CommentThread }) {
  const { pin } = thread;
  if (!pin.regionW || !pin.regionH) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: pin.x,
        top: pin.y,
        width: pin.regionW,
        height: pin.regionH,
        border: "1.5px dashed rgba(59,130,246,0.4)",
        background: "rgba(59,130,246,0.06)",
        borderRadius: 4,
        pointerEvents: "none",
        zIndex: 55,
      }}
    />
  );
}

/* ── Main overlay ────────────────────────────────────────── */
export default function CommentOverlay({
  threads,
  composerThreadId,
  zoom,
  onSubmitNew,
  onCancelComposer,
  onSwap,
  onIdeate,
}: CommentOverlayProps) {
  return (
    <>
      <style>{SPRING_STYLE}</style>

      {/* Region highlights for temporary composer thread only */}
      {composerThreadId && (() => {
        const thread = threads.find((t) => t.id === composerThreadId);
        if (!thread) return null;
        return <RegionHighlight thread={thread} />;
      })()}

      {/* Composer popover */}
      {composerThreadId && (() => {
        const thread = threads.find((t) => t.id === composerThreadId);
        if (!thread) return null;
        return (
          <ComposerPopover
            thread={thread}
            zoom={zoom}
            onSubmit={(body) => onSubmitNew(composerThreadId, body)}
            onCancel={() => onCancelComposer(composerThreadId)}
            onSwap={() => onSwap?.(composerThreadId)}
            onIdeate={() => onIdeate?.(composerThreadId)}
          />
        );
      })()}
    </>
  );
}
