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
    <div className="border border-border rounded-xl overflow-hidden bg-card w-full">
      <table className="w-full text-sm table-fixed">
        <thead>
          <tr className="border-b border-border">
            <th className="w-10 p-2" />
            <th className="text-left p-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider w-[140px]">Type</th>
            <th className="text-left p-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider w-[25%]">Title</th>
            <th className="text-left p-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Description</th>
            <th className="text-left p-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell w-[20%]">Subject Line</th>
            <th className="w-16 p-2" />
          </tr>
        </thead>
        <tbody>
          {ideas.map((idea, i) => (
            <IdeaRow
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
            <tr key={`skel-${i}`} className="border-t border-border">
              <td className="p-2.5 w-10"><div className="w-4 h-4 rounded-full border border-border mx-auto" /></td>
              <td className="p-2.5"><div className="w-20 h-3 bg-muted rounded animate-pulse" /></td>
              <td className="p-2.5"><div className="w-32 h-4 bg-muted rounded animate-pulse" /></td>
              <td className="p-2.5 hidden md:table-cell"><div className="w-48 h-3 bg-muted rounded animate-pulse" /></td>
              <td className="p-2.5 hidden lg:table-cell"><div className="w-28 h-3 bg-muted rounded animate-pulse" /></td>
              <td className="p-2.5 w-16" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IdeaRow({
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
    <tr
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={isPartial ? undefined : onToggleSelect}
      className={`border-t border-border cursor-pointer transition-colors group select-none ${
        isDragging ? 'opacity-50' : ''
      } ${
        isSelected
          ? 'bg-primary/[0.06]'
          : 'hover:bg-muted/50'
      }`}
    >
      <td className="p-2.5 w-10 align-middle">
        <div className={`w-4 h-4 rounded-full border flex items-center justify-center mx-auto transition-colors ${
          isSelected ? 'bg-primary border-primary' : 'border-border'
        }`}>
          {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
        </div>
      </td>

      <td className="p-2.5 align-middle">
        {idea.campaign_type && (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getTypeColor(idea.campaign_type)}`} />
            <span className="text-[11px] text-muted-foreground truncate">{idea.campaign_type}</span>
          </div>
        )}
      </td>

      <td className="p-2.5 align-middle">
        <span className="text-[13px] font-semibold text-foreground truncate block">
          {idea.title || <span className="inline-block w-32 h-4 bg-muted rounded animate-pulse" />}
          {isStreaming && !idea.id && (
            <span className="inline-block w-[2px] h-[14px] bg-primary/70 animate-lucy-blink ml-0.5 align-middle" />
          )}
        </span>
      </td>

      <td className="p-2.5 align-middle hidden md:table-cell">
        <span className="text-[12px] text-muted-foreground line-clamp-2">
          {idea.description || (isStreaming && !idea.id ? <span className="inline-block w-40 h-3 bg-muted rounded animate-pulse" /> : null)}
        </span>
      </td>

      <td className="p-2.5 align-middle hidden lg:table-cell">
        <span className="text-[12px] text-muted-foreground truncate block">
          {idea.subject_line || null}
        </span>
      </td>

      <td className="p-2.5 w-16 align-middle">
        {!isPartial && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
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
      </td>
    </tr>
  );
}
