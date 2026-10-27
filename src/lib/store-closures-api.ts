import { supabase } from './supabase'
import type { Json, StoreClosure, StoreClosureCategory } from '../types/database'

export interface SaveStoreClosureInput {
  id?: string
  startDate: string
  endDate: string
  category: StoreClosureCategory
  publicLabel: string
  internalNote?: string
}

export interface PublicStoreClosure {
  start_date: string
  end_date: string
  public_label: string
}

interface ClosureRpcResult {
  ok: boolean
  error?: string
  id?: string
  conflict_count?: number
}

function parseResult(value: Json): ClosureRpcResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('伺服器回傳格式不正確')
  }
  return value as ClosureRpcResult
}

function assertOk(value: Json): ClosureRpcResult {
  const result = parseResult(value)
  if (!result.ok) throw new Error(result.error ?? '操作失敗')
  return result
}

export async function getStoreClosures(): Promise<StoreClosure[]> {
  const { data, error } = await supabase
    .from('store_closures')
    .select('*')
    .is('deleted_at', null)
    .order('start_date', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function saveStoreClosure(input: SaveStoreClosureInput): Promise<ClosureRpcResult> {
  const { data, error } = await supabase.rpc('save_store_closure', {
    p_closure_id: input.id ?? null,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_category: input.category,
    p_public_label: input.publicLabel.trim(),
    p_internal_note: input.internalNote?.trim() || null,
  })

  if (error) throw error
  return assertOk(data)
}

export async function archiveStoreClosure(id: string): Promise<void> {
  const { data, error } = await supabase.rpc('archive_store_closure', {
    p_closure_id: id,
  })

  if (error) throw error
  assertOk(data)
}

export async function getPublicStoreClosures(
  storeId: string,
  startDate: string,
  endDate: string,
): Promise<PublicStoreClosure[]> {
  const { data, error } = await supabase.rpc('get_public_store_closures', {
    p_store_id: storeId,
    p_start_date: startDate,
    p_end_date: endDate,
  })

  if (error) throw error
  return data ?? []
}
