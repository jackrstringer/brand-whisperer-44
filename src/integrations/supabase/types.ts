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
          composition_data: Json | null
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
          composition_data?: Json | null
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
          composition_data?: Json | null
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
      brand_calendar: {
        Row: {
          auto_generated: boolean | null
          brand_id: string
          created_at: string | null
          event_date: string
          event_name: string
          event_type: string | null
          id: string
        }
        Insert: {
          auto_generated?: boolean | null
          brand_id: string
          created_at?: string | null
          event_date: string
          event_name: string
          event_type?: string | null
          id?: string
        }
        Update: {
          auto_generated?: boolean | null
          brand_id?: string
          created_at?: string | null
          event_date?: string
          event_name?: string
          event_type?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_calendar_brand_id_fkey"
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
      brand_intelligence: {
        Row: {
          ai_research: Json | null
          ai_research_confidence: string | null
          brand_id: string
          campaign_report_error: string | null
          campaign_report_generated_at: string | null
          campaign_report_html: string | null
          campaign_report_status: string | null
          compiled_context: string | null
          created_at: string
          klaviyo_compiled: string | null
          klaviyo_last_synced_at: string | null
          klaviyo_raw: Json | null
          klaviyo_report: Json | null
          last_compiled_at: string | null
          last_researched_at: string | null
          last_surveyed_at: string | null
          merged_profile: Json | null
          research_status: string
          survey_answers: Json | null
          updated_at: string
        }
        Insert: {
          ai_research?: Json | null
          ai_research_confidence?: string | null
          brand_id: string
          campaign_report_error?: string | null
          campaign_report_generated_at?: string | null
          campaign_report_html?: string | null
          campaign_report_status?: string | null
          compiled_context?: string | null
          created_at?: string
          klaviyo_compiled?: string | null
          klaviyo_last_synced_at?: string | null
          klaviyo_raw?: Json | null
          klaviyo_report?: Json | null
          last_compiled_at?: string | null
          last_researched_at?: string | null
          last_surveyed_at?: string | null
          merged_profile?: Json | null
          research_status?: string
          survey_answers?: Json | null
          updated_at?: string
        }
        Update: {
          ai_research?: Json | null
          ai_research_confidence?: string | null
          brand_id?: string
          campaign_report_error?: string | null
          campaign_report_generated_at?: string | null
          campaign_report_html?: string | null
          campaign_report_status?: string | null
          compiled_context?: string | null
          created_at?: string
          klaviyo_compiled?: string | null
          klaviyo_last_synced_at?: string | null
          klaviyo_raw?: Json | null
          klaviyo_report?: Json | null
          last_compiled_at?: string | null
          last_researched_at?: string | null
          last_surveyed_at?: string | null
          merged_profile?: Json | null
          research_status?: string
          survey_answers?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_intelligence_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: true
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
          processing_error: string | null
          processing_status: string
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
          processing_error?: string | null
          processing_status?: string
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
          processing_error?: string | null
          processing_status?: string
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
          idea_generation_status: string | null
          ideation_prompt: string | null
          ideation_prompt_built_at: string | null
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
          idea_generation_status?: string | null
          ideation_prompt?: string | null
          ideation_prompt_built_at?: string | null
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
          idea_generation_status?: string | null
          ideation_prompt?: string | null
          ideation_prompt_built_at?: string | null
          industry?: string | null
          name?: string
          source_types?: string[] | null
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
      }
      campaign_reports: {
        Row: {
          brand_id: string
          campaign_count: number | null
          created_at: string | null
          date_range_days: number | null
          id: string
          report_html: string | null
        }
        Insert: {
          brand_id: string
          campaign_count?: number | null
          created_at?: string | null
          date_range_days?: number | null
          id?: string
          report_html?: string | null
        }
        Update: {
          brand_id?: string
          campaign_count?: number | null
          created_at?: string | null
          date_range_days?: number | null
          id?: string
          report_html?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_reports_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          brand_id: string
          brief: string | null
          cached_flow_preview: Json | null
          campaign_mode: string
          created_at: string
          exclude_list_ids: string[] | null
          exclude_segment_ids: string[] | null
          extra_copy: string | null
          flow_config: Json | null
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
          visual_qa_score: number | null
          visual_qa_status: string | null
        }
        Insert: {
          brand_id: string
          brief?: string | null
          cached_flow_preview?: Json | null
          campaign_mode?: string
          created_at?: string
          exclude_list_ids?: string[] | null
          exclude_segment_ids?: string[] | null
          extra_copy?: string | null
          flow_config?: Json | null
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
          visual_qa_score?: number | null
          visual_qa_status?: string | null
        }
        Update: {
          brand_id?: string
          brief?: string | null
          cached_flow_preview?: Json | null
          campaign_mode?: string
          created_at?: string
          exclude_list_ids?: string[] | null
          exclude_segment_ids?: string[] | null
          extra_copy?: string | null
          flow_config?: Json | null
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
          visual_qa_score?: number | null
          visual_qa_status?: string | null
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
      creative_decisions: {
        Row: {
          brand_id: string
          campaign_id: string | null
          created_at: string | null
          decision_type: string
          id: string
          value: string
        }
        Insert: {
          brand_id: string
          campaign_id?: string | null
          created_at?: string | null
          decision_type: string
          id?: string
          value: string
        }
        Update: {
          brand_id?: string
          campaign_id?: string | null
          created_at?: string | null
          decision_type?: string
          id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_decisions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_decisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      design_queue_items: {
        Row: {
          brand_id: string
          campaign_id: string | null
          campaign_info: string | null
          campaign_type: string | null
          copy_direction: string | null
          created_at: string | null
          description: string | null
          id: string
          klaviyo_campaign_id: string | null
          position: number | null
          preferences: Json | null
          send_date: string | null
          source_session_id: string | null
          status: string
          subject_line: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          brand_id: string
          campaign_id?: string | null
          campaign_info?: string | null
          campaign_type?: string | null
          copy_direction?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          klaviyo_campaign_id?: string | null
          position?: number | null
          preferences?: Json | null
          send_date?: string | null
          source_session_id?: string | null
          status?: string
          subject_line?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          brand_id?: string
          campaign_id?: string | null
          campaign_info?: string | null
          campaign_type?: string | null
          copy_direction?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          klaviyo_campaign_id?: string | null
          position?: number | null
          preferences?: Json | null
          send_date?: string | null
          source_session_id?: string | null
          status?: string
          subject_line?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_queue_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_queue_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_queue_items_source_session_id_fkey"
            columns: ["source_session_id"]
            isOneToOne: false
            referencedRelation: "ideation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_emails: {
        Row: {
          brand_id: string
          campaign_id: string | null
          created_at: string
          flow_id: string
          generation_status: string
          html: string | null
          id: string
          job: string | null
          label: string | null
          node_type: string
          notes: string | null
          sections: Json | null
          sequence_index: number
          subject_direction: string | null
          timing: string | null
        }
        Insert: {
          brand_id: string
          campaign_id?: string | null
          created_at?: string
          flow_id: string
          generation_status?: string
          html?: string | null
          id?: string
          job?: string | null
          label?: string | null
          node_type: string
          notes?: string | null
          sections?: Json | null
          sequence_index: number
          subject_direction?: string | null
          timing?: string | null
        }
        Update: {
          brand_id?: string
          campaign_id?: string | null
          created_at?: string
          flow_id?: string
          generation_status?: string
          html?: string | null
          id?: string
          job?: string | null
          label?: string | null
          node_type?: string
          notes?: string | null
          sections?: Json | null
          sequence_index?: number
          subject_direction?: string | null
          timing?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_emails_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_emails_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_emails_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flows: {
        Row: {
          brand_id: string
          created_at: string
          flow_type: string
          id: string
          messages: Json
          name: string
          skeleton_markdown: string | null
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          flow_type: string
          id?: string
          messages?: Json
          name: string
          skeleton_markdown?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          flow_type?: string
          id?: string
          messages?: Json
          name?: string
          skeleton_markdown?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flows_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_events: {
        Row: {
          campaign_id: string
          completed_at: string | null
          created_at: string | null
          duration_ms: number | null
          error: string | null
          event_key: string | null
          id: string
          payload: Json | null
          result: Json | null
          run_id: string | null
          started_at: string | null
          status: string
          step: string
        }
        Insert: {
          campaign_id: string
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error?: string | null
          event_key?: string | null
          id?: string
          payload?: Json | null
          result?: Json | null
          run_id?: string | null
          started_at?: string | null
          status?: string
          step: string
        }
        Update: {
          campaign_id?: string
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error?: string | null
          event_key?: string | null
          id?: string
          payload?: Json | null
          result?: Json | null
          run_id?: string | null
          started_at?: string | null
          status?: string
          step?: string
        }
        Relationships: []
      }
      idea_bank: {
        Row: {
          brand_id: string
          campaign_info: string | null
          campaign_type: string | null
          copy_direction: string | null
          created_at: string | null
          description: string | null
          id: string
          source_type: string | null
          status: string | null
          subject_line: string | null
          title: string
          used_at: string | null
        }
        Insert: {
          brand_id: string
          campaign_info?: string | null
          campaign_type?: string | null
          copy_direction?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          source_type?: string | null
          status?: string | null
          subject_line?: string | null
          title: string
          used_at?: string | null
        }
        Update: {
          brand_id?: string
          campaign_info?: string | null
          campaign_type?: string | null
          copy_direction?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          source_type?: string | null
          status?: string | null
          subject_line?: string | null
          title?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idea_bank_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      ideation_sessions: {
        Row: {
          brand_id: string
          created_at: string | null
          id: string
          initial_brief: string | null
          locked_idea: Json | null
          nodes: Json | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string | null
          id?: string
          initial_brief?: string | null
          locked_idea?: Json | null
          nodes?: Json | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string | null
          id?: string
          initial_brief?: string | null
          locked_idea?: Json | null
          nodes?: Json | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideation_sessions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      klaviyo_connections: {
        Row: {
          active_profiles_segment_id: string | null
          api_key: string
          brand_id: string
          cached_lists: Json | null
          cached_segments: Json | null
          cached_stats: Json | null
          connected_at: string | null
          id: string
          klaviyo_account_id: string | null
          klaviyo_account_name: string | null
          last_synced_at: string | null
          quick_stats: Json | null
          sync_error: string | null
          sync_status: string | null
        }
        Insert: {
          active_profiles_segment_id?: string | null
          api_key: string
          brand_id: string
          cached_lists?: Json | null
          cached_segments?: Json | null
          cached_stats?: Json | null
          connected_at?: string | null
          id?: string
          klaviyo_account_id?: string | null
          klaviyo_account_name?: string | null
          last_synced_at?: string | null
          quick_stats?: Json | null
          sync_error?: string | null
          sync_status?: string | null
        }
        Update: {
          active_profiles_segment_id?: string | null
          api_key?: string
          brand_id?: string
          cached_lists?: Json | null
          cached_segments?: Json | null
          cached_stats?: Json | null
          connected_at?: string | null
          id?: string
          klaviyo_account_id?: string | null
          klaviyo_account_name?: string | null
          last_synced_at?: string | null
          quick_stats?: Json | null
          sync_error?: string | null
          sync_status?: string | null
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
      klaviyo_product_store: {
        Row: {
          brand: string | null
          brand_id: string
          categories: string[] | null
          checkout_count: number
          created_at: string
          first_seen: string
          id: string
          image_url: string | null
          is_junk: boolean
          klaviyo_account_id: string
          last_seen: string
          last_synced: string
          order_count: number
          price: number | null
          product_id: string
          product_name: string
          product_url: string | null
          sku: string | null
          updated_at: string
          view_count: number
        }
        Insert: {
          brand?: string | null
          brand_id: string
          categories?: string[] | null
          checkout_count?: number
          created_at?: string
          first_seen?: string
          id?: string
          image_url?: string | null
          is_junk?: boolean
          klaviyo_account_id: string
          last_seen?: string
          last_synced?: string
          order_count?: number
          price?: number | null
          product_id: string
          product_name: string
          product_url?: string | null
          sku?: string | null
          updated_at?: string
          view_count?: number
        }
        Update: {
          brand?: string | null
          brand_id?: string
          categories?: string[] | null
          checkout_count?: number
          created_at?: string
          first_seen?: string
          id?: string
          image_url?: string | null
          is_junk?: boolean
          klaviyo_account_id?: string
          last_seen?: string
          last_synced?: string
          order_count?: number
          price?: number | null
          product_id?: string
          product_name?: string
          product_url?: string | null
          sku?: string | null
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "klaviyo_product_store_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
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
