import { CampaignIdea } from '@/lib/types';
import { IdeaGrid } from './IdeaGrid';
import { TurboIdeaTable } from './TurboIdeaTable';
import { Search, Loader2 } from 'lucide-react';

interface Props {
  ideas: CampaignIdea[];
  streamingIdeas: CampaignIdea[];
  isStreaming: boolean;
  isTurbo: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (idea: CampaignIdea) => void;
  onAddToQueue: (idea: CampaignIdea) => void;
  onBuildNow: (idea: CampaignIdea) => void;
  researchStatus?: string | null;
  roundIndex?: number;
}

export function GenerationNode({
  ideas,
  streamingIdeas,
  isStreaming,
  isTurbo,
  selectedIds,
  onToggleSelect,
  onAddToQueue,
  onBuildNow,
  researchStatus,
  roundIndex = 0,
}: Props) {
  const displayIdeas = isStreaming
    ? [...ideas, ...streamingIdeas.filter(si => si.title && !ideas.find(i => i.id === si.id))]
    : ideas;

  const showResearch = isStreaming && researchStatus;
  const showLoading = isStreaming && displayIdeas.length === 0 && !showResearch;

  return (
    <div className="mb-3">
      {/* Round label */}
      {roundIndex > 0 && (
        <div className="text-center mb-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50">
            Round {roundIndex + 1}
          </span>
        </div>
      )}

      {/* Research progress */}
      {showResearch && (
        <div className="flex items-center gap-3 py-4 px-4 justify-center">
          <div className="relative">
            <div className="w-8 h-8 rounded-full border-2 border-primary/20 flex items-center justify-center">
              <Search className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div className="absolute inset-0 w-8 h-8 rounded-full border-2 border-primary/30 animate-ping" />
          </div>
          <span className="text-sm text-muted-foreground animate-pulse">{researchStatus}</span>
        </div>
      )}

      {/* Bouncing dots loader */}
      {showLoading && (
        <div className="flex items-center gap-2 py-4 px-4 justify-center">
          <span className="text-sm text-muted-foreground animate-pulse">Generating ideas</span>
          <div className="flex gap-0.5">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-muted-foreground"
                style={{
                  animation: 'bounce 1s ease-in-out infinite',
                  animationDelay: `${i * 150}ms`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Ideas display */}
      {(displayIdeas.length > 0 || (isStreaming && !showResearch && !showLoading)) && (
        isTurbo ? (
          <TurboIdeaTable
            ideas={displayIdeas}
            isStreaming={isStreaming}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onAddToQueue={onAddToQueue}
            onBuildNow={onBuildNow}
          />
        ) : (
          <IdeaGrid
            ideas={displayIdeas}
            isStreaming={isStreaming}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
            onAddToQueue={onAddToQueue}
            onBuildNow={onBuildNow}
          />
        )
      )}
    </div>
  );
}
