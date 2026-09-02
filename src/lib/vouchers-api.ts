import { supabase } from './supabase'
import type {
  ClientVoucher,
  ClientVoucherItem,
  Json,
  VoucherProduct,
  VoucherProductItem,
} from '../types/database'

export interface VoucherProductItemWithService extends VoucherProductItem {
  services: {
    id: string
    name: string
    duration_minutes: number
    price: number
  } | null
}

export interface VoucherProductWithItems extends VoucherProduct {
  voucher_product_items: VoucherProductItemWithService[]
}

export interface ClientVoucherWithItems extends ClientVoucher {
  client_voucher_items: ClientVoucherItem[]
}

export interface VoucherSaleWithRelations extends ClientVoucherWithItems {
  clients: {
    id: string
    full_name: string
    phone: string
  } | null
}

export interface SaveVoucherProductInput {
  id?: string
  name: string
  description?: string
  sellingPrice: number
  validityDays: number | null
  active: boolean
  items: Array<{ serviceId: string; quantity: number }>
}

export interface SellVoucherInput {
  productId: string
  clientId: string
  purchasedOn: string
  paidAmount: number | null
  paymentMethod: 'cash' | 'transfer' | 'card' | 'other'
  notes?: string
}

interface RpcResult {
  ok: boolean
  error?: string
  id?: string
  sale_number?: string
  expires_on?: string | null
  available_quantity?: number
}

function parseRpcResult(value: Json): RpcResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('伺服器回傳格式不正確')
  }

  return value as RpcResult
}

function assertOk(value: Json): RpcResult {
  const result = parseRpcResult(value)
  if (!result.ok) throw new Error(result.error ?? '操作失敗')
  return result
}

export async function getVoucherProducts(): Promise<VoucherProductWithItems[]> {
  const { data, error } = await supabase
    .from('voucher_products')
    .select(`
      *,
      voucher_product_items (
        *,
        services (id, name, duration_minutes, price)
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as VoucherProductWithItems[]
}

export async function saveVoucherProduct(input: SaveVoucherProductInput): Promise<string> {
  const { data, error } = await supabase.rpc('save_voucher_product', {
    p_product_id: input.id ?? null,
    p_name: input.name.trim(),
    p_description: input.description?.trim() || null,
    p_selling_price: input.sellingPrice,
    p_validity_days: input.validityDays,
    p_active: input.active,
    p_items: input.items.map(item => ({
      service_id: item.serviceId,
      quantity: item.quantity,
    })),
  })

  if (error) throw error
  const result = assertOk(data)
  if (!result.id) throw new Error('商品券方案未建立')
  return result.id
}

export async function archiveVoucherProduct(productId: string): Promise<void> {
  const { data, error } = await supabase.rpc('archive_voucher_product', {
    p_product_id: productId,
  })

  if (error) throw error
  assertOk(data)
}

export async function sellVoucher(input: SellVoucherInput): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('sell_voucher_product', {
    p_product_id: input.productId,
    p_client_id: input.clientId,
    p_purchased_on: input.purchasedOn,
    p_paid_amount: input.paidAmount,
    p_payment_method: input.paymentMethod,
    p_notes: input.notes?.trim() || null,
  })

  if (error) throw error
  return assertOk(data)
}

export async function getVoucherSales(): Promise<VoucherSaleWithRelations[]> {
  const { data, error } = await supabase
    .from('client_vouchers')
    .select(`
      *,
      clients (id, full_name, phone),
      client_voucher_items (*)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as VoucherSaleWithRelations[]
}

export async function getClientVouchers(clientId: string): Promise<ClientVoucherWithItems[]> {
  const { data, error } = await supabase
    .from('client_vouchers')
    .select('*, client_voucher_items (*)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as ClientVoucherWithItems[]
}

export async function voidClientVoucher(voucherId: string, reason: string): Promise<void> {
  const { data, error } = await supabase.rpc('void_client_voucher', {
    p_client_voucher_id: voucherId,
    p_reason: reason.trim(),
  })

  if (error) throw error
  assertOk(data)
}

export async function adjustClientVoucherItem(
  itemId: string,
  quantityDelta: number,
  reason: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('adjust_client_voucher_item', {
    p_client_voucher_item_id: itemId,
    p_quantity_delta: quantityDelta,
    p_reason: reason.trim(),
  })

  if (error) throw error
  return assertOk(data).available_quantity ?? 0
}

export function getAvailableQuantity(item: ClientVoucherItem): number {
  return item.total_quantity + item.adjustment_quantity
    - item.reserved_quantity - item.used_quantity
}
