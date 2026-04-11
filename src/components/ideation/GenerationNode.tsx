import { CampaignIdea } from '@/lib/types';
import { IdeaGrid } from './IdeaGrid';
import { TurboIdeaTable } from './TurboIdeaTable';

interface Props {
  ideas: CampaignIdea[];
  streamingIdeas: CampaignIdea[];
  isStreaming: boolean;
  isTurbo: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (idea: CampaignIdea) => void;
  onAddToQueue: (idea: CampaignIdea) => void;
  onBuildNow: (idea: CampaignIdea) => void;
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
}: Props) {
  const displayIdeas = isStreaming
    ? [...ideas, ...streamingIdeas.filter(si => si.title && !ideas.find(i => i.id === si.id))]
    : ideas;

  if (isTurbo && displayIdeas.length > 6) {
    return (
      <div className="mb-4">
        <TurboIdeaTable
          ideas={displayIdeas}
          isStreaming={isStreaming}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onAddToQueue={onAddToQueue}
        />
      </div>
    );
  }

  return (
    <div className="mb-3">
      <IdeaGrid
        ideas={displayIdeas}
        isStreaming={isStreaming}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
        onAddToQueue={onAddToQueue}
        onBuildNow={onBuildNow}
      />
    </div>
  );
}
