import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { useMemo } from 'react';
import { DesignQueueItem } from '@/hooks/useDesignQueue';
import { CalendarDayData } from '@/hooks/useIdeationCalendar';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  generating: 'bg-amber-100 text-amber-700 animate-pulse',
  designed: 'bg-blue-100 text-blue-700',
  templated: 'bg-purple-100 text-purple-700',
  sent: 'bg-green-100 text-green-700',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  calendarData: Record<string, CalendarDayData>;
  onRequestMonths: (months: Date[]) => void;
  onPillClick: (item: DesignQueueItem) => void;
  onDayClick?: (dateStr: string) => void;
  currentMonth: Date;
}

function buildMonthGrid(year: number, month: number) {
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function TaskCalendarView({ calendarData, onPillClick, onDayClick, currentMonth }: Props) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  return (
    <div className="flex flex-col h-full">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border flex-shrink-0">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr min-h-0">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="border-b border-r border-border/30" />;
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateStr === todayStr;
          const dayData = calendarData[dateStr];

          return (
            <CalendarDayCell
              key={dateStr}
              dateStr={dateStr}
              day={day}
              isToday={isToday}
              dayData={dayData}
              onPillClick={onPillClick}
              onDayClick={onDayClick}
            />
          );
        })}
      </div>
    </div>
  );
}

function CalendarDayCell({
  dateStr,
  day,
  isToday,
  dayData,
  onPillClick,
  onDayClick,
}: {
  dateStr: string;
  day: number;
  isToday: boolean;
  dayData?: CalendarDayData;
  onPillClick?: (item: DesignQueueItem) => void;
  onDayClick?: (dateStr: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `calendar-day-${dateStr}` });
  const hasEvents = dayData?.events && dayData.events.length > 0;

  return (
    <div
      ref={setNodeRef}
      onClick={() => onDayClick?.(dateStr)}
      className={`border-b border-r border-border/30 p-1.5 overflow-y-auto transition-colors cursor-pointer hover:bg-muted/30 ${
        isOver ? 'bg-primary/10 ring-2 ring-inset ring-primary/40' : hasEvents ? 'bg-amber-50/30' : ''
      } ${isToday ? 'ring-1 ring-inset ring-blue-300 bg-blue-50/20' : ''}`}
    >
      <span className={`text-xs font-medium ${isToday ? 'text-blue-600' : 'text-muted-foreground'}`}>
        {day}
      </span>

      {dayData?.events?.map(evt => (
        <div key={evt.id} className="text-[10px] text-muted-foreground mt-0.5 leading-tight" title={evt.event_name}>
          {evt.event_name}
        </div>
      ))}

      {dayData?.queueItems?.map(item => (
        <DraggableCalendarPill key={item.id} item={item} onClick={() => onPillClick?.(item)} />
      ))}
    </div>
  );
}

function DraggableCalendarPill({ item, onClick }: { item: DesignQueueItem; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `cal-pill-${item.id}`,
    data: { type: 'queue-item', item },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={`text-xs font-medium px-1.5 py-1 rounded cursor-pointer mt-1 leading-tight break-words ${
        STATUS_COLORS[item.status] || STATUS_COLORS.draft
      } ${isDragging ? 'opacity-50' : ''}`}
      title={item.title}
    >
      {item.title}
    </div>
  );
}
