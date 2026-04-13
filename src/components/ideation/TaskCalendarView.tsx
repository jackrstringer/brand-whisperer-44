import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useMemo, useState } from 'react';
import { DesignQueueItem } from '@/hooks/useDesignQueue';
import { CalendarDayData } from '@/hooks/useIdeationCalendar';
import { Plus } from 'lucide-react';

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

  // Previous month trailing days
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells: { day: number; inMonth: boolean; year: number; month: number }[] = [];

  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = month - 1;
    const y = m < 0 ? year - 1 : year;
    cells.push({ day: d, inMonth: false, year: y, month: m < 0 ? 11 : m });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true, year, month });
  }

  // Next month leading days
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    const m = month + 1;
    const y = m > 11 ? year + 1 : year;
    cells.push({ day: nextDay++, inMonth: false, year: y, month: m > 11 ? 0 : m });
  }

  return cells;
}

export function TaskCalendarView({ calendarData, onPillClick, onDayClick, currentMonth }: Props) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const weeks = useMemo(() => {
    const w: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      w.push(cells.slice(i, i + 7));
    }
    return w;
  }, [cells]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border flex-shrink-0">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7" style={{ minHeight: 100 }}>
            {week.map((cell, ci) => {
              const dateStr = `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
              const isToday = dateStr === todayStr;
              const dayData = calendarData[dateStr];

              return (
                <CalendarDayCell
                  key={`${wi}-${ci}`}
                  dateStr={dateStr}
                  day={cell.day}
                  inMonth={cell.inMonth}
                  isToday={isToday}
                  dayData={dayData}
                  onPillClick={onPillClick}
                  onDayClick={onDayClick}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarDayCell({
  dateStr,
  day,
  inMonth,
  isToday,
  dayData,
  onPillClick,
  onDayClick,
}: {
  dateStr: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  dayData?: CalendarDayData;
  onPillClick?: (item: DesignQueueItem) => void;
  onDayClick?: (dateStr: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `calendar-day-${dateStr}` });
  const [hovered, setHovered] = useState(false);

  return (
    <div
      ref={setNodeRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`border-b border-r border-border/30 p-1.5 min-h-[100px] transition-colors duration-150 relative ${
        isOver
          ? 'bg-primary/10 ring-2 ring-inset ring-primary/40'
          : hovered
            ? 'bg-muted/60'
            : ''
      } ${isToday ? 'ring-1 ring-inset ring-blue-300/60 bg-blue-50/10' : ''}`}
    >
      {/* Day number + hover add button */}
      <div className="flex items-center justify-between mb-0.5">
        <span
          className={`text-[11px] font-medium leading-none ${
            isToday
              ? 'text-blue-600 bg-blue-100 rounded-full w-5 h-5 flex items-center justify-center'
              : inMonth
                ? 'text-foreground/70'
                : 'text-muted-foreground/40'
          }`}
        >
          {day}
        </span>

        {/* Always-present + button, visibility toggled to prevent layout shift */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDayClick?.(dateStr);
          }}
          className={`w-5 h-5 rounded-full flex items-center justify-center bg-primary/10 text-foreground hover:bg-primary/20 transition-all duration-100 hover:scale-110 ${
            hovered && inMonth ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Events */}
      {dayData?.events?.map(evt => (
        <div
          key={evt.id}
          className="text-[10px] text-muted-foreground/70 leading-tight truncate mb-0.5 italic"
          title={evt.event_name}
        >
          {evt.event_name}
        </div>
      ))}

      {/* Queue pills */}
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
      className={`text-[11px] font-medium px-1.5 py-1 rounded-md cursor-grab active:cursor-grabbing mt-1 leading-tight break-words transition-all duration-150 hover:ring-1 hover:ring-primary/30 hover:shadow-sm ${
        STATUS_COLORS[item.status] || STATUS_COLORS.draft
      } ${isDragging ? 'opacity-40 scale-95' : ''}`}
      title={item.title}
    >
      {item.title}
    </div>
  );
}
