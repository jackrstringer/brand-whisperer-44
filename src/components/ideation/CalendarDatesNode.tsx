import { CalendarDays, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalendarDateEntry } from '@/hooks/useIdeation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

const TYPE_COLORS: Record<string, string> = {
  holiday: 'bg-red-500/15 text-red-400',
  cultural: 'bg-violet-500/15 text-violet-400',
  social_media: 'bg-blue-500/15 text-blue-400',
  awareness: 'bg-emerald-500/15 text-emerald-400',
  niche: 'bg-amber-500/15 text-amber-400',
  seasonal: 'bg-orange-500/15 text-orange-400',
  pop_culture: 'bg-pink-500/15 text-pink-400',
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
}

function daysUntil(dateStr: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T12:00:00');
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return `${diff}d`;
}

interface Props {
  nodeId: string;
  dates: CalendarDateEntry[];
  isLoading: boolean;
  selectedDates: Set<string>;
  onToggleDate: (nodeId: string, dateKey: string) => void;
}

export function CalendarDatesNode({ nodeId, dates, isLoading, selectedDates, onToggleDate }: Props) {
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Researching upcoming dates and events...</span>
        </div>
      </div>
    );
  }

  if (!dates.length) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <p className="text-sm text-muted-foreground">No upcoming dates found.</p>
      </div>
    );
  }

  const selectedCount = selectedDates.size;

  const handleSelectAll = () => {
    const allSelected = dates.every(d => selectedDates.has(`${d.date}-${d.name}`));
    dates.forEach(d => {
      const key = `${d.date}-${d.name}`;
      if (allSelected) {
        if (selectedDates.has(key)) onToggleDate(nodeId, key);
      } else {
        if (!selectedDates.has(key)) onToggleDate(nodeId, key);
      }
    });
  };

  const allSelected = dates.length > 0 && dates.every(d => selectedDates.has(`${d.date}-${d.name}`));

  return (
    <div className="bg-card border border-border rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200 space-y-1">
      <div className="flex items-center gap-2 mb-3 px-1">
        <CalendarDays className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-medium text-foreground">Upcoming Dates — Next 30 Days</span>
        <span className="text-xs text-muted-foreground ml-auto">{dates.length} events</span>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border mb-1">
        <Checkbox
          checked={allSelected}
          onCheckedChange={handleSelectAll}
          className="h-3.5 w-3.5"
        />
        <span className="text-xs text-muted-foreground">Select all</span>
      </div>

      {dates.map((entry, i) => {
        const key = `${entry.date}-${entry.name}`;
        const isSelected = selectedDates.has(key);

        return (
          <label
            key={`${key}-${i}`}
            className={cn(
              'group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
              isSelected ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/50 border border-transparent'
            )}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleDate(nodeId, key)}
              className="h-3.5 w-3.5 flex-shrink-0"
            />

            <div className="flex-shrink-0 w-16 text-center">
              <span className="text-xs font-semibold text-foreground block">{formatDate(entry.date)}</span>
              <span className="text-[10px] text-muted-foreground">{daysUntil(entry.date)}</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">{entry.name}</span>
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize',
                  TYPE_COLORS[entry.type] || 'bg-muted text-muted-foreground'
                )}>
                  {entry.type.replace('_', ' ')}
                </span>
              </div>
            </div>
          </label>
        );
      })}

    </div>
  );
}
