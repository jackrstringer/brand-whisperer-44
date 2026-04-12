import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
import {
  X, CalendarIcon, Loader2, Trash2, ChevronDown, ChevronRight,
  Maximize2, Minimize2, MoreHorizontal, ExternalLink, Copy,
} from 'lucide-react';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

type PeekMode = 'side' | 'center';

const STORAGE_KEY = 'campaign-peek-mode';

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-muted text-muted-foreground',
  draft: 'bg-muted text-muted-foreground',
  configured: 'bg-blue-100 text-blue-700',
  generating: 'bg-amber-100 text-amber-700 animate-pulse',
  generated: 'bg-green-100 text-green-700',
  designed: 'bg-green-100 text-green-700',
  sent: 'bg-green-600 text-white',
};

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  item: DesignQueueItem;
  brandId: string;
  onClose: () => void;
  onUpdate: (id: string, fields: Partial<DesignQueueItem>) => void;
  onRemove: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Collapsible Section                                                */
/* ------------------------------------------------------------------ */

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
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
        style={{ maxHeight: open ? '2000px' : '0', opacity: open ? 1 : 0 }}
      >
        <div className="px-6 pb-4">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Property Row                                                       */
/* ------------------------------------------------------------------ */

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 group/row">
      <span className="text-xs text-muted-foreground w-[130px] shrink-0 pt-1.5">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Editable text (inline)                                             */
/* ------------------------------------------------------------------ */

