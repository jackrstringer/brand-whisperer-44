import { CampaignIdea } from '@/lib/types';

interface Props {
  content: string;
  selectedIdeas: CampaignIdea[];
}

export function FeedbackNode({ content, selectedIdeas }: Props) {
  return (
    <div className="flex justify-end mb-3 animate-[slide-up-section_0.5s_ease-out_forwards]">
      <div className="max-w-sm bg-white/10 backdrop-blur-sm border border-white/[0.08] px-4 py-2.5 rounded-2xl rounded-br-md">
        {selectedIdeas.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {selectedIdeas.map(idea => (
              <span key={idea.id} className="text-xs bg-white/10 text-white/60 px-2 py-0.5 rounded-full">
                {idea.title}
              </span>
            ))}
          </div>
        )}
        <p className="text-[13px] text-white/80">{content}</p>
      </div>
    </div>
  );
}
