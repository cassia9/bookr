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
          line_user_id: string | null
          notes: string | null
          store_id: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id' | 'created_at'>
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
