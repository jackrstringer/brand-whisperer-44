import { CampaignIdea } from '@/lib/types';
import { useDraggable } from '@dnd-kit/core';
import { Check, Plus, ArrowRight, GripVertical } from 'lucide-react';

interface Props {
  ideas: CampaignIdea[];
  isStreaming: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (idea: CampaignIdea) => void;
  onAddToQueue: (idea: CampaignIdea) => void;
  onBuildNow: (idea: CampaignIdea) => void;
}

export function IdeaGrid({ ideas, isStreaming, selectedIds, onToggleSelect, onAddToQueue, onBuildNow }: Props) {
  const skeletonCount = isStreaming ? Math.max(0, 2 - ideas.length) : 0;

  return (
    <div className="space-y-0 border border-border rounded-xl overflow-hidden bg-card w-full divide-y divide-border">
      {ideas.map((idea, i) => (
        <IdeaCard
          key={idea.id || `idea-${i}`}
          idea={idea}
          isSelected={selectedIds.has(idea.id)}
          isPartial={!idea.id}
          isStreaming={isStreaming && !idea.id}
          onToggleSelect={() => onToggleSelect(idea)}
          onAddToQueue={() => onAddToQueue(idea)}
          onBuildNow={() => onBuildNow(idea)}
        />
      ))}
      {Array.from({ length: skeletonCount }).map((_, i) => (
        <div key={`skel-${i}`} className="px-5 py-4 space-y-2.5">
          <div className="w-52 h-5 bg-muted rounded animate-pulse" />
          <div className="w-72 h-4 bg-muted rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function IdeaCard({
  idea,
  isSelected,
  isPartial,
  isStreaming,
  onToggleSelect,
  onAddToQueue,
  onBuildNow,
}: {
  idea: CampaignIdea;
  isSelected: boolean;
  isPartial: boolean;
  isStreaming: boolean;
  onToggleSelect: () => void;
  onAddToQueue: () => void;
  onBuildNow: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `idea-${idea.id || idea.title}`,
    data: { type: 'idea', idea },
    disabled: isPartial,
  });

  const handleClick = () => {
    if (!isPartial) onToggleSelect();
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      onClick={handleClick}
      className={`group relative flex gap-2.5 px-5 py-3.5 cursor-pointer transition-all duration-150 select-none ${
        isDragging ? 'opacity-50' : ''
      } ${
        isSelected
          ? 'bg-primary/[0.06]'
          : 'hover:bg-muted/60'
      }`}
    >
      {/* Selection indicator bar */}
      {isSelected && (
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
      )}

      {/* Left controls: grab handle + checkbox, visible on hover or selected */}
      <div
        className={`flex items-center gap-0.5 flex-shrink-0 pt-0.5 transition-opacity duration-150 ${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div
          className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 transition-all duration-150 cursor-pointer ${
            isSelected
              ? 'bg-primary border-primary scale-100'
              : 'border-border hover:border-muted-foreground hover:scale-105'
          }`}
          onClick={onToggleSelect}
        >
          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title */}
        <div className="text-[15px] font-semibold text-foreground leading-snug mb-1">
          {idea.title || <span className="inline-block w-44 h-5 bg-muted rounded animate-pulse" />}
          {isStreaming && !idea.id && (
            <span className="inline-block w-[2px] h-[16px] bg-primary/70 animate-lucy-blink ml-0.5 align-middle" />
          )}
        </div>

        {/* Description */}
        {idea.description && (
          <p className="text-[14px] text-muted-foreground leading-relaxed line-clamp-2 mb-1">
            {idea.description}
          </p>
        )}
        {isStreaming && !idea.id && !idea.description && (
          <div className="w-60 h-4 bg-muted rounded animate-pulse mb-1" />
        )}

        {/* Subject line */}
        {idea.subject_line && (
          <p className="text-[14px] text-muted-foreground/60 truncate">
            {idea.subject_line}
          </p>
        )}
      </div>

      {/* Right actions on hover */}
      {!isPartial && (
        <div
          className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={onAddToQueue}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-150 hover:scale-105"
            title="Add to Queue"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onBuildNow}
            className="p-1.5 rounded-lg bg-primary/10 text-foreground hover:bg-primary/20 transition-all duration-150 hover:scale-105"
            title="Build Now"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
