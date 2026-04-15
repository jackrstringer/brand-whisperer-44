import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Brain, AlertTriangle } from 'lucide-react';

interface IntelligenceGateProps {
  brandId: string;
  children: React.ReactNode;
}

type GateStatus = 'loading' | 'ready' | 'missing' | 'researching' | 'failed';

export function IntelligenceGate({ brandId, children }: IntelligenceGateProps) {
  const [status, setStatus] = useState<GateStatus>('loading');
  const [brandName, setBrandName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const checkIntelligence = useCallback(async () => {
    const [{ data: brand }, { data: intel }] = await Promise.all([
      supabase.from('brands').select('name, website_url').eq('id', brandId).single(),
      supabase.from('brand_intelligence').select('research_status, ai_research').eq('brand_id', brandId).maybeSingle(),
    ]);

    setBrandName(brand?.name || '');
    setWebsiteUrl(brand?.website_url || '');
    setInputUrl(brand?.website_url || '');

    if (!intel) {
      setStatus('missing');
      return;
    }

    const rs = intel.research_status;
    const hasResearch = !!intel.ai_research && typeof intel.ai_research === 'object' &&
      Object.keys(intel.ai_research as Record<string, unknown>).length > 0;

    if (hasResearch && ['ai_complete', 'complete', 'survey_complete'].includes(rs)) {
      setStatus('ready');
    } else if (rs === 'researching') {
      setStatus('researching');
    } else if (rs === 'failed') {
      setStatus('failed');
    } else if (rs === 'pending' && !hasResearch) {
      setStatus('missing');
    } else if (hasResearch) {
      setStatus('ready');
    } else {
      setStatus('missing');
    }
  }, [brandId]);

  useEffect(() => {
    checkIntelligence();
  }, [checkIntelligence]);

  // Poll while researching
  useEffect(() => {
    if (status !== 'researching') return;
    const interval = setInterval(checkIntelligence, 5000);
    return () => clearInterval(interval);
  }, [status, checkIntelligence]);

  const handleRunResearch = async () => {
    const url = inputUrl.trim();
    if (!url) {
      setError('Please enter a website URL.');
      return;
    }
    setError(null);
    setStatus('researching');

    // Save URL to brand if changed
    if (url !== websiteUrl) {
      await supabase.from('brands').update({ website_url: url }).eq('id', brandId);
    }

    // Ensure intelligence row exists
    await supabase.from('brand_intelligence').upsert(
      { brand_id: brandId, research_status: 'pending' } as any,
      { onConflict: 'brand_id' }
    );

    const { error: invokeErr } = await supabase.functions.invoke('research-brand', {
      body: { brand_id: brandId, domain: url, brand_name: brandName },
    });

    if (invokeErr) {
      setError(invokeErr.message || 'Failed to start research');
      setStatus('failed');
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === 'ready') {
    return <>{children}</>;
  }

  const isOpen = status === 'missing' || status === 'researching' || status === 'failed';

  return (
    <>
      {children}
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {status === 'researching' ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Researching {brandName}...</>
              ) : status === 'failed' ? (
                <><AlertTriangle className="w-5 h-5 text-destructive" /> Research Failed</>
              ) : (
                <><Brain className="w-5 h-5" /> Brand Intelligence Required</>
              )}
            </DialogTitle>
            <DialogDescription>
              {status === 'researching'
                ? 'Analyzing brand, products, audience, and competitive landscape. This takes 1-3 minutes.'
                : status === 'failed'
                ? 'The research process encountered an error. You can retry.'
                : 'To generate relevant campaign ideas, we need to research your brand first.'}
            </DialogDescription>
          </DialogHeader>

          {status === 'researching' ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div className="bg-primary h-full rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
              <p className="text-xs text-muted-foreground">Polling for results every 5 seconds...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="research-url">Website URL</Label>
                <Input
                  id="research-url"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={handleRunResearch} className="w-full">
                <Brain className="w-4 h-4 mr-2" />
                {status === 'failed' ? 'Retry Research' : 'Run Brand Research'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
