import { CampaignIdea } from '@/lib/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface StreamIdeasCallbacks {
  onIdeaStart: (index: number) => void;
  onIdeaField: (index: number, field: string, value: string) => void;
  onIdeaComplete: (index: number, idea: CampaignIdea) => void;
  onResearchStatus: (status: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function streamIdeas(
  body: Record<string, any>,
  callbacks: StreamIdeasCallbacks,
  abortSignal?: AbortSignal,
) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-ideas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  if (!response.ok) {
    const err = await response.text();
    callbacks.onError(err);
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('event: ')) {
        lastEvent = trimmed.slice(7).trim();
        continue;
      }
      if (trimmed.startsWith('data: ')) {
        try {
          const data = JSON.parse(trimmed.slice(6));
          switch (lastEvent) {
            case 'idea_start':
              callbacks.onIdeaStart(data.index);
              break;
            case 'idea_field':
              callbacks.onIdeaField(data.index, data.field, data.value || data.token || '');
              break;
            case 'idea_complete':
              callbacks.onIdeaComplete(data.index, data.idea);
              break;
            case 'research_status':
              callbacks.onResearchStatus(data.status);
              break;
            case 'done':
              callbacks.onDone();
              break;
            case 'error':
              callbacks.onError(data.message);
              break;
          }
        } catch {
          // skip unparseable
        }
      }
    }
  }
  // If we exit the loop without a done event
  callbacks.onDone();
}

interface StreamChatCallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function streamChat(
  body: Record<string, any>,
  callbacks: StreamChatCallbacks,
  abortSignal?: AbortSignal,
) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ideation-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify(body),
    signal: abortSignal,
  });

  if (!response.ok) {
    const err = await response.text();
    callbacks.onError(err);
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('event: ')) {
        lastEvent = trimmed.slice(7).trim();
        continue;
      }
      if (trimmed.startsWith('data: ')) {
        try {
          const data = JSON.parse(trimmed.slice(6));
          switch (lastEvent) {
            case 'text':
              callbacks.onToken(data.token);
              break;
            case 'done':
              callbacks.onDone();
              break;
            case 'error':
              callbacks.onError(data.message);
              break;
          }
        } catch {
          // skip
        }
      }
    }
  }
  callbacks.onDone();
}
