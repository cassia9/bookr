export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
export type UserRole = 'admin' | 'member'
export type NotificationType =
  | 'booking_received'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_rescheduled'
  | 'reminder'
  | 'test'
  | 'post_session_review'
  | 'post_session_tips'

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string
          name: string
          address: string | null
          phone: string | null
          open_time: string
          close_time: string
          default_buffer_minutes: number
          logo_url: string | null
          liff_id: string | null
          line_login_channel_id: string | null
          booking_confirmation_mode: 'manual' | 'auto'
          booking_enabled: boolean
          store_code: string | null
          booking_slug: string | null
          timezone: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['stores']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['stores']['Insert']>
      }
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          role: UserRole
          practitioner_id: string | null
          store_id: string
          created_at: string
          invited_by: string | null
          invited_at: string | null
          deleted_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      practitioners: {
        Row: {
          id: string
          full_name: string
          title: string | null
          phone: string | null
          color: string
          store_id: string
          active: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['practitioners']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['practitioners']['Insert']>
      }
      clients: {
        Row: {
          id: string
          full_name: string
          phone: string
          email: string | null
          gender: 'male' | 'female' | 'unknown'
          line_user_id: string | null
          notes: string | null
          store_id: string
          created_at: string
          updated_at: string | null
          deleted_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id' | 'created_at' | 'updated_at' | 'deleted_at'>
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
      }
      services: {
        Row: {
          id: string
          name: string
          description: string | null
          duration_minutes: number
          price: number
          active: boolean
          store_id: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['services']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['services']['Insert']>
      }
      bookings: {
        Row: {
          id: string
          client_id: string
          practitioner_id: string
          service_id: string
          start_time: string
          end_time: string
          status: BookingStatus
          notes: string | null
          store_id: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['bookings']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['bookings']['Insert']>
      }
      notification_settings: {
        Row: {
          id: string
          store_id: string
          booking_confirmed_enabled: boolean
          booking_received_enabled: boolean
          booking_cancelled_enabled: boolean
          booking_rescheduled_enabled: boolean
          reminder_enabled: boolean
          reminder_minutes_before: number
          post_session_review_enabled: boolean
          post_session_tips_enabled: boolean
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['notification_settings']['Row'], 'id' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['notification_settings']['Insert']>
      }
      notification_templates: {
        Row: {
          id: string
          store_id: string
          type: NotificationType
          content: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['notification_templates']['Row'], 'id' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['notification_templates']['Insert']>
      }
      pending_invitations: {
        Row: {
          id: string
          store_id: string
          email: string
          role: UserRole
          token: string
          created_by: string
          created_at: string
          expires_at: string
          accepted_at: string | null
          accepted_user_id: string | null
          processing_at: string | null
          email_sending_at: string | null
          email_sent_at: string | null
          email_send_attempts: number
          email_last_error: string | null
        }
        Insert: {
          id?: string
          store_id: string
          email: string
          role?: UserRole
          token?: string
          created_by: string
          created_at?: string
          expires_at?: string
          accepted_at?: string | null
          accepted_user_id?: string | null
          processing_at?: string | null
          email_sending_at?: string | null
          email_sent_at?: string | null
          email_send_attempts?: number
          email_last_error?: string | null
        }
        Update: Partial<Database['public']['Tables']['pending_invitations']['Insert']>
      }
      customer_channel_identities: {
        Row: {
          id: string
          store_id: string
          client_id: string
          channel: 'line' | 'messenger' | 'instagram'
          provider_account_id: string
          provider_user_id: string
          display_name: string | null
          avatar_url: string | null
          verified_at: string
          last_seen_at: string
          created_at: string
          updated_at: string
          deleted_at: string | null
          friend_status: 'unknown' | 'friend' | 'not_friend'
          friend_status_updated_at: string | null
          notifications_reachable: boolean | null
        }
        Insert: {
          id?: string
          store_id: string
          client_id: string
          channel: 'line' | 'messenger' | 'instagram'
          provider_account_id: string
          provider_user_id: string
          display_name?: string | null
          avatar_url?: string | null
          verified_at?: string
          last_seen_at?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
          friend_status?: 'unknown' | 'friend' | 'not_friend'
          friend_status_updated_at?: string | null
          notifications_reachable?: boolean | null
        }
        Update: Partial<Database['public']['Tables']['customer_channel_identities']['Insert']>
      }
      store_channel_connections: {
        Row: {
          id: string
          store_id: string
          channel: 'line' | 'messenger' | 'instagram'
          provider_id: string | null
          provider_name: string | null
          official_account_name: string | null
          official_account_basic_id: string | null
          login_channel_id: string
          liff_id: string
          connection_version: number
          status: 'active' | 'disconnected'
          connected_at: string
          disconnected_at: string | null
          created_by: string | null
          disconnected_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          channel: 'line' | 'messenger' | 'instagram'
          provider_id?: string | null
          provider_name?: string | null
          official_account_name?: string | null
          official_account_basic_id?: string | null
          login_channel_id: string
          liff_id: string
          connection_version?: number
          status?: 'active' | 'disconnected'
          connected_at?: string
          disconnected_at?: string | null
          created_by?: string | null
          disconnected_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['store_channel_connections']['Insert']>
      }
      line_notification_outbox: {
        Row: {
          id: string
          store_id: string
          connection_id: string
          booking_id: string | null
          client_id: string
          identity_id: string
          event_type: NotificationType
          idempotency_key: string
          payload_snapshot: Json
          status: 'pending' | 'processing' | 'retry' | 'sent' | 'skipped' | 'dead'
          available_at: string
          attempt_count: number
          max_attempts: number
          locked_at: string | null
          sent_at: string | null
          skipped_at: string | null
          error_code: string | null
          http_status: number | null
          line_request_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
      }
    }
    Views: {
      client_stats: {
        Row: {
          id: string
          store_id: string
          full_name: string
          phone: string
          email: string | null
          notes: string | null
          created_at: string
          updated_at: string | null
          booking_count: number
          completed_count: number
          cancelled_count: number
          total_spent: number
          avg_spent: number
          first_booking_at: string | null
          last_booking_at: string | null
          upcoming_count: number
        }
      }
    }
    Functions: {
      validate_invitation_token: {
        Args: { p_token: string }
        Returns: Array<{
          valid: boolean
          store_id: string
          email: string
          role: UserRole
          message: string
        }>
      }
      search_clients: {
        Args: { p_query: string; p_store_id?: string; p_limit?: number }
        Returns: Array<{ id: string; full_name: string; phone: string; email: string | null }>
      }
      get_client_bookings: {
        Args: { p_client_id: string; p_limit?: number }
        Returns: Array<{
          id: string
          start_time: string
          end_time: string
          status: BookingStatus
          price: number
          notes: string | null
          practitioner_name: string
          service_name: string
          service_duration: number
        }>
      }
      manage_store_line_connection: {
        Args: {
          p_action: 'connect' | 'disconnect'
          p_provider_id?: string | null
          p_provider_name?: string | null
          p_official_account_name?: string | null
          p_official_account_basic_id?: string | null
          p_line_login_channel_id?: string | null
          p_liff_id?: string | null
        }
        Returns: Json
      }
      get_store_line_messaging_status: {
        Args: Record<string, never>
        Returns: Array<{
          connection_id: string
          provider_id: string
          messaging_channel_id: string
          bot_basic_id: string | null
          bot_display_name: string
          status: 'active' | 'disconnected' | 'error'
          verified_at: string
          webhook_path: string
        }>
      }
    }
  }
}

// Convenience types for use in components
export type Store = Database['public']['Tables']['stores']['Row']
export type User = Database['public']['Tables']['users']['Row']
export type Practitioner = Database['public']['Tables']['practitioners']['Row']
export type Client = Database['public']['Tables']['clients']['Row']
export type StoreChannelConnection = Database['public']['Tables']['store_channel_connections']['Row']
export type Service = Database['public']['Tables']['services']['Row']
export type Booking = Database['public']['Tables']['bookings']['Row']

export type BookingWithRelations = Booking & {
  client: Client
  practitioner: Practitioner
  service: Service
}
export type ClientStat = Database['public']['Views']['client_stats']['Row']
