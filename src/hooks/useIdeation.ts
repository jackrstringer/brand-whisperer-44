import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CampaignIdea } from '@/lib/types';
import { CAMPAIGN_TYPES } from '@/lib/ideation/campaignTypes';
import { streamIdeas } from '@/lib/ideation/streamHelpers';

export interface CalendarDateEntry {
  date: string;
  name: string;
  type: string;
}

export type IdeationNode =
  | { id: string; type: 'brief'; content: string; campaignType?: string; campaignSubtype?: string; timestamp: number }
  | { id: string; type: 'generation'; ideas: CampaignIdea[]; isStreaming: boolean; wasTurbo?: boolean; groupLabel?: string; timestamp: number }
  | { id: string; type: 'feedback'; content: string; selectedIdeas: CampaignIdea[]; timestamp: number }
  | { id: string; type: 'ai_response'; content: string; isStreaming: boolean; timestamp: number }
  | { id: string; type: 'menu'; timestamp: number }
  | { id: string; type: 'calendar_dates'; dates: CalendarDateEntry[]; isLoading: boolean; selectedDates: Set<string>; timestamp: number };

interface UseIdeationState {
  sessionId: string | null;
  nodes: IdeationNode[];
  isGenerating: boolean;
  isChatting: boolean;
  selectedIdeas: Map<string, CampaignIdea>;
  streamingIdeas: CampaignIdea[];
  streamingNodeId: string | null;
  researchStatus: string | null;
  activeType: string | null;
  activeSubtype: string | null;
  chaosMode: boolean;
  turboMode: boolean;
}

