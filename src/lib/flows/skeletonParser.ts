// Parses agent-produced flow skeleton markdown into structured nodes.
// Format: nodes separated by `---`, each starting with one of:
//   [EMAIL ...]   [DELAY ...]   [CONDITIONAL SPLIT ...]   [SMS ...]

export type FlowNodeType = "email" | "delay" | "split" | "sms";

export interface ParsedFlowNode {
  node_type: FlowNodeType;
  label?: string;
  timing?: string;
  job?: string;
  subject_direction?: string;
  sections?: string[];
  notes?: string;
  raw: string;
}

function detectType(line: string): FlowNodeType | null {
  const upper = line.trim().toUpperCase();
  // Bracket format (preferred)
  if (upper.startsWith("[EMAIL")) return "email";
  if (upper.startsWith("[DELAY")) return "delay";
  if (upper.startsWith("[CONDITIONAL SPLIT") || upper.startsWith("[SPLIT")) return "split";
  if (upper.startsWith("[SMS")) return "sms";
  // Markdown header fallback (defense-in-depth)
  // Matches "## EMAIL 1:", "### Email 2 -", "## DELAY", etc.
  const headerMatch = upper.match(/^#+\s*(EMAIL|DELAY|SPLIT|CONDITIONAL\s+SPLIT|SMS)\b/);
  if (headerMatch) {
    const kind = headerMatch[1];
    if (kind.startsWith("EMAIL")) return "email";
    if (kind.startsWith("DELAY")) return "delay";
    if (kind.includes("SPLIT")) return "split";
    if (kind === "SMS") return "sms";
  }
  return null;
}

function extractField(block: string, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const re = new RegExp(`^\\s*(?:[-*•]\\s*)?\\*{0,2}${key}\\*{0,2}\\s*[:\\-]\\s*(.+)$`, "im");
    const m = block.match(re);
    if (m) return m[1].trim().replace(/\*+$/, "").trim();
  }
  return undefined;
}

function extractSections(block: string): string[] | undefined {
  // Find a "Sections:" header and capture indented bullets beneath it
  const m = block.match(/sections?\s*[:\-]\s*\n([\s\S]*?)(?:\n\s*\n|\n[A-Z][a-zA-Z ]+:|$)/i);
  if (!m) return undefined;
  const lines = m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*•]/.test(l))
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  return lines.length ? lines : undefined;
}

function extractLabel(firstLine: string): string {
  // Bracket: [EMAIL 1 — Welcome + Offer] → "Welcome + Offer"
  const bracket = firstLine.match(/\[([^\]]+)\]/)?.[1];
  if (bracket) {
    const dashSplit = bracket.split(/[—–-]/);
    return (dashSplit.length > 1 ? dashSplit.slice(1).join("-") : bracket).trim();
  }
  // Markdown header: "## EMAIL 1: Welcome + Offer" or "## Email 1 - Welcome"
  const stripped = firstLine.replace(/^#+\s*/, "").replace(/^(EMAIL|DELAY|SPLIT|CONDITIONAL SPLIT|SMS)\s*\d*\s*[:\-—–]?\s*/i, "");
  return stripped.trim() || firstLine.trim();
}

function splitIntoBlocks(markdown: string): string[] {
  // Primary: split on `---` separators
  const dashSplit = markdown
    .split(/\n\s*---+\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (dashSplit.length > 1) return dashSplit;

  // Fallback: split on bracket headers OR markdown headers (## EMAIL, etc.)
  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  const isHeader = (l: string) =>
    /^\s*\[(EMAIL|DELAY|CONDITIONAL\s+SPLIT|SPLIT|SMS)/i.test(l) ||
    /^\s*#+\s*(EMAIL|DELAY|SPLIT|CONDITIONAL\s+SPLIT|SMS)\b/i.test(l);
  for (const line of lines) {
    if (isHeader(line) && current.length > 0) {
      blocks.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current.join("\n").trim());
  return blocks.filter(Boolean);
}

export function parseSkeleton(markdown: string | null | undefined): ParsedFlowNode[] {
  if (!markdown?.trim()) return [];
  const blocks = splitIntoBlocks(markdown);

  const nodes: ParsedFlowNode[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd());
    const firstLine = lines.find((l) => l.trim().length > 0) || "";
    const type = detectType(firstLine);
    if (!type) continue;

    const label = extractLabel(firstLine);

    if (type === "delay") {
      // Try to find the wait duration in the bracket or a Wait: line
      const dur =
        firstLine.match(/\[DELAY[^\]]*\]\s*(.+)/i)?.[1]?.trim() ||
        extractField(block, "Wait", "Duration", "Timing") ||
        label;
      nodes.push({ node_type: "delay", label: dur || "Delay", raw: block });
      continue;
    }

    if (type === "split") {
      nodes.push({
        node_type: "split",
        label: label || "Conditional Split",
        notes: lines.slice(1).join("\n").trim() || undefined,
        raw: block,
      });
      continue;
    }

    if (type === "sms") {
      nodes.push({
        node_type: "sms",
        label: label || "SMS",
        notes: extractField(block, "Body", "Message") ?? lines.slice(1).join("\n").trim(),
        raw: block,
      });
      continue;
    }

    // email
    nodes.push({
      node_type: "email",
      label: label || "Email",
      timing: extractField(block, "Timing", "Send time", "When"),
      job: extractField(block, "Job", "Goal", "Purpose"),
      subject_direction: extractField(block, "Subject direction", "Subject", "Subject line"),
      sections: extractSections(block),
      notes: extractField(block, "Notes", "Dynamic content"),
      raw: block,
    });
  }
  return nodes;
}

export const FLOW_TRIGGERS: Record<string, string> = {
  welcome: "Added to List",
  abandoned_checkout: "Started Checkout",
  post_purchase: "Placed Order",
  browse_abandonment: "Viewed Product",
  winback: "Time-based (no event trigger)",
};

export const FLOW_TYPE_META: Record<
  string,
  { label: string; description: string }
> = {
  welcome: {
    label: "Welcome Flow",
    description:
      "Your highest-leverage flow. Hits every new subscriber at peak intent.",
  },
  abandoned_checkout: {
    label: "Abandoned Checkout",
    description: "Recover lost revenue. Sends within 1 hour of abandonment.",
  },
  post_purchase: {
    label: "Post-Purchase",
    description: "Onboard customers, reduce churn, drive repeat purchase.",
  },
  browse_abandonment: {
    label: "Browse Abandonment",
    description: "Re-engage product viewers who didn't add to cart.",
  },
  winback: {
    label: "Winback",
    description: "Re-engage lapsed customers. 60–180 days since last purchase.",
  },
};
