import { Sparkles } from 'lucide-react';

interface Props {
  content: string;
  isStreaming: boolean;
}

export function AiResponseNode({ content, isStreaming }: Props) {
  if (!content && !isStreaming) return null;

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-full flex gap-2.5">
        <div className="w-6 h-6 rounded-full bg-foreground flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles className="w-3.5 h-3.5 text-background" />
        </div>
        <div className="bg-muted px-4 py-2.5 rounded-2xl rounded-bl-md">
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {content}
            {isStreaming && <span className="inline-block w-1.5 h-4 bg-foreground/60 ml-0.5 animate-pulse" />}
          </p>
        </div>
      </div>
    </div>
  );
}
