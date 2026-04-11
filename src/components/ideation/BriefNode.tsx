interface Props {
  content: string;
  campaignType?: string;
  campaignSubtype?: string;
}

export function BriefNode({ content, campaignType, campaignSubtype }: Props) {
  return (
    <div className="flex justify-center mb-3">
      <div className="bg-foreground text-background px-5 py-2 rounded-full inline-flex items-center gap-2">
        {campaignType && <span className="text-xs font-medium opacity-80">{campaignType}{campaignSubtype ? ` → ${campaignSubtype}` : ''}</span>}
        {campaignType && content && <span className="opacity-40">·</span>}
        {content && <span className="text-sm">{content}</span>}
      </div>
    </div>
  );
}
