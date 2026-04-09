import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Copy, Check } from "lucide-react";

interface JsonNodeProps {
  keyName?: string;
  value: any;
  depth: number;
  defaultOpen?: boolean;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function JsonNode({ keyName, value, depth, defaultOpen = false }: JsonNodeProps) {
  const [open, setOpen] = useState(defaultOpen || depth < 1);
  const [copied, setCopied] = useState(false);

  const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
  const isArray = Array.isArray(value);
  const isExpandable = isObject || isArray;

  const childEntries = useMemo(() => {
    if (isArray) return value.map((v: any, i: number) => [String(i), v] as [string, any]);
    if (isObject) return Object.entries(value);
    return [];
  }, [value, isArray, isObject]);

  const preview = useMemo(() => {
    if (isArray) return `[${value.length} item${value.length !== 1 ? "s" : ""}]`;
    if (isObject) {
      const keys = Object.keys(value);
      if (keys.length <= 3) return `{ ${keys.join(", ")} }`;
      return `{ ${keys.slice(0, 3).join(", ")} … +${keys.length - 3} }`;
    }
    return null;
  }, [value, isArray, isObject]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyToClipboard(typeof value === "string" ? value : JSON.stringify(value, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const renderValue = () => {
    if (value === null) return <span className="text-muted-foreground italic">null</span>;
    if (value === undefined) return <span className="text-muted-foreground italic">undefined</span>;
    if (typeof value === "boolean") return <span className="text-amber-500">{String(value)}</span>;
    if (typeof value === "number") return <span className="text-blue-500">{value}</span>;
    if (typeof value === "string") {
      if (value.length > 80) {
        return <span className="text-green-600 dark:text-green-400">"{value.slice(0, 80)}…"</span>;
      }
      return <span className="text-green-600 dark:text-green-400">"{value}"</span>;
    }
    return <span>{String(value)}</span>;
  };

  if (!isExpandable) {
    return (
      <div
        className="group flex items-center gap-1 py-[3px] hover:bg-muted/40 rounded px-1.5 -mx-1.5 transition-colors"
        style={{ paddingLeft: `${depth * 16 + 6}px` }}
      >
        <div className="w-4 shrink-0" />
        {keyName !== undefined && (
          <span className="text-foreground/80 font-medium shrink-0">{keyName}:</span>
        )}
        <span className="truncate">{renderValue()}</span>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 ml-auto shrink-0 p-0.5 rounded hover:bg-muted transition-opacity"
          title="Copy value"
        >
          {copied ? <Check className="w-2.5 h-2.5 text-green-500" /> : <Copy className="w-2.5 h-2.5 text-muted-foreground" />}
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="group flex items-center gap-1 py-[3px] w-full text-left hover:bg-muted/40 rounded px-1.5 -mx-1.5 transition-colors"
        style={{ paddingLeft: `${depth * 16 + 6}px` }}
      >
        <span className="shrink-0 text-muted-foreground">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        {keyName !== undefined && (
          <span className="text-foreground/80 font-medium shrink-0">{keyName}</span>
        )}
        {!open && <span className="text-muted-foreground/60 truncate ml-1">{preview}</span>}
        {open && isArray && (
          <span className="text-muted-foreground/50 ml-1">{value.length} item{value.length !== 1 ? "s" : ""}</span>
        )}
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 ml-auto shrink-0 p-0.5 rounded hover:bg-muted transition-opacity"
          title="Copy"
        >
          {copied ? <Check className="w-2.5 h-2.5 text-green-500" /> : <Copy className="w-2.5 h-2.5 text-muted-foreground" />}
        </button>
      </button>
      {open && (
        <div>
          {childEntries.map(([k, v]) => (
            <JsonNode key={k} keyName={k} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface JsonExplorerProps {
  data: any;
  maxHeight?: string;
}

export default function JsonExplorer({ data, maxHeight = "450px" }: JsonExplorerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [allCopied, setAllCopied] = useState(false);

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    return filterJson(data, searchTerm.toLowerCase());
  }, [data, searchTerm]);

  const handleCopyAll = () => {
    copyToClipboard(JSON.stringify(data, null, 2));
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 1500);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search keys or values…"
          className="flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none"
        />
        <button
          onClick={handleCopyAll}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          {allCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          {allCopied ? "Copied" : "Copy all"}
        </button>
      </div>
      {/* Tree */}
      <div className="overflow-auto text-[11px] font-mono p-1.5" style={{ maxHeight }}>
        {filteredData === undefined ? (
          <div className="text-muted-foreground text-center py-4 text-[10px]">No results match "{searchTerm}"</div>
        ) : (
          <JsonNode value={filteredData} depth={0} defaultOpen />
        )}
      </div>
    </div>
  );
}

function filterJson(obj: any, term: string): any {
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj === "string" && obj.toLowerCase().includes(term)) return obj;
  if (typeof obj === "number" && String(obj).includes(term)) return obj;
  if (typeof obj === "boolean" && String(obj).includes(term)) return obj;

  if (Array.isArray(obj)) {
    const filtered = obj.map((item) => filterJson(item, term)).filter((v) => v !== undefined);
    return filtered.length > 0 ? filtered : undefined;
  }

  if (typeof obj === "object") {
    const result: Record<string, any> = {};
    let found = false;
    for (const [key, value] of Object.entries(obj)) {
      if (key.toLowerCase().includes(term)) {
        result[key] = value;
        found = true;
      } else {
        const filtered = filterJson(value, term);
        if (filtered !== undefined) {
          result[key] = filtered;
          found = true;
        }
      }
    }
    return found ? result : undefined;
  }

  return undefined;
}
