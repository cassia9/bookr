import { useState } from 'react'
import { TicketCheck } from 'lucide-react'
import Button from '../ui/Button'
import ClientCombobox from '../ui/ClientCombobox'
import FormField from '../ui/FormField'
import Input from '../ui/Input'
import Modal from '../ui/Modal'
import Select from '../ui/Select'
import Textarea from '../ui/Textarea'
import { toast } from '../ui/Snackbar'
import {
  sellVoucher,
  type SellVoucherInput,
  type VoucherProductWithItems,
} from '../../lib/vouchers-api'

export interface VoucherClientOption {
  id: string
  full_name: string
  phone: string
}

interface SaleFormState {
  clientId: string
  productId: string
  purchasedOn: string
  paidAmount: string
  paymentMethod: SellVoucherInput['paymentMethod']
  notes: string
}

const today = () => new Date().toLocaleDateString('en-CA')
const money = (value: number) => `NT$ ${value.toLocaleString('zh-TW')}`

function saleFormFrom(
  product: VoucherProductWithItems | null,
  initialClientId?: string,
): SaleFormState {
  return {
    clientId: initialClientId ?? '',
    productId: product?.id ?? '',
    purchasedOn: today(),
    paidAmount: product ? String(product.selling_price) : '',
    paymentMethod: 'cash',
    notes: '',
  }
}

function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : '操作失敗'
  const messages: Record<string, string> = {
    INVALID_INPUT: '請確認必填欄位與輸入格式',
    INVALID_SERVICE_OR_QUANTITY: '課程無效或堂數超出範圍',
    PRODUCT_HAS_NO_ITEMS: '此方案尚未設定可使用課程',
    FREE_VOUCHER_NOTE_REQUIRED: '0 元贈送券必須填寫備註',
    CLIENT_NOT_FOUND: '找不到客戶，請重新選擇',
    FORBIDDEN: '目前帳號沒有此操作權限',
  }
  return messages[raw] ?? raw
}

export default function VoucherSaleModal({
  open,
  initialProduct,
  initialClientId,
  products,
  clients,
  onClose,
  onSaved,
}: {
  open: boolean
  initialProduct: VoucherProductWithItems | null
  initialClientId?: string
  products: VoucherProductWithItems[]
  clients: VoucherClientOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<SaleFormState>(() => (
    saleFormFrom(initialProduct, initialClientId)
  ))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const activeProducts = products.filter(product => product.active && !product.deleted_at)
  const selectedProduct = products.find(product => product.id === form.productId) ?? null
  const clientLocked = Boolean(initialClientId)

  function chooseProduct(productId: string) {
    const product = products.find(entry => entry.id === productId)
    setForm(current => ({
      ...current,
      productId,
      paidAmount: product ? String(product.selling_price) : '',
    }))
  }

  function validate() {
    const next: Record<string, string> = {}
    if (!form.clientId) next.clientId = '請選擇客戶'
    if (!form.productId) next.productId = '請選擇商品券方案'
    if (!form.purchasedOn) next.purchasedOn = '請選擇購買日期'
    if (form.paidAmount === '' || Number(form.paidAmount) < 0) next.paidAmount = '請輸入正確實收金額'
    if (Number(form.paidAmount) === 0 && !form.notes.trim()) next.notes = '0 元贈送券必須填寫原因'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSell() {
    if (!validate()) return
    setSaving(true)
    try {
      const result = await sellVoucher({
        productId: form.productId,
        clientId: form.clientId,
        purchasedOn: form.purchasedOn,
        paidAmount: Number(form.paidAmount),
        paymentMethod: form.paymentMethod,
        notes: form.notes,
      })
      toast.success('商品券已登記', result.sale_number)
      onSaved()
    } catch (error) {
      toast.error('無法登記購買', errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="登記購買商品券"
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>取消</Button>
          <Button className="flex-1" loading={saving} onClick={handleSell}>確認登記</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <FormField label="客戶" required error={errors.clientId}>
          <ClientCombobox
            clients={clients}
            value={form.clientId}
            onChange={value => {
              setForm(current => ({ ...current, clientId: value }))
              setErrors(current => ({ ...current, clientId: '' }))
            }}
            error={Boolean(errors.clientId)}
            locked={clientLocked}
          />
        </FormField>

        <FormField label="商品券方案" required error={errors.productId}>
          <Select
            value={form.productId}
            onChange={chooseProduct}
            options={activeProducts.map(product => ({
              value: product.id,
              label: `${product.name} · ${money(product.selling_price)}`,
            }))}
            placeholder="選擇上架中的方案"
          />
        </FormField>

        {selectedProduct && (
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[#FAFAF7] px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">BOOKR PASS</p>
                <p className="mt-1 text-base font-semibold text-slate-900">{selectedProduct.name}</p>
              </div>
              <TicketCheck className="text-lime-600" size={22} />
            </div>
            <div className="relative my-4 border-t border-dashed border-slate-200" aria-hidden="true">
              <span className="absolute -left-6 -top-2.5 h-5 w-5 rounded-full bg-white" />
              <span className="absolute -right-6 -top-2.5 h-5 w-5 rounded-full bg-white" />
            </div>
            <div className="space-y-1.5">
              {selectedProduct.voucher_product_items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-slate-600">{item.services?.name ?? '課程已下架'}</span>
                  <span className="font-mono font-semibold text-slate-900">{item.quantity} 堂</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="購買日期" required error={errors.purchasedOn}>
            <Input
              type="date"
              value={form.purchasedOn}
              onChange={event => setForm(current => ({ ...current, purchasedOn: event.target.value }))}
            />
          </FormField>
          <FormField label="實收金額" required error={errors.paidAmount}>
            <Input
              type="number"
              min="0"
              value={form.paidAmount}
              onChange={event => setForm(current => ({ ...current, paidAmount: event.target.value }))}
              prefix={<span className="text-xs font-semibold">NT$</span>}
            />
          </FormField>
        </div>

        <FormField label="付款方式">
          <Select
            value={form.paymentMethod}
            onChange={value => setForm(current => ({
              ...current,
              paymentMethod: value as SaleFormState['paymentMethod'],
            }))}
            options={[
              { value: 'cash', label: '現金' },
              { value: 'transfer', label: '轉帳' },
              { value: 'card', label: '信用卡' },
              { value: 'other', label: '其他' },
            ]}
          />
        </FormField>

        <FormField label="銷售備註" hint="0 元贈送時必填" error={errors.notes}>
          <Textarea
            value={form.notes}
            onChange={event => setForm(current => ({ ...current, notes: event.target.value }))}
            placeholder="例：現場轉帳已確認、活動贈送"
          />
        </FormField>
      </div>
    </Modal>
  )
}
