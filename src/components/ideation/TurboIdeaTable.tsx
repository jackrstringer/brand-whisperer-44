import { CampaignIdea } from '@/lib/types';
import { Check, Plus, ArrowRight } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
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

export function TurboIdeaTable({ ideas, isStreaming, selectedIds, onToggleSelect, onAddToQueue, onBuildNow }: Props) {
  const totalSlots = 20;
  const filledCount = ideas.length;
  const skeletonCount = isStreaming ? Math.max(0, totalSlots - filledCount) : 0;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="w-10 p-2" />
            <th className="text-left p-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider w-[200px]">Campaign Type</th>
            <th className="text-left p-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Title</th>
            <th className="w-20 p-2" />
          </tr>
        </thead>
        <tbody>
          {ideas.map((idea, i) => (
            <TurboRow
              key={idea.id || `turbo-${i}`}
              idea={idea}
              isSelected={selectedIds.has(idea.id)}
              isPartial={!idea.id}
              onToggleSelect={() => onToggleSelect(idea)}
              onAddToQueue={() => onAddToQueue(idea)}
              onBuildNow={() => onBuildNow(idea)}
            />
          ))}
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <tr key={`skel-${i}`} className="border-t border-border">
              <td className="p-2">
                <div className="w-4 h-4 rounded border border-border bg-muted/30 mx-auto" />
              </td>
              <td className="p-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted" />
                  <div className="w-20 h-3 bg-muted rounded animate-pulse" />
                </div>
              </td>
              <td className="p-2">
                <div className="w-48 h-4 bg-muted rounded animate-pulse" />
              </td>
              <td className="p-2" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TurboRow({
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
      className={`border-t border-border cursor-pointer transition-all group select-none ${
        isDragging ? 'opacity-50' : ''
      } ${isSelected ? 'bg-primary/[0.08]' : 'hover:bg-muted/50'}`}
    >
      <td className="p-2 text-center">
        <div className={`w-4 h-4 rounded border flex items-center justify-center mx-auto transition-colors ${
          isSelected ? 'bg-primary border-primary' : 'border-border'
        }`}>
          {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
        </div>
      </td>
      <td className="p-2">
        {idea.campaign_type && (
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getTypeColor(idea.campaign_type)}`} />
            <span className="text-[11px] text-muted-foreground">{idea.campaign_type}</span>
          </div>
        )}
      </td>
      <td className="p-2">
        <span className="font-medium text-foreground transition-opacity duration-300" style={{ opacity: idea.title ? 1 : 0 }}>
          {idea.title}
        </span>
      </td>
      <td className="p-2">
        {!isPartial && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button onClick={onAddToQueue} className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" title="Add to Queue">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button onClick={onBuildNow} className="p-1 rounded-md bg-primary/10 text-foreground hover:bg-primary/20" title="Build Now">
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
