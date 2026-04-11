import { CampaignIdea } from '@/lib/types';
import { useDraggable } from '@dnd-kit/core';
import { Check, Plus, ArrowRight } from 'lucide-react';
import { useState } from 'react';

interface Props {
  ideas: CampaignIdea[];
  isStreaming: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (idea: CampaignIdea) => void;
  onAddToQueue: (idea: CampaignIdea) => void;
  onBuildNow: (idea: CampaignIdea) => void;
}

export function IdeaGrid({ ideas, isStreaming, selectedIds, onToggleSelect, onAddToQueue, onBuildNow }: Props) {
  const skeletonCount = isStreaming ? Math.max(0, 4 - ideas.length) : 0;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
      {ideas.map(idea => (
        <IdeaCard
          key={idea.id || idea.title}
          idea={idea}
          isSelected={selectedIds.has(idea.id)}
          isPartial={!idea.id}
          onToggleSelect={() => onToggleSelect(idea)}
          onAddToQueue={() => onAddToQueue(idea)}
          onBuildNow={() => onBuildNow(idea)}
        />
      ))}
      {Array.from({ length: skeletonCount }).map((_, i) => (
        <SkeletonCard key={`skel-${i}`} />
      ))}
    </div>
  );
}

function IdeaCard({
  idea,
  isSelected,
  isPartial,
  onToggleSelect,
  onAddToQueue,
  onBuildNow,
}: {
  idea: CampaignIdea;
  isSelected: boolean;
  isPartial: boolean;
  onToggleSelect: () => void;
  onAddToQueue: () => void;
  onBuildNow: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `idea-${idea.id || idea.title}`,
    data: { type: 'idea', idea },
    disabled: isPartial,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={isPartial ? undefined : onToggleSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative p-3 rounded-xl border cursor-pointer transition-all select-none ${
        isDragging ? 'opacity-50' : ''
      } ${
        isSelected
          ? 'border-foreground bg-foreground/[0.03] ring-1 ring-foreground/20'
          : 'border-border hover:border-foreground/20 hover:shadow-sm'
      }`}
    >
      {/* Selection check */}
      {isSelected && (
        <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-foreground flex items-center justify-center">
          <Check className="w-3 h-3 text-background" />
        </div>
      )}

      {/* Campaign type badge */}
      {idea.campaign_type && (
        <span className="inline-block text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full mb-2">
          {idea.campaign_type}
        </span>
      )}

      <h4 className="text-sm font-semibold text-foreground mb-1 pr-6 leading-tight">
        {idea.title || <span className="inline-block w-32 h-4 bg-muted rounded animate-pulse" />}
      </h4>

      {idea.description && (
        <p className="text-xs text-muted-foreground mb-1.5 line-clamp-2">{idea.description}</p>
      )}

      {idea.subject_line && (
        <p className="text-xs text-foreground/60 italic truncate">✉ {idea.subject_line}</p>
      )}

      {/* Action buttons on hover */}
      {isHovered && !isPartial && (
        <div className="absolute bottom-2.5 right-2.5 flex gap-1 animate-in fade-in duration-150" onClick={e => e.stopPropagation()}>
          <button
            onClick={onAddToQueue}
            className="p-1.5 rounded-lg bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Add to Queue"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onBuildNow}
            className="p-1.5 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
            title="Build Now"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="p-3.5 rounded-xl border border-border animate-pulse">
      <div className="w-20 h-4 bg-muted rounded-full mb-2.5" />
      <div className="w-full h-4 bg-muted rounded mb-1.5" />
      <div className="w-3/4 h-3 bg-muted rounded mb-1.5" />
      <div className="w-1/2 h-3 bg-muted rounded" />
    </div>
  );
}