function InlineInput({
  value,
  onChange,
  placeholder,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const Comp = multiline ? Textarea : Input;
  return (
    <Comp
      value={value}
      onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value)}
      placeholder={placeholder}
      className="bg-transparent border-none shadow-none px-1.5 py-1 text-sm rounded-md hover:bg-muted/60 focus:bg-card transition-colors h-auto min-h-0 resize-none"
      rows={multiline ? 2 : undefined}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function GenerationDrawer({ item, brandId, onClose, onUpdate, onRemove, onStatusChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Peek mode
  const [peekMode, setPeekMode] = useState<PeekMode>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as PeekMode) || 'side';
    } catch {
      return 'side';
    }
  });

  // Responsive: force center on small screens
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
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [visible, setVisible] = useState(false);
  const saveRef = useRef<ReturnType<typeof setTimeout>>();
  const actionsRef = useRef<HTMLDivElement>(null);

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
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

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleAnimatedClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleAnimatedClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  // Auto-save debounce
  const debounceSave = useCallback(
    (fields: Record<string, any>) => {
      if (saveRef.current) clearTimeout(saveRef.current);
      saveRef.current = setTimeout(() => {
        supabase
          .from('design_queue_items')
          .update(fields as any)
          .eq('id', item.id)
          .then(() => {});
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

  /* ----- Generate handler (preserved) ----- */
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

      await supabase.from('design_queue_items').update({
        campaign_id: campaign.id,
      }).eq('id', item.id);

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

      await supabase.from('design_queue_items').update({ status: 'generated' }).eq('id', item.id);
      onStatusChange(item.id, 'generated');
      toast.success('Email generated — click to view', {
        action: {
          label: 'View',
          onClick: () => navigate(`/brands/${brandId}/campaigns/${campaign.id}`),
        },
      });
      handleAnimatedClose();
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
    handleAnimatedClose();
    toast.success('Removed from queue');
  };

  /* ----- Render ----- */
  const panel = (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        } ${effectiveMode === 'center' ? 'bg-black/40 backdrop-blur-[2px]' : 'bg-black/20'}`}
        onClick={handleAnimatedClose}
      />

      {/* Panel */}
      <div
        className={`fixed z-50 flex flex-col bg-card ${
          effectiveMode === 'side'
            ? `top-0 right-0 bottom-0 border-l border-border shadow-xl transition-transform duration-300 ease-out ${
                visible ? 'translate-x-0' : 'translate-x-full'
              }`
            : `top-1/2 left-1/2 rounded-xl shadow-2xl border border-border transition-all duration-200 ease-out ${
                visible
                  ? '-translate-x-1/2 -translate-y-1/2 scale-100 opacity-100'
                  : '-translate-x-1/2 -translate-y-1/2 scale-95 opacity-0'
              }`
        }`}
        style={
          effectiveMode === 'side'
            ? { width: 'min(680px, 50vw)' }
            : isMobile
            ? { width: '95vw', height: '90vh' }
            : { width: 'min(900px, 90vw)', maxHeight: '85vh' }
        }
      >
        {/* ========== HEADER ========== */}
        <div className="shrink-0 border-b border-border">
          {/* Top toolbar */}
          <div className="flex items-center justify-between px-5 py-2.5">
            <div className="flex items-center gap-1">
              {!isMobile && (
                <button
                  onClick={togglePeekMode}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-150"
                  title={`Switch to ${peekMode === 'side' ? 'center' : 'side'} peek`}
                >
                  {effectiveMode === 'side' ? (
                    <Maximize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Minimize2 className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>

            <div className="flex items-center gap-0.5">
              {/* Actions dropdown */}
              <div className="relative" ref={actionsRef}>
                <button
                  onClick={() => setShowActions(s => !s)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-150"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {showActions && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-lg py-1 z-10 animate-scale-in">
                    {item.campaign_id && (
                      <button
                        onClick={() => {
                          navigate(`/brands/${brandId}/campaigns/${item.campaign_id}`);
                          setShowActions(false);
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted/70 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open full page
                      </button>
                    )}
                    <button
                      onClick={() => { setShowActions(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted/70 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Duplicate
                    </button>
                    <button
                      onClick={() => { setConfirmRemove(true); setShowActions(false); }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={handleAnimatedClose}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-all duration-150"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Title + meta */}
          <div className="px-6 pb-3">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full text-lg font-semibold text-foreground bg-transparent border-none outline-none px-0 py-0.5 hover:underline decoration-muted-foreground/30 underline-offset-4 placeholder:text-muted-foreground"
              placeholder="Untitled campaign"
            />
            <div className="flex items-center gap-2 mt-1.5">
              <Badge className={`text-[10px] ${STATUS_STYLES[item.status] || STATUS_STYLES.queued}`}>
                {item.status}
              </Badge>
              {item.campaign_type && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground/40" />
                  {item.campaign_type}
                </span>
              )}
              {sendDate && (
                <span className="text-xs text-muted-foreground">
                  {sendDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ========== SCROLLABLE BODY ========== */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Details section */}
          <Section title="Details">
            <div className="space-y-0.5">
              <PropRow label="Campaign Brief">
                <InlineInput
                  value={campaignInfo}
                  onChange={setCampaignInfo}
                  placeholder="Describe what this email should communicate..."
                  multiline
                />
              </PropRow>
              <PropRow label="Subject Line">
                <InlineInput
                  value={subjectLine}
                  onChange={setSubjectLine}
                  placeholder="Email subject line"
                />
              </PropRow>
              <PropRow label="Copy Direction">
                <InlineInput
                  value={copyDirection}
                  onChange={setCopyDirection}
                  placeholder="Tone, voice angle, specific copy hooks..."
                  multiline
                />
              </PropRow>
              <PropRow label="Design Notes">
                <InlineInput
                  value={designNotes}
                  onChange={setDesignNotes}
                  placeholder="Additional design instructions..."
                  multiline
                />
              </PropRow>
              <PropRow label="Send Date">
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1.5 text-sm px-1.5 py-1 rounded-md hover:bg-muted/60 transition-colors text-foreground">
                      <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      {sendDate
                        ? sendDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span className="text-muted-foreground">Pick a date</span>}
                    </button>
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
              </PropRow>
            </div>
          </Section>

          {/* Preferences section – only show if meaningful preferences exist */}
          {item.preferences && Object.keys(item.preferences as any).filter(k => k !== 'design_notes').length > 0 && (
            <Section title="Preferences" defaultOpen={false}>
              <div className="space-y-0.5">
                {Object.entries(item.preferences as Record<string, any>)
                  .filter(([k]) => k !== 'design_notes')
                  .map(([key, val]) => (
                    <PropRow key={key} label={key.replace(/_/g, ' ')}>
                      <span className="text-sm text-foreground px-1.5 py-1">
                        {Array.isArray(val) ? val.join(', ') : String(val)}
                      </span>
                    </PropRow>
                  ))}
              </div>
            </Section>
          )}

          {/* Activity section */}
          <Section title="Activity" defaultOpen={false}>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                Created {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
              {item.updated_at && item.updated_at !== item.created_at && (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  Updated {new Date(item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              )}
              {item.campaign_id && (
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Campaign generated
                </div>
              )}
            </div>
          </Section>

          {/* View campaign link */}
          {item.campaign_id && (
            <div className="px-6 py-3 border-b border-border">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => navigate(`/brands/${brandId}/campaigns/${item.campaign_id}`)}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                View Generated Campaign
              </Button>
            </div>
          )}
        </div>

        {/* ========== BOTTOM ACTION BAR ========== */}
        <div className="shrink-0 border-t border-border px-6 py-3 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmRemove(true)}
            className="text-muted-foreground hover:text-red-600 hover:border-red-200"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            Remove
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleAnimatedClose}>
              Save & Close
            </Button>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={isGenerating || item.status === 'generating'}
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
              {isGenerating ? 'Generating...' : 'Generate Email'}
            </Button>
          </div>
        </div>
      </div>

      {/* Remove confirmation dialog */}
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

  return createPortal(panel, document.body);
}
