import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useMemo } from 'react';
import { DesignQueueItem } from '@/hooks/useDesignQueue';

interface CalendarEvent {
  id: string;
  event_name: string;
  event_date: string;
  event_type: string;
}

export interface CalendarDayData {
  queueItems: DesignQueueItem[];
  events: CalendarEvent[];
}

function startOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function endOfMonth(d: Date): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

export function useIdeationCalendar(brandId: string) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const queueQuery = useQuery({
    queryKey: ['calendar-queue', brandId, monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_queue_items')
        .select('*')
        .eq('brand_id', brandId)
        .not('send_date', 'is', null)
        .gte('send_date', monthStart)
        .lte('send_date', monthEnd);
      if (error) throw error;
      return (data || []) as DesignQueueItem[];
    },
    enabled: !!brandId,
  });

  const eventsQuery = useQuery({
    queryKey: ['calendar-events', brandId, monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brand_calendar')
        .select('*')
        .eq('brand_id', brandId)
        .gte('event_date', monthStart)
        .lte('event_date', monthEnd);
      if (error) throw error;
      return (data || []) as CalendarEvent[];
    },
    enabled: !!brandId,
  });

  const calendarData = useMemo(() => {
    const map: Record<string, CalendarDayData> = {};
    for (const item of queueQuery.data || []) {
      if (!item.send_date) continue;
      const key = item.send_date;
      if (!map[key]) map[key] = { queueItems: [], events: [] };
      map[key].queueItems.push(item);
    }
    for (const event of eventsQuery.data || []) {
      const key = event.event_date;
      if (!map[key]) map[key] = { queueItems: [], events: [] };
      map[key].events.push(event);
    }
    return map;
  }, [queueQuery.data, eventsQuery.data]);

  const navigateMonth = (delta: number) => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  return {
    calendarData,
    isLoading: queueQuery.isLoading || eventsQuery.isLoading,
    currentMonth,
    setCurrentMonth,
    navigateMonth,
  };
}
