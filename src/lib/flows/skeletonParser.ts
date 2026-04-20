// Parses agent-produced flow skeleton markdown into structured nodes.
// Format: nodes separated by `---`, each starting with one of:
//   [TRIGGER ...] [FILTERS ...] [EXIT ...]
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

export interface ParsedFlowMeta {
  trigger?: string;
  filters?: string[];
  exit?: string[];
}

function detectType(line: string): FlowNodeType | null {
  const upper = line.trim().toUpperCase();
  if (upper.startsWith("[EMAIL")) return "email";
  if (upper.startsWith("[DELAY")) return "delay";
  if (upper.startsWith("[CONDITIONAL SPLIT") || upper.startsWith("[SPLIT")) return "split";
  if (upper.startsWith("[SMS")) return "sms";
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

function isMetaHeader(line: string): "trigger" | "filters" | "exit" | null {
  const upper = line.trim().toUpperCase();
  if (upper.startsWith("[TRIGGER")) return "trigger";
  if (upper.startsWith("[FILTERS") || upper.startsWith("[FILTER") || upper.startsWith("[ENTRY FILTERS")) return "filters";
  if (upper.startsWith("[EXIT")) return "exit";
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

function extractBulletList(block: string): string[] {
  return block
    .split("\n")
    .slice(1) // skip the bracket header line
    .map((l) => l.trim())
    .filter((l) => /^[-*•]/.test(l))
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function extractLabel(firstLine: string): string {
  const bracket = firstLine.match(/\[([^\]]+)\]/)?.[1];
  if (bracket) {
    const dashSplit = bracket.split(/[—–-]/);
    return (dashSplit.length > 1 ? dashSplit.slice(1).join("-") : bracket).trim();
  }
  const stripped = firstLine.replace(/^#+\s*/, "").replace(/^(EMAIL|DELAY|SPLIT|CONDITIONAL SPLIT|SMS)\s*\d*\s*[:\-—–]?\s*/i, "");
  return stripped.trim() || firstLine.trim();
}

function splitIntoBlocks(markdown: string): string[] {
  const dashSplit = markdown
    .split(/\n\s*---+\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (dashSplit.length > 1) return dashSplit;

  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  const isHeader = (l: string) =>
    /^\s*\[(TRIGGER|FILTERS?|ENTRY FILTERS|EXIT|EMAIL|DELAY|CONDITIONAL\s+SPLIT|SPLIT|SMS)/i.test(l) ||
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

export function parseSkeletonMeta(markdown: string | null | undefined): ParsedFlowMeta {
  if (!markdown?.trim()) return {};
  const blocks = splitIntoBlocks(markdown);
  const meta: ParsedFlowMeta = {};
  for (const block of blocks) {
    const lines = block.split("\n");
    const firstLine = lines.find((l) => l.trim().length > 0) || "";
    const kind = isMetaHeader(firstLine);
    if (!kind) continue;
    if (kind === "trigger") {
      const inline = firstLine.match(/\[TRIGGER[^\]]*\]\s*[—–-]?\s*(.+)/i)?.[1]?.trim();
      meta.trigger = inline || extractField(block, "Trigger", "Event", "Metric") || lines.slice(1).join(" ").trim();
    } else if (kind === "filters") {
      meta.filters = extractBulletList(block);
    } else if (kind === "exit") {
      meta.exit = extractBulletList(block);
    }
  }
  return meta;
}

export function parseSkeleton(markdown: string | null | undefined): ParsedFlowNode[] {
  if (!markdown?.trim()) return [];
  const blocks = splitIntoBlocks(markdown);

  const nodes: ParsedFlowNode[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd());
    const firstLine = lines.find((l) => l.trim().length > 0) || "";
    if (isMetaHeader(firstLine)) continue; // meta blocks handled separately
    const type = detectType(firstLine);
    if (!type) continue;

    const label = extractLabel(firstLine);

    if (type === "delay") {
      const dur =
        firstLine.match(/\[DELAY[^\]]*\]\s*[—–-]?\s*(.+)/i)?.[1]?.trim() ||
        extractField(block, "Wait", "Duration", "Timing") ||
        label;
      nodes.push({ node_type: "delay", label: dur || "Delay", raw: block });
      continue;
    }

    if (type === "split") {
      // Parse explicit branch metadata if present.
      // Supported shapes inside the split block:
      //   Branches:
      //   - YES: <description>
      //   - NO: <description>
      // (also accepts "If yes" / "If no" / arbitrary labels)
      const branches: SplitBranch[] = [];
      const branchSection = block.match(/branches?\s*[:\-]\s*\n([\s\S]*?)(?:\n\s*\n|\n[A-Z][a-zA-Z ]+:|$)/i);
      if (branchSection) {
        for (const line of branchSection[1].split("\n")) {
          const m = line.match(/^\s*[-*•]\s*([^:]+?)\s*[:\-]\s*(.+)$/);
          if (m) branches.push({ label: m[1].trim(), description: m[2].trim() });
          else {
            const bare = line.match(/^\s*[-*•]\s*(.+)$/);
            if (bare) branches.push({ label: bare[1].trim() });
          }
        }
      }
      nodes.push({
        node_type: "split",
        label: label || "Conditional Split",
        notes: lines.slice(1).join("\n").trim() || undefined,
        branches: branches.length ? branches : undefined,
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

export const FLOW_DEFAULT_FILTERS: Record<string, string[]> = {
  welcome: [
    "Has not been in this flow in the last 60 days",
    "Has email consent",
    "Has not Placed Order since starting this flow",
  ],
  abandoned_checkout: [
    "Has not Placed Order since Started Checkout",
    "Has not been in this flow in the last 7 days",
  ],
  post_purchase: ["Has Placed Order — once"],
  browse_abandonment: [
    "Has not Started Checkout since Viewed Product",
    "Has not been in this flow in the last 14 days",
  ],
  winback: ["Has Placed Order at least once", "Has not Placed Order in 60+ days"],
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
