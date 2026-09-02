import { supabase } from './supabase'
import {
  getCurrentLineIdToken,
  initializeLineBooking,
  type LineBookingSession,
} from './line/liff'

export type CustomerBookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'

export interface CustomerCenterBooking {
  id: string
  startTime: string
  endTime: string
  status: CustomerBookingStatus
  price: number
  service: {
    id: string
    name: string
    durationMinutes: number
  }
  practitioner: {
    id: string
    name: string
  }
  voucher: null | {
    status: 'reserved' | 'redeemed'
    productName: string
    serviceName: string
  }
}

export interface CustomerCenterVoucherItem {
  id: string
  serviceId: string
  serviceName: string
  totalQuantity: number
  availableQuantity: number
  reservedQuantity: number
  usedQuantity: number
}

export interface CustomerCenterVoucher {
  id: string
  saleNumber: string
  productName: string
  description: string | null
  purchasedOn: string
  expiresOn: string | null
  status: 'active' | 'voided'
  items: CustomerCenterVoucherItem[]
}

export interface CustomerCenterData {
  ok: true
  store: {
    id: string
    name: string
    logoUrl: string | null
    address: string | null
    phone: string | null
    timezone: string
  }
  client: { id: string; name: string }
  bookings: CustomerCenterBooking[]
  vouchers: CustomerCenterVoucher[]
}

interface FunctionErrorData {
  ok?: false
  code?: string
  error?: string
}

export type CustomerCenterLoadResult =
  | { kind: 'ready'; data: CustomerCenterData; session: LineBookingSession }
  | { kind: 'outside_line'; storeName: string }
  | { kind: 'unlinked'; storeName: string }
  | { kind: 'unavailable'; message: string }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function functionErrorData(error: unknown): Promise<FunctionErrorData | null> {
  const context = (error as { context?: unknown } | null)?.context
  if (!(context instanceof Response)) return null
  try {
    return await context.clone().json() as FunctionErrorData
  } catch {
    return null
  }
}

export async function loadCustomerCenter(storeId: string): Promise<CustomerCenterLoadResult> {
  if (!uuidPattern.test(storeId)) {
    return { kind: 'unavailable', message: '無效的客戶中心連結' }
  }

  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('name, liff_id, booking_enabled')
    .eq('id', storeId)
    .maybeSingle()

  if (storeError || !store || !store.booking_enabled) {
    return { kind: 'unavailable', message: '找不到此店家的客戶中心' }
  }
  if (!store.liff_id) {
    return { kind: 'unavailable', message: '店家尚未完成 LINE 客戶中心設定' }
  }

  const session = await initializeLineBooking(store.liff_id)
  if (session.status === 'idle') {
    return { kind: 'outside_line', storeName: store.name }
  }
  if (session.status !== 'connected') {
    return { kind: 'unavailable', message: 'LINE 登入暫時無法使用，請稍後再試' }
  }

  const idToken = getCurrentLineIdToken() || session.idToken
  const { data, error } = await supabase.functions.invoke<CustomerCenterData>(
    'line-customer-center',
    { body: { storeId, idToken } },
  )

  if (error || !data?.ok) {
    const detail = await functionErrorData(error)
    if (detail?.code === 'IDENTITY_NOT_FOUND') {
      return { kind: 'unlinked', storeName: store.name }
    }
    if (detail?.code === 'LINE_TOKEN_REJECTED') {
      return { kind: 'unavailable', message: 'LINE 登入已失效，請關閉後重新開啟' }
    }
    return { kind: 'unavailable', message: '暫時無法讀取客戶資料，請稍後再試' }
  }

  return { kind: 'ready', data, session }
}
