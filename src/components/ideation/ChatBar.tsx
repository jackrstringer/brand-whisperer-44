import { useState, KeyboardEvent } from 'react';
import { Send, Zap, Rocket, X } from 'lucide-react';

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
}: Props) {
  const [input, setInput] = useState('');
  const isBusy = isGenerating || isChatting;

  const placeholder = selectedCount > 0
    ? 'Give feedback on selected ideas, or press Enter for variations...'
    : 'Describe your campaign idea...';

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
    <div className="border-t border-border bg-card px-4 py-3">
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

      <div className="flex items-center gap-2">
        {/* Mode toggles */}
        <button
          onClick={onToggleChaos}
          className={`p-2 rounded-lg transition-colors ${
            chaosMode ? 'bg-amber-100 text-amber-600' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          title="Chaos Mode — creative entropy"
        >
          <Zap className="w-4 h-4" />
        </button>
        <button
          onClick={onToggleTurbo}
          className={`p-2 rounded-lg transition-colors ${
            turboMode ? 'bg-purple-100 text-purple-600' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          title="Turbo Mode — 20 ideas"
        >
          <Rocket className="w-4 h-4" />
        </button>

        {/* Input */}
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isBusy}
          className="flex-1 bg-muted text-sm text-foreground placeholder:text-muted-foreground px-4 py-2.5 rounded-xl border-0 focus:outline-none focus:ring-1 focus:ring-foreground/20 disabled:opacity-50"
        />

        {/* Send */}
        <button
          onClick={handleSend}
          disabled={isBusy && !input.trim() && selectedCount === 0}
          className="p-2.5 rounded-xl bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
