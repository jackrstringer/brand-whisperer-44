import { CalendarDays, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CalendarDateEntry {
  date: string;
  name: string;
  type: string;
  angle: string;
}

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
  dates: CalendarDateEntry[];
  isLoading: boolean;
  onIdeateDate: (entry: CalendarDateEntry) => void;
}

export function CalendarDatesNode({ dates, isLoading, onIdeateDate }: Props) {
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

  return (
    <div className="bg-card border border-border rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200 space-y-1">
      <div className="flex items-center gap-2 mb-3 px-1">
        <CalendarDays className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-medium text-foreground">Upcoming Dates — Next 30 Days</span>
        <span className="text-xs text-muted-foreground ml-auto">{dates.length} events</span>
      </div>

      {dates.map((entry, i) => (
        <div
          key={`${entry.date}-${entry.name}-${i}`}
          className="group flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
        >
          {/* Date badge */}
          <div className="flex-shrink-0 w-16 text-center">
            <span className="text-xs font-semibold text-foreground block">{formatDate(entry.date)}</span>
            <span className="text-[10px] text-muted-foreground">{daysUntil(entry.date)}</span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-foreground">{entry.name}</span>
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize",
                TYPE_COLORS[entry.type] || 'bg-muted text-muted-foreground'
              )}>
                {entry.type.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.angle}</p>
          </div>

          {/* Ideate button */}
          <button
            onClick={() => onIdeateDate(entry)}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium"
          >
            <Sparkles className="w-3 h-3" />
            Ideate
          </button>
        </div>
      ))}
    </div>
  );
}
