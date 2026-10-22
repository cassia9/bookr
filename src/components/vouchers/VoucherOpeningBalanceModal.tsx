import { useMemo, useState } from 'react'
import { ArchiveRestore } from 'lucide-react'
import {
  importVoucherOpeningBalance,
  type VoucherProductWithItems,
} from '../../lib/vouchers-api'
import { parseIntegerInput } from '../../lib/numeric-input'
import Button from '../ui/Button'
import ClientCombobox from '../ui/ClientCombobox'
import FormField from '../ui/FormField'
import Input from '../ui/Input'
import Modal from '../ui/Modal'
import Select from '../ui/Select'
import Textarea from '../ui/Textarea'
import { toast } from '../ui/Snackbar'
import type { VoucherClientOption } from './VoucherSaleModal'

interface ItemBalance {
  serviceId: string
  serviceName: string
  totalQuantity: string
  usedQuantity: string
}

interface OpeningForm {
  clientId: string
  productId: string
  purchasedOn: string
  expiresOn: string
  paidAmount: string
  importNotes: string
  items: ItemBalance[]
}

const today = () => new Date().toLocaleDateString('en-CA')

function itemsFromProduct(product: VoucherProductWithItems | undefined): ItemBalance[] {
  return (product?.voucher_product_items ?? []).map(item => ({
    serviceId: item.service_id,
    serviceName: item.services?.name ?? '課程已下架',
    totalQuantity: String(item.quantity),
    usedQuantity: '0',
  }))
}

function blankForm(products: VoucherProductWithItems[]): OpeningForm {
  const first = products.find(product => !product.deleted_at)
  return {
    clientId: '',
    productId: first?.id ?? '',
    purchasedOn: today(),
    expiresOn: '',
    paidAmount: '0',
    importNotes: '',
    items: itemsFromProduct(first),
  }
}

function operationError(error: unknown) {
  const raw = error instanceof Error ? error.message : '操作失敗'
  const messages: Record<string, string> = {
    FORBIDDEN: '只有管理員可以匯入期初商品券',
    INVALID_INPUT: '請確認客戶、日期、金額與移轉說明',
    INVALID_ITEMS: '堂數格式錯誤；已使用堂數不可超過原始堂數',
    DUPLICATE_SERVICE: '同一課程不可重複',
    PRODUCT_NOT_FOUND: '找不到商品券方案，請重新整理',
    CLIENT_NOT_FOUND: '找不到客戶，請重新選擇',
    PRODUCT_ITEMS_MISMATCH: '課程內容與商品券方案不一致，請重新選擇方案',
  }
  return messages[raw] ?? raw
}

