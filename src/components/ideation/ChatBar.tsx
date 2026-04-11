import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Zap, Rocket, X, Square, Sparkles, Plus, LayoutGrid, RotateCcw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

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
  menuOpen?: boolean;
  onToggleMenu?: () => void;
  onClearChat?: () => void;
  onAddToQueue?: () => void;
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
  menuOpen,
  onToggleMenu,
  onClearChat,
  onAddToQueue,
}: Props) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isBusy = isGenerating || isChatting;

  let placeholder = "Pick a campaign type above, or describe your idea...";
  if (selectedCount > 1) {
    placeholder = "Add direction for the next round of variations...";
  } else if (selectedCount === 1) {
    placeholder = "Describe how to refine this idea, or press Enter to build...";
  } else if (activeType) {
    placeholder = `Add direction for more ${activeType} ideas...`;
  }

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
    <div className="w-full">
      {/* Selection indicator */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 mb-2 justify-center">
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

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Top row — textarea */}
        <div className="px-4 pt-3 pb-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isBusy}
            rows={1}
            className="w-full bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground border-0 focus:outline-none disabled:opacity-50 resize-none overflow-hidden leading-[1.6]"
            style={{ minHeight: '28px', maxHeight: '120px' }}
          />
        </div>

        {/* Bottom row — controls */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-border flex-wrap gap-1.5">
          <div className="flex items-center gap-1 flex-wrap">
            {/* Menu toggle */}
            <button
              onClick={onToggleMenu}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                menuOpen
                  ? 'bg-primary/10 border-primary/30 text-foreground'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Menu
            </button>

            {/* Turbo toggle */}
            <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              turboMode
                ? 'bg-cyan-50 border-cyan-200 text-cyan-700'
                : 'text-muted-foreground border-transparent'
            }`}>
              <Rocket className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Turbo</span>
              <Switch
                checked={turboMode}
                onCheckedChange={onToggleTurbo}
                className="h-4 w-7 data-[state=checked]:bg-cyan-500"
              />
            </div>

            {/* Chaos toggle */}
            <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              chaosMode
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'text-muted-foreground border-transparent'
            }`}>
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Chaos</span>
              <Switch
                checked={chaosMode}
                onCheckedChange={onToggleChaos}
                className="h-4 w-7 data-[state=checked]:bg-amber-500"
              />
            </div>

            {/* Clear chat */}
            {onClearChat && (
              <button
                onClick={onClearChat}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Clear chat"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {isBusy ? (
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </button>
            ) : (
              <>
                <button
                  onClick={handleSend}
                  disabled={!input.trim() && selectedCount === 0}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all border bg-muted border-border text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Ideate
                  {selectedCount > 0 && (
                    <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-medium">
                      {selectedCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => selectedCount > 0 && onAddToQueue?.()}
                  disabled={selectedCount === 0}
                  className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all ${
                    selectedCount > 0
                      ? 'bg-primary text-primary-foreground hover:opacity-90'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add to Queue
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
