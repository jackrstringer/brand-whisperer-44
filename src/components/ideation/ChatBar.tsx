import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Zap, Rocket, X, Square } from 'lucide-react';

interface Props {
  onSend: (message: string) => void;
  isGenerating: boolean;
  isChatting: boolean;
  selectedCount: number;
  onClearSelection: () => void;
  chaosMode: boolean;
  turboMode: boolean;
  onToggleChaos: () => void;
  onToggleTurbo: () => void;
  activeType?: string | null;
  onStop?: () => void;
}

export function ChatBar({
  onSend,
  isGenerating,
  isChatting,
  selectedCount,
  onClearSelection,
  chaosMode,
  turboMode,
  onToggleChaos,
  onToggleTurbo,
  activeType,
  onStop,
}: Props) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isBusy = isGenerating || isChatting;

  // Dynamic placeholder
  let placeholder = "Pick a campaign type above, or describe your idea...";
  if (selectedCount > 1) {
    placeholder = "Add direction for the next round of variations...";
  } else if (selectedCount === 1) {
    placeholder = "Describe how to refine this idea, or press Enter to build...";
  } else if (activeType) {
    placeholder = "Add direction for more ideas...";
  }

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '28px';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const handleSend = () => {
    if (isBusy) return;
    const msg = input.trim();
    if (!msg && selectedCount === 0) return;
    onSend(msg);
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border bg-card px-4 py-2">
      {/* Selection indicator */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-foreground bg-muted px-2.5 py-1 rounded-full">
            {selectedCount} idea{selectedCount > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={onClearSelection}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Mode toggles */}
        <div className="flex gap-1 pb-0.5">
          <button
            onClick={onToggleChaos}
            className={`p-2 rounded-lg transition-all ${
              chaosMode
                ? 'bg-amber-100 text-amber-600 border border-amber-300'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
            }`}
            title="Chaos Mode — creative entropy"
          >
            <Zap className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleTurbo}
            className={`p-2 rounded-lg transition-all ${
              turboMode
                ? 'bg-cyan-100 text-cyan-600 border border-cyan-300'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
            }`}
            title="Turbo Mode — 20 ideas"
          >
            <Rocket className="w-4 h-4" />
          </button>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isBusy}
          rows={1}
          className="flex-1 bg-muted text-sm text-foreground placeholder:text-muted-foreground px-3.5 py-1.5 rounded-xl border-0 focus:outline-none focus:ring-1 focus:ring-foreground/20 disabled:opacity-50 resize-none overflow-hidden leading-[1.6]"
          style={{ minHeight: '28px', maxHeight: '120px' }}
        />

        {/* Send / Stop */}
        {isBusy ? (
          <button
            onClick={onStop}
            className="p-2.5 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            <Square className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Stop</span>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim() && selectedCount === 0}
            className={`p-2.5 rounded-xl transition-colors flex items-center gap-1.5 flex-shrink-0 ${
              selectedCount > 0
                ? 'bg-foreground text-background hover:bg-foreground/90'
                : 'bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30 disabled:cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
            {selectedCount > 0 && (
              <span className="rounded-full bg-background/20 px-1.5 text-[10px] font-medium">
                {selectedCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
