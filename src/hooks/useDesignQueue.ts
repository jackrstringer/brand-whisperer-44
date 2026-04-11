import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CampaignIdea } from '@/lib/types';

export interface DesignQueueItem {
  id: string;
  brand_id: string;
  user_id: string;
  title: string;
  description: string | null;
  subject_line: string | null;
  campaign_type: string | null;
  campaign_info: string | null;
  copy_direction: string | null;
  send_date: string | null;
  position: number;
  preferences: any;
  source_session_id: string | null;
  campaign_id: string | null;
  klaviyo_campaign_id: string | null;
  status: 'draft' | 'generating' | 'designed' | 'templated' | 'sent';
  created_at: string;
  updated_at: string;
}

export function useDesignQueue(brandId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['design-queue', brandId];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('design_queue_items')
        .select('*')
        .eq('brand_id', brandId)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data || []) as DesignQueueItem[];
    },
    enabled: !!brandId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ['calendar-queue', brandId] });
  };

  const addToQueue = useMutation({
    mutationFn: async (params: { idea: CampaignIdea; sessionId?: string | null; sendDate?: string | null }) => {
      const items = query.data || [];
      const nextPos = items.length > 0 ? Math.max(...items.map(i => i.position)) + 1 : 0;
      const { error } = await supabase.from('design_queue_items').insert({
        brand_id: brandId,
        user_id: user!.id,
        title: params.idea.title,
        description: params.idea.description || null,
        subject_line: params.idea.subject_line || null,
        campaign_type: params.idea.campaign_type || null,
        campaign_info: params.idea.campaign_info || null,
        copy_direction: params.idea.copy_direction || null,
        source_session_id: params.sessionId || null,
        send_date: params.sendDate || null,
        position: nextPos,
        status: 'draft',
      } as any);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeFromQueue = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('design_queue_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setDate = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase.from('design_queue_items').update({ send_date: date }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const clearDate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('design_queue_items').update({ send_date: null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('design_queue_items').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updatePreferences = useMutation({
    mutationFn: async ({ id, preferences }: { id: string; preferences: any }) => {
      const { error } = await supabase.from('design_queue_items').update({ preferences }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reorderQueue = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, idx) =>
        supabase.from('design_queue_items').update({ position: idx }).eq('id', id),
      );
      await Promise.all(updates);
    },
    onSuccess: invalidate,
  });

  return {
    items: query.data || [],
    isLoading: query.isLoading,
    addToQueue,
    removeFromQueue,
    setDate,
    clearDate,
    updateStatus,
    updatePreferences,
    reorderQueue,
  };
}
