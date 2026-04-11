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
  const hasAutoScrolledRef = useRef(false);
  const prevNodeCountRef = useRef(nodes.length);

  useEffect(() => {
    // One-shot auto-scroll per new generation round
    if (nodes.length > prevNodeCountRef.current && !hasAutoScrolledRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      hasAutoScrolledRef.current = true;
    }
    if (nodes.length < prevNodeCountRef.current) {
      hasAutoScrolledRef.current = false;
    }
    prevNodeCountRef.current = nodes.length;
  }, [nodes.length]);

  // Reset scroll lock when new generation starts
  useEffect(() => {
    if (streamingNodeId) {
      hasAutoScrolledRef.current = false;
    }
  }, [streamingNodeId]);

  let genRoundIndex = 0;

  return (
    <div className="max-w-3xl mx-auto px-6 py-4 space-y-1">
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
