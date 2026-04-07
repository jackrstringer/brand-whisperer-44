import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronDown,
  Building2,
  ShoppingBag,
  DollarSign,
  Target,
  Megaphone,
  Users,
  Palette,
  Star,
  Globe,
  TrendingUp,
  Package,
  Award,
  AlertTriangle,
  Heart,
  MessageSquare,
  Repeat,
  Mail,
  Eye,
} from "lucide-react";

interface Props {
  research: any;
  confidence?: string;
  lastResearchedAt?: string;
}

function Section({ title, icon: Icon, children, defaultOpen = false }: {
  title: string;
  icon: any;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border-border/50">
        <CollapsibleTrigger className="w-full">
          <CardHeader className="flex flex-row items-center justify-between py-4 px-5 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-5 px-5">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  if (!value || value === "unknown" || value === "N/A") return null;
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm">{typeof value === "string" ? value : JSON.stringify(value)}</p>
    </div>
  );
}

function TagList({ items, variant = "secondary" }: { items: any[]; variant?: "secondary" | "outline" | "default" }) {
  if (!items || !Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.filter(i => i && i !== "unknown").map((item, idx) => (
        <Badge key={idx} variant={variant} className="text-xs font-normal">
          {typeof item === "string" ? item : item.name || JSON.stringify(item)}
        </Badge>
      ))}
    </div>
  );
}

