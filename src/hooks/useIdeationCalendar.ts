import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useMemo, useCallback } from 'react';
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

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useIdeationCalendar(brandId: string) {
  // Track the full date range we need data for
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 4, 0);
    return { start: formatDate(start), end: formatDate(end) };
  });

  const handleRequestMonths = useCallback((months: Date[]) => {
    if (months.length === 0) return;
    const earliest = months[0];
    const latest = months[months.length - 1];
    const start = formatDate(new Date(earliest.getFullYear(), earliest.getMonth(), 1));
    const endD = new Date(latest.getFullYear(), latest.getMonth() + 1, 0);
    const end = formatDate(endD);

    setDateRange(prev => {
      const newStart = start < prev.start ? start : prev.start;
      const newEnd = end > prev.end ? end : prev.end;
      if (newStart === prev.start && newEnd === prev.end) return prev;
      return { start: newStart, end: newEnd };
    });
  }, []);

  const queueQuery = useQuery({
    queryKey: ['calendar-queue', brandId, dateRange.start, dateRange.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_queue_items')
        .select('*')
        .eq('brand_id', brandId)
        .not('send_date', 'is', null)
        .gte('send_date', dateRange.start)
        .lte('send_date', dateRange.end);
      if (error) throw error;
      return (data || []) as DesignQueueItem[];
    },
    enabled: !!brandId,
  });

  const eventsQuery = useQuery({
    queryKey: ['calendar-events', brandId, dateRange.start, dateRange.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brand_calendar')
        .select('*')
        .eq('brand_id', brandId)
        .gte('event_date', dateRange.start)
        .lte('event_date', dateRange.end);
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

  return {
    calendarData,
    isLoading: queueQuery.isLoading || eventsQuery.isLoading,
    handleRequestMonths,
  };
}
