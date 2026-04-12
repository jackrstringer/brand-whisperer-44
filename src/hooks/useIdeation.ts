import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CampaignIdea } from '@/lib/types';
import { CAMPAIGN_TYPES } from '@/lib/ideation/campaignTypes';
import { streamIdeas, streamChat } from '@/lib/ideation/streamHelpers';

export type IdeationNode =
  | { id: string; type: 'brief'; content: string; campaignType?: string; campaignSubtype?: string; timestamp: number }
  | { id: string; type: 'generation'; ideas: CampaignIdea[]; isStreaming: boolean; wasTurbo?: boolean; timestamp: number }
  | { id: string; type: 'feedback'; content: string; selectedIdeas: CampaignIdea[]; timestamp: number }
  | { id: string; type: 'ai_response'; content: string; isStreaming: boolean; timestamp: number };

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
          const loadedNodes = (session.nodes as any[] || []).map((n: any) => ({
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
    const chatNodeId = crypto.randomUUID();
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
          setState(s => {
            const ideas = [...s.streamingIdeas];
            if (ideas[index]) {
              (ideas[index] as any)[field] = ((ideas[index] as any)[field] || '') + token;
            }
            return { ...s, streamingIdeas: ideas };
          });
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
  }, [ensureSession, brandId, state.chaosMode, state.turboMode, state.nodes, saveNodes]);

  const sendChat = useCallback(async (message: string) => {
    const sessionId = await ensureSession();
    const selected = Array.from(state.selectedIdeas.values());
    const hasSelections = selected.length > 0;

    let mode: 'initial' | 'variations' | 'feedback' | 'different' = 'initial';
    if (hasSelections && message.trim()) mode = 'feedback';
    else if (hasSelections && !message.trim()) mode = 'variations';
    else if (/\bdifferent\b/i.test(message)) mode = 'different';

    const genNodeId = crypto.randomUUID();
    const chatNodeId = crypto.randomUUID();

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
    newNodes.push({ id: chatNodeId, type: 'ai_response', content: '', isStreaming: true, timestamp: Date.now() });

    setState(s => ({
      ...s,
      isGenerating: true,
      isChatting: true,
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
          setState(s => {
            const ideas = [...s.streamingIdeas];
            if (ideas[index]) {
              (ideas[index] as any)[field] = ((ideas[index] as any)[field] || '') + token;
            }
            return { ...s, streamingIdeas: ideas };
          });
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

    const historyForChat = state.nodes.slice(-10).map(n => ({
      role: n.type === 'brief' || n.type === 'feedback' ? 'user' : 'assistant',
      content: n.type === 'generation' ? `[Generated ideas]` : (n as any).content || '',
    }));

    const chatPromise = streamChat(
      { brand_id: brandId, message, history: historyForChat },
      {
        onToken: (token) => {
          setState(s => ({
            ...s,
            nodes: s.nodes.map(n =>
              n.id === chatNodeId && n.type === 'ai_response'
                ? { ...n, content: n.content + token }
                : n,
            ),
          }));
        },
        onDone: () => {
          setState(s => {
            const updatedNodes = s.nodes.map(n =>
              n.id === chatNodeId && n.type === 'ai_response' ? { ...n, isStreaming: false } : n,
            );
            saveNodes(sessionId, updatedNodes);
            return { ...s, isChatting: false, nodes: updatedNodes };
          });
        },
        onError: (err) => {
          console.error('[useIdeation] Chat error:', err);
          setState(s => ({ ...s, isChatting: false }));
        },
      },
      controller.signal,
    );

    await Promise.allSettled([ideasPromise, chatPromise]);
  }, [ensureSession, brandId, state.selectedIdeas, state.activeType, state.activeSubtype, state.chaosMode, state.turboMode, state.nodes, saveNodes]);

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
  };
}
