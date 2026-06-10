/**
 * 預約管理 API 函數
 * 2026-06-10
 */

import { supabase } from '@/lib/supabase'
import { Client, CreateClientData, Booking, BookingFormData } from '@/types/booking'

/**
 * 搜尋客戶
 */
export async function searchClients(
  storeId: string,
  query: string,
  limit: number = 5
): Promise<Client[]> {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('store_id', storeId)
      .is('deleted_at', null)
      .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(limit)

    if (error) throw error
    return data || []
  } catch (err) {
    console.error('Failed to search clients:', err)
    throw err
  }
}

/**
 * 新增客戶
 */
export async function createClient(
  storeId: string,
  data: CreateClientData
): Promise<Client> {
  try {
    const { data: newClient, error } = await supabase
      .from('clients')
      .insert({
        store_id: storeId,
        name: data.name,
        phone: data.phone || null,
        notes: data.notes || null,
      })
      .select()
      .single()

    if (error) throw error
    return newClient
  } catch (err) {
    console.error('Failed to create client:', err)
    throw err
  }
}

/**
 * 獲取老師可提供的課程
 */
export async function getPractitionerServices(
  practitionerId: string
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('practitioner_services')
      .select(`
        service_id,
        services (
          id,
          name,
          duration_minutes,
          price
        )
      `)
      .eq('practitioner_id', practitionerId)

    if (error) throw error

    return data?.map(item => item.services).filter(Boolean) || []
  } catch (err) {
    console.error('Failed to get practitioner services:', err)
    throw err
  }
}

/**
 * 檢查預約時段衝突
 * @param storeId 店家 ID（用於多租戶隔離）
 * @param practitionerId 老師 ID
 * @param startTime 預約開始時間
 * @param endTime 預約結束時間
 * @param excludeBookingId 排除的預約 ID（編輯時使用）
 */
export async function checkBookingConflict(
  storeId: string,
  practitionerId: string,
  startTime: string,
  endTime: string,
  excludeBookingId?: string
): Promise<boolean> {
  try {
    let query = supabase
      .from('bookings')
      .select('id', { count: 'exact', head: 0 })
      .eq('store_id', storeId)
      .eq('practitioner_id', practitionerId)
      .in('status', ['pending', 'confirmed'])
      .lt('start_time', endTime)
      .gt('end_time', startTime)
      .is('deleted_at', null)

    if (excludeBookingId) {
      query = query.neq('id', excludeBookingId)
    }

    const { count, error } = await query

    if (error) throw error
    return (count || 0) > 0
  } catch (err) {
    console.error('Failed to check booking conflict:', err)
    throw err
  }
}

/**
 * 新增預約
 */
export async function createBooking(
  storeId: string,
  data: BookingFormData
): Promise<Booking> {
  try {
    // 檢查衝突
    const hasConflict = await checkBookingConflict(
      storeId,
      data.practitioner_id,
      data.start_time,
      data.end_time
    )

    if (hasConflict) {
      throw new Error('該時段已有預約，請選擇其他時間')
    }

    const { data: newBooking, error } = await supabase
      .from('bookings')
      .insert({
        store_id: storeId,
        practitioner_id: data.practitioner_id,
        client_id: data.client_id,
        service_id: data.service_id,
        start_time: data.start_time,
        end_time: data.end_time,
        notes: data.notes || null,
        status: 'pending',
      })
      .select()
      .single()

    if (error) throw error
    return newBooking
  } catch (err) {
    console.error('Failed to create booking:', err)
    throw err
  }
}

/**
 * 更新預約
 */
export async function updateBooking(
  bookingId: string,
  data: Partial<BookingFormData>
): Promise<Booking> {
  try {
    // 如果改變了時間，檢查衝突
    if (data.start_time && data.end_time) {
      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('practitioner_id, store_id')
        .eq('id', bookingId)
        .single()

      if (existingBooking) {
        const hasConflict = await checkBookingConflict(
          existingBooking.store_id,
          existingBooking.practitioner_id,
          data.start_time,
          data.end_time,
          bookingId
        )

        if (hasConflict) {
          throw new Error('該時段已有預約，請選擇其他時間')
        }
      }
    }

    const { data: updatedBooking, error } = await supabase
      .from('bookings')
      .update(data)
      .eq('id', bookingId)
      .select()
      .single()

    if (error) throw error
    return updatedBooking
  } catch (err) {
    console.error('Failed to update booking:', err)
    throw err
  }
}

/**
 * 刪除預約（軟刪除）
 */
export async function deleteBooking(bookingId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('bookings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', bookingId)

    if (error) throw error
  } catch (err) {
    console.error('Failed to delete booking:', err)
    throw err
  }
}

/**
 * 獲取老師的可用時段
 * @param practitionerId 老師 ID
 * @param date 日期（YYYY-MM-DD）
 */
export async function getAvailableTimeSlots(
  practitionerId: string,
  date: string
): Promise<{ start: string; end: string }[]> {
  try {
    // 獲取該日期的所有預約
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('start_time, end_time')
      .eq('practitioner_id', practitionerId)
      .gte('start_time', `${date}T00:00:00`)
      .lt('start_time', `${date}T23:59:59`)
      .in('status', ['pending', 'confirmed'])
      .is('deleted_at', null)

    if (error) throw error

    // TODO: 根據老師的可用時段設定和已預約時段，計算可用時段
    // 這裡需要整合 availability 表的數據
    return []
  } catch (err) {
    console.error('Failed to get available time slots:', err)
    throw err
  }
}