function HeroProductCard({ product }: { product: any }) {
  return (
    <Card className="bg-muted/30 border-border/30">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between">
          <h4 className="font-semibold text-sm">{product.name}</h4>
          {product.price && <Badge variant="outline" className="text-xs shrink-0">{product.price}</Badge>}
        </div>
        {product.what_it_does && <p className="text-xs text-muted-foreground">{product.what_it_does}</p>}
        {product.why_its_hero && (
          <div className="flex items-start gap-1.5">
            <Star className="w-3 h-3 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">{product.why_its_hero}</p>
          </div>
        )}
        {product.key_ingredients_or_specs && product.key_ingredients_or_specs !== "unknown" && (
          <p className="text-xs"><span className="font-medium">Key specs:</span> {product.key_ingredients_or_specs}</p>
        )}
        <TagList items={product.unique_selling_points} variant="outline" />
        {product.rating && product.rating !== "unknown" && (
          <p className="text-xs text-muted-foreground">
            ⭐ {product.rating} {product.review_count_estimate ? `(${product.review_count_estimate} reviews)` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function BrandResearchReport({ research, confidence, lastResearchedAt }: Props) {
  if (!research) return null;

  const bo = research.brand_overview || {};
  const pl = research.product_landscape || {};
  const sm = research.sales_model || {};
  const cl = research.competitive_landscape || {};
  const mi = research.marketing_intelligence || {};
  const ci = research.customer_intelligence || {};
  const bd = research.brand_design_observations || {};

  return (
    <ScrollArea className="h-[calc(100vh-200px)]">
      <div className="space-y-3 pr-4">
        {/* Header summary */}
        <div className="flex items-center gap-3 flex-wrap mb-2">
          {confidence && confidence !== "unknown" && (
            <Badge variant={confidence === "high" ? "default" : "secondary"} className="text-xs">
              Confidence: {confidence}
            </Badge>
          )}
          {lastResearchedAt && (
            <span className="text-xs text-muted-foreground">
              Researched {new Date(lastResearchedAt).toLocaleDateString()}
            </span>
          )}
          {research.sources_consulted?.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {research.sources_consulted.length} sources consulted
            </span>
          )}
        </div>

        {/* Brand Overview */}
        <Section title="Brand Overview" icon={Building2} defaultOpen={true}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Category" value={bo.primary_category} />
            <Field label="Sub-Category" value={bo.sub_category} />
            <Field label="Founded" value={bo.founding_year} />
            <Field label="Founders" value={bo.founders} />
            <Field label="Headquarters" value={bo.headquarters} />
            <Field label="Tagline" value={bo.tagline_or_slogan} />
          </div>
          <div className="mt-4 space-y-3">
            <Field label="Mission" value={bo.mission_statement} />
            <Field label="Brand Story" value={bo.brand_story} />
            <Field label="Positioning" value={bo.brand_positioning} />
            <Field label="Voice & Tone" value={bo.brand_voice_and_tone} />
          </div>
          {bo.key_brand_values?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Brand Values</p>
              <TagList items={bo.key_brand_values} />
            </div>
          )}
          {bo.target_demographic && (
            <div className="mt-4 p-3 rounded-lg bg-muted/30 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3 h-3" /> Target Demographic
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Age" value={bo.target_demographic.age_range} />
                <Field label="Gender" value={bo.target_demographic.gender_skew} />
                <Field label="Income" value={bo.target_demographic.income_level} />
              </div>
              <Field label="Psychographic" value={bo.target_demographic.psychographic_profile} />
              <TagList items={bo.target_demographic.lifestyle_descriptors} variant="outline" />
            </div>
          )}
        </Section>

        {/* Product Landscape */}
        <Section title="Product Landscape" icon={ShoppingBag}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <Field label="Catalog Type" value={pl.catalog_type} />
            <Field label="Total Products" value={pl.total_product_count_estimate} />
            {pl.price_range && (
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Price Range</p>
                <p className="text-sm">{pl.price_range.low} – {pl.price_range.high}</p>
                {pl.price_range.avg_order_value_estimate && (
                  <p className="text-xs text-muted-foreground">AOV: {pl.price_range.avg_order_value_estimate}</p>
                )}
              </div>
            )}
          </div>

          {pl.hero_products?.length > 0 && (
            <div className="space-y-2 mb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-3 h-3" /> Hero Products
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {pl.hero_products.map((p: any, i: number) => <HeroProductCard key={i} product={p} />)}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {pl.product_lines_or_collections?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Collections</p>
                <TagList items={pl.product_lines_or_collections} />
              </div>
            )}
            {pl.bestsellers?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Bestsellers</p>
                <TagList items={pl.bestsellers} variant="outline" />
              </div>
            )}
            {pl.bundles_or_kits?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Bundles & Kits</p>
                <TagList items={pl.bundles_or_kits} variant="outline" />
              </div>
            )}
            {pl.new_launches?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">New Launches</p>
                <TagList items={pl.new_launches} variant="outline" />
              </div>
            )}
          </div>
        </Section>

        {/* Sales Model */}
        <Section title="Sales Model" icon={DollarSign}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Primary Channel" value={sm.primary_channel} />
            <Field label="Free Shipping Threshold" value={sm.free_shipping_threshold} />
            <Field label="Subscription Platform" value={sm.subscription_platform} />
            <Field label="Subscription Discount" value={sm.subscription_discount_typical} />
            <Field label="Trial / Intro Offers" value={sm.trial_or_intro_offers} />
            <Field label="Loyalty Program" value={sm.loyalty_program} />
            <Field label="Referral Program" value={sm.referral_program} />
            <Field label="Return Policy" value={sm.return_policy_summary} />
          </div>
          <div className="mt-3 space-y-2">
            {sm.also_sold_at?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Also Sold At</p>
                <TagList items={sm.also_sold_at} />
              </div>
            )}
            {sm.payment_methods?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Payment Methods</p>
                <TagList items={sm.payment_methods} variant="outline" />
              </div>
            )}
          </div>
        </Section>

        {/* Competitive Landscape */}
        <Section title="Competitive Landscape" icon={Target}>
          <div className="space-y-3">
            <Field label="Market Positioning" value={cl.market_positioning_vs_competitors} />
            <Field label="Price Positioning" value={cl.price_positioning} />
            {cl.direct_competitors?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Direct Competitors</p>
                <TagList items={cl.direct_competitors} />
              </div>
            )}
            {cl.indirect_competitors?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Indirect Competitors</p>
                <TagList items={cl.indirect_competitors} variant="outline" />
              </div>
            )}
            {cl.competitive_advantages?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-green-600" /> Advantages
                </p>
                <ul className="space-y-1">
                  {cl.competitive_advantages.filter((a: string) => a !== "unknown").map((a: string, i: number) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-green-600 mt-1">✓</span> {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {cl.competitive_weaknesses?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-500" /> Weaknesses
                </p>
                <ul className="space-y-1">
                  {cl.competitive_weaknesses.filter((a: string) => a !== "unknown").map((a: string, i: number) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="text-amber-500 mt-1">⚠</span> {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>

        {/* Marketing Intelligence */}
        <Section title="Marketing Intelligence" icon={Megaphone}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Email Frequency" value={mi.estimated_email_frequency} />
              <Field label="Email Style" value={mi.email_style_observations} />
              <Field label="Influencer/Ambassador" value={mi.influencer_or_ambassador_program} />
              <Field label="UGC Usage" value={mi.ugc_usage} />
            </div>
            {mi.content_themes?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Content Themes</p>
                <TagList items={mi.content_themes} />
              </div>
            )}
            {mi.proof_types_used?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Proof Types</p>
                <TagList items={mi.proof_types_used} variant="outline" />
              </div>
            )}
            {mi.typical_offer_types?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Typical Offers</p>
                <TagList items={mi.typical_offer_types} variant="outline" />
              </div>
            )}
            {mi.social_platforms?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Social Platforms</p>
                <TagList items={mi.social_platforms} />
              </div>
            )}
            {mi.seasonal_moments?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Seasonal Moments</p>
                <TagList items={mi.seasonal_moments} variant="outline" />
              </div>
            )}
            {mi.notable_campaigns_or_collabs?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Notable Campaigns</p>
                <TagList items={mi.notable_campaigns_or_collabs} variant="outline" />
              </div>
            )}
          </div>
        </Section>

        {/* Customer Intelligence */}
        <Section title="Customer Intelligence" icon={Users}>
          <div className="space-y-3">
            <Field label="Typical Journey" value={ci.typical_customer_journey} />
            <Field label="Community Signals" value={ci.community_or_loyalty_signals} />

            {ci.primary_pain_points_solved?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Heart className="w-3 h-3 text-red-500" /> Pain Points Solved
                </p>
                <ul className="space-y-1">
                  {ci.primary_pain_points_solved.map((p: string, i: number) => (
                    <li key={i} className="text-sm">• {p}</li>
                  ))}
                </ul>
              </div>
            )}
            {ci.common_objections_before_purchase?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> Common Objections
                </p>
                <ul className="space-y-1">
                  {ci.common_objections_before_purchase.map((p: string, i: number) => (
                    <li key={i} className="text-sm">• {p}</li>
                  ))}
                </ul>
              </div>
            )}
            {ci.common_praise_in_reviews?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Star className="w-3 h-3 text-green-600" /> Common Praise
                </p>
                <ul className="space-y-1">
                  {ci.common_praise_in_reviews.map((p: string, i: number) => (
                    <li key={i} className="text-sm text-green-700 dark:text-green-400">✓ {p}</li>
                  ))}
                </ul>
              </div>
            )}
            {ci.common_complaints_in_reviews?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-500" /> Common Complaints
                </p>
                <ul className="space-y-1">
                  {ci.common_complaints_in_reviews.map((p: string, i: number) => (
                    <li key={i} className="text-sm text-amber-700 dark:text-amber-400">⚠ {p}</li>
                  ))}
                </ul>
              </div>
            )}
            {ci.repeat_purchase_drivers?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Repeat className="w-3 h-3" /> Repeat Purchase Drivers
                </p>
                <TagList items={ci.repeat_purchase_drivers} />
              </div>
            )}
          </div>
        </Section>

        {/* Design Observations */}
        <Section title="Design & Aesthetics" icon={Palette}>
          <div className="space-y-3">
            <Field label="Overall Aesthetic" value={bd.overall_aesthetic} />
            <Field label="Typography" value={bd.typography_style} />
            <Field label="Photography Style" value={bd.photography_style} />
            <Field label="Packaging" value={bd.packaging_notes} />
            {bd.primary_colors_observed?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Colors Observed</p>
                <div className="flex gap-2 flex-wrap">
                  {bd.primary_colors_observed.map((color: string, i: number) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div
                        className="w-5 h-5 rounded border border-border"
                        style={{ backgroundColor: color.startsWith("#") ? color : undefined }}
                      />
                      <span className="text-xs">{color}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* Research Notes */}
        {research.research_notes && research.research_notes !== "unknown" && (
          <Section title="Research Notes" icon={Eye}>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{research.research_notes}</p>
            {research.sources_consulted?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Sources</p>
                <ul className="space-y-0.5">
                  {research.sources_consulted.map((s: string, i: number) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Globe className="w-3 h-3 shrink-0" />
                      {s.startsWith("http") ? (
                        <a href={s} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">{s}</a>
                      ) : s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        )}
      </div>
    </ScrollArea>
  );
}
