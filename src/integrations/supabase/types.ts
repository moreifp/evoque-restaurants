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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_consent_logs: {
        Row: {
          allowed: boolean
          created_at: string
          device_info: string | null
          id: string
          policy_version: string
          scope: string
          user_id: string
        }
        Insert: {
          allowed: boolean
          created_at?: string
          device_info?: string | null
          id?: string
          policy_version?: string
          scope: string
          user_id: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          device_info?: string | null
          id?: string
          policy_version?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      album_entries: {
        Row: {
          album_id: string
          entry_id: string
        }
        Insert: {
          album_id: string
          entry_id: string
        }
        Update: {
          album_id?: string
          entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_entries_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_entries_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "restaurant_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      albums: {
        Row: {
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          id: string
          title: string
          updated_at: string | null
          user_id: string
          visibility: string | null
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          title: string
          updated_at?: string | null
          user_id: string
          visibility?: string | null
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          title?: string
          updated_at?: string | null
          user_id?: string
          visibility?: string | null
        }
        Relationships: []
      }
      content_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          status: string
          target_id: string
          target_type: string
          target_user_id: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: string
          target_id: string
          target_type: string
          target_user_id: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
          target_id?: string
          target_type?: string
          target_user_id?: string
        }
        Relationships: []
      }
      entry_tags: {
        Row: {
          entry_id: string
          tag_id: string
        }
        Insert: {
          entry_id: string
          tag_id: string
        }
        Update: {
          entry_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_tags_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "restaurant_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_notifications: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          read: boolean
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          read?: boolean
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          read?: boolean
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      plan_slots: {
        Row: {
          created_at: string
          date: string
          google_place_id: string | null
          has_reservation: boolean
          id: string
          meal: string
          notes: string | null
          plan_id: string
          reservation_code: string | null
          reservation_required: boolean
          restaurant_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          google_place_id?: string | null
          has_reservation?: boolean
          id?: string
          meal: string
          notes?: string | null
          plan_id: string
          reservation_code?: string | null
          reservation_required?: boolean
          restaurant_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          google_place_id?: string | null
          has_reservation?: boolean
          id?: string
          meal?: string
          notes?: string | null
          plan_id?: string
          reservation_code?: string | null
          reservation_required?: boolean
          restaurant_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          city: string
          created_at: string
          end_date: string | null
          id: string
          instructions: string | null
          intake_json: Json | null
          recommendations_json: Json | null
          schedule_json: Json | null
          start_date: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          created_at?: string
          end_date?: string | null
          id?: string
          instructions?: string | null
          intake_json?: Json | null
          recommendations_json?: Json | null
          schedule_json?: Json | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string
          created_at?: string
          end_date?: string | null
          id?: string
          instructions?: string | null
          intake_json?: Json | null
          recommendations_json?: Json | null
          schedule_json?: Json | null
          start_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_consent: boolean
          ai_consent_scopes: string[] | null
          ai_consent_timestamp: string | null
          ai_consent_version: string | null
          avatar_url: string | null
          biometric_enabled: boolean | null
          created_at: string | null
          display_name: string | null
          id: string
          notification_preferences: Json | null
          profile_visibility: string
          terms_accepted_at: string | null
          updated_at: string | null
        }
        Insert: {
          ai_consent?: boolean
          ai_consent_scopes?: string[] | null
          ai_consent_timestamp?: string | null
          ai_consent_version?: string | null
          avatar_url?: string | null
          biometric_enabled?: boolean | null
          created_at?: string | null
          display_name?: string | null
          id: string
          notification_preferences?: Json | null
          profile_visibility?: string
          terms_accepted_at?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_consent?: boolean
          ai_consent_scopes?: string[] | null
          ai_consent_timestamp?: string | null
          ai_consent_version?: string | null
          avatar_url?: string | null
          biometric_enabled?: boolean | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          notification_preferences?: Json | null
          profile_visibility?: string
          terms_accepted_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string | null
          device_name: string | null
          id: string
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_name?: string | null
          id?: string
          platform: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_name?: string | null
          id?: string
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      receipt_items: {
        Row: {
          created_at: string | null
          id: string
          item_type: string
          line_total: number | null
          name: string
          quantity: number | null
          receipt_id: string
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_type: string
          line_total?: number | null
          name: string
          quantity?: number | null
          receipt_id: string
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          item_type?: string
          line_total?: number | null
          name?: string
          quantity?: number | null
          receipt_id?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string | null
          currency: string | null
          entry_id: string
          id: string
          ocr_raw_text: string | null
          photo_url: string
          service_fee: number | null
          subtotal: number | null
          tax: number | null
          total: number | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          entry_id: string
          id?: string
          ocr_raw_text?: string | null
          photo_url: string
          service_fee?: number | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          entry_id?: string
          id?: string
          ocr_raw_text?: string | null
          photo_url?: string
          service_fee?: number | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "restaurant_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_entries: {
        Row: {
          companions: string | null
          created_at: string | null
          description: string | null
          google_place_id: string | null
          id: string
          is_draft: boolean
          is_public: boolean | null
          location_address: string | null
          location_lat: number | null
          location_lng: number | null
          notes: string | null
          origin_scheduled_visit_id: string | null
          rating: number | null
          restaurant_name: string
          updated_at: string | null
          user_id: string
          visit_date: string
          voice_note_url: string | null
          voice_transcription: string | null
        }
        Insert: {
          companions?: string | null
          created_at?: string | null
          description?: string | null
          google_place_id?: string | null
          id?: string
          is_draft?: boolean
          is_public?: boolean | null
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          origin_scheduled_visit_id?: string | null
          rating?: number | null
          restaurant_name: string
          updated_at?: string | null
          user_id: string
          visit_date: string
          voice_note_url?: string | null
          voice_transcription?: string | null
        }
        Update: {
          companions?: string | null
          created_at?: string | null
          description?: string | null
          google_place_id?: string | null
          id?: string
          is_draft?: boolean
          is_public?: boolean | null
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          origin_scheduled_visit_id?: string | null
          rating?: number | null
          restaurant_name?: string
          updated_at?: string | null
          user_id?: string
          visit_date?: string
          voice_note_url?: string | null
          voice_transcription?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_entries_origin_scheduled_visit_id_fkey"
            columns: ["origin_scheduled_visit_id"]
            isOneToOne: false
            referencedRelation: "scheduled_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_notes: {
        Row: {
          created_at: string
          google_place_id: string | null
          id: string
          rating_user: number | null
          restaurant_name: string
          summary_240: string | null
          tags: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          google_place_id?: string | null
          id?: string
          rating_user?: number | null
          restaurant_name: string
          summary_240?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          google_place_id?: string | null
          id?: string
          rating_user?: number | null
          restaurant_name?: string
          summary_240?: string | null
          tags?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      restaurant_photos: {
        Row: {
          caption: string | null
          created_at: string | null
          entry_id: string
          id: string
          menu_translation: string | null
          photo_url: string
          rating: number | null
          type: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          entry_id: string
          id?: string
          menu_translation?: string | null
          photo_url: string
          rating?: number | null
          type?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          entry_id?: string
          id?: string
          menu_translation?: string | null
          photo_url?: string
          rating?: number | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_photos_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "restaurant_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_social_links: {
        Row: {
          created_at: string | null
          entry_id: string
          id: string
          platform: string
          title: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          entry_id: string
          id?: string
          platform: string
          title?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          entry_id?: string
          id?: string
          platform?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_social_links_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "restaurant_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_visits: {
        Row: {
          ai_plan_id: string | null
          booking_ref: string | null
          city: string
          created_at: string | null
          end_datetime: string
          google_place_id: string | null
          id: string
          local_notification_id: string | null
          location_address: string | null
          maps_url: string | null
          meal_type: string
          notes: string | null
          party_size: number | null
          phone: string | null
          restaurant_name: string
          source: string
          start_datetime: string
          status: string
          timezone: string | null
          updated_at: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          ai_plan_id?: string | null
          booking_ref?: string | null
          city: string
          created_at?: string | null
          end_datetime: string
          google_place_id?: string | null
          id?: string
          local_notification_id?: string | null
          location_address?: string | null
          maps_url?: string | null
          meal_type?: string
          notes?: string | null
          party_size?: number | null
          phone?: string | null
          restaurant_name: string
          source?: string
          start_datetime: string
          status?: string
          timezone?: string | null
          updated_at?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          ai_plan_id?: string | null
          booking_ref?: string | null
          city?: string
          created_at?: string | null
          end_datetime?: string
          google_place_id?: string | null
          id?: string
          local_notification_id?: string | null
          location_address?: string | null
          maps_url?: string | null
          meal_type?: string
          notes?: string | null
          party_size?: number | null
          phone?: string | null
          restaurant_name?: string
          source?: string
          start_datetime?: string
          status?: string
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_visits_ai_plan_id_fkey"
            columns: ["ai_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      share_tokens: {
        Row: {
          clicks: number
          created_at: string
          entry_id: string
          expires_at: string | null
          id: string
          token: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          entry_id: string
          expires_at?: string | null
          id?: string
          token: string
        }
        Update: {
          clicks?: number
          created_at?: string
          entry_id?: string
          expires_at?: string | null
          id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_tokens_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "restaurant_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          label: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          label: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          label?: string
        }
        Relationships: []
      }
      upload_error_logs: {
        Row: {
          attempt_number: number | null
          category: string | null
          connection_type: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          error_type: string
          file_name: string | null
          file_size: number | null
          file_type: string | null
          id: string
          is_native: boolean | null
          metadata: Json | null
          platform: string | null
          user_id: string | null
          was_retry_successful: boolean | null
        }
        Insert: {
          attempt_number?: number | null
          category?: string | null
          connection_type?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          error_type: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_native?: boolean | null
          metadata?: Json | null
          platform?: string | null
          user_id?: string | null
          was_retry_successful?: boolean | null
        }
        Update: {
          attempt_number?: number | null
          category?: string | null
          connection_type?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          error_type?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_native?: boolean | null
          metadata?: Json | null
          platform?: string | null
          user_id?: string | null
          was_retry_successful?: boolean | null
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      user_follows: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
          status?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_profile_visibility: {
        Args: { target_user_id: string }
        Returns: string
      }
      get_public_profiles: {
        Args: { user_ids: string[] }
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          id: string
          profile_visibility: string
        }[]
      }
      is_accepted_follower: {
        Args: { follower: string; target: string }
        Returns: boolean
      }
      is_blocked_by: {
        Args: { blocked: string; blocker: string }
        Returns: boolean
      }
      search_users_fuzzy: {
        Args: {
          exclude_user_id: string
          max_results?: number
          search_term: string
        }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          similarity_score: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
