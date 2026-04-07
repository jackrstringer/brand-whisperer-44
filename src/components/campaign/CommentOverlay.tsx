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
export const COMMENT_CURSOR_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='28' viewBox='0 0 24 28'%3E%3Cg transform='rotate(-45 12 14)'%3E%3Ccircle cx='12' cy='10' r='9' fill='%233B82F6' stroke='white' stroke-width='1.5'/%3E%3Crect x='8' y='14' width='8' height='8' rx='0' fill='%233B82F6' stroke='white' stroke-width='1.5'/%3E%3C/g%3E%3C/svg%3E") 3 24, crosshair`;

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
    width: 32, height: 32, borderRadius: 6,
    background: "#F1F5F9", border: "1px solid #E2E8F0",
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#64748B", flexShrink: 0,
    transition: "all 0.12s ease",
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
        width: 260,
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
        animation: SPRING_ANIMATION,
        padding: 12,
      }}
    >
      {/* Quick action buttons */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button
          onClick={onSwap}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#DBEAFE"; e.currentTarget.style.borderColor = "#93C5FD"; e.currentTarget.style.color = "#3B82F6"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#F1F5F9"; e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; }}
          style={actionBtnStyle}
          title="Swap — auto-replace with a new option"
        >
          <RefreshCw size={14} />
        </button>
        <button
          onClick={onIdeate}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#FEF9C3"; e.currentTarget.style.borderColor = "#FDE047"; e.currentTarget.style.color = "#CA8A04"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#F1F5F9"; e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; }}
          style={actionBtnStyle}
          title="Ideate — generate options for this area"
        >
          <Lightbulb size={14} />
        </button>
      </div>
      <div
        style={{
          background: "#F8FAFC",
          borderRadius: 8,
          border: `1px solid ${hasText ? "#3B82F6" : "#E2E8F0"}`,
          padding: "4px 8px",
          display: "flex",
          alignItems: "center",
          gap: 4,
          transition: "border-color 0.15s",
        }}
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // Auto-resize
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
            color: "#334155",
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
              width: 28, height: 28, borderRadius: 6,
              background: "#3B82F6", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", flexShrink: 0,
              animation: "tooltipFadeIn 120ms ease forwards",
            }}
          >
            <CornerDownRight size={14} />
          </button>
        )}
      </div>
      <p style={{ fontSize: 10, color: "#94A3B8", marginTop: 6, marginBottom: 0 }}>
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
