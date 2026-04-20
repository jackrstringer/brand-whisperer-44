import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Download, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  parseSkeleton,
  parseSkeletonMeta,
  ParsedFlowNode,
  FLOW_TRIGGERS,
  FLOW_TYPE_META,
} from "@/lib/flows/skeletonParser";
import { FlowAgentChat } from "@/components/flows/FlowAgentChat";
import {
  SkeletonViewer,
  FlowEmailRow,
  FlowEmailMeta,
} from "@/components/flows/SkeletonViewer";

interface FlowRow {
  id: string;
  brand_id: string;
  flow_type: string;
  name: string;
  status: string;
  skeleton_markdown: string | null;
  messages: any;
}

export default function FlowBuilderPage() {
  const { brandId, flowId } = useParams<{ brandId: string; flowId: string }>();
  const navigate = useNavigate();
  const [flow, setFlow] = useState<FlowRow | null>(null);
  const [emails, setEmails] = useState<FlowEmailRow[]>([]);
  const [campaignMeta, setCampaignMeta] = useState<Record<string, FlowEmailMeta>>({});
  const [loading, setLoading] = useState(true);
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);

  const loadAll = async () => {
    if (!flowId) return;
    const [{ data: f }, { data: e }] = await Promise.all([
      supabase.from("flows").select("*").eq("id", flowId).single(),
      supabase
        .from("flow_emails")
        .select("id, sequence_index, label, generation_status, html, campaign_id")
        .eq("flow_id", flowId)
        .order("sequence_index", { ascending: true }),
    ]);
    if (f) {
      setFlow(f as FlowRow);
      setNameDraft(f.name);
    }
    const emailRows = (e as FlowEmailRow[]) || [];
    setEmails(emailRows);

    // Pull campaign meta (subject_line, preview_text) for any linked campaigns
    const campaignIds = emailRows
      .map((row) => row.campaign_id)
      .filter((id): id is string => !!id);
    if (campaignIds.length > 0) {
      const { data: camps } = await supabase
        .from("campaigns")
        .select("id, subject_line, preview_text")
        .in("id", campaignIds);
      if (camps) {
        const map: Record<string, FlowEmailMeta> = {};
        for (const c of camps as { id: string; subject_line: string | null; preview_text: string | null }[]) {
          map[c.id] = { subject_line: c.subject_line, preview_text: c.preview_text };
        }
        setCampaignMeta(map);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, [flowId]);

  // Realtime
  useEffect(() => {
    if (!flowId) return;
    const ch = supabase
      .channel(`flow-${flowId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flows", filter: `id=eq.${flowId}` },
        (p) => {
          if (p.new) {
            setFlow((prev) => ({ ...(prev || {}), ...(p.new as any) } as FlowRow));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flow_emails", filter: `flow_id=eq.${flowId}` },
        () => loadAll()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  const parsedNodes = useMemo(
    () => parseSkeleton(flow?.skeleton_markdown),
    [flow?.skeleton_markdown]
  );
  const parsedMeta = useMemo(
    () => parseSkeletonMeta(flow?.skeleton_markdown),
    [flow?.skeleton_markdown]
  );
  const emailNodes = useMemo(
    () => parsedNodes.filter((n) => n.node_type === "email"),
    [parsedNodes]
  );

  const handleSkeletonUpdated = () => {
    loadAll();
  };

  const renameFlow = async () => {
    if (!flow || !nameDraft.trim()) return;
    setEditingName(false);
    if (nameDraft === flow.name) return;
    await supabase.from("flows").update({ name: nameDraft.trim() }).eq("id", flow.id);
  };

  const generateSingleEmail = async (emailIndex: number) => {
    if (!flow) return;
    const node = emailNodes[emailIndex];
    if (!node) return;
    setGeneratingIndex(emailIndex);

    try {
      // Make sure a flow_emails row exists for this index
      let emailRow = emails.find((e) => e.sequence_index === emailIndex);
      if (!emailRow) {
        const { data, error } = await supabase
          .from("flow_emails")
          .insert({
            flow_id: flow.id,
            brand_id: flow.brand_id,
            sequence_index: emailIndex,
            node_type: "email",
            label: node.label,
            timing: node.timing,
            job: node.job,
            subject_direction: node.subject_direction,
            sections: node.sections || null,
            notes: node.notes,
            generation_status: "generating",
          })
          .select("id, sequence_index, label, generation_status, html, campaign_id")
          .single();
        if (error) throw error;
        emailRow = data as FlowEmailRow;
        setEmails((prev) => [...prev, emailRow!]);
      } else {
        await supabase
          .from("flow_emails")
          .update({ generation_status: "generating" })
          .eq("id", emailRow.id);
      }

      // Create a campaign record up front
      const { data: campaign, error: campErr } = await supabase
        .from("campaigns")
        .insert({
          brand_id: flow.brand_id,
          name: `${flow.name} · Email ${emailIndex + 1}`,
          campaign_mode: "flow",
          status: "draft",
        })
        .select("id")
        .single();
      if (campErr || !campaign) throw campErr || new Error("Failed to create campaign");

      const prevNode = emailNodes[emailIndex - 1];
      const nextNode = emailNodes[emailIndex + 1];

      const brief = `FLOW CONTEXT: This is email ${emailIndex + 1} in a ${flow.flow_type} flow.
Previous email: ${prevNode?.label || "none"}
Next email: ${nextNode?.label || "none"}

EMAIL SPEC:
Job: ${node.job || "(unspecified)"}
Subject direction: ${node.subject_direction || "(unspecified)"}
Sections: ${JSON.stringify(node.sections || [])}
Notes: ${node.notes || "none"}`;

      // Kick off generation. The function now runs in the background and returns 202 immediately.
      const { error: genErr } = await supabase.functions.invoke(
        "generate-campaign",
        {
          body: {
            brandId: flow.brand_id,
            campaignId: campaign.id,
            brief,
            goal: node.job || "flow_email",
            campaignMode: "flow",
            flowConfig: {
              flow_type: flow.flow_type,
              trigger_metric_name: FLOW_TRIGGERS[flow.flow_type] || null,
              step_number: emailIndex + 1,
              total_steps: emailNodes.length,
              step_goal: node.job,
            },
          },
        }
      );
      if (genErr) throw genErr;

      // Poll the campaigns table for ready/error (Opus generation can take 2-5 min).
      const POLL_INTERVAL = 3000;
      const POLL_TIMEOUT = 8 * 60 * 1000; // 8 min hard cap
      const startedAt = Date.now();
      let html = "";
      while (Date.now() - startedAt < POLL_TIMEOUT) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        const { data: row } = await supabase
          .from("campaigns")
          .select("status, html, last_error")
          .eq("id", campaign.id)
          .maybeSingle();
        if (row?.status === "ready" && row.html) {
          html = row.html;
          break;
        }
        if (row?.status === "error") {
          const reason = (row as any).last_error || "Generation failed (no error message captured).";
          throw new Error(reason);
        }
      }
      if (!html) throw new Error("Campaign generation timed out after 8 minutes.");

      await supabase
        .from("flow_emails")
        .update({
          html,
          campaign_id: campaign.id,
          generation_status: "complete",
        })
        .eq("id", emailRow.id);

      await loadAll();
      toast({ title: `Email ${emailIndex + 1} generated` });
    } catch (err: any) {
      console.error("[generateSingleEmail]", err);
      const emailRow = emails.find((e) => e.sequence_index === emailIndex);
      if (emailRow) {
        await supabase
          .from("flow_emails")
          .update({ generation_status: "failed", last_error: err.message || "Unknown backend error" })
          .eq("id", emailRow.id);
      }
      toast({
        title: "Generation failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingIndex(null);
    }
  };

  const generateAllEmails = async () => {
    if (!flow) return;
    setBulkGenerating(true);
    try {
      await supabase.from("flows").update({ status: "generating" }).eq("id", flow.id);
      // Generate sequentially to avoid hammering the AI gateway
      for (let i = 0; i < emailNodes.length; i++) {
        await generateSingleEmail(i);
      }
      await supabase.from("flows").update({ status: "complete" }).eq("id", flow.id);
      toast({ title: "All emails generated" });
    } catch (err: any) {
      toast({
        title: "Bulk generation failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setBulkGenerating(false);
    }
  };

  const exportAll = async () => {
    if (!flow) return;
    const completeEmails = emails.filter((e) => e.html);
    if (completeEmails.length === 0) {
      toast({ title: "Nothing to export yet", variant: "destructive" });
      return;
    }
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    completeEmails.forEach((e) => {
      const slug = (e.label || "email").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const filename = `${String(e.sequence_index + 1).padStart(2, "0")}-${slug || "email"}.html`;
      zip.file(filename, e.html!);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${flow.name.replace(/[^a-z0-9]+/gi, "-")}-emails.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveNodeEdit = async (idx: number, patch: Partial<ParsedFlowNode>) => {
    if (!flow) return;
    const node = emailNodes[idx];
    if (!node) return;
    const emailRow = emails.find((e) => e.sequence_index === idx);
    const payload = {
      label: patch.label || node.label,
      timing: patch.timing,
      job: patch.job,
      subject_direction: patch.subject_direction,
      notes: patch.notes,
      sections: patch.sections,
    };
    if (emailRow) {
      await supabase.from("flow_emails").update(payload).eq("id", emailRow.id);
    } else {
      await supabase.from("flow_emails").insert({
        flow_id: flow.id,
        brand_id: flow.brand_id,
        sequence_index: idx,
        node_type: "email",
        ...payload,
      });
    }
    await loadAll();
  };

  if (loading || !flow) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-foreground/55 bg-[hsl(var(--canvas))]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading flow…
      </div>
    );
  }

  const hasAnyHtml = emails.some((e) => e.html);
  const meta = FLOW_TYPE_META[flow.flow_type];
  const hasSkeleton = !!flow.skeleton_markdown;

  return (
    <div className="absolute inset-0 bg-[hsl(var(--canvas))]">
      {/* Canvas fills the entire stage */}
      {!hasSkeleton ? (
        <FlowAgentChat
          key={`${flow.id}:draft`}
          flowId={flow.id}
          brandId={flow.brand_id}
          flowType={flow.flow_type}
          initialMessages={Array.isArray(flow.messages) ? (flow.messages as any) : []}
          currentSkeleton={flow.skeleton_markdown}
          onSkeletonUpdated={handleSkeletonUpdated}
          centered
        />
      ) : (
        <>
          <SkeletonViewer
            key={`${flow.id}:ready`}
            nodes={parsedNodes}
            meta={parsedMeta}
            flowType={flow.flow_type}
            emails={emails}
            campaignMeta={campaignMeta}
            expandedIndex={expandedIndex}
            onToggleExpand={setExpandedIndex}
            onGenerateNode={generateSingleEmail}
            onSaveNodeEdit={saveNodeEdit}
            generatingIndex={generatingIndex}
            drafting={flow.status === "draft" || flow.status === "generating"}
          />
          <FlowAgentChat
            key={`${flow.id}:chat`}
            flowId={flow.id}
            brandId={flow.brand_id}
            flowType={flow.flow_type}
            initialMessages={Array.isArray(flow.messages) ? (flow.messages as any) : []}
            currentSkeleton={flow.skeleton_markdown}
            onSkeletonUpdated={handleSkeletonUpdated}
          />
        </>
      )}

      {/* Floating top-left: back + title */}
      <div className="absolute top-5 left-5 z-30 flex items-center gap-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 px-2 py-1.5 rounded-full bg-card/90 backdrop-blur-xl border border-foreground/15 shadow-sm">
          <button
            onClick={() => navigate(`/brands/${brandId}/flows`)}
            className="w-7 h-7 rounded-full flex items-center justify-center text-foreground/55 hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Back to flows"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-foreground/15" />
          <div className="flex items-center gap-2 px-1.5">
            {editingName ? (
              <Input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={renameFlow}
                onKeyDown={(e) => e.key === "Enter" && renameFlow()}
                className="h-6 text-[13px] font-medium border-0 px-1 py-0 focus-visible:ring-0 shadow-none bg-transparent w-48"
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="text-[13px] font-medium text-foreground hover:opacity-70 transition-opacity"
              >
                {flow.name}
              </button>
            )}
            <span className="text-foreground/25 text-[11px]">·</span>
            <span className="text-[11px] text-foreground/55">{meta?.label}</span>
            <StatusPill status={flow.status} />
          </div>
        </div>
      </div>

      {/* Floating top-right: actions */}
      <div className="absolute top-5 right-5 z-30 flex items-center gap-2 pointer-events-none">
        {hasAnyHtml && (
          <button
            onClick={exportAll}
            className="pointer-events-auto px-3.5 h-9 rounded-full bg-card/90 backdrop-blur-xl border border-foreground/15 shadow-sm flex items-center gap-1.5 text-[12.5px] font-medium text-foreground/75 hover:text-foreground hover:border-foreground/35 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export all
          </button>
        )}
        {flow.status === "skeleton_ready" && emailNodes.length > 0 && (
          <button
            onClick={generateAllEmails}
            disabled={bulkGenerating}
            className="pointer-events-auto px-4 h-9 rounded-full bg-foreground text-background shadow-[0_4px_16px_-4px_rgba(0,0,0,0.25)] flex items-center gap-1.5 text-[12.5px] font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {bulkGenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Approve & Generate All
          </button>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "Draft",
    skeleton_ready: "Skeleton ready",
    generating: "Generating",
    complete: "Complete",
  };
  const label = map[status] || "Draft";
  return (
    <span className="text-[10px] uppercase tracking-[0.1em] text-foreground/45 font-semibold">
      {label}
    </span>
  );
}
