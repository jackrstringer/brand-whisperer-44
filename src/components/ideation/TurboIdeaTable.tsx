import { CampaignIdea } from '@/lib/types';
import { Check, Plus } from 'lucide-react';

interface Props {
  ideas: CampaignIdea[];
  isStreaming: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (idea: CampaignIdea) => void;
  onAddToQueue: (idea: CampaignIdea) => void;
}

export function TurboIdeaTable({ ideas, isStreaming, selectedIds, onToggleSelect, onAddToQueue }: Props) {
  const skeletonCount = isStreaming ? Math.max(0, 20 - ideas.length) : 0;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted">
            <th className="w-8 p-2" />
            <th className="text-left p-2 text-xs font-medium text-muted-foreground">Title</th>
            <th className="text-left p-2 text-xs font-medium text-muted-foreground">Type</th>
            <th className="w-10 p-2" />
          </tr>
        </thead>
        <tbody>
          {ideas.map(idea => {
            const isSelected = selectedIds.has(idea.id);
            return (
              <tr
                key={idea.id || idea.title}
                onClick={() => idea.id && onToggleSelect(idea)}
                className={`cursor-pointer transition-colors ${
                  isSelected ? 'bg-foreground/[0.03]' : 'hover:bg-muted/50'
                } border-t border-border`}
              >
                <td className="p-2 text-center">
                  {isSelected && (
                    <div className="w-4 h-4 rounded-full bg-foreground flex items-center justify-center mx-auto">
                      <Check className="w-2.5 h-2.5 text-background" />
                    </div>
                  )}
                </td>
                <td className="p-2 font-medium text-foreground">{idea.title}</td>
                <td className="p-2">
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {idea.campaign_type}
                  </span>
                </td>
                <td className="p-2">
                  <button
                    onClick={e => { e.stopPropagation(); onAddToQueue(idea); }}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <tr key={`skel-${i}`} className="border-t border-border">
              <td className="p-2" />
              <td className="p-2"><div className="w-40 h-4 bg-muted rounded animate-pulse" /></td>
              <td className="p-2"><div className="w-20 h-4 bg-muted rounded animate-pulse" /></td>
              <td className="p-2" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
