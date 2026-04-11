import { CampaignIdea } from '@/lib/types';

interface Props {
  content: string;
  selectedIdeas: CampaignIdea[];
}

export function FeedbackNode({ content, selectedIdeas }: Props) {
  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[80%] bg-foreground text-background px-4 py-2.5 rounded-2xl rounded-br-md">
        {selectedIdeas.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {selectedIdeas.map(idea => (
              <span key={idea.id} className="text-xs bg-background/20 px-2 py-0.5 rounded-full">
                {idea.title}
              </span>
            ))}
          </div>
        )}
        <p className="text-sm">{content}</p>
      </div>
    </div>
  );
}
