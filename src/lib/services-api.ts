import { supabase } from './supabase'

export interface Service {
  id: string
  name: string
  description?: string
  duration_minutes: number
  price: number
  active: boolean
  category_id: string | null
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
  category_id?: string | null
}

export interface UpdateServiceRequest {
  service_id: string
  name?: string
  description?: string
  duration_minutes?: number
  price?: number
  active?: boolean
  category_id?: string | null
}

export interface ServiceCategory {
  id: string
  store_id: string
  name: string
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/**
 * 調用 services-crud API
 * @param action 'create' | 'update' | 'delete'
 * @param body 請求體
 */
export async function callServicesAPI(
  action: 'create' | 'update' | 'delete',
  body: CreateServiceRequest | UpdateServiceRequest | { service_id: string },
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

export async function getServiceCategories() {
  const { data, error } = await supabase
    .from('service_categories')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return data as ServiceCategory[]
}

export async function createServiceCategory(
  storeId: string,
  input: Pick<ServiceCategory, 'name' | 'sort_order' | 'active'>,
) {
  const { data, error } = await supabase
    .from('service_categories')
    .insert({
      store_id: storeId,
      name: input.name.trim(),
      sort_order: input.sort_order,
      active: input.active,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as ServiceCategory
}

export async function updateServiceCategory(
  categoryId: string,
  input: Partial<Pick<ServiceCategory, 'name' | 'sort_order' | 'active'>>,
) {
  const payload = {
    ...input,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
  }
  const { data, error } = await supabase
    .from('service_categories')
    .update(payload)
    .eq('id', categoryId)
    .select('*')
    .single()

  if (error) throw error
  return data as ServiceCategory
}

export async function saveServiceCategories(
  storeId: string,
  categories: Array<Pick<ServiceCategory, 'id' | 'name' | 'sort_order' | 'active'>>,
) {
  if (categories.length === 0) return []

  const { data, error } = await supabase
    .from('service_categories')
    .upsert(
      categories.map(category => ({
        id: category.id,
        store_id: storeId,
        name: category.name.trim(),
        sort_order: category.sort_order,
        active: category.active,
      })),
      { onConflict: 'id' },
    )
    .select('*')

  if (error) throw error
  return data as ServiceCategory[]
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
