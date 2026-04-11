import { useState, useEffect, useCallback } from 'react';
import { List, CalendarDays, Star, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import { DesignQueueItem } from '@/hooks/useDesignQueue';
import { CalendarDayData } from '@/hooks/useIdeationCalendar';
import { TaskListView } from './TaskListView';
import { TaskCalendarView } from './TaskCalendarView';
import { TaskDetail } from './TaskDetail';
import { Button } from '@/components/ui/button';

type ViewMode = 'list' | 'calendar';

interface Props {
  items: DesignQueueItem[];
  brandId: string;
  calendarData: Record<string, CalendarDayData>;
  onRequestMonths: (months: Date[]) => void;
  onRemove: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  bulkEligibleCount: number;
  onBulkGenerate: () => void;
  bulkProgress: { completed: number; total: number } | null;
}

export function TaskWindow({
  items,
  brandId,
  calendarData,
  onRequestMonths,
  onRemove,
  onStatusChange,
  bulkEligibleCount,
  onBulkGenerate,
  bulkProgress,
}: Props) {
  const [view, setView] = useState<ViewMode>(() => {
    return (localStorage.getItem('ideation-default-view') as ViewMode) || 'list';
  });
  const [defaultView, setDefaultView] = useState<ViewMode>(() => {
    return (localStorage.getItem('ideation-default-view') as ViewMode) || 'list';
  });
  const [selectedItem, setSelectedItem] = useState<DesignQueueItem | null>(null);

  // Calendar month state (lifted here so we can show month label in header)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const monthLabel = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const goToPrev = useCallback(() => {
    const prev = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    setCurrentMonth(prev);
    onRequestMonths([prev]);
  }, [currentMonth, onRequestMonths]);

  const goToNext = useCallback(() => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    setCurrentMonth(next);
    onRequestMonths([next]);
  }, [currentMonth, onRequestMonths]);

  const goToToday = useCallback(() => {
    const now = new Date();
    const t = new Date(now.getFullYear(), now.getMonth(), 1);
    setCurrentMonth(t);
    onRequestMonths([t]);
  }, [onRequestMonths]);

  useEffect(() => {
    if (selectedItem) {
      const updated = items.find(i => i.id === selectedItem.id);
      if (updated) setSelectedItem(updated);
      else setSelectedItem(null);
    }
  }, [items, selectedItem]);

  const handleStarView = (v: ViewMode) => {
    setDefaultView(v);
    localStorage.setItem('ideation-default-view', v);
  };

  const handleItemClick = (item: DesignQueueItem) => {
    setSelectedItem(item);
  };

  if (selectedItem) {
    return (
      <TaskDetail
        item={selectedItem}
        brandId={brandId}
        onBack={() => setSelectedItem(null)}
        onRemove={(id) => {
          onRemove(id);
          setSelectedItem(null);
        }}
        onStatusChange={onStatusChange}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Unified header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1">
          {/* View toggle icons */}
          <button
            onClick={() => setView('list')}
            className={`p-1.5 rounded transition-colors ${
              view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title="List view"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleStarView(view === 'list' ? 'list' : 'calendar'); handleStarView(view); }}
            className={`p-0.5 rounded transition-colors ${
              defaultView === view ? 'text-amber-500' : 'text-muted-foreground/30 hover:text-muted-foreground'
            }`}
            title={defaultView === view ? 'Default view' : 'Set as default'}
          >
            <Star className={`w-3 h-3 ${defaultView === view ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`p-1.5 rounded transition-colors ${
              view === 'calendar' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
            title="Calendar view"
          >
            <CalendarDays className="w-3.5 h-3.5" />
          </button>

          {/* Calendar month nav — only in calendar view */}
          {view === 'calendar' && (
            <div className="flex items-center gap-0.5 ml-2">
              <button onClick={goToPrev} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-semibold text-foreground min-w-[110px] text-center">{monthLabel}</span>
              <button onClick={goToNext} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={goToToday} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted ml-1">
                Today
              </button>
            </div>
          )}
        </div>

        {/* Bulk generate */}
        {bulkEligibleCount > 0 && !bulkProgress && (
          <Button size="sm" variant="outline" onClick={onBulkGenerate} className="h-7 text-xs gap-1">
            <Zap className="w-3 h-3" />
            Bulk Generate ({bulkEligibleCount})
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {view === 'list' ? (
          <TaskListView
            items={items}
            onRemove={onRemove}
            onItemClick={handleItemClick}
            bulkEligibleCount={bulkEligibleCount}
            onBulkGenerate={onBulkGenerate}
            bulkProgress={bulkProgress}
          />
        ) : (
          <TaskCalendarView
            calendarData={calendarData}
            onRequestMonths={onRequestMonths}
            onPillClick={handleItemClick}
            currentMonth={currentMonth}
          />
        )}
      </div>
    </div>
  );
}
