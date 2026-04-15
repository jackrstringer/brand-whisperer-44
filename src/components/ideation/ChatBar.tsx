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
  calendarDateCount?: number;
  onGenerateCalendarIdeas?: () => void;
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
  calendarDateCount = 0,
  onGenerateCalendarIdeas,
}: Props) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isBusy = isGenerating || isChatting;
  const hasCalendarDates = calendarDateCount > 0;

  let placeholder = "Pick a campaign type above, or describe your idea...";
  if (hasCalendarDates) {
    placeholder = `Press Enter to generate ideas for ${calendarDateCount} date${calendarDateCount > 1 ? 's' : ''}...`;
  } else if (selectedCount > 1) {
    placeholder = "Add direction for the next round of variations...";
  } else if (selectedCount === 1) {
    placeholder = "Describe how to refine this idea, or press Enter to build...";
  } else if (activeType) {
    placeholder = `Add direction for more ${activeType} ideas...`;
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '32px';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px';
    }
  }, [input]);

  const handleSend = () => {
    if (isBusy) return;
    // If calendar dates are selected, generate ideas for them
    if (hasCalendarDates && !input.trim()) {
      onGenerateCalendarIdeas?.();
      return;
    }
    const msg = input.trim();
    if (!msg && selectedCount === 0 && !activeType) return;
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
        <div className="flex items-center gap-2.5 mb-2.5 justify-center">
          <span className="text-sm font-medium text-foreground bg-muted px-3 py-1 rounded-full">
            {selectedCount} idea{selectedCount > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={onClearSelection}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors duration-150"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {/* Top row — textarea */}
        <div className="px-4 pt-3.5 pb-2.5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isBusy}
            rows={1}
            className="w-full bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/60 border-0 focus:outline-none disabled:opacity-50 resize-none overflow-hidden leading-[1.6]"
            style={{ minHeight: '32px', maxHeight: '140px' }}
          />
        </div>

        {/* Bottom row — controls */}
        <div className="flex items-center justify-between px-3.5 pb-3 pt-1.5 border-t border-border flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Menu toggle */}
            <button
              onClick={onToggleMenu}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 border ${
                menuOpen
                  ? 'bg-primary/10 border-primary/30 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border-transparent'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Menu
            </button>

            {/* Turbo toggle */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 border ${
              turboMode
                ? 'bg-cyan-50 border-cyan-200 text-cyan-700 dark:bg-cyan-950 dark:border-cyan-800 dark:text-cyan-300'
                : 'text-muted-foreground border-transparent hover:bg-muted/60'
            }`}>
              <Rocket className="w-4 h-4" />
              <span className="hidden sm:inline">Turbo</span>
              <Switch
                checked={turboMode}
                onCheckedChange={onToggleTurbo}
                className="h-4 w-7 data-[state=checked]:bg-cyan-500"
              />
            </div>

            {/* Chaos toggle */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 border ${
              chaosMode
                ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300'
                : 'text-muted-foreground border-transparent hover:bg-muted/60'
            }`}>
              <Zap className="w-4 h-4" />
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
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150"
                title="Clear chat"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isBusy ? (
              <button
                onClick={onStop}
                className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-medium hover:bg-red-100 dark:bg-red-950 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900 transition-all duration-150"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            ) : (
              <>
                <button
                  onClick={handleSend}
                  disabled={!input.trim() && selectedCount === 0 && !activeType && !hasCalendarDates}
                  className={`flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium transition-all duration-150 border ${
                    hasCalendarDates
                      ? 'bg-primary text-primary-foreground hover:opacity-90 hover:scale-[1.02] border-primary'
                      : 'bg-muted border-border text-foreground hover:bg-accent hover:scale-[1.02] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  Ideate
                  {hasCalendarDates && (
                    <span className="rounded-full bg-primary-foreground/20 px-1.5 text-xs font-medium">
                      {calendarDateCount}
                    </span>
                  )}
                  {selectedCount > 0 && !hasCalendarDates && (
                    <span className="rounded-full bg-primary/20 px-1.5 text-xs font-medium">
                      {selectedCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => selectedCount > 0 && onAddToQueue?.()}
                  disabled={selectedCount === 0}
                  className={`flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium transition-all duration-150 ${
                    selectedCount > 0
                      ? 'bg-primary text-primary-foreground hover:opacity-90 hover:scale-[1.02]'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-4 h-4" />
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
