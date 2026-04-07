import { useState, useRef, useEffect, useCallback } from "react";
import { X, Check, CornerDownRight, Undo2, RefreshCw, Lightbulb } from "lucide-react";

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

export interface CommentThread {
  id: string;
  pin: { x: number; y: number; regionW?: number; regionH?: number };
  comments: ThreadComment[];
  resolved: boolean;
  /** Transient: true while composer is open for a new pin not yet submitted */
  isTemporary?: boolean;
}

/* ── Cursor SVG data URI ─────────────────────────────────── */
export const COMMENT_CURSOR_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='28' viewBox='0 0 24 28'%3E%3Cg transform='rotate(-45 12 14)'%3E%3Ccircle cx='12' cy='10' r='9' fill='%233B82F6' stroke='white' stroke-width='1.5'/%3E%3Crect x='8' y='14' width='8' height='8' rx='0' fill='%233B82F6' stroke='white' stroke-width='1.5'/%3E%3C/g%3E%3C/svg%3E") 3 24, crosshair`;

/* ── Props ────────────────────────────────────────────────── */
interface CommentOverlayProps {
  threads: CommentThread[];
  activeThreadId: string | null;
  composerThreadId: string | null; // thread currently showing composer (new pin)
  currentUser: CommentAuthor;
  zoom: number;
  onActivate: (id: string) => void;
  onCloseThread: (id: string) => void;
  onSubmitNew: (threadId: string, body: string) => void;
  onReply: (threadId: string, body: string) => void;
  onResolve: (threadId: string) => void;
  onUnresolve: (threadId: string) => void;
  onCancelComposer: (threadId: string) => void;
  onSwap?: (threadId: string) => void;
  onIdeate?: (threadId: string) => void;
}

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

/* ── Teardrop Pin ────────────────────────────────────────── */
function TeardropPin({
  thread,
  index,
  isActive,
  isHovered,
  zoom,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  thread: CommentThread;
  index: number;
  isActive: boolean;
  isHovered: boolean;
  zoom: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  const firstComment = thread.comments[0];
  const author = firstComment?.author;
  const replyCount = thread.comments.length;
  const isResolved = thread.resolved;

  const bgColor = isActive ? "#3B82F6" : "#FFFFFF";
  const shadow = isActive
    ? "0 4px 16px rgba(59,130,246,0.35)"
    : isHovered
    ? "0 3px 12px rgba(0,0,0,0.18)"
    : "0 2px 6px rgba(0,0,0,0.15)";

  return (
    <div
      style={{
        position: "absolute",
        left: thread.pin.x,
        top: thread.pin.y,
        zIndex: isActive ? 62 : 60,
        transform: `scale(${1 / zoom})`,
        transformOrigin: "0 0",
        filter: isResolved && !isActive ? "grayscale(0.6)" : undefined,
        opacity: isResolved && !isActive ? 0.5 : 1,
        transition: "filter 0.15s ease, opacity 0.15s ease",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Teardrop shape */}
      <button
        onClick={onClick}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: 32,
          height: 32,
          position: "relative",
          transform: "translate(-8px, -32px) rotate(-45deg)",
          borderRadius: "50% 50% 50% 0",
          background: bgColor,
          border: "2px solid white",
          boxShadow: shadow,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.15s ease, box-shadow 0.15s ease",
          padding: 0,
        }}
      >
        {/* Avatar circle inside teardrop */}
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: isActive ? "rgba(255,255,255,0.25)" : (author?.bgColor || "#6366F1"),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: "rotate(45deg)",
            fontSize: 10,
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1,
          }}
        >
          {author?.initials || (index + 1)}
        </div>
      </button>

      {/* Reply count badge */}
      {replyCount >= 2 && (
        <div
          style={{
            position: "absolute",
            top: -36,
            left: 14,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#3B82F6",
            border: "2px solid white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 700,
            color: "#fff",
            pointerEvents: "none",
          }}
        >
          {replyCount}
        </div>
      )}

      {/* Hover tooltip */}
      {isHovered && !isActive && firstComment && (
        <div
          style={{
            position: "absolute",
            left: 36,
            top: -28,
            background: "#1E293B",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 12,
            maxWidth: 200,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            animation: "tooltipFadeIn 120ms ease forwards",
            pointerEvents: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        >
          {firstComment.body.slice(0, 60)}{firstComment.body.length > 60 ? "…" : ""}
        </div>
      )}
    </div>
  );
}