export default function VoucherOpeningBalanceModal({
  open,
  products,
  clients,
  onClose,
  onSaved,
}: {
  open: boolean
  products: VoucherProductWithItems[]
  clients: VoucherClientOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const availableProducts = products.filter(product => !product.deleted_at)
  const [form, setForm] = useState<OpeningForm>(() => blankForm(availableProducts))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const totals = useMemo(() => form.items.reduce((result, item) => ({
    total: result.total + (Number(item.totalQuantity) || 0),
    used: result.used + (Number(item.usedQuantity) || 0),
  }), { total: 0, used: 0 }), [form.items])

  function chooseProduct(productId: string) {
    const product = availableProducts.find(entry => entry.id === productId)
    setForm(current => ({
      ...current,
      productId,
      items: itemsFromProduct(product),
    }))
    setErrors(current => ({ ...current, productId: '', items: '' }))
  }

  function updateItem(serviceId: string, field: 'totalQuantity' | 'usedQuantity', value: string) {
    setForm(current => ({
      ...current,
      items: current.items.map(item => item.serviceId === serviceId
        ? { ...item, [field]: value }
        : item),
    }))
    setErrors(current => ({ ...current, items: '' }))
  }

  function validate() {
    const next: Record<string, string> = {}
    const paidAmount = parseIntegerInput(form.paidAmount)
    if (!form.clientId) next.clientId = '請選擇客戶'
    if (!form.productId) next.productId = '請選擇商品券方案'
    if (!form.purchasedOn) next.purchasedOn = '請填寫原購買日期'
    if (form.expiresOn && form.expiresOn < form.purchasedOn) next.expiresOn = '到期日不可早於購買日'
    if (paidAmount === null || paidAmount > 2147483647) next.paidAmount = '歷史實收必須是有效整數'
    if (!form.importNotes.trim()) next.importNotes = '請填寫移轉依據，方便日後查核'
    if (form.items.some(item => {
      const total = parseIntegerInput(item.totalQuantity)
      const used = parseIntegerInput(item.usedQuantity)
      return total === null || used === null || total < 1 || used > total || total > 999999
    })) {
      next.items = '原始堂數至少 1 堂，且已使用堂數不可超過原始堂數'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleImport() {
    if (!validate()) return
    const paidAmount = parseIntegerInput(form.paidAmount)
    if (paidAmount === null) return
    setSaving(true)
    try {
      const result = await importVoucherOpeningBalance({
        productId: form.productId,
        clientId: form.clientId,
        purchasedOn: form.purchasedOn,
        expiresOn: form.expiresOn || null,
        paidAmount,
        importNotes: form.importNotes,
        items: form.items.map(item => ({
          serviceId: item.serviceId,
          totalQuantity: Number(item.totalQuantity),
          usedQuantity: Number(item.usedQuantity),
        })),
      })
      toast.success('期初商品券已匯入', `${result.sale_number ?? ''} · 可用 ${totals.total - totals.used} 堂`)
      onSaved()
    } catch (error) {
      toast.error('無法匯入期初商品券', operationError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="匯入既有商品券"
      size="lg"
      footer={(
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>取消</Button>
          <Button className="flex-1" loading={saving} onClick={handleImport}>確認匯入</Button>
        </div>
      )}
    >
      <div className="space-y-5">
        <div className="flex gap-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
          <ArchiveRestore size={18} className="mt-0.5 shrink-0 text-sky-600" />
          <div>
            <p className="text-sm font-semibold text-sky-900">只用於上線前已存在的商品券</p>
            <p className="mt-0.5 text-xs leading-5 text-sky-700">匯入原始堂數與歷史已用堂數，不建立假預約，也不計入新銷售。</p>
          </div>
        </div>

        <FormField label="客戶" required error={errors.clientId}>
          <ClientCombobox
            clients={clients}
            value={form.clientId}
            error={Boolean(errors.clientId)}
            onChange={value => {
              setForm(current => ({ ...current, clientId: value }))
              setErrors(current => ({ ...current, clientId: '' }))
            }}
          />
        </FormField>

        <FormField label="對應商品券方案" required error={errors.productId}>
          <Select
            value={form.productId}
            onChange={chooseProduct}
            options={availableProducts.map(product => ({ value: product.id, label: product.name }))}
            placeholder="選擇既有方案"
          />
        </FormField>

        <div>
          <p className="text-xs font-medium text-slate-500">各課程堂數 <span className="text-red-400">*</span></p>
          <p className="mt-0.5 text-xs text-slate-400">請填原始購買堂數，以及上線前已經使用的堂數。</p>
          <div className="mt-2 space-y-2">
            {form.items.map(item => (
              <div key={item.serviceId} className="grid grid-cols-[minmax(0,1fr)_92px_92px] items-center gap-2 rounded-2xl bg-slate-50 p-3">
                <p className="truncate text-sm font-medium text-slate-700">{item.serviceName}</p>
                <FormField label="原始堂數">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={item.totalQuantity}
                    onChange={event => updateItem(item.serviceId, 'totalQuantity', event.target.value)}
                  />
                </FormField>
                <FormField label="已使用">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={item.usedQuantity}
                    onChange={event => updateItem(item.serviceId, 'usedQuantity', event.target.value)}
                  />
                </FormField>
              </div>
            ))}
          </div>
          {errors.items && <p className="mt-1.5 text-xs text-red-500">{errors.items}</p>}
          {form.items.length > 0 && (
            <p className="mt-2 text-right text-xs font-medium text-slate-500">
              原始 {totals.total} 堂 · 已用 {totals.used} 堂 · 匯入後可用 {totals.total - totals.used} 堂
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="原購買日期" required error={errors.purchasedOn}>
            <Input
              type="date"
              value={form.purchasedOn}
              onChange={event => setForm(current => ({ ...current, purchasedOn: event.target.value }))}
            />
          </FormField>
          <FormField label="到期日" hint="留白代表永久" error={errors.expiresOn}>
            <Input
              type="date"
              min={form.purchasedOn}
              value={form.expiresOn}
              onChange={event => setForm(current => ({ ...current, expiresOn: event.target.value }))}
            />
          </FormField>
        </div>

        <FormField label="歷史實收金額" required error={errors.paidAmount} hint="只供歷史查核，不計入本期銷售">
          <Input
            type="text"
            inputMode="numeric"
            value={form.paidAmount}
            prefix={<span className="text-xs font-semibold">NT$</span>}
            error={Boolean(errors.paidAmount)}
            onChange={event => setForm(current => ({ ...current, paidAmount: event.target.value }))}
          />
        </FormField>

        <FormField label="移轉說明" required error={errors.importNotes}>
          <Textarea
            value={form.importNotes}
            placeholder="例：2026/10/20 紙本紀錄移轉，經 Cassia 核對"
            onChange={event => setForm(current => ({ ...current, importNotes: event.target.value }))}
          />
        </FormField>
      </div>
    </Modal>
  )
}
