import { useState, useEffect } from 'react';
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
  onAddTask: (sendDate: string) => void;
  bulkEligibleCount: number;
  onBulkGenerate: () => void;
  bulkProgress: { completed: number; total: number } | null;
  // Lifted state from parent
  view: ViewMode;
  currentMonth: Date;
}

export function TaskWindow({
  items,
  brandId,
  calendarData,
  onRequestMonths,
  onRemove,
  onStatusChange,
  onAddTask,
  bulkEligibleCount,
  onBulkGenerate,
  bulkProgress,
  view,
  currentMonth,
}: Props) {
  const [selectedItem, setSelectedItem] = useState<DesignQueueItem | null>(null);

  useEffect(() => {
    if (selectedItem) {
      const updated = items.find(i => i.id === selectedItem.id);
      if (updated) setSelectedItem(updated);
      else setSelectedItem(null);
    }
  }, [items, selectedItem]);

  const handleItemClick = (item: DesignQueueItem) => {
    setSelectedItem(item);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Content — no header, parent renders it */}
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
            onDayClick={onAddTask}
            currentMonth={currentMonth}
          />
        )}
      </div>

      {/* Task detail peek panel (portal-based) */}
      {selectedItem && (
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
      )}
    </div>
  );
}
