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
  return t?.color || 'bg-white/20';
}

export function IdeaGrid({ ideas, isStreaming, selectedIds, onToggleSelect, onAddToQueue, onBuildNow }: Props) {
  const skeletonCount = isStreaming ? Math.max(0, 4 - ideas.length) : 0;

  return (
    <div className="glass-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="w-10 p-2" />
            <th className="text-left p-2 text-[10px] font-medium text-white/30 uppercase tracking-wider w-[140px]">Campaign Type</th>
            <th className="text-left p-2 text-[10px] font-medium text-white/30 uppercase tracking-wider">Title</th>
            <th className="text-left p-2 text-[10px] font-medium text-white/30 uppercase tracking-wider hidden md:table-cell max-w-[400px]">Description</th>
            <th className="text-left p-2 text-[10px] font-medium text-white/30 uppercase tracking-wider hidden lg:table-cell w-[220px]">Subject Line</th>
            <th className="w-20 p-2" />
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
            <tr key={`skel-${i}`} className="border-t border-white/[0.04]">
              <td className="p-2.5 w-10"><div className="w-4 h-4 rounded-full border border-white/10 mx-auto" /></td>
              <td className="p-2.5 w-[140px]"><div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-white/[0.06]" /><div className="w-16 h-3 bg-white/[0.03] rounded animate-pulse" /></div></td>
              <td className="p-2.5"><div className="w-48 h-4 bg-white/[0.03] rounded animate-pulse" /></td>
              <td className="p-2.5 hidden md:table-cell"><div className="w-64 h-3 bg-white/[0.03] rounded animate-pulse" /></td>
              <td className="p-2.5 hidden lg:table-cell"><div className="w-40 h-3 bg-white/[0.03] rounded animate-pulse" /></td>
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
      className={`border-t border-white/[0.04] cursor-pointer transition-colors group select-none ${
        isDragging ? 'opacity-50' : ''
      } ${
        isSelected
          ? 'bg-primary/[0.08]'
          : 'hover:bg-white/[0.04]'
      }`}
    >
      <td className="p-2.5 w-10 align-top">
        <div className={`w-4 h-4 rounded border flex items-center justify-center mx-auto mt-0.5 transition-colors ${
          isSelected ? 'bg-white border-white' : 'border-white/20'
        }`}>
          {isSelected && <Check className="w-2.5 h-2.5 text-[#0f1117]" />}
        </div>
      </td>

      <td className="p-2.5 w-[140px] align-top">
        {idea.campaign_type && (
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getTypeColor(idea.campaign_type)}`} />
            <span className="text-[11px] text-white/40 truncate">{idea.campaign_type}</span>
          </div>
        )}
      </td>

      <td className="p-2.5 align-top">
        <span className="text-[13px] font-semibold text-white">
          {idea.title || <span className="inline-block w-32 h-4 bg-white/[0.03] rounded animate-pulse" />}
          {isStreaming && !idea.id && (
            <span className="inline-block w-[2px] h-[14px] bg-primary/70 animate-lucy-blink ml-0.5 align-middle" />
          )}
        </span>
      </td>

      <td className="p-2.5 hidden md:table-cell align-top max-w-[400px]">
        {idea.description && (
          <span className="text-xs text-white/40 line-clamp-2">{idea.description}</span>
        )}
      </td>

      <td className="p-2.5 hidden lg:table-cell align-top w-[220px]">
        {idea.subject_line && (
          <div className="flex items-start gap-1">
            <Mail className="w-3 h-3 text-white/30 mt-0.5 flex-shrink-0" />
            <span className="text-xs text-white/40 line-clamp-2">{idea.subject_line}</span>
          </div>
        )}
      </td>

      <td className="p-2.5 w-20 align-top">
        {!isPartial && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            <button
              onClick={onAddToQueue}
              className="p-1 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors"
              title="Add to Queue"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onBuildNow}
              className="p-1 rounded-md bg-white/10 text-white hover:bg-white/20 transition-colors"
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
