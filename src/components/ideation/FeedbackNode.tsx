import { CampaignIdea } from '@/lib/types';

interface Props {
  content: string;
  selectedIdeas: CampaignIdea[];
}

export function FeedbackNode({ content, selectedIdeas }: Props) {
  const hasIdeas = selectedIdeas.length > 0;
  const isVariationRequest = !content.trim() || content === 'Show me variations';

  return (
    <div className="flex justify-end mb-3 animate-[slide-up-section_0.5s_ease-out_forwards]">
      <div className="max-w-sm bg-muted/60 border border-border px-4 py-2.5 rounded-2xl rounded-br-md">
        {hasIdeas && (
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-foreground">
            {isVariationRequest ? (
              <>
                <span className="text-muted-foreground">Ideate based on</span>
                {selectedIdeas.map((idea, idx) => (
                  <span key={idea.id}>
                    <span className="inline-flex items-center bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[11px] font-medium">
                      {idea.title}
                    </span>
                    {idx < selectedIdeas.length - 1 && (
                      <span className="text-muted-foreground mx-0.5">
                        {idx === selectedIdeas.length - 2 ? ' and ' : ', '}
                      </span>
                    )}
                  </span>
                ))}
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-1 mb-1.5 w-full">
                  {selectedIdeas.map(idea => (
                    <span key={idea.id} className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                      {idea.title}
                    </span>
                  ))}
                </div>
                <p className="text-[13px] text-foreground w-full">{content}</p>
              </>
            )}
          </div>
        )}
        {!hasIdeas && <p className="text-[13px] text-foreground">{content}</p>}
      </div>
    </div>
  );
}
