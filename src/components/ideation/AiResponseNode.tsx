// AI response nodes are hidden from the ideation flow.
// Kept as a no-op component so imports don't break.

interface Props {
  content: string;
  isStreaming: boolean;
}

export function AiResponseNode(_props: Props) {
  return null;
}
