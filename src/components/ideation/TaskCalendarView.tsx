import { IdeationCalendar } from './IdeationCalendar';
import { DesignQueueItem } from '@/hooks/useDesignQueue';
import { CalendarDayData } from '@/hooks/useIdeationCalendar';

interface Props {
  calendarData: Record<string, CalendarDayData>;
  onRequestMonths: (months: Date[]) => void;
  onPillClick: (item: DesignQueueItem) => void;
}

export function TaskCalendarView({ calendarData, onRequestMonths, onPillClick }: Props) {
  return (
    <div className="h-full">
      <IdeationCalendar
        calendarData={calendarData}
        onRequestMonths={onRequestMonths}
        onPillClick={onPillClick}
      />
    </div>
  );
}
