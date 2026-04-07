import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, ArrowLeft, Loader2, GripVertical, Plus, X, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface HeroProduct {
  name: string;
  price: string;
  what_it_does: string;
}

interface Promotion {
  name: string;
  offer: string;
}

interface CrossSellPair {
  buy: string;
  show: string;
}

interface SurveyData {
  catalog_type: string;
  primary_category: string;
  other_channels: string[];
  hero_products: HeroProduct[];
  excluded_products: string;
  new_launches: string;
  bundles_or_kits: string;
  has_subscription: boolean;
  subscription_platform: string;
  subscription_discount: string;
  replenishment_cycle: string;
  top_cancel_reason: string;
  evergreen_offer: string;
  top_promotions: Promotion[];
  cross_sell_paths: CrossSellPair[];
  customer_journey: string;
  target_demographic: string;
  top_objection: string;
  repeat_purchase_drivers: string;
  send_frequency: string;
  best_campaign_types: string[];
  worst_campaign_types: string;
  blackout_periods: string;
  primary_email_goal: string;
  brand_voice_words: string[];
  language_to_avoid: string;
  north_star_brand: string;
  anything_else: string;
}

const CATALOG_OPTIONS = [
  "Single hero product",
  "Focused catalog (2–10 products)",
  "Multi-product (10–50 SKUs)",
  "Full retail library (50+ SKUs)",
];

const CHANNEL_OPTIONS = ["DTC only", "Amazon", "Retail / Wholesale", "International"];

const SUBSCRIPTION_PLATFORMS = ["Recharge", "Skio", "Stay", "Bold", "Other"];

const REPLENISHMENT_OPTIONS = ["30 days", "60 days", "90 days", "Varies"];

const FREQUENCY_OPTIONS = ["Daily", "3–4x/week", "2x/week", "Weekly", "Less than weekly"];

const CAMPAIGN_TYPES = [
  "Promotional/sale", "Educational", "Brand story", "Product launch",
  "Seasonal", "Winback", "Post-purchase",
];

const EMAIL_GOALS = ["Revenue per send", "List growth", "Retention & LTV", "Balanced"];

function defaultSurvey(): SurveyData {
  return {
    catalog_type: "", primary_category: "", other_channels: [],
    hero_products: [], excluded_products: "", new_launches: "", bundles_or_kits: "",
    has_subscription: false, subscription_platform: "", subscription_discount: "",
    replenishment_cycle: "", top_cancel_reason: "",
    evergreen_offer: "", top_promotions: [{ name: "", offer: "" }],
    cross_sell_paths: [{ buy: "", show: "" }],
    customer_journey: "", target_demographic: "", top_objection: "", repeat_purchase_drivers: "",
    send_frequency: "", best_campaign_types: [], worst_campaign_types: "", blackout_periods: "",
    primary_email_goal: "",
    brand_voice_words: ["", "", ""], language_to_avoid: "", north_star_brand: "", anything_else: "",
  };
}

