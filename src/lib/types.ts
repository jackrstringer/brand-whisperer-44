export interface Brand {
  id: string;
  user_id: string;
  name: string;
  industry: string | null;
  created_at: string;
}

export interface BrandProfile {
  id: string;
  brand_id: string;
  system_prompt: string | null;
  raw_extraction: BrandExtraction | null;
  reference_image_urls: string[] | null;
  created_at: string;
}

export interface Campaign {
  id: string;
  brand_id: string;
  name: string;
  brief: string | null;
  goal: string | null;
  extra_copy?: string | null;
  html: string | null;
  html_history: any;
  status: string;
  reference_campaign_ids: string[] | null;
  product_ids?: string[] | null;
  pinned_asset_urls?: string[] | null;
  speed_mode?: "normal" | "fast" | null;
  created_at: string;
  updated_at: string;
}

export interface VariantOption {
  label: string;
  preview: string;
  find: string;
  replace: string;
}

export interface VariantData {
  message: string;
  variants: VariantOption[];
  applied_index: number | null;
}

export interface ChatMessage {
  id: string;
  campaign_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  message_type?: 'text' | 'variants';
  variant_data?: VariantData;
}

export interface Product {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  url: string | null;
  created_at: string;
}

export interface ProductAsset {
  id: string;
  product_id: string;
  brand_id: string;
  bucket: 'transparent_bg' | 'lifestyle' | 'hero_shots';
  url: string;
  filename: string | null;
  description: string | null;
  dominant_colors: string[] | null;
  ai_category: string | null;
  composition_notes: string | null;
  transparent_bg: boolean;
  created_at: string;
}

export interface BrandExtraction {
  colors: {
    canvas: string;
    text_primary: string;
    text_secondary: string;
    accent: string;
    dark_card: string;
    button_border: string;
  };
  fonts: {
    heading: string;
    heading_stack: string;
    body: string;
    body_stack: string;
    google_fonts_url: string;
  };
  spacing: {
    canvas_width: number;
    side_padding: number;
    card_inset: number;
    card_radius: number;
    section_gap: number;
  };
  buttons: {
    primary_bg: string;
    primary_text: string;
    border_color: string;
    border_width: string;
    border_radius: string;
    padding: string;
  };
  layout: {
    contrast_sections: string;
    background: string;
  };
  voice: {
    tone: string;
    headline_structure: string;
    cta_style: string;
    urgency_level: string;
    notable_rules: string[];
  };
  confidence: {
    overall: string;
    low_confidence_fields: string[];
  };
}
