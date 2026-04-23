import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  FileText,
  Mail,
  Maximize2,
  Minimize2,
  Play,
  StickyNote,
  Timer,
  X,
} from "lucide-react";
import type { BoardNode, FlowEmailMeta, FlowEmailRow } from "@/components/flows/SkeletonViewer";

type PeekMode = "side" | "center";

const STORAGE_KEY = "flow-email-peek-mode";

function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 w-full px-6 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {title}
      </button>
      <div className="overflow-hidden transition-all duration-150" style={{ maxHeight: open ? "4000px" : "0", opacity: open ? 1 : 0 }}>
        <div className="px-6 pb-4">{children}</div>
      </div>
    </div>
  );
}

function PropRow({ label, icon, children, noBorder }: { label: string; icon?: React.ReactNode; children: React.ReactNode; noBorder?: boolean }) {
  return (
    <div className={`flex items-start gap-3 min-h-[36px] group/row hover:bg-muted/40 transition-colors ${noBorder ? "" : "border-b border-border/50"}`}>
      <div className="flex items-center gap-1.5 w-[140px] shrink-0 pt-[9px] pl-1">
        {icon && <span className="text-muted-foreground/70">{icon}</span>}
        <span className="text-[13px] text-muted-foreground select-none">{label}</span>
      </div>
      <div className="flex-1 min-w-0 py-[7px] pr-1 text-[13px] leading-[20px] text-foreground whitespace-pre-wrap break-words">
        {children || <span className="text-muted-foreground/40">–</span>}
      </div>
    </div>
  );
}

export function FlowEmailDetail({
  node,
  emailRow,
  campaignMeta,
  brandId,
  flowType,
  onClose,
  onGenerate,
}: {
  node: BoardNode;
  emailRow?: FlowEmailRow;
  campaignMeta: Record<string, FlowEmailMeta>;
  brandId: string;
  flowType: string;
  onClose: () => void;
  onGenerate?: () => void;
}) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [peekMode, setPeekMode] = useState<PeekMode>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as PeekMode) || "side";
    } catch {
      return "side";
    }
  });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const resize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleAnimatedClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });

  const handleAnimatedClose = () => {
    setVisible(false);
    window.setTimeout(onClose, 180);
  };

  const effectiveMode = isMobile ? "center" : peekMode;
  const togglePeekMode = () => {
    const next = peekMode === "side" ? "center" : "side";
    setPeekMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  };

  const meta = emailRow?.campaign_id ? campaignMeta[emailRow.campaign_id] : null;
  const status = emailRow?.generation_status || "draft";
  const sections = useMemo(() => (Array.isArray(node.meta?.sections) ? node.meta.sections : []), [node.meta?.sections]);
  const subject = meta?.subject_line || node.meta?.subject_direction || node.meta?.subject || "";
  const previewText = meta?.preview_text || node.meta?.preview || "";

  const sideClasses = effectiveMode === "side"
    ? `fixed top-0 right-0 bottom-0 border-l border-border flex flex-col bg-card z-50 transition-transform duration-200 ease-out ${visible ? "translate-x-0" : "translate-x-full"}`
    : `fixed top-1/2 left-1/2 flex flex-col bg-card z-50 rounded-xl shadow-2xl border border-border transition-all duration-150 ease-out ${visible ? "opacity-100 scale-100" : "opacity-0 scale-95"}`;
  const sideStyle = effectiveMode === "side"
    ? { width: "min(680px, 50vw)" }
    : { width: isMobile ? "95vw" : "min(900px, 90vw)", maxHeight: isMobile ? "90vh" : "85vh", transform: `translate(-50%, -50%) ${visible ? "scale(1)" : "scale(0.95)"}` };

  const panel = (
    <>
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-150 ${visible ? "opacity-100" : "opacity-0"} ${effectiveMode === "center" ? "bg-background/70 backdrop-blur-sm" : "bg-background/35"}`}
        onClick={handleAnimatedClose}
      />
      <div className={sideClasses} style={sideStyle}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
          <button
            onClick={togglePeekMode}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={`Switch to ${peekMode === "side" ? "center" : "side"} peek`}
          >
            {effectiveMode === "side" ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          <div className="flex items-center gap-1">
            {emailRow?.campaign_id && (
              <button
                onClick={() => navigate(`/brands/${brandId}/campaigns/${emailRow.campaign_id}`)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Open in Editor"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            )}
            <button onClick={handleAnimatedClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-6 pt-4 pb-2 shrink-0">
          <h2 className="text-lg font-semibold leading-snug text-foreground">{node.label}</h2>
          <div className="flex items-center gap-2 mt-1.5 pb-1">
            <Badge variant="secondary" className="text-[10px] uppercase">{status}</Badge>
            <Badge variant="outline" className="text-[10px]">{flowType}</Badge>
            {typeof node.emailIndex === "number" && <span className="text-[11px] text-muted-foreground">Step {node.emailIndex + 1}</span>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          <Section title="Details">
            <div>
              <PropRow label="Brief" icon={<FileText className="w-3.5 h-3.5" />}>{node.meta?.job}</PropRow>
              <PropRow label="Subject Line" icon={<Mail className="w-3.5 h-3.5" />}>{subject}</PropRow>
              <PropRow label="Preview Text" icon={<Eye className="w-3.5 h-3.5" />}>{previewText}</PropRow>
              <PropRow label="Timing" icon={<Timer className="w-3.5 h-3.5" />}>{node.meta?.timing}</PropRow>
              <PropRow label="Copy Notes" icon={<StickyNote className="w-3.5 h-3.5" />} noBorder>{node.meta?.notes}</PropRow>
            </div>
          </Section>
          {sections.length > 0 && (
            <Section title="Sections">
              <div className="space-y-2">
                {sections.map((section: unknown, index: number) => (
                  <div key={index} className="rounded-md border border-border bg-muted/20 px-3 py-2 text-[13px] leading-relaxed text-foreground">
                    {typeof section === "string" ? section : JSON.stringify(section, null, 2)}
                  </div>
                ))}
              </div>
            </Section>
          )}
          {emailRow?.html && (
            <Section title="Campaign Preview">
              <div className="rounded-lg overflow-hidden bg-background border border-border mx-auto" style={{ maxWidth: 430 }}>
                <iframe title={`detail-preview-${emailRow.id}`} srcDoc={emailRow.html} className="w-full border-0 block bg-background" style={{ height: 560 }} sandbox="allow-same-origin" />
              </div>
            </Section>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-3 border-t border-border shrink-0">
          <div>
            {emailRow?.campaign_id && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate(`/brands/${brandId}/campaigns/${emailRow.campaign_id}`)}>
                <ExternalLink className="w-3 h-3 mr-1.5" /> Open in Editor
              </Button>
            )}
          </div>
          {onGenerate && (
            <Button onClick={onGenerate} disabled={status === "generating"} size="sm" className="h-8">
              <Play className="w-3 h-3 mr-1.5" /> {emailRow?.html ? "Regenerate" : "Generate Email"}
            </Button>
          )}
        </div>
      </div>
    </>
  );

  return createPortal(panel, document.body);
}