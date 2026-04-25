import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FLOW_TYPE_META } from "@/lib/flows/skeletonParser";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
  Pencil,
  Sparkles,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ComplexityOption {
  id: string;
  title: string;
  description?: string;
  bullets: string[];
  recommended: boolean;
  rationale: string | null;
}

interface SetupConfirmation {
  key: string;
  label: string;
  value: string;
  source: string;
  editable: boolean;
}

interface QuickPreference {
  key: string;
  label: string;
  type: "toggle" | "select";
  options?: string[];
  default: boolean | string;
  recommendation?: boolean | string;
  rationale?: string;
}

interface Recommendations {
  complexity_options: ComplexityOption[];
  recommended_complexity_id: string;
  setup_confirmations: SetupConfirmation[];
  quick_preferences: QuickPreference[];
}

interface ResearchPayload {
  brand: { id: string; name: string };
  flow_type: string;
  site_context: string;
  recommendations: Recommendations;
}

const RESEARCH_STEPS: { key: string; label: string }[] = [
  { key: "intel", label: "Loading brand intelligence" },
  { key: "klaviyo", label: "Reading Klaviyo performance data" },
  { key: "site", label: "Researching website for offers" },
  { key: "catalog", label: "Analyzing product catalog" },
  { key: "recs", label: "Generating flow recommendations" },
];

type StepStatus = "pending" | "active" | "done";

