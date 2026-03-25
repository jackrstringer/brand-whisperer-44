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
          reference_campaign_ids: string[] | null
          send_list_ids: string[] | null
          send_segment_ids: string[] | null
          speed_mode: string | null
          status: string
          subject_line: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          brief?: string | null
          created_at?: string
          exclude_list_ids?: string[] | null
          exclude_segment_ids?: string[] | null
          extra_copy?: string | null
          generation_duration_secs?: number | null
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
          reference_campaign_ids?: string[] | null
          send_list_ids?: string[] | null
          send_segment_ids?: string[] | null
          speed_mode?: string | null
          status?: string
          subject_line?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          brief?: string | null
          created_at?: string
          exclude_list_ids?: string[] | null
          exclude_segment_ids?: string[] | null
          extra_copy?: string | null
          generation_duration_secs?: number | null
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
          reference_campaign_ids?: string[] | null
          send_list_ids?: string[] | null
          send_segment_ids?: string[] | null
          speed_mode?: string | null
          status?: string
          subject_line?: string | null
          updated_at?: string
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
        }
        Insert: {
          campaign_id: string
          content: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          campaign_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
