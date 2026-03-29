export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      brand_assets: {
        Row: {
          ai_category: string | null
          brand_id: string
          category: string
          created_at: string
          description: string | null
          dominant_colors: string[] | null
          filename: string | null
          id: string
          url: string
        }
        Insert: {
          ai_category?: string | null
          brand_id: string
          category: string
          created_at?: string
          description?: string | null
          dominant_colors?: string[] | null
          filename?: string | null
          id?: string
          url: string
        }
        Update: {
          ai_category?: string | null
          brand_id?: string
          category?: string
          created_at?: string
          description?: string | null
          dominant_colors?: string[] | null
          filename?: string | null
          id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_assets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_feedback: {
        Row: {
          attachment_urls: string[] | null
          brand_id: string
          created_at: string
          feedback: Json
          id: string
          round: number
        }
        Insert: {
          attachment_urls?: string[] | null
          brand_id: string
          created_at?: string
          feedback?: Json
          id?: string
          round?: number
        }
        Update: {
          attachment_urls?: string[] | null
          brand_id?: string
          created_at?: string
          feedback?: Json
          id?: string
          round?: number
        }
        Relationships: [
          {
            foreignKeyName: "brand_feedback_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profiles: {
        Row: {
          audit_findings: Json | null
          brand_guide_html: string | null
          brand_guide_url: string | null
          brand_id: string
          brand_instructions: string | null
          confirmed_properties: Json | null
          created_at: string
          extraction_sources: string[] | null
          id: string
          qa_checklist: Json | null
          raw_extraction: Json | null
          reference_image_urls: string[] | null
          reference_slice_urls: string[] | null
          system_prompt: string | null
        }
        Insert: {
          audit_findings?: Json | null
          brand_guide_html?: string | null
          brand_guide_url?: string | null
          brand_id: string
          brand_instructions?: string | null
          confirmed_properties?: Json | null
          created_at?: string
          extraction_sources?: string[] | null
          id?: string
          qa_checklist?: Json | null
          raw_extraction?: Json | null
          reference_image_urls?: string[] | null
          reference_slice_urls?: string[] | null
          system_prompt?: string | null
        }
        Update: {
          audit_findings?: Json | null
          brand_guide_html?: string | null
          brand_guide_url?: string | null
          brand_id?: string
          brand_instructions?: string | null
          confirmed_properties?: Json | null
          created_at?: string
          extraction_sources?: string[] | null
          id?: string
          qa_checklist?: Json | null
          raw_extraction?: Json | null
          reference_image_urls?: string[] | null
          reference_slice_urls?: string[] | null
          system_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_profiles_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_segment_presets: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          list_ids: string[] | null
          name: string
          segment_ids: string[] | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          list_ids?: string[] | null
          name: string
          segment_ids?: string[] | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          list_ids?: string[] | null
          name?: string
          segment_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_segment_presets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          clickup_api_key: string | null
          created_at: string
          figma_url: string | null
          id: string
          industry: string | null
          name: string
          source_types: string[] | null
          user_id: string
          website_url: string | null
        }
        Insert: {
          clickup_api_key?: string | null
          created_at?: string
          figma_url?: string | null
          id?: string
          industry?: string | null
          name: string
          source_types?: string[] | null
          user_id: string
          website_url?: string | null
        }
        Update: {
          clickup_api_key?: string | null
          created_at?: string
          figma_url?: string | null
          id?: string
          industry?: string | null
          name?: string
          source_types?: string[] | null
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          brand_id: string
          brief: string | null
          created_at: string
          exclude_list_ids: string[] | null
          exclude_segment_ids: string[] | null
          extra_copy: string | null
          generation_duration_secs: number | null
          generation_mode: string
          generation_started_at: string | null
          goal: string | null
          html: string | null
          html_history: Json | null
          id: string
          klaviyo_campaign_id: string | null
          klaviyo_template_id: string | null
          name: string
          pinned_asset_urls: string[] | null
          preview_text: string | null
          product_ids: string[] | null
          reference_campaign_id: string | null
          reference_campaign_ids: string[] | null
          reference_campaign_type: string | null
          reference_strength: number | null
          send_list_ids: string[] | null
          send_segment_ids: string[] | null
          speed_mode: string | null
          status: string
          subject_line: string | null
          updated_at: string
          variant_htmls: Json | null
        }
        Insert: {
          brand_id: string
          brief?: string | null
          created_at?: string
          exclude_list_ids?: string[] | null
          exclude_segment_ids?: string[] | null
          extra_copy?: string | null
          generation_duration_secs?: number | null
          generation_mode?: string
          generation_started_at?: string | null
          goal?: string | null
          html?: string | null
          html_history?: Json | null
          id?: string
          klaviyo_campaign_id?: string | null
          klaviyo_template_id?: string | null
          name?: string
          pinned_asset_urls?: string[] | null
          preview_text?: string | null
          product_ids?: string[] | null
          reference_campaign_id?: string | null
          reference_campaign_ids?: string[] | null
          reference_campaign_type?: string | null
          reference_strength?: number | null
          send_list_ids?: string[] | null
          send_segment_ids?: string[] | null
          speed_mode?: string | null
          status?: string
          subject_line?: string | null
          updated_at?: string
          variant_htmls?: Json | null
        }
        Update: {
          brand_id?: string
          brief?: string | null
          created_at?: string
          exclude_list_ids?: string[] | null
          exclude_segment_ids?: string[] | null
          extra_copy?: string | null
          generation_duration_secs?: number | null
          generation_mode?: string
          generation_started_at?: string | null
          goal?: string | null
          html?: string | null
          html_history?: Json | null
          id?: string
          klaviyo_campaign_id?: string | null
          klaviyo_template_id?: string | null
          name?: string
          pinned_asset_urls?: string[] | null
          preview_text?: string | null
          product_ids?: string[] | null
          reference_campaign_id?: string | null
          reference_campaign_ids?: string[] | null
          reference_campaign_type?: string | null
          reference_strength?: number | null
          send_list_ids?: string[] | null
          send_segment_ids?: string[] | null
          speed_mode?: string | null
          status?: string
          subject_line?: string | null
          updated_at?: string
          variant_htmls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          campaign_id: string
          content: string
          created_at: string
          id: string
          role: string
          tool_calls: Json | null
        }
        Insert: {
          campaign_id: string
          content: string
          created_at?: string
          id?: string
          role: string
          tool_calls?: Json | null
        }
        Update: {
          campaign_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      klaviyo_connections: {
        Row: {
          api_key_encrypted: string
          brand_id: string
          cached_lists: Json | null
          cached_segments: Json | null
          created_at: string
          id: string
          last_synced_at: string | null
        }
        Insert: {
          api_key_encrypted: string
          brand_id: string
          cached_lists?: Json | null
          cached_segments?: Json | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
        }
        Update: {
          api_key_encrypted?: string
          brand_id?: string
          cached_lists?: Json | null
          cached_segments?: Json | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "klaviyo_connections_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      product_assets: {
        Row: {
          ai_category: string | null
          brand_id: string
          bucket: string
          composition_notes: string | null
          created_at: string
          description: string | null
          dominant_colors: string[] | null
          filename: string | null
          id: string
          product_id: string
          transparent_bg: boolean
          url: string
        }
        Insert: {
          ai_category?: string | null
          brand_id: string
          bucket: string
          composition_notes?: string | null
          created_at?: string
          description?: string | null
          dominant_colors?: string[] | null
          filename?: string | null
          id?: string
          product_id: string
          transparent_bg?: boolean
          url: string
        }
        Update: {
          ai_category?: string | null
          brand_id?: string
          bucket?: string
          composition_notes?: string | null
          created_at?: string
          description?: string | null
          dominant_colors?: string[] | null
          filename?: string | null
          id?: string
          product_id?: string
          transparent_bg?: boolean
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_assets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_assets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          url: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          url?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_campaigns: {
        Row: {
          ai_metadata: Json | null
          brand_name: string | null
          campaign_type: string | null
          category: string | null
          created_at: string | null
          extracted_copy: string | null
          id: string
          image_slice_urls: Json | null
          image_total_height: number | null
          image_urls: string[] | null
          industry: string | null
          is_published: boolean | null
          message_type: string | null
          slicing_status: string
          sort_order: number | null
          tags: string[] | null
          thumbnail_url: string
          title: string
        }
        Insert: {
          ai_metadata?: Json | null
          brand_name?: string | null
          campaign_type?: string | null
          category?: string | null
          created_at?: string | null
          extracted_copy?: string | null
          id?: string
          image_slice_urls?: Json | null
          image_total_height?: number | null
          image_urls?: string[] | null
          industry?: string | null
          is_published?: boolean | null
          message_type?: string | null
          slicing_status?: string
          sort_order?: number | null
          tags?: string[] | null
          thumbnail_url: string
          title: string
        }
        Update: {
          ai_metadata?: Json | null
          brand_name?: string | null
          campaign_type?: string | null
          category?: string | null
          created_at?: string | null
          extracted_copy?: string | null
          id?: string
          image_slice_urls?: Json | null
          image_total_height?: number | null
          image_urls?: string[] | null
          industry?: string | null
          is_published?: boolean | null
          message_type?: string | null
          slicing_status?: string
          sort_order?: number | null
          tags?: string[] | null
          thumbnail_url?: string
          title?: string
        }
        Relationships: []
      }
      saved_references: {
        Row: {
          id: string
          reference_id: string
          reference_type: string
          saved_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          reference_id: string
          reference_type: string
          saved_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          reference_id?: string
          reference_type?: string
          saved_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      shopify_connections: {
        Row: {
          access_token: string
          brand_id: string
          connected_at: string
          id: string
          last_synced_at: string | null
          scope: string | null
          shop_domain: string
        }
        Insert: {
          access_token: string
          brand_id: string
          connected_at?: string
          id?: string
          last_synced_at?: string | null
          scope?: string | null
          shop_domain: string
        }
        Update: {
          access_token?: string
          brand_id?: string
          connected_at?: string
          id?: string
          last_synced_at?: string | null
          scope?: string | null
          shop_domain?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_connections_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_product_images: {
        Row: {
          background_type: string | null
          brand_id: string
          classified_at: string | null
          confidence: string | null
          dominant_colors: string[] | null
          has_salvageable_product: boolean | null
          has_text_overlay: boolean | null
          has_transparent_bg: boolean | null
          has_white_bg: boolean | null
          id: string
          image_type: string | null
          imagekit_url: string | null
          is_marketing_collateral: boolean | null
          is_usable_product_photo: boolean | null
          original_url: string
          processed_url: string | null
          processing_status: string
          product_id: string
          rescue_strategy: string | null
          rescue_transforms: string | null
          shopify_image_id: string | null
          subject_description: string | null
          usable_as_hero: boolean | null
          usable_as_product_shot: boolean | null
          variant_shown: string | null
        }
        Insert: {
          background_type?: string | null
          brand_id: string
          classified_at?: string | null
          confidence?: string | null
          dominant_colors?: string[] | null
          has_salvageable_product?: boolean | null
          has_text_overlay?: boolean | null
          has_transparent_bg?: boolean | null
          has_white_bg?: boolean | null
          id?: string
          image_type?: string | null
          imagekit_url?: string | null
          is_marketing_collateral?: boolean | null
          is_usable_product_photo?: boolean | null
          original_url: string
          processed_url?: string | null
          processing_status?: string
          product_id: string
          rescue_strategy?: string | null
          rescue_transforms?: string | null
          shopify_image_id?: string | null
          subject_description?: string | null
          usable_as_hero?: boolean | null
          usable_as_product_shot?: boolean | null
          variant_shown?: string | null
        }
        Update: {
          background_type?: string | null
          brand_id?: string
          classified_at?: string | null
          confidence?: string | null
          dominant_colors?: string[] | null
          has_salvageable_product?: boolean | null
          has_text_overlay?: boolean | null
          has_transparent_bg?: boolean | null
          has_white_bg?: boolean | null
          id?: string
          image_type?: string | null
          imagekit_url?: string | null
          is_marketing_collateral?: boolean | null
          is_usable_product_photo?: boolean | null
          original_url?: string
          processed_url?: string | null
          processing_status?: string
          product_id?: string
          rescue_strategy?: string | null
          rescue_transforms?: string | null
          shopify_image_id?: string | null
          subject_description?: string | null
          usable_as_hero?: boolean | null
          usable_as_product_shot?: boolean | null
          variant_shown?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_product_images_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shopify_products"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_products: {
        Row: {
          best_hero_image_id: string | null
          brand_id: string
          handle: string | null
          id: string
          product_type: string | null
          shopify_product_id: string
          shopify_updated_at: string | null
          status: string | null
          synced_at: string
          tags: string[] | null
          title: string
          variants: Json | null
        }
        Insert: {
          best_hero_image_id?: string | null
          brand_id: string
          handle?: string | null
          id?: string
          product_type?: string | null
          shopify_product_id: string
          shopify_updated_at?: string | null
          status?: string | null
          synced_at?: string
          tags?: string[] | null
          title: string
          variants?: Json | null
        }
        Update: {
          best_hero_image_id?: string | null
          brand_id?: string
          handle?: string | null
          id?: string
          product_type?: string | null
          shopify_product_id?: string
          shopify_updated_at?: string | null
          status?: string | null
          synced_at?: string
          tags?: string[] | null
          title?: string
          variants?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_products_best_hero_image_id_fkey"
            columns: ["best_hero_image_id"]
            isOneToOne: false
            referencedRelation: "shopify_product_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          id: string
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
