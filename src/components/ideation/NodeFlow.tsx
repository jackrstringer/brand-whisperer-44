import { useRef, useEffect } from 'react';
import { IdeationNode } from '@/hooks/useIdeation';
import { CampaignIdea } from '@/lib/types';
import { BriefNode } from './BriefNode';
import { AiResponseNode } from './AiResponseNode';
import { GenerationNode } from './GenerationNode';
import { FeedbackNode } from './FeedbackNode';

interface Props {
  nodes: IdeationNode[];
  streamingIdeas: CampaignIdea[];
  streamingNodeId: string | null;
  selectedIds: Set<string>;
  isTurbo: boolean;
  onToggleSelect: (idea: CampaignIdea) => void;
  onAddToQueue: (idea: CampaignIdea) => void;
  onBuildNow: (idea: CampaignIdea) => void;
  researchStatus?: string | null;
}

export function NodeFlow({
  nodes,
  streamingIdeas,
  streamingNodeId,
  selectedIds,
  isTurbo,
  onToggleSelect,
  onAddToQueue,
  onBuildNow,
  researchStatus,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [nodes.length, streamingIdeas.length]);

  // Count generation round indices
  let genRoundIndex = 0;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
      {nodes.map(node => {
        switch (node.type) {
          case 'brief':
            return <BriefNode key={node.id} content={node.content} campaignType={node.campaignType} campaignSubtype={node.campaignSubtype} />;
          case 'ai_response':
            return <AiResponseNode key={node.id} content={node.content} isStreaming={node.isStreaming} />;
          case 'generation': {
            const currentRound = genRoundIndex++;
            return (
              <GenerationNode
                key={node.id}
                ideas={node.ideas}
                streamingIdeas={node.id === streamingNodeId ? streamingIdeas : []}
                isStreaming={node.isStreaming}
                isTurbo={isTurbo}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onAddToQueue={onAddToQueue}
                onBuildNow={onBuildNow}
                researchStatus={node.id === streamingNodeId ? researchStatus : null}
                roundIndex={currentRound}
              />
            );
          }
          case 'feedback':
            return <FeedbackNode key={node.id} content={node.content} selectedIdeas={node.selectedIdeas} />;
          default:
            return null;
        }
      })}
      <div ref={bottomRef} />
    </div>
  );
}
