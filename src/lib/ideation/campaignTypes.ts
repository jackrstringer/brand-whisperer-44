export interface CampaignType {
  name: string;
  description: string;
  category: 'direct' | 'subtype' | 'research';
  subtypes?: { name: string; description: string }[];
  needsResearch?: boolean;
  popular?: boolean;
  color: string; // Tailwind bg class for the color dot
}

export const CAMPAIGN_TYPES: CampaignType[] = [
  // DIRECT TYPES (click to generate)
  { name: "Billboard/Flagship", description: "Hero-driven brand moment", category: "direct", popular: true, color: "bg-violet-500" },
  { name: "Sale/Promo", description: "Discount, offer, or flash sale", category: "direct", popular: true, color: "bg-amber-500" },
  { name: "Brand Values", description: "Mission, story, or ethos spotlight", category: "direct", color: "bg-rose-500" },
  { name: "Seasonal", description: "Holiday or seasonal campaign", category: "direct", color: "bg-orange-500" },
  { name: "Referral Program", description: "Refer-a-friend or ambassador push", category: "direct", color: "bg-pink-500" },
  { name: "Re-engagement", description: "Win-back or reactivation", category: "direct", color: "bg-red-500" },
  { name: "Sneak Peek", description: "Teaser for upcoming launch", category: "direct", color: "bg-indigo-500" },
  { name: "Survey", description: "Customer feedback or quiz", category: "direct", color: "bg-slate-500" },

  // SUBTYPE TYPES (click to expand, then pick)
  {
    name: "Product Highlight", description: "Spotlight a product or collection", category: "subtype", popular: true, color: "bg-blue-500",
    subtypes: [
      { name: "Hero Highlight", description: "Spotlight the brand's #1 hero product" },
      { name: "Deep Dive", description: "Everything about one product" },
      { name: 'The "Why"', description: "Why this product exists" },
      { name: "Problem → Solution", description: "Pain point to product" },
      { name: "Use Cases", description: "Different ways to use it" },
      { name: "Ingredient/Material Spotlight", description: "Hero ingredient deep dive" },
      { name: "The Science Behind It", description: "Clinical or technical angle" },
      { name: "Gift-Worthy", description: "Gifting angle" },
      { name: "Beginner's Guide", description: "New customer onboarding" },
      { name: "Comparison", description: "Competitive differentiation vs alternatives" },
    ],
  },
  {
    name: "Blog Style", description: "Editorial or storytelling format", category: "subtype", color: "bg-teal-500",
    subtypes: [
      { name: "How-To", description: "Tutorial or routine guide" },
      { name: "Brand Story", description: "Founder story or brand journey" },
      { name: "Behind the Scenes", description: "Process, team, or making-of" },
    ],
  },
  {
    name: "Listicle", description: "Curated product list", category: "subtype", color: "bg-cyan-500",
    subtypes: [
      { name: "Best Sellers", description: "Top performing products" },
      { name: "Staff Picks", description: "Team favorites" },
      { name: "Seasonal", description: "Season-specific curation" },
    ],
  },
  {
    name: "Bundle", description: "Multi-product package", category: "subtype", color: "bg-lime-500",
    subtypes: [
      { name: "Starter Kit", description: "Entry-level bundle" },
      { name: "Complete Routine", description: "Full regimen" },
      { name: "Seasonal Bundle", description: "Limited-time package" },
    ],
  },

  // RESEARCH TYPES (click triggers web research first)
  { name: "Social Proof", description: "Reviews, testimonials, UGC", category: "research", needsResearch: true, popular: true, color: "bg-emerald-500" },
  { name: "FAQ/Overcoming Objections", description: "Address hesitations head-on", category: "research", needsResearch: true, color: "bg-yellow-500" },
  { name: 'Press/"As Seen In"', description: "Media mentions and editorial", category: "research", needsResearch: true, color: "bg-sky-500" },
  { name: "Loyalty Program", description: "Rewards, points, VIP perks", category: "research", needsResearch: true, color: "bg-fuchsia-500" },

  // SPECIAL TYPES
  { name: "📅 Calendar Dates", description: "Upcoming holidays, events & moments", category: "direct", color: "bg-emerald-400" },
];

// Hero order: Product Highlight, Sale/Promo, Social Proof first, then rest, Random last
const HERO_NAMES = ["Product Highlight", "Sale/Promo", "Social Proof"];
export const ORDERED_TYPES = [
  ...HERO_NAMES.map(n => CAMPAIGN_TYPES.find(t => t.name === n)!),
  ...CAMPAIGN_TYPES.filter(t => !HERO_NAMES.includes(t.name)),
];

export const POPULAR_TYPES = CAMPAIGN_TYPES.filter(t => t.popular);