export function useIdeation(brandId: string) {
  const { user } = useAuth();
  const [state, setState] = useState<UseIdeationState>({
    sessionId: null,
    nodes: [],
    isGenerating: false,
    isChatting: false,
    selectedIdeas: new Map(),
    streamingIdeas: [],
    streamingNodeId: null,
    researchStatus: null,
    activeType: null,
    activeSubtype: null,
    chaosMode: false,
    turboMode: false,
  });

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);
  const streamBufferRef = useRef<Map<string, Record<string, string>>>(new Map());
  const rafRef = useRef<number | null>(null);

  // Load existing session on mount
  useEffect(() => {
    if (!user || !brandId) return;
    supabase
      .from('ideation_sessions')
      .select('id, nodes')
      .eq('brand_id', brandId)
      .eq('user_id', user.id)
      .eq('status', 'exploring')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const session = data[0];
          const loadedNodes = (session.nodes as any[] || [])
            .filter((n: any) => n.type !== 'ai_response' && n.type !== 'menu')
            .map((n: any) => ({
              ...n,
              isStreaming: false,
            }));
          setState(s => ({ ...s, sessionId: session.id, nodes: loadedNodes as IdeationNode[] }));
        }
      });
  }, [user, brandId]);

  // Debounced save
  const saveNodes = useCallback((sessionId: string, nodes: IdeationNode[]) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const cleaned = nodes.map(n => {
        if (n.type === 'generation' || n.type === 'ai_response') {
          return { ...n, isStreaming: false };
        }
        return n;
      });
      supabase
        .from('ideation_sessions')
        .update({ nodes: cleaned as any })
        .eq('id', sessionId)
        .then(() => {});
    }, 800);
  }, []);

  // Batched streaming field updates — buffer tokens and flush at 60fps
  const flushStreamBuffer = useCallback(() => {
    rafRef.current = null;
    const buffer = streamBufferRef.current;
    if (buffer.size === 0) return;
    const snapshot = new Map(buffer);
    buffer.clear();
    setState(s => {
      const ideas = [...s.streamingIdeas];
      for (const [key, fields] of snapshot) {
        const idx = parseInt(key);
        if (ideas[idx]) {
          for (const [field, value] of Object.entries(fields)) {
            (ideas[idx] as any)[field] = ((ideas[idx] as any)[field] || '') + value;
          }
        }
      }
      return { ...s, streamingIdeas: ideas };
    });
  }, []);

  const bufferIdeaField = useCallback((index: number, field: string, token: string) => {
    const key = String(index);
    const existing = streamBufferRef.current.get(key) || {};
    existing[field] = (existing[field] || '') + token;
    streamBufferRef.current.set(key, existing);
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(flushStreamBuffer);
    }
  }, [flushStreamBuffer]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (state.sessionId) return state.sessionId;
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('ideation_sessions')
      .insert({
        brand_id: brandId,
        user_id: user.id,
        nodes: [],
        status: 'exploring',
      })
      .select('id')
      .single();

    if (error || !data) throw new Error('Failed to create session');
    setState(s => ({ ...s, sessionId: data.id }));
    return data.id;
  }, [state.sessionId, user, brandId]);

  const generateForType = useCallback(async (typeName: string, subtypeName?: string, userBrief?: string) => {
    const sessionId = await ensureSession();
    const campaignType = CAMPAIGN_TYPES.find(t => t.name === typeName);

    const briefNodeId = crypto.randomUUID();
    const genNodeId = crypto.randomUUID();
    
    const briefContent = subtypeName
      ? `${typeName} → ${subtypeName}${userBrief ? `: ${userBrief}` : ''}`
      : `${typeName}${userBrief ? `: ${userBrief}` : ''}`;

    const newNodes: IdeationNode[] = [
      { id: briefNodeId, type: 'brief', content: briefContent, campaignType: typeName, campaignSubtype: subtypeName, timestamp: Date.now() },
      { id: genNodeId, type: 'generation', ideas: [], isStreaming: true, wasTurbo: state.turboMode, timestamp: Date.now() },
    ];

    setState(s => ({
      ...s,
      activeType: typeName,
      activeSubtype: subtypeName || null,
      isGenerating: true,
      isChatting: false,
      streamingIdeas: [],
      streamingNodeId: genNodeId,
      researchStatus: campaignType?.needsResearch ? 'Researching...' : null,
      nodes: [...s.nodes, ...newNodes],
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    // Fire ideas stream only (no chat commentary)
    const ideasPromise = streamIdeas(
      {
        brand_id: brandId,
        brief: userBrief,
        campaign_type_filter: typeName,
        campaign_subtype_filter: subtypeName,
        needs_research: campaignType?.needsResearch || false,
        chaos_mode: state.chaosMode,
        turbo_mode: state.turboMode,
        stream: true,
      },
      {
        onIdeaStart: (_index) => {
          setState(s => ({
            ...s,
            streamingIdeas: [...s.streamingIdeas, { id: '', title: '', description: '', campaign_type: typeName }],
          }));
        },
        onIdeaField: (index, field, token) => {
          bufferIdeaField(index, field, token);
        },
        onIdeaComplete: (index, idea) => {
          setState(s => {
            const updatedNodes = s.nodes.map(n => {
              if (n.id === genNodeId && n.type === 'generation') {
                return { ...n, ideas: [...n.ideas, idea] };
              }
              return n;
            });
            return { ...s, nodes: updatedNodes };
          });
        },
        onResearchStatus: (status) => {
          setState(s => ({ ...s, researchStatus: status === 'complete' ? null : status }));
        },
        onDone: () => {
          setState(s => {
            const updatedNodes = s.nodes.map(n => {
              if (n.id === genNodeId && n.type === 'generation') {
                return { ...n, isStreaming: false };
              }
              return n;
            });
            saveNodes(sessionId, updatedNodes);
            return { ...s, isGenerating: false, streamingIdeas: [], streamingNodeId: null, nodes: updatedNodes };
          });
        },
        onError: (err) => {
          console.error('[useIdeation] Ideas error:', err);
          setState(s => ({ ...s, isGenerating: false }));
        },
      },
      controller.signal,
    );

    await ideasPromise;
  }, [ensureSession, brandId, state.chaosMode, state.turboMode, state.nodes, saveNodes, bufferIdeaField]);

  const sendChat = useCallback(async (message: string) => {
    const sessionId = await ensureSession();
    const selected = Array.from(state.selectedIdeas.values());
    const hasSelections = selected.length > 0;

    // If no message and no selections, re-generate with last preferences
    if (!message.trim() && !hasSelections) {
      if (state.activeType) {
        generateForType(state.activeType, state.activeSubtype || undefined);
        return;
      }
      return;
    }

    let mode: 'initial' | 'variations' | 'feedback' | 'different' = 'initial';
    if (hasSelections && message.trim()) mode = 'feedback';
    else if (hasSelections && !message.trim()) mode = 'variations';
    else if (/\bdifferent\b/i.test(message)) mode = 'different';

    const genNodeId = crypto.randomUUID();

    const newNodes: IdeationNode[] = [];
    if (hasSelections) {
      newNodes.push({
        id: crypto.randomUUID(),
        type: 'feedback',
        content: message || 'Show me variations',
        selectedIdeas: selected,
        timestamp: Date.now(),
      });
    } else {
      newNodes.push({
        id: crypto.randomUUID(),
        type: 'brief',
        content: message,
        timestamp: Date.now(),
      });
    }
    newNodes.push({ id: genNodeId, type: 'generation', ideas: [], isStreaming: true, wasTurbo: state.turboMode, timestamp: Date.now() });

    setState(s => ({
      ...s,
      isGenerating: true,
      isChatting: false,
      streamingIdeas: [],
      streamingNodeId: genNodeId,
      nodes: [...s.nodes, ...newNodes],
      selectedIdeas: new Map(),
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    const parentIdeas = hasSelections
      ? selected.map(i => ({ title: i.title, description: i.description }))
      : state.nodes.filter(n => n.type === 'generation').flatMap(n => (n as any).ideas || []).slice(-4).map((i: any) => ({ title: i.title, description: i.description }));

    const ideasPromise = streamIdeas(
      {
        brand_id: brandId,
        brief: message,
        parent_ideas: parentIdeas,
        feedback: message,
        mode,
        campaign_type_filter: state.activeType,
        campaign_subtype_filter: state.activeSubtype,
        chaos_mode: state.chaosMode,
        turbo_mode: state.turboMode,
        stream: true,
      },
      {
        onIdeaStart: () => {
          setState(s => ({
            ...s,
            streamingIdeas: [...s.streamingIdeas, { id: '', title: '', description: '', campaign_type: state.activeType || '' }],
          }));
        },
        onIdeaField: (index, field, token) => {
          bufferIdeaField(index, field, token);
        },
        onIdeaComplete: (_index, idea) => {
          setState(s => ({
            ...s,
            nodes: s.nodes.map(n =>
              n.id === genNodeId && n.type === 'generation'
                ? { ...n, ideas: [...n.ideas, idea] }
                : n,
            ),
          }));
        },
        onResearchStatus: () => {},
        onDone: () => {
          setState(s => {
            const updatedNodes = s.nodes.map(n =>
              n.id === genNodeId && n.type === 'generation' ? { ...n, isStreaming: false } : n,
            );
            saveNodes(sessionId, updatedNodes);
            return { ...s, isGenerating: false, streamingIdeas: [], streamingNodeId: null, nodes: updatedNodes };
          });
        },
        onError: (err) => {
          console.error('[useIdeation] Ideas error:', err);
          setState(s => ({ ...s, isGenerating: false }));
        },
      },
      controller.signal,
    );

    await ideasPromise;
  }, [ensureSession, brandId, state.selectedIdeas, state.activeType, state.activeSubtype, state.chaosMode, state.turboMode, state.nodes, saveNodes, bufferIdeaField]);

  const toggleSelect = useCallback((idea: CampaignIdea) => {
    setState(s => {
      const next = new Map(s.selectedIdeas);
      if (next.has(idea.id)) next.delete(idea.id);
      else next.set(idea.id, idea);
      return { ...s, selectedIdeas: next };
    });
  }, []);

  const clearSelection = useCallback(() => {
    setState(s => ({ ...s, selectedIdeas: new Map() }));
  }, []);

  const toggleChaosMode = useCallback(() => {
    setState(s => ({ ...s, chaosMode: !s.chaosMode }));
  }, []);

  const toggleTurboMode = useCallback(() => {
    setState(s => ({ ...s, turboMode: !s.turboMode }));
  }, []);

  const startNewSession = useCallback(() => {
    // Cancel any pending debounced save to prevent it from restoring old nodes
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setState(s => ({
      ...s,
      sessionId: null,
      nodes: [],
      selectedIdeas: new Map(),
      streamingIdeas: [],
      activeType: null,
      activeSubtype: null,
    }));
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setState(s => ({
      ...s,
      isGenerating: false,
      isChatting: false,
      streamingIdeas: [],
      streamingNodeId: null,
      nodes: s.nodes.map(n => {
        if ((n.type === 'generation' || n.type === 'ai_response') && n.isStreaming) {
          return { ...n, isStreaming: false };
        }
        return n;
      }),
    }));
  }, []);

  const insertMenuNode = useCallback((type: string, sub?: string) => {
    // Remove any existing menu nodes, then generate
    setState(s => ({ ...s, nodes: s.nodes.filter(n => n.type !== 'menu') }));
    generateForType(type, sub);
  }, [generateForType]);

  const addMenuNode = useCallback(() => {
    setState(s => ({
      ...s,
      nodes: [
        ...s.nodes.filter(n => n.type !== 'menu'),
        { id: crypto.randomUUID(), type: 'menu' as const, timestamp: Date.now() },
      ],
    }));
  }, []);

  const removeMenuNodes = useCallback(() => {
    setState(s => ({ ...s, nodes: s.nodes.filter(n => n.type !== 'menu') }));
  }, []);

  // Step 1: Fetch calendar dates (no brand-specific ideas yet)
  const generateCalendarDates = useCallback(async () => {
    await ensureSession();
    const briefNodeId = crypto.randomUUID();
    const calNodeId = crypto.randomUUID();

    setState(s => ({
      ...s,
      isGenerating: true,
      nodes: [
        ...s.nodes,
        { id: briefNodeId, type: 'brief' as const, content: 'Research upcoming calendar dates & events for the next 30 days', campaignType: '📅 Calendar Dates', timestamp: Date.now() },
        { id: calNodeId, type: 'calendar_dates' as const, dates: [], isLoading: true, selectedDates: new Set<string>(), timestamp: Date.now() },
      ],
    }));

    try {
      const { data, error } = await supabase.functions.invoke('generate-calendar-dates', {
        body: { brand_id: brandId, mode: 'list' },
      });

      if (error) throw new Error(error.message || 'Failed to fetch calendar dates');
      if (data?.error) throw new Error(data.error);

      const dates: CalendarDateEntry[] = data?.dates || [];

      setState(s => ({
        ...s,
        isGenerating: false,
        nodes: s.nodes.map(n =>
          n.id === calNodeId && n.type === 'calendar_dates'
            ? { ...n, dates, isLoading: false }
            : n,
        ),
      }));
    } catch (err) {
      console.error('[useIdeation] Calendar dates error:', err);
      setState(s => ({
        ...s,
        isGenerating: false,
        nodes: s.nodes.map(n =>
          n.id === calNodeId && n.type === 'calendar_dates'
            ? { ...n, isLoading: false }
            : n,
        ),
      }));
      throw err;
    }
  }, [ensureSession, brandId]);

  // Toggle a date selection in the calendar_dates node
  const toggleCalendarDate = useCallback((nodeId: string, dateKey: string) => {
    setState(s => ({
      ...s,
      nodes: s.nodes.map(n => {
        if (n.id === nodeId && n.type === 'calendar_dates') {
          const next = new Set(n.selectedDates);
          if (next.has(dateKey)) next.delete(dateKey);
          else next.add(dateKey);
          return { ...n, selectedDates: next };
        }
        return n;
      }),
    }));
  }, []);

  // Step 2: Generate ideas for selected dates
  const generateCalendarIdeas = useCallback(async (nodeId: string) => {
    const sessionId = await ensureSession();
    const calNode = state.nodes.find(n => n.id === nodeId && n.type === 'calendar_dates');
    if (!calNode || calNode.type !== 'calendar_dates') return;

    const selectedDates = calNode.dates.filter(d => calNode.selectedDates.has(`${d.date}-${d.name}`));
    if (selectedDates.length === 0) return;

    // Create generation nodes for each date (will be populated after API call)
    const genNodeIds: string[] = selectedDates.map(() => crypto.randomUUID());

    setState(s => ({
      ...s,
      isGenerating: true,
      nodes: [
        ...s.nodes,
        ...selectedDates.map((d, i) => ({
          id: genNodeIds[i],
          type: 'generation' as const,
          ideas: [] as CampaignIdea[],
          isStreaming: true,
          groupLabel: `${d.name} — ${new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
          timestamp: Date.now() + i,
        })),
      ],
    }));

    try {
      const { data, error } = await supabase.functions.invoke('generate-calendar-dates', {
        body: { brand_id: brandId, mode: 'ideate', selected_dates: selectedDates },
      });

      if (error) throw new Error(error.message || 'Failed to generate ideas');
      if (data?.error) throw new Error(data.error);

      const dateIdeas: Array<{ date: string; name: string; ideas: any[] }> = data?.date_ideas || [];

      setState(s => {
        let updatedNodes = [...s.nodes];
        dateIdeas.forEach((di, idx) => {
          const genNodeId = genNodeIds[idx];
          if (!genNodeId) return;
          const ideas: CampaignIdea[] = (di.ideas || []).map((idea: any) => ({
            id: crypto.randomUUID(),
            title: idea.title,
            description: idea.description,
            campaign_type: idea.campaign_type || 'calendar',
            campaign_info: `Date: ${di.date} | Event: ${di.name}`,
            subject_line: idea.subject_line || '',
            copy_direction: '',
          }));
          updatedNodes = updatedNodes.map(n =>
            n.id === genNodeId && n.type === 'generation'
              ? { ...n, ideas, isStreaming: false }
              : n,
          );
        });
        // Mark any remaining gen nodes as done
        updatedNodes = updatedNodes.map(n =>
          genNodeIds.includes(n.id) && n.type === 'generation' && n.isStreaming
            ? { ...n, isStreaming: false }
            : n,
        );
        saveNodes(sessionId, updatedNodes);
        return { ...s, isGenerating: false, nodes: updatedNodes };
      });
    } catch (err) {
      console.error('[useIdeation] Calendar ideas error:', err);
      setState(s => ({
        ...s,
        isGenerating: false,
        nodes: s.nodes.map(n =>
          genNodeIds.includes(n.id) && n.type === 'generation'
            ? { ...n, isStreaming: false }
            : n,
        ),
      }));
      throw err;
    }
  }, [ensureSession, brandId, state.nodes, saveNodes]);

  return {
    ...state,
    generateForType,
    sendChat,
    toggleSelect,
    clearSelection,
    toggleChaosMode,
    toggleTurboMode,
    startNewSession,
    abort,
    insertMenuNode,
    addMenuNode,
    removeMenuNodes,
    generateCalendarDates,
  };
}