export default function FlowSetupPage() {
  const { brandId, flowType } = useParams<{ brandId: string; flowType: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const meta = flowType ? FLOW_TYPE_META[flowType] : undefined;

  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(
    RESEARCH_STEPS.map((_, i) => (i === 0 ? "active" : "pending"))
  );
  const [revealCount, setRevealCount] = useState(1);
  const [phase, setPhase] = useState<"thinking" | "options" | "creating">("thinking");
  const [research, setResearch] = useState<ResearchPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedComplexity, setSelectedComplexity] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [preferences, setPreferences] = useState<Record<string, boolean | string>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const startedAtRef = useRef<number>(Date.now());

  // Stagger reveal of research lines while the call runs in the background
  useEffect(() => {
    if (phase !== "thinking") return;
    if (revealCount >= RESEARCH_STEPS.length) return;
    const t = setTimeout(() => {
      setStepStatuses((prev) => {
        const next = [...prev];
        if (revealCount - 1 >= 0) next[revealCount - 1] = "done";
        if (revealCount < RESEARCH_STEPS.length) next[revealCount] = "active";
        return next;
      });
      setRevealCount((c) => c + 1);
    }, 700);
    return () => clearTimeout(t);
  }, [phase, revealCount]);

  // Kick off research call
  useEffect(() => {
    if (!brandId || !flowType) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          "flow-setup-research",
          { body: { brand_id: brandId, flow_type: flowType } }
        );
        if (cancelled) return;
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);

        // Make sure the thinking animation has had time to play (min 3.2s).
        const elapsed = Date.now() - startedAtRef.current;
        const minDuration = 3200;
        if (elapsed < minDuration) {
          await new Promise((r) => setTimeout(r, minDuration - elapsed));
        }

        // Mark all steps complete
        setStepStatuses(RESEARCH_STEPS.map(() => "done"));
        setRevealCount(RESEARCH_STEPS.length);

        const payload = data as ResearchPayload;
        setResearch(payload);

        // Pre-select recommended complexity
        const recId =
          payload.recommendations.recommended_complexity_id ||
          payload.recommendations.complexity_options.find((o) => o.recommended)?.id ||
          payload.recommendations.complexity_options[0]?.id ||
          null;
        setSelectedComplexity(recId);

        // Seed confirmation drafts
        const confSeed: Record<string, string> = {};
        for (const c of payload.recommendations.setup_confirmations) confSeed[c.key] = c.value;
        setConfirmations(confSeed);

        // Seed preference defaults (use recommendation when present)
        const prefSeed: Record<string, boolean | string> = {};
        for (const p of payload.recommendations.quick_preferences) {
          prefSeed[p.key] = p.recommendation ?? p.default;
        }
        setPreferences(prefSeed);

        await new Promise((r) => setTimeout(r, 250));
        setPhase("options");
      } catch (err: any) {
        if (cancelled) return;
        console.error("[FlowSetupPage] research error", err);
        setError(err?.message || "Failed to load setup recommendations");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brandId, flowType]);

  const recommendedComplexity = useMemo(
    () => research?.recommendations.complexity_options.find((o) => o.recommended) || null,
    [research]
  );

  const handleStartEdit = (c: SetupConfirmation) => {
    setEditingKey(c.key);
    setEditingDraft(confirmations[c.key] ?? c.value);
  };
  const handleSaveEdit = (key: string) => {
    setConfirmations((prev) => ({ ...prev, [key]: editingDraft.trim() || prev[key] }));
    setEditingKey(null);
  };

  const buildSetupData = (): Record<string, unknown> => {
    if (!research) return {};
    const recs = research.recommendations;
    const complexity = recs.complexity_options.find((o) => o.id === selectedComplexity) || null;
    const offerValue = confirmations["evergreen_offer"] || confirmations["offer"] || "";
    const heroValue = confirmations["hero_product"] || "";
    return {
      complexity: {
        selected_id: selectedComplexity,
        selected_title: complexity?.title || null,
        recommended_id: recs.recommended_complexity_id,
        was_recommended: selectedComplexity === recs.recommended_complexity_id,
      },
      offer: {
        detected_candidates: offerValue ? [offerValue] : [],
        confirmed_mode: detectOfferMode(offerValue),
        description: offerValue,
        static_code: extractCode(offerValue) || "",
        dynamic_coupon_pool: "",
      },
      products: {
        detected_hero_products: heroValue ? [heroValue] : [],
        confirmed_primary_products: heroValue ? [heroValue] : [],
        scope: "hero",
      },
      merchandising: {
        selected_feed_preset: "",
        notes: "",
      },
      confirmations: {
        offer_confirmed: true,
        product_priority_confirmed: true,
        complexity_confirmed: true,
      },
      site_context: research.site_context,
      raw_confirmations: confirmations,
      preferences,
    };
  };

  const handleBuild = async () => {
    if (!brandId || !user || !flowType || !meta || !research) return;
    if (!selectedComplexity) {
      toast({ title: "Select a complexity option to continue", variant: "destructive" });
      return;
    }
    setPhase("creating");
    const setupData = buildSetupData();
    const { data: brand } = await supabase
      .from("brands")
      .select("name")
      .eq("id", brandId)
      .maybeSingle();
    const { data, error: insertError } = await supabase
      .from("flows")
      .insert([
        {
          brand_id: brandId,
          flow_type: flowType,
          name: `${meta.label} — ${brand?.name || "Brand"}`,
          status: "draft",
          setup_status: "ready_for_skeleton",
          setup_data: setupData as any,
        },
      ])
      .select("id")
      .single();
    if (insertError || !data) {
      setPhase("options");
      toast({
        title: "Failed to create flow",
        description: insertError?.message,
        variant: "destructive",
      });
      return;
    }
    navigate(`/brands/${brandId}/flows/${data.id}?autostart=1`);
  };

  if (!meta) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Unknown flow type.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-10">
        <button
          onClick={() => navigate(`/brands/${brandId}/flows`)}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to flows
        </button>

        {phase === "thinking" && (
          <ThinkingState statuses={stepStatuses} flowLabel={meta.label} error={error} />
        )}

        {phase !== "thinking" && research && (
          <div className="animate-fade-in space-y-10">
            <header className="space-y-2">
              <div className="inline-flex items-center gap-1.5 text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                <Sparkles className="w-3 h-3" />
                <span className="font-medium">Setup ready for {research.brand.name}</span>
              </div>
              <h1 className="text-2xl font-semibold text-foreground">
                Configure your {meta.label.toLowerCase()}
              </h1>
              <p className="text-sm text-muted-foreground">
                We pre-filled everything from your brand intelligence, Klaviyo data, and live website
                research. Adjust anything that's wrong, then build the skeleton.
              </p>
            </header>

            {/* Complexity */}
            <section className="space-y-4 animate-fade-in" style={{ animationDelay: "100ms" }}>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  How complex should this flow be?
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose the structure. The recommended option is tailored to your brand's data.
                </p>
              </div>
              <div className="grid gap-3">
                {research.recommendations.complexity_options.map((opt) => {
                  const selected = opt.id === selectedComplexity;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedComplexity(opt.id)}
                      className={cn(
                        "text-left p-5 rounded-xl border transition-all",
                        selected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-card hover:border-foreground/30"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{opt.title}</h3>
                          {opt.recommended && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                              <Zap className="w-2.5 h-2.5" />
                              We'd pick this for {research.brand.name}
                            </span>
                          )}
                        </div>
                        <div
                          className={cn(
                            "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40"
                          )}
                        >
                          {selected && <Check className="w-3 h-3" />}
                        </div>
                      </div>
                      {opt.description && (
                        <p className="text-sm text-muted-foreground mb-2">{opt.description}</p>
                      )}
                      <ul className="space-y-1 mb-2">
                        {opt.bullets.map((b, i) => (
                          <li
                            key={i}
                            className="text-xs text-muted-foreground flex items-start gap-1.5"
                          >
                            <span className="text-primary mt-0.5">•</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                      {opt.rationale && (
                        <p className="text-xs italic text-foreground/70 border-t border-border/60 pt-2 mt-2">
                          {opt.rationale}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Confirmations */}
            <section className="space-y-4 animate-fade-in" style={{ animationDelay: "200ms" }}>
              <div>
                <h2 className="text-base font-semibold text-foreground">Key setup details</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  We pulled these from your sources. Edit any that are wrong.
                </p>
              </div>
              <div className="grid gap-3">
                {research.recommendations.setup_confirmations.map((c) => {
                  const isEditing = editingKey === c.key;
                  return (
                    <div
                      key={c.key}
                      className="p-4 rounded-xl border border-border bg-card"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                              {c.label}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                              <Globe className="w-2.5 h-2.5" />
                              {c.source}
                            </span>
                          </div>
                          {isEditing ? (
                            <div className="flex items-center gap-2 mt-1">
                              <Input
                                autoFocus
                                value={editingDraft}
                                onChange={(e) => setEditingDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveEdit(c.key);
                                  if (e.key === "Escape") setEditingKey(null);
                                }}
                                className="h-9"
                              />
                              <Button size="sm" onClick={() => handleSaveEdit(c.key)}>
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingKey(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <p className="text-sm text-foreground">
                              {confirmations[c.key] ?? c.value}
                            </p>
                          )}
                        </div>
                        {!isEditing && c.editable && (
                          <button
                            onClick={() => handleStartEdit(c)}
                            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted shrink-0"
                            aria-label={`Edit ${c.label}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Quick preferences */}
            {research.recommendations.quick_preferences.length > 0 && (
              <section className="animate-fade-in" style={{ animationDelay: "300ms" }}>
                <button
                  onClick={() => setAdvancedOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-foreground/70 transition-colors"
                >
                  Advanced preferences
                  {advancedOpen ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                {advancedOpen && (
                  <div className="grid gap-3 mt-3">
                    {research.recommendations.quick_preferences.map((pref) => (
                      <div
                        key={pref.key}
                        className="p-4 rounded-xl border border-border bg-card flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{pref.label}</p>
                          {pref.rationale && (
                            <p className="text-xs text-muted-foreground mt-0.5">{pref.rationale}</p>
                          )}
                        </div>
                        {pref.type === "toggle" ? (
                          <Switch
                            checked={!!preferences[pref.key]}
                            onCheckedChange={(v) =>
                              setPreferences((prev) => ({ ...prev, [pref.key]: v }))
                            }
                          />
                        ) : (
                          <select
                            value={String(preferences[pref.key] ?? "")}
                            onChange={(e) =>
                              setPreferences((prev) => ({
                                ...prev,
                                [pref.key]: e.target.value,
                              }))
                            }
                            className="h-9 rounded-md border border-border bg-card px-3 text-sm"
                          >
                            {(pref.options || []).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* CTA */}
            <div className="sticky bottom-0 -mx-8 px-8 py-4 bg-background/95 backdrop-blur border-t border-border">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {recommendedComplexity?.rationale ||
                    "We've researched your brand and pre-filled the strongest defaults."}
                </p>
                <Button
                  size="lg"
                  onClick={handleBuild}
                  disabled={phase === "creating" || !selectedComplexity}
                >
                  {phase === "creating" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating flow…
                    </>
                  ) : (
                    <>
                      Build Flow Skeleton
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingState({
  statuses,
  flowLabel,
  error,
}: {
  statuses: StepStatus[];
  flowLabel: string;
  error: string | null;
}) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
      <div className="inline-flex items-center gap-1.5 text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-full mb-4">
        <Sparkles className="w-3 h-3" />
        <span className="font-medium">Preparing your {flowLabel.toLowerCase()}</span>
      </div>
      <h1 className="text-xl font-semibold text-foreground mb-1">
        Researching your brand…
      </h1>
      <p className="text-sm text-muted-foreground mb-8 max-w-md">
        Our agent is loading every relevant signal so you only confirm decisions, not make them from
        scratch.
      </p>
      <div className="font-mono text-[13px] text-left space-y-2 bg-muted/40 border border-border rounded-xl px-5 py-4 min-w-[360px]">
        {RESEARCH_STEPS.map((step, idx) => {
          const status = statuses[idx];
          if (status === "pending") {
            return (
              <div
                key={step.key}
                className="flex items-center gap-2.5 text-muted-foreground/40"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                <span>○ {step.label}</span>
              </div>
            );
          }
          if (status === "active") {
            return (
              <div
                key={step.key}
                className="flex items-center gap-2.5 text-foreground animate-fade-in"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span>
                  ⟳ {step.label}
                  <span className="inline-block ml-0.5 animate-pulse">…</span>
                </span>
              </div>
            );
          }
          return (
            <div
              key={step.key}
              className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 animate-fade-in"
            >
              <Check className="w-3 h-3" />
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>
      {error && (
        <p className="mt-6 text-sm text-destructive max-w-md">
          {error}
        </p>
      )}
    </div>
  );
}

function detectOfferMode(value: string): "none" | "static_code" | "dynamic_coupon" {
  if (!value) return "none";
  const v = value.toLowerCase();
  if (/no offer|no evergreen|none detected/.test(v)) return "none";
  if (/dynamic coupon|klaviyo coupon/.test(v)) return "dynamic_coupon";
  return "static_code";
}

function extractCode(value: string): string | null {
  if (!value) return null;
  const m = value.match(/\b([A-Z0-9][A-Z0-9_-]{2,20})\b/);
  return m ? m[1] : null;
}