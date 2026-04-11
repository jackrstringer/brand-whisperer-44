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
      <div className="max-w-sm bg-white/10 backdrop-blur-sm border border-white/[0.08] px-4 py-2.5 rounded-2xl rounded-br-md">
        <p className="text-[13px] text-white/80">{label}</p>
      </div>
    </div>
  );
}
