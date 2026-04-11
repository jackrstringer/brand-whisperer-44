interface Props {
  content: string;
  isStreaming: boolean;
}

export function AiResponseNode({ content, isStreaming }: Props) {
  if (!content && !isStreaming) return null;

  return (
    <div className="flex justify-start animate-[slide-up-section_0.5s_ease-out_forwards]">
      <div className="max-w-[85%] rounded-xl bg-muted/60 border border-border px-4 py-3">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {content}
          {isStreaming && (
            <span className="inline-block w-[2px] h-[14px] bg-primary/70 animate-lucy-blink ml-0.5 align-middle" />
          )}
        </p>
      </div>
    </div>
  );
}
