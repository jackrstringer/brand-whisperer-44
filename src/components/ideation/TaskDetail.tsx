import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DesignQueueItem } from '@/hooks/useDesignQueue';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  ArrowLeft, CalendarIcon, Loader2, Trash2, Play, ExternalLink, ImageIcon,
  Maximize2, Minimize2, MoreHorizontal, X, ChevronDown, ChevronRight,
  FileText, Mail, Pen, StickyNote, Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import ReferencePanel, { SelectedReference } from '@/components/campaign/ReferencePanel';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type PeekMode = 'side' | 'center';

const STORAGE_KEY = 'campaign-peek-mode';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  generating: 'bg-amber-100 text-amber-700 animate-pulse',
  designed: 'bg-blue-100 text-blue-700',
  templated: 'bg-purple-100 text-purple-700',
  sent: 'bg-green-100 text-green-700',
};

/* ------------------------------------------------------------------ */
/*  Collapsible Section                                                */
/* ------------------------------------------------------------------ */

function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {title}
      </button>
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? '4000px' : '0', opacity: open ? 1 : 0 }}
      >
        <div className="px-6 pb-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Property Row — ClickUp-style inline field                          */
/* ------------------------------------------------------------------ */

function PropRow({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 min-h-[32px] group/row hover:bg-muted/40 rounded-md -mx-1.5 px-1.5 transition-colors">
      <div className="flex items-center gap-1.5 w-[130px] shrink-0 pt-[7px]">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span className="text-[12px] text-muted-foreground select-none">{label}</span>
      </div>
      <div className="flex-1 min-w-0 py-[5px]">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline editable text field — shows as plain text, edits on click   */
/* ------------------------------------------------------------------ */

function InlineText({
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      if (ref.current instanceof HTMLTextAreaElement) {
        ref.current.style.height = 'auto';
        ref.current.style.height = ref.current.scrollHeight + 'px';
      }
    }
  }, [editing]);

  if (editing) {
    const sharedClass = "w-full bg-transparent text-[13px] text-foreground outline-none border border-border rounded-md px-2 py-1 focus:border-primary/50 transition-colors";
    if (multiline) {
      return (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false);
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) setEditing(false);
          }}
          placeholder={placeholder}
          className={`${sharedClass} resize-none min-h-[28px]`}
          rows={1}
        />
      );
    }
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Enter') setEditing(false);
        }}
        placeholder={placeholder}
        className={`${sharedClass} h-7`}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="w-full text-left rounded-md px-2 py-0.5 -mx-2 hover:bg-muted/60 transition-colors cursor-text group/field"
    >
      {value ? (
        <span className="text-[13px] text-foreground whitespace-pre-wrap break-words">{value}</span>
      ) : (
        <span className="text-[13px] text-muted-foreground/50 group-hover/field:text-muted-foreground transition-colors">{placeholder}</span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  item: DesignQueueItem;
  brandId: string;
  onBack: () => void;
  onRemove: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function TaskDetail({ item, brandId, onBack, onRemove, onStatusChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Peek mode
  const [peekMode, setPeekMode] = useState<PeekMode>(() => {
    try { return (localStorage.getItem(STORAGE_KEY) as PeekMode) || 'side'; } catch { return 'side'; }
  });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const effectiveMode = isMobile ? 'center' : peekMode;
  const togglePeekMode = () => {
    const next = peekMode === 'side' ? 'center' : 'side';
    setPeekMode(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  };

  // Animate
  const [visible, setVisible] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);
  const handleAnimatedClose = () => { setVisible(false); setTimeout(onBack, 200); };

  // Form state
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
  const [showActions, setShowActions] = useState(false);
  const saveRef = useRef<ReturnType<typeof setTimeout>>();
  const actionsRef = useRef<HTMLDivElement>(null);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleAnimatedClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Click outside actions menu
  useEffect(() => {
    if (!showActions) return;
    const handler = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) setShowActions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showActions]);

  // Measure iframe
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

  // Auto-save debounce
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
    toast.success('Removed from queue');
  };

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  const sideClasses = effectiveMode === 'side'
    ? `fixed top-0 right-0 bottom-0 border-l border-border flex flex-col bg-card z-50 transition-transform duration-300 ease-out ${visible ? 'translate-x-0' : 'translate-x-full'}`
    : `fixed top-1/2 left-1/2 flex flex-col bg-card z-50 rounded-xl shadow-2xl border border-border transition-all duration-200 ease-out ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`;

  const sideStyle = effectiveMode === 'side'
    ? { width: 'min(680px, 50vw)' }
    : { width: isMobile ? '95vw' : 'min(900px, 90vw)', maxHeight: isMobile ? '90vh' : '85vh', transform: `translate(-50%, -50%) ${visible ? 'scale(1)' : 'scale(0.95)'}` };

  const panel = (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'} ${effectiveMode === 'center' ? 'bg-black/40 backdrop-blur-sm' : 'bg-black/20'}`}
        onClick={handleAnimatedClose}
      />

      {/* Panel */}
      <div className={sideClasses} style={sideStyle}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            {!isMobile && (
              <button
                onClick={togglePeekMode}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title={`Switch to ${peekMode === 'side' ? 'center' : 'side'} peek`}
              >
                {effectiveMode === 'side' ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Actions dropdown */}
            <div className="relative" ref={actionsRef}>
              <button
                onClick={() => setShowActions(s => !s)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {showActions && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
                  {item.campaign_id && (
                    <button
                      onClick={() => { navigate(`/brands/${brandId}/campaigns/${item.campaign_id}`); setShowActions(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open in Editor
                    </button>
                  )}
                  <button
                    onClick={() => { handleRemove(); setShowActions(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove from Queue
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={handleAnimatedClose}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Title — large, bold, inline-editable */}
        <div className="px-6 pt-4 pb-2 border-b border-border shrink-0">
          <div className="group/title">
            <InlineText value={title} onChange={setTitle} placeholder="Untitled" />
          </div>
          <div className="flex items-center gap-2 mt-2 pb-1">
            <Badge className={`text-[10px] ${STATUS_STYLES[item.status] || STATUS_STYLES.draft}`}>
              {item.status}
            </Badge>
            {item.campaign_type && (
              <Badge variant="secondary" className="text-[10px]">{item.campaign_type}</Badge>
            )}
            {sendDate && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" />
                {sendDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {/* Details section */}
          <Section title="Details">
            <div className="space-y-0.5">
              <PropRow label="Brief" icon={<FileText className="w-3.5 h-3.5" />}>
                <InlineText value={campaignInfo} onChange={setCampaignInfo} placeholder="Empty" multiline />
              </PropRow>
              <PropRow label="Subject Line" icon={<Mail className="w-3.5 h-3.5" />}>
                <InlineText value={subjectLine} onChange={setSubjectLine} placeholder="Empty" />
              </PropRow>
              <PropRow label="Copy Direction" icon={<Pen className="w-3.5 h-3.5" />}>
                <InlineText value={copyDirection} onChange={setCopyDirection} placeholder="Empty" multiline />
              </PropRow>
              <PropRow label="Design Notes" icon={<StickyNote className="w-3.5 h-3.5" />}>
                <InlineText value={designNotes} onChange={setDesignNotes} placeholder="Empty" multiline />
              </PropRow>
              <PropRow label="Send Date" icon={<CalendarIcon className="w-3.5 h-3.5" />}>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="rounded-md px-2 py-0.5 -mx-2 hover:bg-muted/60 transition-colors text-left cursor-pointer">
                      {sendDate ? (
                        <span className="text-[13px] text-foreground">
                          {sendDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      ) : (
                        <span className="text-[13px] text-muted-foreground/50">Empty</span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={sendDate} onSelect={setSendDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </PropRow>
              <PropRow label="Reference" icon={<ImageIcon className="w-3.5 h-3.5" />}>
                <button
                  onClick={() => setRefPanelOpen(true)}
                  className="flex items-center gap-2 rounded-md px-2 py-0.5 -mx-2 hover:bg-muted/60 transition-colors text-left"
                >
                  {selectedRefs.length > 0 ? (
                    <>
                      <img
                        src={selectedRefs[0].thumbnail_url}
                        alt=""
                        className="w-6 h-8 object-cover rounded border border-border"
                      />
                      <span className="text-[13px] text-foreground truncate">{selectedRefs[0].title}</span>
                    </>
                  ) : (
                    <span className="text-[13px] text-muted-foreground/50">Empty</span>
                  )}
                </button>
              </PropRow>
            </div>
          </Section>

          {/* Email Preview section */}
          {campaignHtml && (
            <Section title="Email Preview">
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
            </Section>
          )}

          {/* Activity section */}
          <Section title="Activity" defaultOpen={false}>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p>Created {new Date(item.created_at || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              {item.updated_at && item.updated_at !== item.created_at && (
                <p>Updated {new Date(item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              )}
            </div>
          </Section>
        </div>

        {/* Bottom action bar */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border shrink-0">
          <div className="flex items-center gap-2">
            {item.campaign_id && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => navigate(`/brands/${brandId}/campaigns/${item.campaign_id}`)}
              >
                <ExternalLink className="w-3 h-3 mr-1.5" />
                Open in Editor
              </Button>
            )}
          </div>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || item.status === 'generating'}
            size="sm"
            className="h-8"
          >
            {isGenerating ? (
              <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Generating...</>
            ) : item.status === 'designed' || item.status === 'templated' || item.status === 'sent' ? (
              <><Play className="w-3 h-3 mr-1.5" /> Regenerate</>
            ) : (
              <><Play className="w-3 h-3 mr-1.5" /> Generate Email</>
            )}
          </Button>
        </div>
      </div>

      {/* Reference panel dialog */}
      <Dialog open={refPanelOpen} onOpenChange={setRefPanelOpen}>
        <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] p-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
            <ReferencePanel
              brandId={brandId}
              campaignId={item.campaign_id || ''}
              selectedReferences={selectedRefs}
              onSelectReferences={(refs) => {
                handleReferenceChange(refs);
                if (refs.length > 0) setRefPanelOpen(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  return createPortal(panel, document.body);
}
