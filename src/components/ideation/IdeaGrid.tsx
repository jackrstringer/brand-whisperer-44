import { CampaignIdea } from '@/lib/types';
import { useDraggable } from '@dnd-kit/core';
import { Check, Plus, ArrowRight, Mail } from 'lucide-react';
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
  return t?.color || 'bg-muted-foreground';
}

export function IdeaGrid({ ideas, isStreaming, selectedIds, onToggleSelect, onAddToQueue, onBuildNow }: Props) {
  const skeletonCount = isStreaming ? Math.max(0, 4 - ideas.length) : 0;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
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
            <tr key={`skel-${i}`} className="border-t border-border/50">
              <td className="p-2.5 w-10"><div className="w-4 h-4 rounded-full border border-border/50 mx-auto" /></td>
              <td className="p-2.5 w-[120px]"><div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-muted" /><div className="w-16 h-3 bg-muted rounded animate-pulse" /></div></td>
              <td className="p-2.5"><div className="w-48 h-4 bg-muted rounded animate-pulse" /></td>
              <td className="p-2.5 hidden md:table-cell"><div className="w-64 h-3 bg-muted rounded animate-pulse" /></td>
              <td className="p-2.5 hidden lg:table-cell"><div className="w-40 h-3 bg-muted rounded animate-pulse" /></td>
              <td className="p-2.5 w-20" />
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
      className={`border-t border-border/50 cursor-pointer transition-colors group select-none ${
        isDragging ? 'opacity-50' : ''
      } ${
        isSelected
          ? 'bg-primary/[0.04]'
          : 'hover:bg-muted/50'
      }`}
    >
      {/* Checkbox */}
      <td className="p-2.5 w-10 align-top">
        <div className={`w-4 h-4 rounded-full border flex items-center justify-center mx-auto mt-0.5 transition-colors ${
          isSelected ? 'bg-foreground border-foreground' : 'border-border'
        }`}>
          {isSelected && <Check className="w-2.5 h-2.5 text-background" />}
        </div>
      </td>

      {/* Type */}
      <td className="p-2.5 w-[120px] align-top">
        {idea.campaign_type && (
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getTypeColor(idea.campaign_type)}`} />
            <span className="text-[11px] text-muted-foreground truncate">{idea.campaign_type}</span>
          </div>
        )}
      </td>

      {/* Title */}
      <td className="p-2.5 align-top">
        <span className="text-sm font-semibold text-foreground">
          {idea.title || <span className="inline-block w-32 h-4 bg-muted rounded animate-pulse" />}
          {isStreaming && !idea.id && (
            <span className="inline-block w-0.5 h-3.5 bg-primary/70 animate-pulse ml-0.5 align-middle" />
          )}
        </span>
      </td>

      {/* Description */}
      <td className="p-2.5 hidden md:table-cell align-top max-w-[400px]">
        {idea.description && (
          <span className="text-xs text-muted-foreground line-clamp-2">{idea.description}</span>
        )}
      </td>

      {/* Subject Line */}
      <td className="p-2.5 hidden lg:table-cell align-top w-[220px]">
        {idea.subject_line && (
          <div className="flex items-start gap-1">
            <Mail className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
            <span className="text-xs text-muted-foreground line-clamp-2">{idea.subject_line}</span>
          </div>
        )}
      </td>

      {/* Actions */}
      <td className="p-2.5 w-20 align-top">
        {!isPartial && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button
              onClick={onAddToQueue}
              className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Add to Queue"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onBuildNow}
              className="p-1 rounded-md bg-foreground text-background hover:bg-foreground/90 transition-colors"
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
