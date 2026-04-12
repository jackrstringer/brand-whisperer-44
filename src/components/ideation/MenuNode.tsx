import { CampaignTypePicker } from './CampaignTypePicker';

interface Props {
  onSelectType: (type: string, sub?: string) => void;
  activeType: string | null;
}

export function MenuNode({ onSelectType, activeType }: Props) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <CampaignTypePicker
        onSelectType={onSelectType}
        activeType={activeType}
        isCompact={false}
      />
    </div>
  );
}