function prefillFromResearch(ai: any): Partial<SurveyData> {
  if (!ai) return {};
  const s: Partial<SurveyData> = {};

  const pl = ai.product_landscape;
  if (pl) {
    if (pl.catalog_type) {
      const ct = pl.catalog_type.toLowerCase();
      if (ct.includes("single") || ct.includes("hero")) s.catalog_type = CATALOG_OPTIONS[0];
      else if (ct.includes("focused") || ct.includes("2") || ct.includes("few")) s.catalog_type = CATALOG_OPTIONS[1];
      else if (ct.includes("multi") || ct.includes("10")) s.catalog_type = CATALOG_OPTIONS[2];
      else if (ct.includes("full") || ct.includes("50") || ct.includes("large")) s.catalog_type = CATALOG_OPTIONS[3];
    }
    if (Array.isArray(pl.hero_products) && pl.hero_products.length > 0) {
      s.hero_products = pl.hero_products.map((p: any) => ({
        name: p.name || "", price: p.price || "", what_it_does: p.what_it_does || p.description || "",
      }));
    }
    if (Array.isArray(pl.bundles_or_kits) && pl.bundles_or_kits.length > 0) {
      s.bundles_or_kits = pl.bundles_or_kits.join(", ");
    }
  }

  const bo = ai.brand_overview;
  if (bo) {
    if (bo.primary_category) s.primary_category = bo.primary_category;
    if (bo.target_demographic) {
      const td = bo.target_demographic;
      const parts = [];
      if (td.age_range) parts.push(`Age: ${td.age_range}`);
      if (td.gender_skew) parts.push(`Gender: ${td.gender_skew}`);
      if (td.income_level) parts.push(`Income: ${td.income_level}`);
      if (td.psychographic_profile) parts.push(td.psychographic_profile);
      s.target_demographic = parts.join(". ");
    }
    if (bo.brand_tone) {
      const words = bo.brand_tone.split(/[,;/]+/).map((w: string) => w.trim()).filter(Boolean);
      s.brand_voice_words = [words[0] || "", words[1] || "", words[2] || ""];
    }
  }

  const sm = ai.sales_model;
  if (sm) {
    s.has_subscription = !!(sm.subscription_platform && sm.subscription_platform !== "unknown" && sm.subscription_platform !== "N/A");
    if (s.has_subscription) {
      s.subscription_platform = sm.subscription_platform || "";
      s.subscription_discount = sm.subscription_discount_typical || "";
    }
    if (sm.free_shipping_threshold || sm.trial_or_intro_offers) {
      const parts = [];
      if (sm.trial_or_intro_offers && sm.trial_or_intro_offers !== "unknown") parts.push(sm.trial_or_intro_offers);
      if (sm.free_shipping_threshold && sm.free_shipping_threshold !== "unknown") parts.push(`Free shipping over ${sm.free_shipping_threshold}`);
      s.evergreen_offer = parts.join("; ");
    }
  }

  const ci = ai.customer_intelligence;
  if (ci) {
    if (ci.typical_customer_journey) s.customer_journey = ci.typical_customer_journey;
    if (Array.isArray(ci.common_objections_before_purchase) && ci.common_objections_before_purchase.length > 0) {
      s.top_objection = ci.common_objections_before_purchase[0];
    }
    if (Array.isArray(ci.repeat_purchase_drivers) && ci.repeat_purchase_drivers.length > 0) {
      s.repeat_purchase_drivers = ci.repeat_purchase_drivers.join(", ");
    }
  }

  const mi = ai.marketing_intelligence;
  if (mi) {
    if (mi.estimated_email_frequency) {
      const f = mi.estimated_email_frequency.toLowerCase();
      if (f.includes("daily")) s.send_frequency = "Daily";
      else if (f.includes("3") || f.includes("4")) s.send_frequency = "3–4x/week";
      else if (f.includes("2")) s.send_frequency = "2x/week";
      else if (f.includes("week")) s.send_frequency = "Weekly";
    }
  }

  return s;
}

interface Props {
  brandId: string;
  brandName: string;
  domain?: string;
  existingIntel?: any;
  onComplete?: () => void;
  editMode?: boolean;
}

