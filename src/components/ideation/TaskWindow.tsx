import { useState, useEffect } from 'react';
import { List, CalendarDays, Star } from 'lucide-react';
import { DesignQueueItem } from '@/hooks/useDesignQueue';
import { CalendarDayData } from '@/hooks/useIdeationCalendar';
import { TaskListView } from './TaskListView';
import { TaskCalendarView } from './TaskCalendarView';
import { TaskDetail } from './TaskDetail';

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

  // Keep selected item synced with items list
  useEffect(() => {
    if (selectedItem) {
      const updated = items.find(i => i.id === selectedItem.id);
      if (updated) setSelectedItem(updated);
      else setSelectedItem(null); // item was removed
    }
  }, [items, selectedItem]);

  const handleStarView = (v: ViewMode) => {
    setDefaultView(v);
    localStorage.setItem('ideation-default-view', v);
  };

  const handleItemClick = (item: DesignQueueItem) => {
    setSelectedItem(item);
  };

  // If viewing task detail
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
      {/* View toggle bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border flex-shrink-0">
        <ViewTab
          icon={<List className="w-3.5 h-3.5" />}
          label="List"
          isActive={view === 'list'}
          isDefault={defaultView === 'list'}
          onClick={() => setView('list')}
          onStar={() => handleStarView('list')}
        />
        <ViewTab
          icon={<CalendarDays className="w-3.5 h-3.5" />}
          label="Calendar"
          isActive={view === 'calendar'}
          isDefault={defaultView === 'calendar'}
          onClick={() => setView('calendar')}
          onStar={() => handleStarView('calendar')}
        />
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
          />
        )}
      </div>
    </div>
  );
}

function ViewTab({
  icon,
  label,
  isActive,
  isDefault,
  onClick,
  onStar,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  isDefault: boolean;
  onClick: () => void;
  onStar: () => void;
}) {
  return (
    <div className="flex items-center">
      <button
        onClick={onClick}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
          isActive
            ? 'bg-muted text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
      >
        {icon}
        {label}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onStar(); }}
        className={`p-1 rounded transition-colors ${
          isDefault ? 'text-amber-500' : 'text-muted-foreground/30 hover:text-muted-foreground'
        }`}
        title={isDefault ? 'Default view' : 'Set as default'}
      >
        <Star className={`w-3 h-3 ${isDefault ? 'fill-current' : ''}`} />
      </button>
    </div>
  );
}
