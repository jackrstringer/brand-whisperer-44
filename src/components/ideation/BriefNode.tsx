interface Props {
  content: string;
  campaignType?: string;
  campaignSubtype?: string;
}

export function BriefNode({ content, campaignType, campaignSubtype }: Props) {
  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[80%] bg-foreground text-background px-4 py-2.5 rounded-2xl rounded-br-md">
        <p className="text-sm">{content}</p>
      </div>
    </div>
  );
}
