import { Sparkles } from 'lucide-react';

interface Props {
  content: string;
  isStreaming: boolean;
}

export function AiResponseNode({ content, isStreaming }: Props) {
  if (!content && !isStreaming) return null;

  return (
    <div className="flex justify-start mb-3 animate-[slide-up-section_0.5s_ease-out_forwards]">
      <div className="max-w-full flex gap-2.5">
        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="w-3 h-3 text-white/70" />
        </div>
        <div className="bg-white/[0.06] border border-white/[0.06] px-4 py-2.5 rounded-2xl rounded-bl-md">
          <p className="text-sm text-white/70 whitespace-pre-wrap">
            {content}
            {isStreaming && <span className="inline-block w-[2px] h-[14px] bg-primary/70 ml-0.5 animate-lucy-blink align-middle" />}
          </p>
        </div>
      </div>
    </div>
  );
}
