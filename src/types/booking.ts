/**
 * 預約管理模塊 - 類型定義
 * 2026-06-10
 */

export interface Client {
  id: string
  store_id: string
  name: string
  phone?: string
  email?: string
  notes?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface Booking {
  id: string
  store_id: string
  practitioner_id: string
  client_id: string
  service_id: string
  start_time: string
  end_time: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  notes?: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

export interface BookingFormData {
  client_id: string
  practitioner_id: string
  service_id: string
  start_time: string
  end_time: string
  notes: string
}

export interface CreateClientData {
  name: string
  phone?: string
  notes?: string
}

export type BookingStep = 1 | 2 | 3 | 4

export interface BookingFormState {
  step: BookingStep
  formData: Partial<BookingFormData>
  selectedClient: Client | null
  selectedPractitioner: any | null
  selectedService: any | null
  isLoading: boolean
  error: string | null
  hasConflict: boolean
}
