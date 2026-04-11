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
  return t?.color || 'bg-white/20';
}

export function TurboIdeaTable({ ideas, isStreaming, selectedIds, onToggleSelect, onAddToQueue, onBuildNow }: Props) {
  const totalSlots = 20;
  const filledCount = ideas.length;
  const skeletonCount = isStreaming ? Math.max(0, totalSlots - filledCount) : 0;

  return (
    <div className="glass-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="w-10 p-2" />
            <th className="text-left p-2 text-[10px] font-medium text-white/30 uppercase tracking-wider w-[200px]">Campaign Type</th>
            <th className="text-left p-2 text-[10px] font-medium text-white/30 uppercase tracking-wider">Title</th>
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
            <tr key={`skel-${i}`} className="border-t border-white/[0.04]">
              <td className="p-2">
                <div className="w-4 h-4 rounded border border-white/10 mx-auto" />
              </td>
              <td className="p-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-white/[0.06]" />
                  <div className="w-20 h-3 bg-white/[0.03] rounded animate-pulse" />
                </div>
              </td>
              <td className="p-2">
                <div className="w-48 h-4 bg-white/[0.03] rounded animate-pulse" />
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
      className={`border-t border-white/[0.04] cursor-pointer transition-all group select-none ${
        isDragging ? 'opacity-50' : ''
      } ${isSelected ? 'bg-primary/[0.08]' : 'hover:bg-white/[0.04]'}`}
    >
      <td className="p-2 text-center">
        <div className={`w-4 h-4 rounded border flex items-center justify-center mx-auto transition-colors ${
          isSelected ? 'bg-white border-white' : 'border-white/20'
        }`}>
          {isSelected && <Check className="w-2.5 h-2.5 text-[#0f1117]" />}
        </div>
      </td>
      <td className="p-2">
        {idea.campaign_type && (
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getTypeColor(idea.campaign_type)}`} />
            <span className="text-[11px] text-white/40">{idea.campaign_type}</span>
          </div>
        )}
      </td>
      <td className="p-2">
        <span className="font-medium text-white transition-opacity duration-300" style={{ opacity: idea.title ? 1 : 0 }}>
          {idea.title}
          {isPartial && <span className="inline-block w-[2px] h-[14px] bg-primary/70 animate-lucy-blink ml-0.5 align-middle" />}
        </span>
      </td>
      <td className="p-2">
        {!isPartial && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button onClick={onAddToQueue} className="p-1 rounded-md hover:bg-white/10 text-white/40 hover:text-white" title="Add to Queue">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button onClick={onBuildNow} className="p-1 rounded-md bg-white/10 text-white hover:bg-white/20" title="Build Now">
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
