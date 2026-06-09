import { supabase } from './supabase'

/**
 * 調用 practitioners-crud API
 * @param action 'create' | 'update_services' | 'delete'
 * @param body 請求體
 */
export async function callPractitionersAPI(
  action: 'create' | 'update_services' | 'delete',
  body: any
) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token

  if (!token) {
    throw new Error('未登入，請重新登入')
  }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  const response = await fetch(
    `${baseUrl}/functions/v1/practitioners-crud?action=${action}`,
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

  // 204 No Content 沒有響應體
  if (response.status === 204) {
    return null
  }

  return await response.json()
}

/**
 * 調用 practitioner-leaves API
 * @param action 'create' | 'update' | 'delete'
 * @param body 請求體
 */
export async function callPractitionerLeavesAPI(
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
    `${baseUrl}/functions/v1/practitioner-leaves?action=${action}`,
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

  // 204 No Content 沒有響應體
  if (response.status === 204) {
    return null
  }

  return await response.json()
}
