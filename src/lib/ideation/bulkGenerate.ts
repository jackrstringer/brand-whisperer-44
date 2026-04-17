import { supabase } from '@/integrations/supabase/client';
import { DesignQueueItem } from '@/hooks/useDesignQueue';

export interface BulkGenerateResult {
  itemId: string;
  campaignId?: string;
  success: boolean;
  error?: string;
}

export async function bulkGenerate(
  items: DesignQueueItem[],
  brandId: string,
  onProgress: (completed: number, total: number) => void,
  onItemStatusChange: (itemId: string, status: string) => void,
): Promise<BulkGenerateResult[]> {
  const concurrency = 3;
  let index = 0;
  const results: BulkGenerateResult[] = [];

  async function runNext(): Promise<void> {
    if (index >= items.length) return;
    const item = items[index++];

    onItemStatusChange(item.id, 'generating');
    await supabase.from('design_queue_items').update({ status: 'generating' }).eq('id', item.id);

    try {
      // Create campaign
      const { data: campaign, error: campErr } = await supabase
        .from('campaigns')
        .insert({
          brand_id: brandId,
          name: item.title,
          brief: item.campaign_info || null,
          goal: item.campaign_type || 'promotional',
          extra_copy: item.copy_direction || null,
          subject_line: item.subject_line || null,
          status: 'generating',
          generation_started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (campErr || !campaign) throw new Error(campErr?.message || 'Failed to create campaign');

      await supabase.from('design_queue_items').update({ campaign_id: campaign.id }).eq('id', item.id);

      const session = (await supabase.auth.getSession()).data.session;
      const prefs = (item.preferences as any) || {};

      const genBody: any = {
        brandId,
        campaignId: campaign.id,
        brief: item.campaign_info || undefined,
        goal: item.campaign_type || 'promotional',
        copy: item.copy_direction || undefined,
        subjectLine: item.subject_line || undefined,
        designNotes: prefs.design_notes || undefined,
      };
      if (prefs.product_ids?.length) genBody.productIds = prefs.product_ids;
      if (prefs.reference_campaign_id) genBody.referenceCampaignId = prefs.reference_campaign_id;
      if (prefs.featured_design_elements?.length) genBody.featuredDesignElements = prefs.featured_design_elements;

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-campaign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify(genBody),
        },
      );

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText);
      }

      await supabase.from('design_queue_items').update({ status: 'designed' }).eq('id', item.id);
      onItemStatusChange(item.id, 'designed');
      results.push({ itemId: item.id, campaignId: campaign.id, success: true });
    } catch (err: any) {
      console.error(`[bulkGenerate] Failed for ${item.id}:`, err);
      await supabase.from('design_queue_items').update({ status: 'draft' }).eq('id', item.id);
      onItemStatusChange(item.id, 'draft');
      results.push({ itemId: item.id, success: false, error: err.message });
    }

    onProgress(results.length, items.length);
    await runNext();
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()));
  return results;
}
