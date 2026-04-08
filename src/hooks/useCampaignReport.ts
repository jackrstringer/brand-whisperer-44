import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CampaignReportState {
  status: 'pending' | 'generating' | 'complete' | 'failed' | null;
  reportHtml: string | null;
  generatedAt: string | null;
  error: string | null;
  isLoading: boolean;
}

export function useCampaignReport(brandId: string | undefined) {
  const { toast } = useToast();
  const [state, setState] = useState<CampaignReportState>({
    status: null,
    reportHtml: null,
    generatedAt: null,
    error: null,
    isLoading: false,
  });

  const fetchStatus = useCallback(async () => {
    if (!brandId) return;
    const { data, error } = await supabase
      .from('brand_intelligence')
      .select('campaign_report_status, campaign_report_html, campaign_report_generated_at, campaign_report_error')
      .eq('brand_id', brandId)
      .maybeSingle();

    if (error) return;
    setState(prev => ({
      ...prev,
      status: (data as any)?.campaign_report_status ?? 'pending',
      reportHtml: (data as any)?.campaign_report_html ?? null,
      generatedAt: (data as any)?.campaign_report_generated_at ?? null,
      error: (data as any)?.campaign_report_error ?? null,
    }));
  }, [brandId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll every 5 seconds while generating
  useEffect(() => {
    if (state.status !== 'generating') return;
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [state.status, fetchStatus]);

  const generateReport = useCallback(async () => {
    if (!brandId) return;
    setState(prev => ({ ...prev, isLoading: true, status: 'generating' }));

    try {
      const { error } = await supabase.functions.invoke('generate-campaign-report', {
        body: { brand_id: brandId },
      });

      if (error) throw error;
    } catch (err: any) {
      toast({
        title: 'Report generation failed',
        description: err.message,
        variant: 'destructive',
      });
      setState(prev => ({ ...prev, status: 'failed', error: err.message }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
      await fetchStatus();
    }
  }, [brandId, fetchStatus, toast]);

  return { ...state, generateReport, refetch: fetchStatus };
}
