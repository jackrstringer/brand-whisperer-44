interface Props {
  content: string;
  campaignType?: string;
  campaignSubtype?: string;
}

export function BriefNode({ content, campaignType, campaignSubtype }: Props) {
  const label = campaignType
    ? `${campaignType}${campaignSubtype ? `: ${campaignSubtype}` : ''}${content ? ' — ' + content : ''}`
    : content;

  return (
    <div className="flex justify-end mb-3 animate-[slide-up-section_0.5s_ease-out_forwards]">
      <div className="max-w-sm bg-muted rounded-2xl rounded-br-md px-4 py-2.5">
        <p className="text-[13px] text-foreground">{label}</p>
      </div>
    </div>
  );
}