/* ── Thread Popover ──────────────────────────────────────── */
function ThreadPopover({
  thread,
  currentUser,
  zoom,
  onClose,
  onReply,
  onResolve,
  onUnresolve,
}: {
  thread: CommentThread;
  currentUser: CommentAuthor;
  zoom: number;
  onClose: () => void;
  onReply: (body: string) => void;
  onResolve: () => void;
  onUnresolve: () => void;
}) {
  const [replyText, setReplyText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const hasText = replyText.trim().length > 0;

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
        width: 280,
        background: "#fff",
        borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
        animation: SPRING_ANIMATION,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          borderBottom: "1px solid #E2E8F0",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: thread.resolved ? "#16A34A" : "#334155" }}>
          {thread.resolved ? "Resolved" : "Thread"}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {thread.resolved ? (
            <button
              onClick={onUnresolve}
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: "transparent", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#64748B", transition: "background 0.12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              title="Unresolve"
            >
              <Undo2 size={14} />
            </button>
          ) : thread.comments.length > 0 ? (
            <button
              onClick={onResolve}
              style={{
                width: 28, height: 28, borderRadius: 6,
                background: "transparent", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#64748B", transition: "background 0.12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              title="Resolve"
            >
              <Check size={14} />
            </button>
          ) : null}
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: "transparent", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#64748B", transition: "background 0.12s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Comments list */}
      <div style={{ maxHeight: 240, overflowY: "auto", padding: "0" }}>
        {thread.comments.map((c, i) => (
          <div
            key={c.id}
            style={{
              padding: "10px 12px",
              borderBottom: i < thread.comments.length - 1 ? "1px solid #F1F5F9" : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: c.author.bgColor,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
                }}
              >
                {c.author.initials}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1E293B" }}>{c.author.name}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>{c.time}</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.45, margin: 0, paddingLeft: 36 }}>
              {c.body}
            </p>
          </div>
        ))}
      </div>

      {/* Reply composer (hidden when resolved) */}
      {!thread.resolved && (
        <div
          style={{
            padding: "10px 12px",
            borderTop: "1px solid #E2E8F0",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <div
            style={{
              width: 28, height: 28, borderRadius: "50%",
              background: currentUser.bgColor,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
              marginTop: 4,
            }}
          >
            {currentUser.initials}
          </div>
          <div
            style={{
              flex: 1,
              background: "#F8FAFC",
              borderRadius: 8,
              border: `1px solid ${hasText ? "#3B82F6" : "#E2E8F0"}`,
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 8px",
              transition: "border-color 0.15s",
            }}
          >
            <textarea
              ref={inputRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (hasText) { onReply(replyText.trim()); setReplyText(""); }
                }
                if (e.key === "Escape") { e.stopPropagation(); onClose(); }
              }}
              placeholder="Reply…"
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                resize: "none",
                fontSize: 13,
                color: "#334155",
                maxHeight: 80,
                overflowY: "auto",
                lineHeight: 1.4,
              }}
            />
            {hasText && (
              <button
                onClick={() => { onReply(replyText.trim()); setReplyText(""); }}
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
        </div>
      )}
    </div>
  );
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
          onChange={(e) => setText(e.target.value)}
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
            maxHeight: 80,
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
function RegionHighlight({
  thread,
  isActive,
}: {
  thread: CommentThread;
  isActive: boolean;
}) {
  const { pin } = thread;
  if (!pin.regionW || !pin.regionH) return null;

  const left = pin.x;
  const top = pin.y;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: pin.regionW,
        height: pin.regionH,
        border: isActive ? "1.5px solid rgba(59,130,246,0.4)" : "1.5px dashed rgba(59,130,246,0.3)",
        background: isActive ? "rgba(59,130,246,0.08)" : "rgba(59,130,246,0.04)",
        borderRadius: 4,
        pointerEvents: "none",
        zIndex: 55,
        transition: "background 0.15s, border 0.15s",
      }}
    />
  );
}

/* ── Main overlay ────────────────────────────────────────── */
export default function CommentOverlay({
  threads,
  activeThreadId,
  composerThreadId,
  currentUser,
  zoom,
  onActivate,
  onCloseThread,
  onSubmitNew,
  onReply,
  onResolve,
  onUnresolve,
  onCancelComposer,
}: CommentOverlayProps) {
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);

  return (
    <>
      <style>{SPRING_STYLE}</style>

      {/* Region highlights */}
      {threads.map((t) => (
        <RegionHighlight key={`region-${t.id}`} thread={t} isActive={t.id === activeThreadId} />
      ))}

      {/* Pins */}
      {threads.map((t, idx) => (
        <TeardropPin
          key={t.id}
          thread={t}
          index={idx}
          isActive={t.id === activeThreadId}
          isHovered={hoveredPinId === t.id}
          zoom={zoom}
          onMouseEnter={() => setHoveredPinId(t.id)}
          onMouseLeave={() => setHoveredPinId(null)}
          onClick={(e) => {
            e.stopPropagation();
            onActivate(t.id);
          }}
        />
      ))}

      {/* Composer for new (temporary) pin */}
      {composerThreadId && (() => {
        const thread = threads.find((t) => t.id === composerThreadId);
        if (!thread) return null;
        return (
          <ComposerPopover
            thread={thread}
            zoom={zoom}
            onSubmit={(body) => onSubmitNew(composerThreadId, body)}
            onCancel={() => onCancelComposer(composerThreadId)}
          />
        );
      })()}

      {/* Thread popover for existing (submitted) thread */}
      {activeThreadId && !composerThreadId && (() => {
        const thread = threads.find((t) => t.id === activeThreadId);
        if (!thread || thread.comments.length === 0) return null;
        return (
          <ThreadPopover
            thread={thread}
            currentUser={currentUser}
            zoom={zoom}
            onClose={() => onCloseThread(activeThreadId)}
            onReply={(body) => onReply(activeThreadId, body)}
            onResolve={() => onResolve(activeThreadId)}
            onUnresolve={() => onUnresolve(activeThreadId)}
          />
        );
      })()}
    </>
  );
}
