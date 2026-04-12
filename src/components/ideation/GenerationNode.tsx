import { CampaignIdea } from '@/lib/types';
import { IdeaGrid } from './IdeaGrid';
import { TurboIdeaTable } from './TurboIdeaTable';
import { Search } from 'lucide-react';

interface Props {
  ideas: CampaignIdea[];
  streamingIdeas: CampaignIdea[];
  isStreaming: boolean;
  isTurbo: boolean;
  wasTurbo?: boolean;
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
  wasTurbo,
  selectedIds,
  onToggleSelect,
  onAddToQueue,
  onBuildNow,
  researchStatus,
  roundIndex = 0,
}: Props) {
  const displayIdeas = isStreaming
    ? [...ideas, ...streamingIdeas.filter(si => (si.title || si.description) && !ideas.find(i => i.id === si.id))]
    : ideas;

  const showResearch = isStreaming && researchStatus;
  const showLoading = isStreaming && displayIdeas.length === 0 && !showResearch;

  // Use turbo display if currently streaming in turbo, or if this node was generated in turbo mode
  const useTurboDisplay = isStreaming ? isTurbo : (wasTurbo ?? false);

  return (
    <div className="mb-3 animate-[slide-up-section_0.5s_ease-out_forwards]">
      {showResearch && (
        <div className="flex items-center gap-3 py-4 px-4 justify-center animate-fade-in-up">
          <div className="relative">
            <div className="w-8 h-8 rounded-full border-2 border-primary/20 flex items-center justify-center">
              <Search className="w-4 h-4 text-muted-foreground animate-pulse" />
            </div>
            <div className="absolute inset-0 w-8 h-8 rounded-full border-2 border-primary/30 animate-ping" />
          </div>
          <span className="text-sm text-muted-foreground animate-pulse">{researchStatus}</span>
        </div>
      )}

      {showLoading && (
        <div className="flex items-center gap-2 py-4 px-4 justify-center">
          <span className="text-sm text-muted-foreground animate-pulse">Generating ideas</span>
          <div className="flex gap-0.5">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-muted-foreground/40"
                style={{
                  animation: 'bounce 1s ease-in-out infinite',
                  animationDelay: `${i * 150}ms`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {(displayIdeas.length > 0 || (useTurboDisplay && isStreaming)) && (
        useTurboDisplay ? (
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
