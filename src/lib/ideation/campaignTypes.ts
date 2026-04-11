export interface CampaignType {
  name: string;
  description: string;
  category: 'direct' | 'subtype' | 'research';
  subtypes?: { name: string; description: string }[];
  needsResearch?: boolean;
  popular?: boolean;
}

export const CAMPAIGN_TYPES: CampaignType[] = [
  // DIRECT TYPES (click to generate)
  { name: "Billboard/Flagship", description: "Hero-driven brand moment", category: "direct", popular: true },
  { name: "Sale/Promo", description: "Discount, offer, or flash sale", category: "direct", popular: true },
  { name: "Brand Values", description: "Mission, story, or ethos spotlight", category: "direct" },
  { name: "Seasonal", description: "Holiday or seasonal campaign", category: "direct" },
  { name: "Referral Program", description: "Refer-a-friend or ambassador push", category: "direct" },
  { name: "Re-engagement", description: "Win-back or reactivation", category: "direct" },
  { name: "Sneak Peek", description: "Teaser for upcoming launch", category: "direct" },
  { name: "Survey", description: "Customer feedback or quiz", category: "direct" },

  // SUBTYPE TYPES (click to expand, then pick)
  {
    name: "Product Highlight", description: "Spotlight a product or collection", category: "subtype", popular: true,
    subtypes: [
      { name: "Deep Dive", description: "Everything about one product" },
      { name: 'The "Why"', description: "Why this product exists" },
      { name: "Problem → Solution", description: "Pain point to product" },
      { name: "Use Cases", description: "Different ways to use it" },
      { name: "Ingredient/Material Spotlight", description: "Hero ingredient deep dive" },
      { name: "The Science Behind It", description: "Clinical or technical angle" },
      { name: "Gift-Worthy", description: "Gifting angle" },
      { name: "Beginner's Guide", description: "New customer onboarding" },
    ],
  },
  {
    name: "Blog Style", description: "Editorial or storytelling format", category: "subtype",
    subtypes: [
      { name: "How-To", description: "Tutorial or routine guide" },
      { name: "Brand Story", description: "Founder story or brand journey" },
      { name: "Behind the Scenes", description: "Process, team, or making-of" },
    ],
  },
  {
    name: "Listicle", description: "Curated product list", category: "subtype",
    subtypes: [
      { name: "Best Sellers", description: "Top performing products" },
      { name: "Staff Picks", description: "Team favorites" },
      { name: "Seasonal", description: "Season-specific curation" },
    ],
  },
  {
    name: "Bundle", description: "Multi-product package", category: "subtype",
    subtypes: [
      { name: "Starter Kit", description: "Entry-level bundle" },
      { name: "Complete Routine", description: "Full regimen" },
      { name: "Seasonal Bundle", description: "Limited-time package" },
    ],
  },

  // RESEARCH TYPES (click triggers web research first)
  { name: "Social Proof", description: "Reviews, testimonials, UGC", category: "research", needsResearch: true, popular: true },
  { name: "FAQ/Overcoming Objections", description: "Address hesitations head-on", category: "research", needsResearch: true },
  { name: 'Press/"As Seen In"', description: "Media mentions and editorial", category: "research", needsResearch: true },
  { name: "Loyalty Program", description: "Rewards, points, VIP perks", category: "research", needsResearch: true },
  { name: "Comparison", description: "Competitive differentiation", category: "research", needsResearch: true },
];

export const POPULAR_TYPES = CAMPAIGN_TYPES.filter(t => t.popular);
