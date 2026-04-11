import { useState } from 'react';
import { CAMPAIGN_TYPES, POPULAR_TYPES, CampaignType } from '@/lib/ideation/campaignTypes';
import { Search, ChevronRight, Globe } from 'lucide-react';

interface Props {
  onSelectType: (typeName: string, subtypeName?: string) => void;
  activeType: string | null;
  isCompact: boolean;
}

export function CampaignTypePicker({ onSelectType, activeType, isCompact }: Props) {
  const [expandedType, setExpandedType] = useState<string | null>(null);

  if (isCompact) {
    return (
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border flex-wrap">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mr-1">Type:</span>
        {CAMPAIGN_TYPES.map(t => (
          <button
            key={t.name}
            onClick={() => {
              if (t.subtypes) {
                setExpandedType(expandedType === t.name ? null : t.name);
              } else {
                onSelectType(t.name);
              }
            }}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
              activeType === t.name
                ? 'bg-foreground text-background'
                : 'bg-muted/60 text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {t.name}
            {t.needsResearch && <Globe className="inline-block ml-1 w-2.5 h-2.5" />}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <h2 className="text-lg font-semibold text-foreground mb-1">What kind of campaign?</h2>
      <p className="text-sm text-muted-foreground mb-5">Pick a type to generate ideas, or type a brief below.</p>

      {/* Popular types */}
      <div className="mb-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Popular</p>
        <div className="grid grid-cols-2 gap-2">
          {POPULAR_TYPES.map(t => (
            <TypeCard
              key={t.name}
              type={t}
              isActive={activeType === t.name}
              isExpanded={expandedType === t.name}
              onSelect={onSelectType}
              onExpand={() => setExpandedType(expandedType === t.name ? null : t.name)}
            />
          ))}
        </div>
      </div>

      {/* All types */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">All Types</p>
        <div className="grid grid-cols-2 gap-2">
          {CAMPAIGN_TYPES.filter(t => !t.popular).map(t => (
            <TypeCard
              key={t.name}
              type={t}
              isActive={activeType === t.name}
              isExpanded={expandedType === t.name}
              onSelect={onSelectType}
              onExpand={() => setExpandedType(expandedType === t.name ? null : t.name)}
            />
          ))}
        </div>
      </div>

      {/* Expanded subtypes */}
      {expandedType && (() => {
        const type = CAMPAIGN_TYPES.find(t => t.name === expandedType);
        if (!type?.subtypes) return null;
        return (
          <div className="mt-3 p-3 bg-muted rounded-xl animate-in slide-in-from-top-2 duration-200">
            <p className="text-xs font-medium text-muted-foreground mb-2">{type.name} subtypes</p>
            <div className="grid grid-cols-2 gap-1.5">
              {type.subtypes.map(sub => (
                <button
                  key={sub.name}
                  onClick={() => {
                    onSelectType(type.name, sub.name);
                    setExpandedType(null);
                  }}
                  className="text-left px-3 py-2 rounded-lg hover:bg-background transition-colors group"
                >
                  <span className="text-sm font-medium text-foreground group-hover:text-foreground">{sub.name}</span>
                  <span className="block text-xs text-muted-foreground">{sub.description}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function TypeCard({
  type,
  isActive,
  isExpanded,
  onSelect,
  onExpand,
}: {
  type: CampaignType;
  isActive: boolean;
  isExpanded: boolean;
  onSelect: (name: string, sub?: string) => void;
  onExpand: () => void;
}) {
  const hasSubtypes = !!type.subtypes;

  return (
    <button
      onClick={() => {
        if (hasSubtypes) onExpand();
        else onSelect(type.name);
      }}
      className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
        isActive
          ? 'border-foreground bg-foreground text-background'
          : isExpanded
          ? 'border-foreground/30 bg-muted'
          : 'border-border hover:border-foreground/20 hover:bg-muted'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${isActive ? 'text-background' : 'text-foreground'}`}>
          {type.name}
        </span>
        <div className="flex items-center gap-1">
          {type.needsResearch && (
            <Globe className={`w-3 h-3 ${isActive ? 'text-background/70' : 'text-muted-foreground'}`} />
          )}
          {hasSubtypes && (
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''} ${isActive ? 'text-background/70' : 'text-muted-foreground'}`} />
          )}
        </div>
      </div>
      <span className={`text-xs ${isActive ? 'text-background/70' : 'text-muted-foreground'}`}>
        {type.description}
      </span>
    </button>
  );
}
