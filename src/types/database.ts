export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
export type UserRole = 'admin' | 'member'

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string
          name: string
          address: string | null
          phone: string | null
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
          reminder_enabled: boolean
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
          type: 'booking_confirmed' | 'reminder' | 'post_session_review' | 'post_session_tips'
          content: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['notification_templates']['Row'], 'id' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['notification_templates']['Insert']>
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
    }
  }
}

// Convenience types for use in components
export type Store = Database['public']['Tables']['stores']['Row']
export type User = Database['public']['Tables']['users']['Row']
export type Practitioner = Database['public']['Tables']['practitioners']['Row']
export type Client = Database['public']['Tables']['clients']['Row']
export type Service = Database['public']['Tables']['services']['Row']
export type Booking = Database['public']['Tables']['bookings']['Row']

export type BookingWithRelations = Booking & {
  client: Client
  practitioner: Practitioner
  service: Service
}
export type ClientStat = Database['public']['Views']['client_stats']['Row']
