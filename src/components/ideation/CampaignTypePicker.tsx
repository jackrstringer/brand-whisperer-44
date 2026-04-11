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
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/[0.06] overflow-x-auto scrollbar-none">
        <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium mr-1 flex-shrink-0">Type:</span>
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
                ? 'bg-white/20 text-white border border-white/20'
                : 'text-white/50 hover:text-white/80 hover:bg-white/[0.06] border border-transparent'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${activeType === t.name ? 'bg-white/60' : t.color}`} />
            {t.name}
            {t.needsResearch && <Globe className="inline-block w-2.5 h-2.5 opacity-60" />}
          </button>
        ))}
        <button
          onClick={() => onSelectType('')}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap text-white/50 hover:text-white/80 hover:bg-white/[0.06] transition-colors flex-shrink-0 border border-transparent"
        >
          <Shuffle className="w-3 h-3" />
          Random
        </button>
      </div>
    );
  }

  return (
    <div>
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
        {/* Random tile */}
        <button
          onClick={() => onSelectType('')}
          className="text-left px-3 py-2.5 rounded-2xl glass-card border-dashed opacity-0 animate-[fade-in-up_0.4s_ease-out_forwards]"
          style={{ animationDelay: `${ORDERED_TYPES.length * 50}ms` }}
        >
          <div className="flex items-center gap-2">
            <Shuffle className="w-3.5 h-3.5 text-white/50" />
            <span className="text-sm font-medium text-white">Random</span>
          </div>
          <span className="text-xs text-white/40 ml-5.5">Surprise me — mixed types</span>
        </button>
      </div>

      {/* Expanded subtypes */}
      {expandedType && (() => {
        const type = CAMPAIGN_TYPES.find(t => t.name === expandedType);
        if (!type?.subtypes) return null;
        return (
          <div className="mt-3 p-3 glass-card animate-in slide-in-from-top-2 duration-200">
            <p className="text-xs font-medium text-white/40 mb-2">{type.name} subtypes</p>
            <div className="grid grid-cols-2 gap-1.5">
              {type.subtypes.map((sub, si) => (
                <button
                  key={sub.name}
                  onClick={() => {
                    onSelectType(type.name, sub.name);
                    setExpandedType(null);
                  }}
                  className="text-left px-3 py-2 rounded-xl hover:bg-white/[0.06] transition-colors group opacity-0 animate-[fade-in-up_0.25s_ease-out_forwards]"
                  style={{ animationDelay: `${si * 40}ms` }}
                >
                  <span className="text-sm font-medium text-white group-hover:text-white">{sub.name}</span>
                  <span className="block text-xs text-white/40">{sub.description}</span>
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
      className={`text-left px-3 py-2.5 rounded-2xl glass-card transition-all opacity-0 animate-[fade-in-up_0.4s_ease-out_forwards] ${
        isExpanded ? 'col-span-2' : ''
      } ${
        isActive
          ? 'border-primary/40 bg-primary/[0.08] ring-1 ring-primary/20'
          : isExpanded
          ? 'border-white/20 bg-white/[0.08]'
          : ''
      }`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${type.color}`} />
          <span className="text-sm font-medium text-white">{type.name}</span>
        </div>
        <div className="flex items-center gap-1">
          {type.needsResearch && (
            <Globe className="w-3 h-3 text-white/40" />
          )}
          {hasSubtypes && (
            <ChevronRight className={`w-3.5 h-3.5 transition-transform text-white/40 ${isExpanded ? 'rotate-90' : ''}`} />
          )}
        </div>
      </div>
      <span className="text-xs ml-4 text-white/40">{type.description}</span>
    </button>
  );
}
