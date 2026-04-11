import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DesignQueueItem } from '@/hooks/useDesignQueue';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ArrowLeft, CalendarIcon, Loader2, Trash2, Play, ExternalLink, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import ReferencePanel, { SelectedReference } from '@/components/campaign/ReferencePanel';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  generating: 'bg-amber-100 text-amber-700 animate-pulse',
  designed: 'bg-blue-100 text-blue-700',
  templated: 'bg-purple-100 text-purple-700',
  sent: 'bg-green-100 text-green-700',
};

interface Props {
  item: DesignQueueItem;
  brandId: string;
  onBack: () => void;
  onRemove: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}

export function TaskDetail({ item, brandId, onBack, onRemove, onStatusChange }: Props) {
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
  const [campaignHtml, setCampaignHtml] = useState<string | null>(null);
  const [iframeHeight, setIframeHeight] = useState(400);
  const [refPanelOpen, setRefPanelOpen] = useState(false);
  const [selectedRefs, setSelectedRefs] = useState<SelectedReference[]>([]);
  const saveRef = useRef<ReturnType<typeof setTimeout>>();

  const measureIframe = useCallback((iframe: HTMLIFrameElement | null) => {
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const h = Math.max(doc.body?.scrollHeight ?? 0, doc.documentElement?.scrollHeight ?? 0, 200);
      setIframeHeight(h);
    } catch {}
  }, []);

  // Load campaign HTML if designed
  useEffect(() => {
    if (item.campaign_id && (item.status === 'designed' || item.status === 'templated' || item.status === 'sent')) {
      supabase.from('campaigns').select('html').eq('id', item.campaign_id).single().then(({ data }) => {
        if (data?.html) setCampaignHtml(data.html);
      });
    }
  }, [item.campaign_id, item.status]);

  // Load saved reference from preferences
  useEffect(() => {
    const prefs = (item.preferences as any) || {};
    if (prefs.reference_campaign_id) {
      supabase.from('reference_campaigns')
        .select('id, title, thumbnail_url, image_urls')
        .eq('id', prefs.reference_campaign_id)
        .single()
        .then(({ data }) => {
          if (data) {
            setSelectedRefs([{
              type: 'library',
              id: data.id,
              title: data.title,
              thumbnail_url: data.thumbnail_url,
              image_urls: (data.image_urls as string[]) || [],
              strength: 50,
              mode: 'reference',
            }]);
          }
        });
    }
  }, [item.preferences]);

  const debounceSave = useCallback(
    (fields: Record<string, any>) => {
      if (saveRef.current) clearTimeout(saveRef.current);
      saveRef.current = setTimeout(() => {
        supabase.from('design_queue_items').update(fields as any).eq('id', item.id).then(() => {});
      }, 500);
    },
    [item.id],
  );

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

  const handleReferenceChange = (refs: SelectedReference[]) => {
    setSelectedRefs(refs);
    const refId = refs[0]?.id || null;
    const prefs = { ...((item.preferences as any) || {}), reference_campaign_id: refId };
    supabase.from('design_queue_items').update({ preferences: prefs } as any).eq('id', item.id).then(() => {});
  };

  const handleGenerate = async () => {
    if (!user) return;
    setIsGenerating(true);
    onStatusChange(item.id, 'generating');

    try {
      await supabase.from('design_queue_items').update({
        title,
        campaign_info: campaignInfo || null,
        subject_line: subjectLine || null,
        copy_direction: copyDirection || null,
        preferences: { ...((item.preferences as any) || {}), design_notes: designNotes || undefined },
        status: 'generating',
      }).eq('id', item.id);

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

      await supabase.from('design_queue_items').update({ campaign_id: campaign.id }).eq('id', item.id);

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
      if (selectedRefs[0]?.id) genBody.referenceCampaignId = selectedRefs[0].id;
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

      await supabase.from('design_queue_items').update({ status: 'designed' }).eq('id', item.id);
      onStatusChange(item.id, 'designed');

      const { data: campData } = await supabase.from('campaigns').select('html').eq('id', campaign.id).single();
      if (campData?.html) setCampaignHtml(campData.html);

      toast.success('Email generated successfully');
    } catch (err: any) {
      console.error('[TaskDetail] Generate error:', err);
      toast.error(err.message || 'Generation failed');
      onStatusChange(item.id, 'draft');
      await supabase.from('design_queue_items').update({ status: 'draft' }).eq('id', item.id);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemove = () => {
    onRemove(item.id);
    onBack();
    toast.success('Removed from queue');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border flex-shrink-0">
        <button onClick={onBack} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {item.campaign_type && (
            <Badge variant="secondary" className="text-[10px] shrink-0">{item.campaign_type}</Badge>
          )}
          <Badge className={`text-[10px] shrink-0 ${STATUS_STYLES[item.status] || STATUS_STYLES.draft}`}>
            {item.status}
          </Badge>
        </div>
        <button
          onClick={handleRemove}
          className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Form — scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: 'none' }}>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Title</label>
          <Input value={title} onChange={e => setTitle(e.target.value)} className="h-8 text-sm" />
        </div>

        <div>
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Brief</label>
          <Textarea
            value={campaignInfo}
            onChange={e => setCampaignInfo(e.target.value)}
            placeholder="Describe what this email should communicate..."
            rows={2}
            className="text-sm"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Subject Line</label>
          <Input value={subjectLine} onChange={e => setSubjectLine(e.target.value)} placeholder="Email subject line" className="h-8 text-sm" />
        </div>

        <div>
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Copy Direction</label>
          <Textarea
            value={copyDirection}
            onChange={e => setCopyDirection(e.target.value)}
            placeholder="Tone, voice, hooks..."
            rows={2}
            className="text-sm"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Design Notes</label>
          <Textarea
            value={designNotes}
            onChange={e => setDesignNotes(e.target.value)}
            placeholder="Additional design instructions..."
            rows={2}
            className="text-sm"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Send Date</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-start text-left text-sm h-8">
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {sendDate
                  ? sendDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={sendDate} onSelect={setSendDate} initialFocus />
            </PopoverContent>
          </Popover>
        </div>

        {/* Reference selector */}
        <div>
          <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Reference</label>
          <button
            onClick={() => setRefPanelOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-muted/50 transition-colors text-left"
          >
            {selectedRefs.length > 0 ? (
              <>
                <img
                  src={selectedRefs[0].thumbnail_url}
                  alt=""
                  className="w-8 h-10 object-cover rounded border border-border"
                />
                <span className="text-xs text-foreground truncate flex-1">{selectedRefs[0].title}</span>
              </>
            ) : (
              <>
                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Choose a reference...</span>
              </>
            )}
          </button>
        </div>

        {/* Generate action */}
        <div className="pt-2">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || item.status === 'generating'}
            className="w-full"
            size="sm"
          >
            {isGenerating ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating...</>
            ) : item.status === 'designed' || item.status === 'templated' || item.status === 'sent' ? (
              <><Play className="w-3.5 h-3.5 mr-1.5" /> Regenerate</>
            ) : (
              <><Play className="w-3.5 h-3.5 mr-1.5" /> Generate Email</>
            )}
          </Button>
        </div>

        {/* View campaign link */}
        {item.campaign_id && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => navigate(`/brands/${brandId}/campaigns/${item.campaign_id}`)}
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            Open in Editor
          </Button>
        )}

        {/* Campaign preview */}
        {campaignHtml && (
          <div className="pt-2">
            <label className="text-[11px] font-medium text-muted-foreground mb-2 block">Preview</label>
            <div className="border border-border rounded-lg overflow-hidden bg-white mx-auto" style={{ maxWidth: 600 }}>
              <iframe
                srcDoc={campaignHtml}
                className="w-full border-0 block"
                style={{ height: iframeHeight, overflow: 'hidden' }}
                sandbox="allow-same-origin"
                title="Campaign preview"
                onLoad={(e) => {
                  const iframe = e.currentTarget;
                  measureIframe(iframe);
                  try {
                    const doc = iframe.contentDocument;
                    if (doc) {
                      const style = doc.createElement('style');
                      style.textContent = 'html,body{margin:0;padding:0;overflow-x:hidden!important;max-width:100%!important;}*{max-width:100%!important;box-sizing:border-box;}';
                      doc.head?.appendChild(style);
                      doc.querySelectorAll('img').forEach(img => {
                        if (!img.complete) img.addEventListener('load', () => measureIframe(iframe), { once: true });
                      });
                    }
                  } catch {}
                  setTimeout(() => measureIframe(iframe), 500);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Reference panel full-screen dialog */}
      <Dialog open={refPanelOpen} onOpenChange={setRefPanelOpen}>
        <DialogContent className="max-w-5xl h-[85vh] p-0 overflow-hidden">
          <ReferencePanel
            brandId={brandId}
            campaignId={item.campaign_id || ''}
            selectedReferences={selectedRefs}
            onSelectReferences={(refs) => {
              handleReferenceChange(refs);
              if (refs.length > 0) setRefPanelOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
