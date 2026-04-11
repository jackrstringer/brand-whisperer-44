import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DesignQueueItem } from '@/hooks/useDesignQueue';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { X, CalendarIcon, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-muted text-muted-foreground',
  configured: 'bg-blue-100 text-blue-700',
  generating: 'bg-amber-100 text-amber-700 animate-pulse',
  generated: 'bg-green-100 text-green-700',
  sent: 'bg-green-600 text-white',
};

interface Props {
  item: DesignQueueItem;
  brandId: string;
  onClose: () => void;
  onUpdate: (id: string, fields: Partial<DesignQueueItem>) => void;
  onRemove: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}

export function GenerationDrawer({ item, brandId, onClose, onUpdate, onRemove, onStatusChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState(item.title);
  const [campaignInfo, setCampaignInfo] = useState(item.campaign_info || '');
  const [subjectLine, setSubjectLine] = useState(item.subject_line || '');
  const [copyDirection, setCopyDirection] = useState(item.copy_direction || '');
  const [designNotes, setDesignNotes] = useState((item.preferences as any)?.design_notes || '');
  const [sendDate, setSendDate] = useState<Date | undefined>(
    item.send_date ? new Date(item.send_date + 'T00:00:00') : undefined,
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const saveRef = useRef<ReturnType<typeof setTimeout>>();

  const debounceSave = useCallback(
    (fields: Record<string, any>) => {
      if (saveRef.current) clearTimeout(saveRef.current);
      saveRef.current = setTimeout(() => {
        supabase
          .from('design_queue_items')
          .update(fields)
          .eq('id', item.id)
          .then(() => {});
      }, 500);
    },
    [item.id],
  );

  // Auto-save on field change
  useEffect(() => {
    debounceSave({
      title,
      campaign_info: campaignInfo || null,
      subject_line: subjectLine || null,
      copy_direction: copyDirection || null,
      send_date: sendDate ? sendDate.toISOString().split('T')[0] : null,
      preferences: { ...((item.preferences as any) || {}), design_notes: designNotes || undefined },
    } as any);
  }, [title, campaignInfo, subjectLine, copyDirection, designNotes, sendDate, debounceSave, item.preferences]);

  const handleGenerate = async () => {
    if (!user) return;
    setIsGenerating(true);
    onStatusChange(item.id, 'generating');

    try {
      // Save current fields
      await supabase.from('design_queue_items').update({
        title,
        campaign_info: campaignInfo || null,
        subject_line: subjectLine || null,
        copy_direction: copyDirection || null,
        preferences: { ...((item.preferences as any) || {}), design_notes: designNotes || undefined },
        status: 'generating',
      }).eq('id', item.id);

      // Create campaign record
      const { data: campaign, error: campErr } = await supabase
        .from('campaigns')
        .insert({
          brand_id: brandId,
          name: title,
          brief: campaignInfo || null,
          goal: item.campaign_type || 'promotional',
          extra_copy: copyDirection || null,
          subject_line: subjectLine || null,
          status: 'generating',
          generation_started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (campErr || !campaign) throw new Error(campErr?.message || 'Failed to create campaign');

      // Link queue item to campaign
      await supabase.from('design_queue_items').update({
        campaign_id: campaign.id,
      }).eq('id', item.id);

      // Call generate-campaign
      const session = (await supabase.auth.getSession()).data.session;
      const prefs = (item.preferences as any) || {};

      const genBody: any = {
        brandId,
        campaignId: campaign.id,
        brief: campaignInfo || undefined,
        goal: item.campaign_type || 'promotional',
        copy: copyDirection || undefined,
        subjectLine: subjectLine || undefined,
        designNotes: designNotes || undefined,
      };
      if (prefs.product_ids?.length) genBody.productIds = prefs.product_ids;
      if (prefs.reference_campaign_id) genBody.referenceCampaignId = prefs.reference_campaign_id;
      if (prefs.pinned_asset_urls?.length) genBody.pinnedAssetUrls = prefs.pinned_asset_urls;

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
        throw new Error(`Generation failed: ${errText}`);
      }

      // Update queue item status
      await supabase.from('design_queue_items').update({ status: 'generated' }).eq('id', item.id);
      onStatusChange(item.id, 'generated');
      toast.success('Email generated — click to view', {
        action: {
          label: 'View',
          onClick: () => navigate(`/brands/${brandId}/campaigns/${campaign.id}`),
        },
      });
      onClose();
    } catch (err: any) {
      console.error('[GenerationDrawer] Generate error:', err);
      toast.error(err.message || 'Generation failed');
      onStatusChange(item.id, 'queued');
      await supabase.from('design_queue_items').update({ status: 'queued' }).eq('id', item.id);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemove = () => {
    onRemove(item.id);
    onClose();
    toast.success('Removed from queue');
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 right-0 bottom-0 w-full max-w-[480px] bg-card border-l border-border z-50 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            {item.campaign_type && (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {item.campaign_type}
              </Badge>
            )}
            <Badge className={`shrink-0 text-[10px] ${STATUS_STYLES[item.status] || STATUS_STYLES.queued}`}>
              {item.status}
            </Badge>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Campaign Name</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Campaign Brief</label>
            <Textarea
              value={campaignInfo}
              onChange={e => setCampaignInfo(e.target.value)}
              placeholder="Describe what this email should communicate..."
              rows={3}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Subject Line</label>
            <Input
              value={subjectLine}
              onChange={e => setSubjectLine(e.target.value)}
              placeholder="Email subject line"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Copy Direction</label>
            <Textarea
              value={copyDirection}
              onChange={e => setCopyDirection(e.target.value)}
              placeholder="Tone, voice angle, specific copy hooks..."
              rows={2}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Design Notes</label>
            <Textarea
              value={designNotes}
              onChange={e => setDesignNotes(e.target.value)}
              placeholder="Additional design instructions..."
              rows={2}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Send Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {sendDate
                    ? sendDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={sendDate}
                  onSelect={setSendDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {item.campaign_id && (
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => navigate(`/brands/${brandId}/campaigns/${item.campaign_id}`)}
              >
                View Generated Campaign
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4 flex items-center gap-2">
          <Button onClick={handleGenerate} disabled={isGenerating || item.status === 'generating'} className="flex-1">
            {isGenerating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
            {isGenerating ? 'Generating...' : 'Generate Email'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Save & Close
          </Button>
          <button
            onClick={() => setConfirmRemove(true)}
            className="p-2 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Remove confirmation */}
      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from queue?</DialogTitle>
            <DialogDescription>This will remove "{item.title}" from your design queue.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