export default function BrandIntelligenceWizard({ brandId, brandName, domain, existingIntel, onComplete, editMode }: Props) {
  const [phase, setPhase] = useState<"confirm_url" | "researching" | "survey" | "compiling" | "done">(
    editMode ? "survey" : existingIntel?.research_status === "ai_complete" ? "survey" : "confirm_url"
  );
  const [confirmedDomain, setConfirmedDomain] = useState(domain || "");
  const [surveyStep, setSurveyStep] = useState(0);
  const [survey, setSurvey] = useState<SurveyData>(defaultSurvey());
  const [researchProgress, setResearchProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  // Prefill survey from existing or new AI research
  const prefillSurvey = useCallback((aiResearch: any, existingSurvey?: any) => {
    const prefilled = prefillFromResearch(aiResearch);
    const base = defaultSurvey();
    const merged = { ...base, ...prefilled };
    // If existing survey answers, overlay them
    if (existingSurvey) {
      for (const [k, v] of Object.entries(existingSurvey)) {
        if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
          (merged as any)[k] = v;
        }
      }
    }
    setSurvey(merged);
  }, []);

  // Start research when phase transitions to "researching"
  useEffect(() => {
    if (phase !== "researching") {
      // Already have research, prefill
      if (existingIntel?.ai_research) {
        prefillSurvey(existingIntel.ai_research, existingIntel?.survey_answers);
      }
      return;
    }

    let cancelled = false;
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setResearchProgress(Math.min(90, 25 * Math.log10(1 + elapsed / 5)));
    }, 500);

    (async () => {
      try {
        // Persist the confirmed domain
        await supabase.from("brands").update({ website_url: confirmedDomain }).eq("id", brandId);

        // Fire-and-forget kick off
        const { error } = await supabase.functions.invoke("research-brand", {
          body: { brand_id: brandId, brand_name: brandName, domain: confirmedDomain },
        });
        if (cancelled) return;
        if (error) throw new Error(error.message || "Research failed to start");

        // Poll for completion
        const pollInterval = setInterval(async () => {
          if (cancelled) { clearInterval(pollInterval); return; }
          const { data } = await supabase
            .from("brand_intelligence")
            .select("research_status, ai_research, survey_answers")
            .eq("brand_id", brandId)
            .single();

          if (data?.research_status === "ai_complete") {
            clearInterval(pollInterval);
            clearInterval(progressInterval);
            setResearchProgress(100);
            prefillSurvey(data.ai_research, data.survey_answers);
            setTimeout(() => { if (!cancelled) setPhase("survey"); }, 800);
          } else if (data?.research_status === "failed") {
            clearInterval(pollInterval);
            clearInterval(progressInterval);
            toast.error("AI research failed. You can still fill out the survey manually.");
            setPhase("survey");
          }
        }, 3000);

        // Safety timeout after 5 minutes
        setTimeout(() => {
          if (!cancelled) {
            clearInterval(pollInterval);
            clearInterval(progressInterval);
            toast.error("Research is taking longer than expected. You can fill out the survey manually.");
            setPhase("survey");
          }
        }, 300000);
      } catch (err: any) {
        if (cancelled) return;
        clearInterval(progressInterval);
        toast.error(err.message || "AI research failed");
        setPhase("survey");
      }
    })();

    return () => { cancelled = true; clearInterval(progressInterval); };
  }, [phase, brandId, brandName, confirmedDomain, prefillSurvey, existingIntel]);

  const updateSurvey = (updates: Partial<SurveyData>) => setSurvey(prev => ({ ...prev, ...updates }));

  const submitSurvey = async () => {
    setSaving(true);
    setPhase("compiling");
    try {
      const { error } = await supabase.functions.invoke("save-brand-survey", {
        body: { brand_id: brandId, survey_answers: survey },
      });
      if (error) throw error;

      // Poll for completion
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const { data } = await supabase
          .from("brand_intelligence")
          .select("research_status")
          .eq("brand_id", brandId)
          .single();
        if (data?.research_status === "complete" || attempts > 60) {
          clearInterval(poll);
          setPhase("done");
        }
      }, 2000);
    } catch (err: any) {
      toast.error(err.message || "Failed to save survey");
      setPhase("survey");
      setSaving(false);
    }
  };

  // PHASE: Confirm URL
  if (phase === "confirm_url") {
    const handleStartResearch = () => {
      if (!confirmedDomain.trim()) {
        toast.error("Please enter your store URL so we can research your brand.");
        return;
      }
      setPhase("researching");
    };

    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 p-8 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-center">Let's research your brand</h2>
        <p className="text-sm text-muted-foreground text-center">
          Confirm your store URL so our AI can analyze your products, positioning, and market.
        </p>
        <div className="w-full space-y-2">
          <Label>Store URL</Label>
          <Input
            value={confirmedDomain}
            onChange={(e) => setConfirmedDomain(e.target.value)}
            placeholder="yourstore.com"
            onKeyDown={(e) => e.key === "Enter" && handleStartResearch()}
          />
        </div>
        <Button onClick={handleStartResearch} className="w-full" disabled={!confirmedDomain.trim()}>
          Start Research <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    );
  }

  // PHASE: Researching
  if (phase === "researching") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 p-8">
        <Sparkles className="w-10 h-10 text-primary animate-pulse" />
        <h2 className="text-xl font-semibold">Researching your brand</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Our AI is analyzing your website, products, and market position. This takes about 30 seconds.
        </p>
        <Progress value={researchProgress} className="w-64" />
        <p className="text-xs text-muted-foreground">{Math.round(researchProgress)}%</p>
      </div>
    );
  }

  // PHASE: Compiling
  if (phase === "compiling") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 p-8">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <h2 className="text-xl font-semibold">Building your brand intelligence profile</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Compiling everything into your brand's AI context. This takes a few seconds.
        </p>
      </div>
    );
  }

  // PHASE: Done
  if (phase === "done") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 p-8">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">Your brand intelligence is ready</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Every campaign generated from now on will be informed by this profile.
        </p>
        <Button onClick={() => onComplete?.()}>
          {editMode ? "Back to Settings" : "Start Generating"} <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    );
  }

  // PHASE: Survey
  const totalSteps = 6;

  const renderStep = () => {
    switch (surveyStep) {
      case 0: return <Step1 survey={survey} update={updateSurvey} />;
      case 1: return <Step2 survey={survey} update={updateSurvey} />;
      case 2: return <Step3 survey={survey} update={updateSurvey} />;
      case 3: return <Step4 survey={survey} update={updateSurvey} />;
      case 4: return <Step5 survey={survey} update={updateSurvey} />;
      case 5: return <Step6 survey={survey} update={updateSurvey} />;
      default: return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Step {surveyStep + 1} of {totalSteps}</span>
          <span>{Math.round(((surveyStep + 1) / totalSteps) * 100)}%</span>
        </div>
        <Progress value={((surveyStep + 1) / totalSteps) * 100} />
      </div>

      {/* AI banner */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground">
        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
        Fields pre-filled by AI research — review and correct anything that's off.
      </div>

      {/* Step content */}
      {renderStep()}

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t border-border">
        <Button variant="outline" onClick={() => setSurveyStep(s => s - 1)} disabled={surveyStep === 0}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        {surveyStep < totalSteps - 1 ? (
          <Button onClick={() => setSurveyStep(s => s + 1)}>
            Next <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={submitSurvey} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Complete Setup
          </Button>
        )}
      </div>
    </div>
  );
}

// ========== STEP COMPONENTS ==========

function Step1({ survey, update }: { survey: SurveyData; update: (u: Partial<SurveyData>) => void }) {
  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold">Store Type & Scale</h3>
      <div className="space-y-2">
        <Label>Catalog Type</Label>
        <div className="grid grid-cols-1 gap-2">
          {CATALOG_OPTIONS.map(opt => (
            <label key={opt} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${survey.catalog_type === opt ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
              <input type="radio" name="catalog" checked={survey.catalog_type === opt} onChange={() => update({ catalog_type: opt })} className="sr-only" />
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${survey.catalog_type === opt ? "border-primary" : "border-muted-foreground/30"}`}>
                {survey.catalog_type === opt && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <span className="text-sm">{opt}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label>Primary Category</Label>
        <Input value={survey.primary_category} onChange={e => update({ primary_category: e.target.value })} placeholder="e.g. Skincare, Supplements, Apparel" className="mt-1" />
      </div>
      <div className="space-y-2">
        <Label>Sales Channels</Label>
        <div className="flex flex-wrap gap-3">
          {CHANNEL_OPTIONS.map(ch => (
            <label key={ch} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={survey.other_channels.includes(ch)} onCheckedChange={checked => {
                update({ other_channels: checked ? [...survey.other_channels, ch] : survey.other_channels.filter(c => c !== ch) });
              }} />
              {ch}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function Step2({ survey, update }: { survey: SurveyData; update: (u: Partial<SurveyData>) => void }) {
  const addProduct = () => update({ hero_products: [...survey.hero_products, { name: "", price: "", what_it_does: "" }] });
  const removeProduct = (i: number) => update({ hero_products: survey.hero_products.filter((_, idx) => idx !== i) });
  const updateProduct = (i: number, field: keyof HeroProduct, val: string) => {
    const next = [...survey.hero_products];
    next[i] = { ...next[i], [field]: val };
    update({ hero_products: next });
  };

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold">Products</h3>
      <div className="space-y-3">
        <Label>Hero Products</Label>
        {survey.hero_products.map((p, i) => (
          <div key={i} className="p-3 rounded-lg border border-border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground"><GripVertical className="w-4 h-4" /><span className="text-xs font-medium">Product {i + 1}</span></div>
              <button onClick={() => removeProduct(i)} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
            </div>
            <Input placeholder="Product name" value={p.name} onChange={e => updateProduct(i, "name", e.target.value)} />
            <div className="flex gap-2">
              <Input placeholder="Price" value={p.price} onChange={e => updateProduct(i, "price", e.target.value)} className="w-28" />
              <Input placeholder="Short description" value={p.what_it_does} onChange={e => updateProduct(i, "what_it_does", e.target.value)} className="flex-1" />
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addProduct}><Plus className="w-4 h-4 mr-1" /> Add Product</Button>
      </div>
      <div>
        <Label>Products to Never Feature</Label>
        <Textarea value={survey.excluded_products} onChange={e => update({ excluded_products: e.target.value })} placeholder="Any products to never feature in emails?" className="mt-1" />
      </div>
      <div>
        <Label>Upcoming Launches</Label>
        <Textarea value={survey.new_launches} onChange={e => update({ new_launches: e.target.value })} placeholder="Any products launching soon?" className="mt-1" />
      </div>
      <div>
        <Label>Bundles or Kits</Label>
        <Textarea value={survey.bundles_or_kits} onChange={e => update({ bundles_or_kits: e.target.value })} placeholder="e.g. Starter Kit, Complete Set..." className="mt-1" />
      </div>
    </div>
  );
}

function Step3({ survey, update }: { survey: SurveyData; update: (u: Partial<SurveyData>) => void }) {
  const addPromo = () => update({ top_promotions: [...survey.top_promotions, { name: "", offer: "" }] });
  const removePromo = (i: number) => update({ top_promotions: survey.top_promotions.filter((_, idx) => idx !== i) });
  const updatePromo = (i: number, field: keyof Promotion, val: string) => {
    const next = [...survey.top_promotions];
    next[i] = { ...next[i], [field]: val };
    update({ top_promotions: next });
  };

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold">Subscription & Sales Model</h3>
      <div className="flex items-center gap-3">
        <Label>Has Subscription?</Label>
        <Switch checked={survey.has_subscription} onCheckedChange={v => update({ has_subscription: v })} />
      </div>
      {survey.has_subscription && (
        <div className="space-y-3 pl-4 border-l-2 border-primary/20">
          <div>
            <Label>Subscription Platform</Label>
            <Select value={survey.subscription_platform} onValueChange={v => update({ subscription_platform: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select platform" /></SelectTrigger>
              <SelectContent>{SUBSCRIPTION_PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Subscription Discount</Label>
            <Input value={survey.subscription_discount} onChange={e => update({ subscription_discount: e.target.value })} placeholder="e.g. 15% off" className="mt-1" />
          </div>
          <div className="space-y-2">
            <Label>Replenishment Cycle</Label>
            <div className="flex flex-wrap gap-2">
              {REPLENISHMENT_OPTIONS.map(opt => (
                <label key={opt} className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${survey.replenishment_cycle === opt ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30"}`}>
                  <input type="radio" name="cycle" checked={survey.replenishment_cycle === opt} onChange={() => update({ replenishment_cycle: opt })} className="sr-only" />
                  {opt}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label>Top Cancel Reason</Label>
            <Input value={survey.top_cancel_reason} onChange={e => update({ top_cancel_reason: e.target.value })} placeholder="Why do subscribers most often cancel?" className="mt-1" />
          </div>
        </div>
      )}
      <div>
        <Label>Evergreen Offer</Label>
        <Input value={survey.evergreen_offer} onChange={e => update({ evergreen_offer: e.target.value })} placeholder="e.g. 15% off first order, free shipping over $50" className="mt-1" />
      </div>
      <div className="space-y-3">
        <Label>Top Promotions (up to 5)</Label>
        {survey.top_promotions.slice(0, 5).map((p, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input placeholder="Name (e.g. Black Friday)" value={p.name} onChange={e => updatePromo(i, "name", e.target.value)} className="w-40" />
            <Input placeholder="Offer (e.g. 30% sitewide)" value={p.offer} onChange={e => updatePromo(i, "offer", e.target.value)} className="flex-1" />
            {survey.top_promotions.length > 1 && <button onClick={() => removePromo(i)} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>}
          </div>
        ))}
        {survey.top_promotions.length < 5 && <Button variant="outline" size="sm" onClick={addPromo}><Plus className="w-4 h-4 mr-1" /> Add Promotion</Button>}
      </div>
    </div>
  );
}

function Step4({ survey, update }: { survey: SurveyData; update: (u: Partial<SurveyData>) => void }) {
  const addPair = () => update({ cross_sell_paths: [...survey.cross_sell_paths, { buy: "", show: "" }] });
  const removePair = (i: number) => update({ cross_sell_paths: survey.cross_sell_paths.filter((_, idx) => idx !== i) });
  const updatePair = (i: number, field: keyof CrossSellPair, val: string) => {
    const next = [...survey.cross_sell_paths];
    next[i] = { ...next[i], [field]: val };
    update({ cross_sell_paths: next });
  };

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold">Cross-Sell & Customer Journey</h3>
      <div className="space-y-3">
        <Label>Cross-Sell Paths</Label>
        <p className="text-xs text-muted-foreground">If customer buys [A], show them [B]</p>
        {survey.cross_sell_paths.map((pair, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input placeholder="If they buy..." value={pair.buy} onChange={e => updatePair(i, "buy", e.target.value)} className="flex-1" />
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input placeholder="Show them..." value={pair.show} onChange={e => updatePair(i, "show", e.target.value)} className="flex-1" />
            {survey.cross_sell_paths.length > 1 && <button onClick={() => removePair(i)} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>}
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addPair}><Plus className="w-4 h-4 mr-1" /> Add Pair</Button>
      </div>
      <div>
        <Label>Customer Journey</Label>
        <Textarea value={survey.customer_journey} onChange={e => update({ customer_journey: e.target.value })} placeholder="Describe your typical customer journey from first purchase onward" className="mt-1" />
      </div>
      <div>
        <Label>Target Demographic</Label>
        <Textarea value={survey.target_demographic} onChange={e => update({ target_demographic: e.target.value })} placeholder="Age, gender, income, psychographic profile" className="mt-1" />
      </div>
      <div>
        <Label>#1 Pre-Purchase Objection</Label>
        <Input value={survey.top_objection} onChange={e => update({ top_objection: e.target.value })} placeholder="What is the #1 reason someone hesitates?" className="mt-1" />
      </div>
      <div>
        <Label>Repeat Purchase Drivers</Label>
        <Textarea value={survey.repeat_purchase_drivers} onChange={e => update({ repeat_purchase_drivers: e.target.value })} placeholder="What keeps customers coming back?" className="mt-1" />
      </div>
    </div>
  );
}

function Step5({ survey, update }: { survey: SurveyData; update: (u: Partial<SurveyData>) => void }) {
  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold">Email Program</h3>
      <div className="space-y-2">
        <Label>Send Frequency</Label>
        <div className="flex flex-wrap gap-2">
          {FREQUENCY_OPTIONS.map(opt => (
            <label key={opt} className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${survey.send_frequency === opt ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30"}`}>
              <input type="radio" name="freq" checked={survey.send_frequency === opt} onChange={() => update({ send_frequency: opt })} className="sr-only" />
              {opt}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Best Campaign Types</Label>
        <div className="flex flex-wrap gap-2">
          {CAMPAIGN_TYPES.map(ct => (
            <label key={ct} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={survey.best_campaign_types.includes(ct)} onCheckedChange={checked => {
                update({ best_campaign_types: checked ? [...survey.best_campaign_types, ct] : survey.best_campaign_types.filter(c => c !== ct) });
              }} />
              {ct}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label>What Has Flopped?</Label>
        <Textarea value={survey.worst_campaign_types} onChange={e => update({ worst_campaign_types: e.target.value })} placeholder="What has flopped or felt off-brand?" className="mt-1" />
      </div>
      <div>
        <Label>Blackout Periods</Label>
        <Textarea value={survey.blackout_periods} onChange={e => update({ blackout_periods: e.target.value })} placeholder="Any dates or periods to never send?" className="mt-1" />
      </div>
      <div className="space-y-2">
        <Label>Primary Email Goal</Label>
        <div className="flex flex-wrap gap-2">
          {EMAIL_GOALS.map(g => (
            <label key={g} className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${survey.primary_email_goal === g ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30"}`}>
              <input type="radio" name="goal" checked={survey.primary_email_goal === g} onChange={() => update({ primary_email_goal: g })} className="sr-only" />
              {g}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function Step6({ survey, update }: { survey: SurveyData; update: (u: Partial<SurveyData>) => void }) {
  const updateVoiceWord = (i: number, val: string) => {
    const next = [...survey.brand_voice_words];
    next[i] = val;
    update({ brand_voice_words: next });
  };

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold">Voice & Brand Context</h3>
      <div className="space-y-2">
        <Label>Brand Voice in 3 Words</Label>
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <Input key={i} value={survey.brand_voice_words[i] || ""} onChange={e => updateVoiceWord(i, e.target.value)} placeholder={`Word ${i + 1}`} />
          ))}
        </div>
      </div>
      <div>
        <Label>Language to Avoid</Label>
        <Textarea value={survey.language_to_avoid} onChange={e => update({ language_to_avoid: e.target.value })} placeholder="Any words, phrases, or tones that feel off-brand?" className="mt-1" />
      </div>
      <div>
        <Label>North Star Brand</Label>
        <Input value={survey.north_star_brand} onChange={e => update({ north_star_brand: e.target.value })} placeholder="Brand whose email style you admire?" className="mt-1" />
      </div>
      <div>
        <Label>Anything Else</Label>
        <Textarea value={survey.anything_else} onChange={e => update({ anything_else: e.target.value })} placeholder="Anything else the AI must know to never get it wrong?" className="mt-1 min-h-[100px]" />
      </div>
    </div>
  );
}
