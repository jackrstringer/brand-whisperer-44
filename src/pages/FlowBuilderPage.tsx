import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Download, Sparkles, MessageSquare, GitFork } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  parseSkeleton,
  parseSkeletonMeta,
  ParsedFlowNode,
  FLOW_TRIGGERS,
  FLOW_TYPE_META,
} from "@/lib/flows/skeletonParser";
import { SplitPane } from "@/components/ideation/SplitPane";
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
  const [mobileTab, setMobileTab] = useState<"canvas" | "chat">("canvas");
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

      const { data: result, error: genErr } = await supabase.functions.invoke(
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

      const html = (result as any)?.html || "";

      await supabase
        .from("flow_emails")
        .update({
          html,
          campaign_id: campaign.id,
          generation_status: html ? "complete" : "failed",
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
          .update({ generation_status: "failed" })
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
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading flow…
      </div>
    );
  }

  const hasAnyHtml = emails.some((e) => e.html);
  const meta = FLOW_TYPE_META[flow.flow_type];

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/brands/${brandId}/flows`)}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            {editingName ? (
              <Input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={renameFlow}
                onKeyDown={(e) => e.key === "Enter" && renameFlow()}
                className="h-8 text-sm font-semibold"
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="text-sm font-semibold text-foreground truncate hover:underline"
              >
                {flow.name}
              </button>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{meta?.label}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <StatusPill status={flow.status} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {flow.status === "skeleton_ready" && emailNodes.length > 0 && (
            <Button onClick={generateAllEmails} disabled={bulkGenerating}>
              {bulkGenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Approve & Generate All
            </Button>
          )}
          {hasAnyHtml && (
            <Button variant="outline" onClick={exportAll}>
              <Download className="w-4 h-4 mr-2" /> Export All
            </Button>
          )}
        </div>
      </div>

      {/* Mobile tabs (only when skeleton exists) */}
      {flow.skeleton_markdown && (
        <div className="md:hidden flex border-b border-border">
          <button
            onClick={() => setMobileTab("canvas")}
            className={`flex-1 py-2 text-sm flex items-center justify-center gap-1.5 ${
              mobileTab === "canvas"
                ? "border-b-2 border-primary text-foreground font-medium"
                : "text-muted-foreground"
            }`}
          >
            <GitFork className="w-3.5 h-3.5" /> Canvas
          </button>
          <button
            onClick={() => setMobileTab("chat")}
            className={`flex-1 py-2 text-sm flex items-center justify-center gap-1.5 ${
              mobileTab === "chat"
                ? "border-b-2 border-primary text-foreground font-medium"
                : "text-muted-foreground"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Agent
          </button>
        </div>
      )}

      {/* Body */}
      {!flow.skeleton_markdown ? (
        // Pre-skeleton: centered chat, no canvas yet
        <div className="flex-1 min-h-0 transition-all duration-300">
          <FlowAgentChat
            flowId={flow.id}
            brandId={flow.brand_id}
            flowType={flow.flow_type}
            initialMessages={Array.isArray(flow.messages) ? (flow.messages as any) : []}
            currentSkeleton={flow.skeleton_markdown}
            onSkeletonUpdated={handleSkeletonUpdated}
            centered
          />
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0 hidden md:block animate-fade-in">
            <SplitPane
              left={
                <SkeletonViewer
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
              }
              right={
                <FlowAgentChat
                  flowId={flow.id}
                  brandId={flow.brand_id}
                  flowType={flow.flow_type}
                  initialMessages={Array.isArray(flow.messages) ? (flow.messages as any) : []}
                  currentSkeleton={flow.skeleton_markdown}
                  onSkeletonUpdated={handleSkeletonUpdated}
                />
              }
              minLeftWidth={420}
              minRightWidth={340}
            />
          </div>
          <div className="flex-1 min-h-0 md:hidden">
            {mobileTab === "canvas" ? (
              <SkeletonViewer
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
            ) : (
              <FlowAgentChat
                flowId={flow.id}
                brandId={flow.brand_id}
                flowType={flow.flow_type}
                initialMessages={Array.isArray(flow.messages) ? (flow.messages as any) : []}
                currentSkeleton={flow.skeleton_markdown}
                onSkeletonUpdated={handleSkeletonUpdated}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "Draft", cls: "bg-muted text-muted-foreground" },
    skeleton_ready: { label: "Skeleton Ready", cls: "bg-primary/15 text-primary" },
    generating: { label: "Generating", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
    complete: { label: "Complete", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  };
  const m = map[status] || map.draft;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>;
}
