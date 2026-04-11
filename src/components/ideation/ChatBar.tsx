import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Zap, Rocket, X, Square, Sparkles, ArrowRight, LayoutGrid } from 'lucide-react';
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
    placeholder = `Add direction for more ${activeType} ideas...`;
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
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 w-full max-w-[700px] px-4">
      {/* Selection indicator */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 mb-2 justify-center">
          <span className="text-xs font-medium text-white bg-white/10 px-2.5 py-1 rounded-full backdrop-blur-sm">
            {selectedCount} idea{selectedCount > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={onClearSelection}
            className="text-xs text-white/40 hover:text-white/80 flex items-center gap-0.5"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        </div>
      )}

      <div className="glass-input overflow-hidden">
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
            className="w-full bg-transparent text-[15px] text-white placeholder:text-white/40 border-0 focus:outline-none disabled:opacity-50 resize-none overflow-hidden leading-[1.6]"
            style={{ minHeight: '28px', maxHeight: '120px' }}
          />
        </div>

        {/* Bottom row — controls */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-white/[0.06]">
          <div className="flex items-center gap-1.5">
            {/* Menu toggle */}
            <button
              onClick={onToggleMenu}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                menuOpen
                  ? 'bg-primary/20 border border-primary/40 text-white'
                  : 'text-white/50 hover:text-white/80 border border-transparent'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Menu
            </button>

            {/* Turbo toggle */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              turboMode
                ? 'bg-cyan-500/20 border border-cyan-400/40 text-cyan-300'
                : 'text-white/50 border border-transparent'
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
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              chaosMode
                ? 'bg-orange-500/20 border border-orange-400/40 text-orange-300'
                : 'text-white/50 border border-transparent'
            }`}>
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Chaos</span>
              <Switch
                checked={chaosMode}
                onCheckedChange={onToggleChaos}
                className="h-4 w-7 data-[state=checked]:bg-orange-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Stop button */}
            {isBusy ? (
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-red-500/20 border border-red-400/40 text-red-300 text-xs font-medium hover:bg-red-500/30 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </button>
            ) : (
              <>
                {/* Ideate button */}
                <button
                  onClick={handleSend}
                  disabled={!input.trim() && selectedCount === 0}
                  className={`flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-medium transition-all ${
                    isBusy
                      ? 'bg-white/10 border border-white/20 text-white animate-pulse'
                      : 'bg-white/10 border border-white/20 text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Ideate
                  {selectedCount > 0 && (
                    <span className="rounded-full bg-white/20 px-1.5 text-[10px] font-medium">
                      {selectedCount}
                    </span>
                  )}
                </button>

                {/* Build button */}
                <button
                  onClick={() => selectedCount > 0 && handleSend()}
                  disabled={selectedCount === 0}
                  className={`flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-medium transition-all ${
                    selectedCount > 0
                      ? 'bg-primary text-primary-foreground hover:opacity-90'
                      : 'bg-white/[0.04] text-white/20 cursor-not-allowed'
                  }`}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  Build
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
