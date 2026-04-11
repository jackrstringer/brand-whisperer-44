import { useState } from 'react';
import { CAMPAIGN_TYPES, ORDERED_TYPES, CampaignType } from '@/lib/ideation/campaignTypes';
import { ChevronRight, Globe, Shuffle } from 'lucide-react';

interface Props {
  onSelectType: (typeName: string, subtypeName?: string) => void;
  activeType: string | null;
  isCompact: boolean;
}

export function CampaignTypePicker({ onSelectType, activeType, isCompact }: Props) {
  const [expandedType, setExpandedType] = useState<string | null>(null);

  if (isCompact) {
    return (
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border overflow-x-auto scrollbar-none">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mr-1 flex-shrink-0">Type:</span>
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
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
              activeType === t.name
                ? 'bg-foreground text-background'
                : 'bg-muted/60 text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeType === t.name ? 'bg-background/60' : t.color}`} />
            {t.name}
            {t.needsResearch && <Globe className="inline-block w-2.5 h-2.5 opacity-60" />}
          </button>
        ))}
        <button
          onClick={() => onSelectType('')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap bg-muted/60 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors flex-shrink-0"
        >
          <Shuffle className="w-3 h-3" />
          Random
        </button>
      </div>
    );
  }

  return (
    <div className="px-6 py-5">
      <h2 className="text-base font-semibold text-foreground mb-1">What kind of campaign?</h2>
      <p className="text-xs text-muted-foreground mb-4">Pick a type to generate ideas, or type a brief below.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {ORDERED_TYPES.map((t, i) => (
          <TypeCard
            key={t.name}
            type={t}
            index={i}
            isActive={activeType === t.name}
            isExpanded={expandedType === t.name}
            onSelect={onSelectType}
            onExpand={() => setExpandedType(expandedType === t.name ? null : t.name)}
          />
        ))}
        {/* Random / Surprise Me tile */}
        <button
          onClick={() => onSelectType('')}
          className="text-left px-3 py-2.5 rounded-xl border border-dashed border-border hover:border-foreground/20 hover:bg-muted transition-all opacity-0 animate-[fade-in-up_0.3s_ease-out_forwards]"
          style={{ animationDelay: `${ORDERED_TYPES.length * 50}ms` }}
        >
          <div className="flex items-center gap-2">
            <Shuffle className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Random</span>
          </div>
          <span className="text-xs text-muted-foreground">Surprise me — mixed types</span>
        </button>
      </div>

      {/* Expanded subtypes */}
      {expandedType && (() => {
        const type = CAMPAIGN_TYPES.find(t => t.name === expandedType);
        if (!type?.subtypes) return null;
        return (
          <div className="mt-3 p-3 bg-muted rounded-xl animate-in slide-in-from-top-2 duration-200">
            <p className="text-xs font-medium text-muted-foreground mb-2">{type.name} subtypes</p>
            <div className="grid grid-cols-2 gap-1.5">
              {type.subtypes.map((sub, si) => (
                <button
                  key={sub.name}
                  onClick={() => {
                    onSelectType(type.name, sub.name);
                    setExpandedType(null);
                  }}
                  className="text-left px-3 py-2 rounded-lg hover:bg-background transition-colors group opacity-0 animate-[fade-in-up_0.25s_ease-out_forwards]"
                  style={{ animationDelay: `${si * 40}ms` }}
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
  index,
  isActive,
  isExpanded,
  onSelect,
  onExpand,
}: {
  type: CampaignType;
  index: number;
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
      className={`text-left px-3 py-2.5 rounded-xl border transition-all opacity-0 animate-[fade-in-up_0.3s_ease-out_forwards] ${
        isExpanded ? 'col-span-2' : ''
      } ${
        isActive
          ? 'border-foreground bg-foreground text-background'
          : isExpanded
          ? 'border-foreground/30 bg-muted'
          : 'border-border hover:border-foreground/20 hover:bg-muted'
      }`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-background/60' : type.color}`} />
          <span className={`text-sm font-medium ${isActive ? 'text-background' : 'text-foreground'}`}>
            {type.name}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {type.needsResearch && (
            <Globe className={`w-3 h-3 ${isActive ? 'text-background/70' : 'text-muted-foreground'}`} />
          )}
          {hasSubtypes && (
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''} ${isActive ? 'text-background/70' : 'text-muted-foreground'}`} />
          )}
        </div>
      </div>
      <span className={`text-xs ml-4 ${isActive ? 'text-background/70' : 'text-muted-foreground'}`}>
        {type.description}
      </span>
    </button>
  );
}
