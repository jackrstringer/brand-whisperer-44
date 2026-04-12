import { useState } from 'react';
import { CampaignIdea } from '@/lib/types';
import { useDraggable } from '@dnd-kit/core';
import { Check, Plus, ArrowRight } from 'lucide-react';
import { CAMPAIGN_TYPES } from '@/lib/ideation/campaignTypes';

interface Props {
  ideas: CampaignIdea[];
  isStreaming: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (idea: CampaignIdea) => void;
  onAddToQueue: (idea: CampaignIdea) => void;
  onBuildNow: (idea: CampaignIdea) => void;
}

function getTypeColor(typeName?: string): string {
  const t = CAMPAIGN_TYPES.find(ct => ct.name === typeName);
  return t?.color || 'bg-muted-foreground/30';
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
        <div key={`skel-${i}`} className="px-4 py-3.5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border border-border flex-shrink-0" />
            <div className="w-20 h-3 bg-muted rounded animate-pulse" />
          </div>
          <div className="w-48 h-4 bg-muted rounded animate-pulse" />
          <div className="w-64 h-3 bg-muted rounded animate-pulse" />
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

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`group relative px-4 py-3 cursor-pointer transition-colors duration-100 select-none ${
        isDragging ? 'opacity-50' : ''
      } ${
        isSelected
          ? 'bg-primary/[0.06]'
          : 'hover:bg-muted/50'
      }`}
    >
      {/* Selection indicator bar */}
      {isSelected && (
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
      )}

      {/* Row 1: Checkbox + Type + Actions */}
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
            isSelected ? 'bg-primary border-primary' : 'border-border group-hover:border-muted-foreground/50'
          }`}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        >
          {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
        </div>

        {idea.campaign_type && (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getTypeColor(idea.campaign_type)}`} />
            <span className="text-[11px] text-muted-foreground">{idea.campaign_type}</span>
          </div>
        )}

        {!isPartial && (
          <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button
              onClick={onAddToQueue}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Add to Queue"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onBuildNow}
              className="p-1 rounded-md bg-primary/10 text-foreground hover:bg-primary/20 transition-colors"
              title="Build Now"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Row 2: Title */}
      <div className="text-[13px] font-semibold text-foreground leading-snug mb-0.5">
        {idea.title || <span className="inline-block w-40 h-4 bg-muted rounded animate-pulse" />}
        {isStreaming && !idea.id && (
          <span className="inline-block w-[2px] h-[14px] bg-primary/70 animate-lucy-blink ml-0.5 align-middle" />
        )}
      </div>

      {/* Row 3: Description (if present) */}
      {idea.description && (
        <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2 mb-0.5">
          {idea.description}
        </p>
      )}
      {isStreaming && !idea.id && !idea.description && (
        <div className="w-52 h-3 bg-muted rounded animate-pulse mb-0.5" />
      )}

      {/* Row 4: Subject line (subtle, inline) */}
      {idea.subject_line && (
        <p className="text-[11px] text-muted-foreground/70 italic truncate">
          ✉ {idea.subject_line}
        </p>
      )}
    </div>
  );
}
