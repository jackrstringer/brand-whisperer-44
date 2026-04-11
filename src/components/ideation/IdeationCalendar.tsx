import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { useRef, useEffect, useCallback, useState } from 'react';
import { DesignQueueItem } from '@/hooks/useDesignQueue';
import { CalendarDayData } from '@/hooks/useIdeationCalendar';

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-muted text-muted-foreground',
  configured: 'bg-blue-100 text-blue-700',
  generating: 'bg-amber-100 text-amber-700',
  generated: 'bg-green-100 text-green-700',
  sent: 'bg-green-600 text-white',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  calendarData: Record<string, CalendarDayData>;
  onRequestMonths: (months: Date[]) => void;
  onPillClick?: (item: DesignQueueItem) => void;
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
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function IdeationCalendar({ calendarData, onRequestMonths, onPillClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [months, setMonths] = useState(() => getMonthsRange(new Date(), 3));
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isLoadingMore = useRef(false);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Notify parent of visible months so it can fetch data
  useEffect(() => {
    onRequestMonths(months);
  }, [months, onRequestMonths]);

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

    // Load more months when near top or bottom
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
    <div className="flex flex-col h-full">
      {/* Day headers - sticky */}
      <div className="grid grid-cols-7 border-b border-border bg-card sticky top-0 z-10">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Scrollable month grid */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {months.map(monthDate => {
          const year = monthDate.getFullYear();
          const month = monthDate.getMonth();
          const key = `${year}-${month}`;
          const cells = buildMonthGrid(year, month);
          const monthLabel = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

          return (
            <div
              key={key}
              ref={el => { if (el) monthRefs.current.set(key, el); }}
            >
              {/* Month label */}
              <div className="sticky top-[29px] z-[5] px-3 py-1.5 bg-card/95 backdrop-blur-sm border-b border-border/50">
                <span className="text-xs font-semibold text-foreground">{monthLabel}</span>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-7">
                {cells.map((day, idx) => {
                  if (day === null) return <div key={`${key}-e-${idx}`} className="border-b border-r border-border/30 min-h-[56px]" />;

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
                    />
                  );
                })}
              </div>
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
  isToday,
  dayData,
  onPillClick,
}: {
  dateStr: string;
  day: number;
  isToday: boolean;
  dayData?: CalendarDayData;
  onPillClick?: (item: DesignQueueItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `calendar-day-${dateStr}` });
  const hasEvents = dayData?.events && dayData.events.length > 0;

  return (
    <div
      ref={setNodeRef}
      className={`border-b border-r border-border/30 p-1 min-h-[56px] transition-colors ${
        isOver ? 'bg-foreground/[0.05]' : hasEvents ? 'bg-amber-50/30' : ''
      } ${isToday ? 'ring-1 ring-inset ring-blue-300 bg-blue-50/20' : ''}`}
    >
      <span className={`text-[10px] font-medium ${isToday ? 'text-blue-600' : 'text-muted-foreground'}`}>
        {day}
      </span>

      {dayData?.events?.map(evt => (
        <div key={evt.id} className="text-[8px] text-muted-foreground truncate mt-0.5" title={evt.event_name}>
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
      className={`text-[8px] font-medium px-1 py-0.5 rounded truncate cursor-pointer mt-0.5 ${
        STATUS_COLORS[item.status] || STATUS_COLORS.queued
      } ${isDragging ? 'opacity-50' : ''}`}
      title={item.title}
    >
      {item.title}
    </div>
  );
}
