import { CampaignIdea } from '@/lib/types';
import { Check, Plus, ArrowRight, GripVertical } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';

interface Props {
  ideas: CampaignIdea[];
  isStreaming: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (idea: CampaignIdea) => void;
  onAddToQueue: (idea: CampaignIdea) => void;
  onBuildNow: (idea: CampaignIdea) => void;
}

export function TurboIdeaTable({ ideas, isStreaming, selectedIds, onToggleSelect, onAddToQueue, onBuildNow }: Props) {
  const totalSlots = 20;
  const filledCount = ideas.length;
  const skeletonCount = isStreaming ? Math.max(0, totalSlots - filledCount) : 0;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="w-12 p-2.5" />
            <th className="text-left p-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</th>
            <th className="w-24 p-2.5" />
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
              <td className="p-2.5">
                <div className="w-[18px] h-[18px] rounded-full border border-border bg-muted/30 mx-auto" />
              </td>
              <td className="p-2.5">
                <div className="w-52 h-5 bg-muted rounded animate-pulse" />
              </td>
              <td className="p-2.5" />
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
      onClick={isPartial ? undefined : onToggleSelect}
      className={`border-t border-border cursor-pointer transition-all duration-150 group select-none ${
        isDragging ? 'opacity-50' : ''
      } ${isSelected ? 'bg-primary/[0.06]' : 'hover:bg-muted/60'}`}
    >
      <td className="p-2.5">
        <div className="flex items-center gap-1 justify-center">
          <div
            {...listeners}
            className={`cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-all duration-150 ${
              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4" />
          </div>
          <div
            className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center transition-all duration-150 ${
              isSelected ? 'bg-primary border-primary' : 'border-border group-hover:border-muted-foreground'
            } ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            onClick={e => { e.stopPropagation(); onToggleSelect(); }}
          >
            {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
          </div>
        </div>
      </td>
      <td className="p-2.5">
        <span className="font-medium text-[15px] text-foreground transition-opacity duration-300" style={{ opacity: idea.title ? 1 : 0 }}>
          {idea.title}
        </span>
      </td>
      <td className="p-2.5">
        {!isPartial && (
          <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150" onClick={e => e.stopPropagation()}>
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
      </td>
    </tr>
  );
}
