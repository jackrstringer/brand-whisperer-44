import { useState, useRef, useEffect } from "react";
import { X, Send, MessageCircle, Check } from "lucide-react";

export interface CommentPin {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text: string;
  screenshot?: string;
  aiReply?: string;
  status: "draft" | "pending" | "resolved";
}

interface CommentOverlayProps {
  comments: CommentPin[];
  activeCommentId: string | null;
  onSubmit: (id: string, text: string) => void;
  onUpdateText: (id: string, text: string) => void;
  onClose: (id: string) => void;
  onActivate: (id: string) => void;
  onResolve: (id: string) => void;
}

export default function CommentOverlay({
  comments,
  activeCommentId,
  onSubmit,
  onUpdateText,
  onClose,
  onActivate,
  onResolve,
}: CommentOverlayProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (activeCommentId) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [activeCommentId]);

  return (
    <>
      {comments.map((pin, idx) => {
        const isActive = pin.id === activeCommentId;
        const isDraft = pin.status === "draft";
        const isPending = pin.status === "pending";

        return (
          <div key={pin.id} style={{ position: "absolute", left: pin.x, top: pin.y, zIndex: 60 }}>
            {/* Pin marker */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onActivate(pin.id);
              }}
              className="flex items-center justify-center rounded-full shadow-lg border transition-all"
              style={{
                width: 28,
                height: 28,
                transform: "translate(-50%, -50%)",
                background: isPending
                  ? "linear-gradient(135deg, #f59e0b, #d97706)"
                  : pin.status === "resolved"
                  ? "linear-gradient(135deg, #22c55e, #16a34a)"
                  : "linear-gradient(135deg, #3b82f6, #6366f1)",
                border: isActive ? "2px solid #fff" : "2px solid rgba(255,255,255,0.6)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: isActive
                  ? "0 0 0 3px rgba(59,130,246,0.4), 0 4px 12px rgba(0,0,0,0.3)"
                  : "0 2px 8px rgba(0,0,0,0.3)",
              }}
            >
              {idx + 1}
            </button>

            {/* Drag region indicator */}
            {pin.width && pin.height && (
              <div
                style={{
                  position: "absolute",
                  left: -pin.x + (pin.x - (pin.width / 2)),
                  top: -pin.y + (pin.y - (pin.height / 2)),
                  width: pin.width,
                  height: pin.height,
                  border: "1.5px dashed rgba(99,102,241,0.4)",
                  background: "rgba(99,102,241,0.04)",
                  pointerEvents: "none",
                  borderRadius: 4,
                  transform: "translate(-50%, -50%)",
                }}
              />
            )}

            {/* Comment bubble */}
            {isActive && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  left: 20,
                  top: 4,
                  width: 280,
                  zIndex: 61,
                }}
                className="rounded-xl border border-border shadow-2xl overflow-hidden"
              >
                <div
                  style={{
                    background: "rgba(18,18,20,0.97)",
                    backdropFilter: "blur(16px)",
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                    <div className="flex items-center gap-1.5">
                      <MessageCircle className="w-3 h-3 text-primary" />
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Comment #{idx + 1}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {pin.status === "resolved" ? (
                        <span className="text-[10px] text-green-400 font-medium">Resolved</span>
                      ) : pin.aiReply ? (
                        <button
                          onClick={() => onResolve(pin.id)}
                          className="text-[10px] text-muted-foreground hover:text-green-400 transition-colors flex items-center gap-0.5"
                        >
                          <Check className="w-3 h-3" /> Resolve
                        </button>
                      ) : null}
                      <button
                        onClick={() => onClose(pin.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Screenshot preview */}
                  {pin.screenshot && (
                    <div className="px-2 pt-2">
                      <img
                        src={pin.screenshot}
                        alt="Context"
                        className="w-full rounded-md border border-border/30"
                        style={{ maxHeight: 150, objectFit: "cover" }}
                      />
                    </div>
                  )}

                  {/* Input or submitted text */}
                  {isDraft ? (
                    <div className="p-2">
                      <textarea
                        ref={inputRef}
                        value={pin.text}
                        onChange={(e) => onUpdateText(pin.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (pin.text.trim()) onSubmit(pin.id, pin.text);
                          }
                        }}
                        placeholder="Add a comment..."
                        className="w-full bg-card/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none focus:border-primary/40 transition-colors"
                        rows={2}
                      />
                      <div className="flex justify-end mt-1.5">
                        <button
                          onClick={() => pin.text.trim() && onSubmit(pin.id, pin.text)}
                          disabled={!pin.text.trim()}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all"
                        >
                          <Send className="w-3 h-3" />
                          Send
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 py-2">
                      <p className="text-sm text-foreground">{pin.text}</p>
                    </div>
                  )}

                  {/* AI Reply */}
                  {isPending && !pin.aiReply && (
                    <div className="px-3 pb-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        Waiting for response...
                      </div>
                    </div>
                  )}
                  {pin.aiReply && (
                    <div className="mx-2 mb-2 px-3 py-2 rounded-lg" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)" }}>
                      <p className="text-[10px] font-medium text-primary/70 mb-1">AI Response</p>
                      <p className="text-sm text-foreground/90">{pin.aiReply}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
