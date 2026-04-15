import { useRef, useEffect } from 'react';
import { IdeationNode } from '@/hooks/useIdeation';
import { CampaignIdea } from '@/lib/types';
import { BriefNode } from './BriefNode';
import { GenerationNode } from './GenerationNode';
import { FeedbackNode } from './FeedbackNode';
import { AiResponseNode } from './AiResponseNode';
import { MenuNode } from './MenuNode';
import { CalendarDatesNode } from './CalendarDatesNode';

interface Props {
  nodes: IdeationNode[];
  streamingIdeas: CampaignIdea[];
  streamingNodeId: string | null;
  selectedIds: Set<string>;
  isTurbo: boolean;
  isGenerating: boolean;
  onToggleSelect: (idea: CampaignIdea) => void;
  onAddToQueue: (idea: CampaignIdea) => void;
  onBuildNow: (idea: CampaignIdea) => void;
  researchStatus?: string | null;
  onMenuSelect?: (type: string, sub?: string) => void;
  activeType?: string | null;
  onToggleCalendarDate?: (nodeId: string, dateKey: string) => void;
  onGenerateCalendarIdeas?: (nodeId: string) => void;
}

export function NodeFlow({
  nodes,
  streamingIdeas,
  streamingNodeId,
  selectedIds,
  isTurbo,
  isGenerating,
  onToggleSelect,
  onAddToQueue,
  onBuildNow,
  researchStatus,
  onMenuSelect,
  activeType,
  onToggleCalendarDate,
  onGenerateCalendarIdeas,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolledRef = useRef(false);
  const prevNodeCountRef = useRef(nodes.length);

  useEffect(() => {
    if (nodes.length > prevNodeCountRef.current && !hasAutoScrolledRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      hasAutoScrolledRef.current = true;
    }
    prevNodeCountRef.current = nodes.length;
  }, [nodes.length]);

  useEffect(() => {
    if (isGenerating) {
      hasAutoScrolledRef.current = false;
    }
  }, [isGenerating]);

  return (
    <div className="w-full max-w-full px-4 py-4 space-y-4">
      {nodes.map(node => {
        switch (node.type) {
          case 'brief':
            return <BriefNode key={node.id} content={node.content} campaignType={node.campaignType} campaignSubtype={node.campaignSubtype} />;
          case 'ai_response':
            return <AiResponseNode key={node.id} content={node.content} isStreaming={node.isStreaming} />;
          case 'generation': {
            return (
              <GenerationNode
                key={node.id}
                ideas={node.ideas}
                streamingIdeas={node.id === streamingNodeId ? streamingIdeas : []}
                isStreaming={node.isStreaming}
                isTurbo={isTurbo}
                wasTurbo={node.wasTurbo}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onAddToQueue={onAddToQueue}
                onBuildNow={onBuildNow}
                researchStatus={node.id === streamingNodeId ? researchStatus : null}
                groupLabel={node.groupLabel}
              />
            );
          }
          case 'feedback':
            return <FeedbackNode key={node.id} content={node.content} selectedIdeas={node.selectedIdeas} />;
          case 'menu':
            return onMenuSelect ? (
              <MenuNode key={node.id} onSelectType={onMenuSelect} activeType={activeType || null} />
            ) : null;
          case 'calendar_dates':
            return (
              <CalendarDatesNode
                key={node.id}
                nodeId={node.id}
                dates={node.dates}
                isLoading={node.isLoading}
                selectedDates={node.selectedDates}
                isGenerating={isGenerating}
                onToggleDate={onToggleCalendarDate || (() => {})}
              />
            );
          default:
            return null;
        }
      })}
      <div ref={bottomRef} />
    </div>
  );
}
