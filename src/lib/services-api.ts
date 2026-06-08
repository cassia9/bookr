import { supabase } from './supabase'

export interface Service {
  id: string
  name: string
  description?: string
  duration_minutes: number
  price: number
  active: boolean
  store_id: string
  created_at: string
  deleted_at?: string
}

export interface CreateServiceRequest {
  name: string
  description?: string
  duration_minutes: number
  price: number
  active?: boolean
}

export interface UpdateServiceRequest {
  service_id: string
  name?: string
  description?: string
  duration_minutes?: number
  price?: number
  active?: boolean
}

/**
 * 調用 services-crud API
 * @param action 'create' | 'update' | 'delete'
 * @param body 請求體
 */
export async function callServicesAPI(
  action: 'create' | 'update' | 'delete',
  body: any
) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token

  if (!token) {
    throw new Error('未登入，請重新登入')
  }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  const response = await fetch(
    `${baseUrl}/functions/v1/services-crud?action=${action}`,
    {
      method: action === 'delete' ? 'DELETE' : action === 'create' ? 'POST' : 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '請求失敗')
  }

  return await response.json()
}

/**
 * 獲取課程列表（管理員可見全部，含已刪除；普通用戶只見活躍課程）
 */
export async function getServices() {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as Service[]
}

/**
 * 獲取活躍課程列表（前端預約表單使用）
 */
export async function getActiveServices() {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('active', true)
    .is('deleted_at', null)
    .order('name')

  if (error) throw error
  return data as Service[]
}

/**
 * 按 ID 獲取課程
 */
export async function getServiceById(serviceId: string) {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('id', serviceId)
    .single()

  if (error) throw error
  return data as Service
}

/**
 * 新增課程
 */
export async function createService(request: CreateServiceRequest) {
  return callServicesAPI('create', request)
}

/**
 * 編輯課程
 */
export async function updateService(request: UpdateServiceRequest) {
  return callServicesAPI('update', request)
}

/**
 * 刪除課程（軟刪除）
 */
export async function deleteService(serviceId: string) {
  return callServicesAPI('delete', { service_id: serviceId })
}

/**
 * 監聽課程表變化（實時更新）
 */
export function subscribeToServices(callback: (service: Service) => void) {
  return supabase
    .from('services')
    .on('*', (payload) => {
      callback(payload.new as Service)
    })
    .subscribe()
}
