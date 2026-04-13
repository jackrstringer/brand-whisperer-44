import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
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

function getMonthsRange(centerDate: Date, spread: number): Date[] {
  const months: Date[] = [];
  for (let i = -spread; i <= spread; i++) {
    months.push(new Date(centerDate.getFullYear(), centerDate.getMonth() + i, 1));
  }
  return months;
}

function buildMonthGrid(year: number, month: number) {
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

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

  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    const m = month + 1;
    const y = m > 11 ? year + 1 : year;
    cells.push({ day: nextDay++, inMonth: false, year: y, month: m > 11 ? 0 : m });
  }

  return cells;
}

export function TaskCalendarView({ calendarData, onRequestMonths, onPillClick, onDayClick, currentMonth }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isLoadingMore = useRef(false);

  const [months, setMonths] = useState(() => getMonthsRange(new Date(), 3));

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Notify parent of visible months so it can fetch data
  useEffect(() => {
    onRequestMonths(months);
  }, [months, onRequestMonths]);

  // Scroll to currentMonth when it changes (prev/next/today buttons)
  useEffect(() => {
    const key = `${currentMonth.getFullYear()}-${currentMonth.getMonth()}`;
    // Ensure the month exists in our list
    setMonths(prev => {
      const exists = prev.some(m => m.getFullYear() === currentMonth.getFullYear() && m.getMonth() === currentMonth.getMonth());
      if (exists) return prev;
      return getMonthsRange(currentMonth, 3);
    });
    requestAnimationFrame(() => {
      const el = monthRefs.current.get(key);
      if (el && scrollRef.current) {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    });
  }, [currentMonth]);

  // Scroll to current month on mount
  useEffect(() => {
    const todayKey = `${today.getFullYear()}-${today.getMonth()}`;
    requestAnimationFrame(() => {
      const el = monthRefs.current.get(todayKey);
      if (el && scrollRef.current) {
        el.scrollIntoView({ block: 'start' });
      }
    });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isLoadingMore.current) return;

    const nearTop = el.scrollTop < 200;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;

    if (nearTop) {
      isLoadingMore.current = true;
      const prevScrollHeight = el.scrollHeight;
      setMonths(prev => {
        const earliest = prev[0];
        const newMonths: Date[] = [];
        for (let i = 3; i >= 1; i--) {
          newMonths.push(new Date(earliest.getFullYear(), earliest.getMonth() - i, 1));
        }
        return [...newMonths, ...prev];
      });
      requestAnimationFrame(() => {
        const newScrollHeight = el.scrollHeight;
        el.scrollTop += newScrollHeight - prevScrollHeight;
        isLoadingMore.current = false;
      });
    } else if (nearBottom) {
      isLoadingMore.current = true;
      setMonths(prev => {
        const latest = prev[prev.length - 1];
        const newMonths: Date[] = [];
        for (let i = 1; i <= 3; i++) {
          newMonths.push(new Date(latest.getFullYear(), latest.getMonth() + i, 1));
        }
        return [...prev, ...newMonths];
      });
      requestAnimationFrame(() => {
        isLoadingMore.current = false;
      });
    }
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Day headers - sticky */}
      <div className="grid grid-cols-7 border-b border-border flex-shrink-0">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Scrollable multi-month grid */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0"
      >
        {months.map(monthDate => {
          const year = monthDate.getFullYear();
          const month = monthDate.getMonth();
          const key = `${year}-${month}`;
          const cells = buildMonthGrid(year, month);
          const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

          const weeks: typeof cells[] = [];
          for (let i = 0; i < cells.length; i += 7) {
            weeks.push(cells.slice(i, i + 7));
          }

          return (
            <div
              key={key}
              ref={el => { if (el) monthRefs.current.set(key, el); }}
            >
              {/* Month label */}
              <div className="sticky top-0 z-[5] px-3 py-1.5 bg-card/95 backdrop-blur-sm border-b border-border/50">
                <span className="text-xs font-semibold text-foreground">{monthLabel}</span>
              </div>

              {/* Grid */}
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7" style={{ minHeight: 140 }}>
                  {week.map((cell, ci) => {
                    const dateStr = `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
                    const isToday = dateStr === todayStr;
                    const dayData = calendarData[dateStr];

                    return (
                      <CalendarDayCell
                        key={`${key}-${wi}-${ci}`}
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
          );
        })}
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

  return (
    <div
      ref={setNodeRef}
      className={`group/cell border-b border-r border-border/30 p-1.5 min-h-[140px] transition-colors duration-150 relative cursor-pointer hover:bg-accent ${
        isOver ? 'bg-primary/10 ring-2 ring-inset ring-primary/40' : ''
      } ${isToday ? 'ring-1 ring-inset ring-blue-300/60 bg-blue-50/10' : ''}`}
    >

      {/* Day number + hover add button */}
      <div className="flex items-center justify-between mb-0.5 relative z-[1]">
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

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDayClick?.(dateStr);
          }}
          className={`w-5 h-5 rounded-full flex items-center justify-center bg-primary/10 text-foreground hover:bg-primary/20 transition-all duration-100 hover:scale-110 opacity-0 pointer-events-none group-hover/cell:opacity-100 group-hover/cell:pointer-events-auto ${
            inMonth ? '' : 'hidden'
          }`}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Events */}
      <div className="relative z-[1]">
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
