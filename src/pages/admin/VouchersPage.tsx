import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CircleDollarSign,
  Edit2,
  Gift,
  Layers3,
  Plus,
  ReceiptText,
  Sparkles,
  TicketCheck,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import {
  archiveVoucherProduct,
  getAvailableQuantity,
  getVoucherProducts,
  getVoucherSales,
  saveVoucherProduct,
  type VoucherProductWithItems,
  type VoucherSaleWithRelations,
} from '../../lib/vouchers-api'
import VoucherSaleModal, {
  type VoucherClientOption,
} from '../../components/vouchers/VoucherSaleModal'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import ConfirmModal from '../../components/ui/ConfirmModal'
import FormField from '../../components/ui/FormField'
import IconButton from '../../components/ui/IconButton'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import SearchInput from '../../components/ui/SearchInput'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import Textarea from '../../components/ui/Textarea'
import Toggle from '../../components/ui/Toggle'
import { toast } from '../../components/ui/Snackbar'
import { cn } from '../../lib/cn'

interface ServiceOption {
  id: string
  name: string
  duration_minutes: number
  price: number
}

interface ProductItemForm {
  key: string
  serviceId: string
  quantity: string
}

interface ProductFormState {
  name: string
  description: string
  sellingPrice: string
  validityDays: string
  active: boolean
  items: ProductItemForm[]
}

const today = () => new Date().toLocaleDateString('en-CA')
const money = (value: number) => `NT$ ${value.toLocaleString('zh-TW')}`

function newItem(): ProductItemForm {
  return { key: crypto.randomUUID(), serviceId: '', quantity: '1' }
}

function blankProductForm(): ProductFormState {
  return {
    name: '',
    description: '',
    sellingPrice: '',
    validityDays: '180',
    active: true,
    items: [newItem()],
  }
}

function productFormFrom(product: VoucherProductWithItems | null): ProductFormState {
  if (!product) return blankProductForm()
  return {
    name: product.name,
    description: product.description ?? '',
    sellingPrice: String(product.selling_price),
    validityDays: product.validity_days ? String(product.validity_days) : '',
    active: product.active,
    items: product.voucher_product_items.map(item => ({
      key: item.id,
      serviceId: item.service_id,
      quantity: String(item.quantity),
    })),
  }
}

function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : '操作失敗'
  const messages: Record<string, string> = {
    DUPLICATE_NAME_OR_SERVICE: '方案名稱或課程重複，請調整後再儲存',
    INVALID_INPUT: '請確認必填欄位與輸入格式',
    INVALID_ITEMS: '請為每個課程設定正確堂數',
    INVALID_SERVICE_OR_QUANTITY: '課程無效或堂數超出範圍',
    PRODUCT_HAS_NO_ITEMS: '此方案尚未設定可使用課程',
    FREE_VOUCHER_NOTE_REQUIRED: '0 元贈送券必須填寫備註',
    CLIENT_NOT_FOUND: '找不到客戶，請重新選擇',
    FORBIDDEN: '目前帳號沒有此操作權限',
  }
  return messages[raw] ?? raw
}

async function getVoucherPageData() {
  const [productData, saleData, serviceResult, clientResult] = await Promise.all([
    getVoucherProducts(),
    getVoucherSales(),
    supabase
      .from('services')
      .select('id, name, duration_minutes, price')
      .eq('active', true)
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('clients')
      .select('id, full_name, phone')
      .is('deleted_at', null)
      .order('full_name'),
  ])
  if (serviceResult.error) throw serviceResult.error
  if (clientResult.error) throw clientResult.error
  return {
    products: productData,
    sales: saleData,
    services: serviceResult.data ?? [],
    clients: clientResult.data ?? [],
  }
}

function voucherStatus(sale: VoucherSaleWithRelations) {
  if (sale.status === 'voided') return { label: '已作廢', variant: 'red' as const }
  if (sale.expires_on && sale.expires_on < today()) {
    return { label: '已到期', variant: 'amber' as const }
  }
  const remaining = sale.client_voucher_items.reduce(
    (sum, item) => sum + getAvailableQuantity(item),
    0,
  )
  const reserved = sale.client_voucher_items.reduce(
    (sum, item) => sum + item.reserved_quantity,
    0,
  )
  if (remaining === 0 && reserved === 0) return { label: '已用完', variant: 'slate' as const }
  return { label: '使用中', variant: 'green' as const }
}

function TicketNotches() {
  return (
    <div className="relative my-4 border-t border-dashed border-slate-200" aria-hidden="true">
      <span className="absolute -left-6 -top-2.5 h-5 w-5 rounded-full bg-slate-50" />
      <span className="absolute -right-6 -top-2.5 h-5 w-5 rounded-full bg-slate-50" />
    </div>
  )
}

function ProductModal({
  open,
  product,
  services,
  onClose,
  onSaved,
}: {
  open: boolean
  product: VoucherProductWithItems | null
  services: ServiceOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ProductFormState>(() => productFormFrom(product))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const originalPrice = useMemo(() => form.items.reduce((sum, item) => {
    const service = services.find(entry => entry.id === item.serviceId)
    return sum + (service?.price ?? 0) * (Number(item.quantity) || 0)
  }, 0), [form.items, services])

  const sellingPrice = Number(form.sellingPrice) || 0
  const totalSessions = form.items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0,
  )

  function updateItem(key: string, field: 'serviceId' | 'quantity', value: string) {
    setForm(current => ({
      ...current,
      items: current.items.map(item => item.key === key ? { ...item, [field]: value } : item),
    }))
  }

  function validate() {
    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = '請輸入方案名稱'
    if (form.sellingPrice === '' || sellingPrice < 0) next.sellingPrice = '請輸入正確售價'
    if (form.validityDays && Number(form.validityDays) < 1) next.validityDays = '效期至少 1 天'
    if (!form.items.length || form.items.some(item => !item.serviceId || Number(item.quantity) < 1)) {
      next.items = '請選擇課程並設定至少 1 堂'
    }
    if (new Set(form.items.map(item => item.serviceId)).size !== form.items.length) {
      next.items = '同一課程只能加入一次'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    try {
      await saveVoucherProduct({
        id: product?.id,
        name: form.name,
        description: form.description,
        sellingPrice,
        validityDays: form.validityDays ? Number(form.validityDays) : null,
        active: form.active,
        items: form.items.map(item => ({
          serviceId: item.serviceId,
          quantity: Number(item.quantity),
        })),
      })
      toast.success(product ? '商品券方案已更新' : '商品券方案已建立')
      onSaved()
    } catch (error) {
      toast.error('無法儲存方案', errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? '編輯商品券方案' : '新增商品券方案'}
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>取消</Button>
          <Button className="flex-1" loading={saving} onClick={handleSave}>儲存方案</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <FormField label="方案名稱" required error={errors.name}>
          <Input
            value={form.name}
            onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
            placeholder="例：筋膜放鬆 10 堂券"
          />
        </FormField>

        <FormField label="方案說明" hint="選填">
          <Textarea
            value={form.description}
            onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
            placeholder="說明適用情境或注意事項"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="優惠售價" required error={errors.sellingPrice}>
            <Input
              type="number"
              min="0"
              value={form.sellingPrice}
              onChange={event => setForm(current => ({ ...current, sellingPrice: event.target.value }))}
              prefix={<span className="text-xs font-semibold">NT$</span>}
            />
          </FormField>
          <FormField label="購買後效期" hint="留白代表永久有效" error={errors.validityDays}>
            <Input
              type="number"
              min="1"
              max="3650"
              value={form.validityDays}
              onChange={event => setForm(current => ({ ...current, validityDays: event.target.value }))}
              suffix={<span className="text-xs">天</span>}
            />
          </FormField>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">包含課程 <span className="text-red-400">*</span></p>
              <p className="mt-0.5 text-xs text-slate-400">可組合多種現有課程與固定堂數</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setForm(current => ({ ...current, items: [...current.items, newItem()] }))}
            >
              <Plus size={14} /> 加入課程
            </Button>
          </div>
          <div className="space-y-2">
            {form.items.map((item, index) => (
              <div key={item.key} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2">
                <span className="w-6 text-center font-mono text-xs text-slate-400">{index + 1}</span>
                <Select
                  value={item.serviceId}
                  onChange={value => updateItem(item.key, 'serviceId', value)}
                  options={services
                    .filter(service => service.id === item.serviceId || !form.items.some(entry => entry.serviceId === service.id))
                    .map(service => ({
                      value: service.id,
                      label: `${service.name} · ${money(service.price)}`,
                    }))}
                  placeholder="選擇課程"
                  className="min-w-0 flex-1"
                />
                <Input
                  type="number"
                  min="1"
                  max="10000"
                  value={item.quantity}
                  onChange={event => updateItem(item.key, 'quantity', event.target.value)}
                  suffix={<span className="text-xs">堂</span>}
                  className="w-24"
                />
                <IconButton
                  icon={X}
                  label="移除課程"
                  variant="danger"
                  disabled={form.items.length === 1}
                  onClick={() => setForm(current => ({
                    ...current,
                    items: current.items.filter(entry => entry.key !== item.key),
                  }))}
                />
              </div>
            ))}
          </div>
          {errors.items && <p className="mt-1.5 text-xs text-red-500">{errors.items}</p>}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-[#FAFAF7] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-slate-400">方案摘要</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{totalSessions} 堂 · {money(sellingPrice)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">課程原價 {money(originalPrice)}</p>
              <p className={cn(
                'mt-1 text-sm font-semibold',
                originalPrice > sellingPrice ? 'text-lime-700' : 'text-slate-500',
              )}>
                {originalPrice > sellingPrice
                  ? `優惠 ${money(originalPrice - sellingPrice)}`
                  : '尚未產生價差'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">立即上架</p>
            <p className="text-xs text-slate-400">上架後店員即可登記銷售</p>
          </div>
          <Toggle
            checked={form.active}
            onChange={value => setForm(current => ({ ...current, active: value }))}
            ariaLabel="立即上架"
          />
        </div>
      </div>
    </Modal>
  )
}

export default function VouchersPage() {
  const { isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState<'products' | 'sales'>('products')
  const [products, setProducts] = useState<VoucherProductWithItems[]>([])
  const [sales, setSales] = useState<VoucherSaleWithRelations[]>([])
  const [services, setServices] = useState<ServiceOption[]>([])
  const [clients, setClients] = useState<VoucherClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<VoucherProductWithItems | null>(null)
  const [saleModalOpen, setSaleModalOpen] = useState(false)
  const [saleProduct, setSaleProduct] = useState<VoucherProductWithItems | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<VoucherProductWithItems | null>(null)
  const [archiving, setArchiving] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await getVoucherPageData()
      setProducts(data.products)
      setSales(data.sales)
      setServices(data.services)
      setClients(data.clients)
    } catch (error) {
      toast.error('無法載入商品券', errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void getVoucherPageData()
      .then(data => {
        if (!active) return
        setProducts(data.products)
        setSales(data.sales)
        setServices(data.services)
        setClients(data.clients)
      })
      .catch(error => {
        if (active) toast.error('無法載入商品券', errorMessage(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const filteredProducts = products.filter(product => (
    product.name.toLowerCase().includes(search.toLowerCase())
    || product.description?.toLowerCase().includes(search.toLowerCase())
  ))
  const filteredSales = sales.filter(sale => (
    sale.product_name_snapshot.toLowerCase().includes(search.toLowerCase())
    || sale.sale_number.toLowerCase().includes(search.toLowerCase())
    || sale.clients?.full_name.toLowerCase().includes(search.toLowerCase())
    || sale.clients?.phone.includes(search)
  ))

  const availableSessions = sales.reduce((total, sale) => (
    sale.status === 'active'
      ? total + sale.client_voucher_items.reduce(
        (subtotal, item) => subtotal + getAvailableQuantity(item), 0,
      )
      : total
  ), 0)
  const monthPrefix = today().slice(0, 7)
  const monthlySales = sales
    .filter(sale => sale.purchased_on.startsWith(monthPrefix) && sale.status === 'active')
    .reduce((total, sale) => total + sale.paid_amount, 0)

  async function handleArchive() {
    if (!archiveTarget) return
    setArchiving(true)
    try {
      await archiveVoucherProduct(archiveTarget.id)
      toast.success('商品券方案已封存')
      setArchiveTarget(null)
      await load()
    } catch (error) {
      toast.error('無法封存方案', errorMessage(error))
    } finally {
      setArchiving(false)
    }
  }

  function openProduct(product: VoucherProductWithItems | null) {
    setEditingProduct(product)
    setProductModalOpen(true)
  }

  function openSale(product: VoucherProductWithItems | null = null) {
    setSaleProduct(product)
    setSaleModalOpen(true)
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-5 py-5 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium tracking-wide text-lime-700">
              <Sparkles size={14} /> 多堂優惠與客戶權益
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">商品券</h1>
            <p className="mt-1 text-sm text-slate-500">建立課程組合、登記購買並追蹤每一堂的去向</p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="secondary" onClick={() => openProduct(null)}>
                <Plus size={15} /> 新增方案
              </Button>
            )}
            <Button onClick={() => openSale()} disabled={!products.some(product => product.active)}>
              <TicketCheck size={15} /> 登記購買
            </Button>
          </div>
        </div>
      </header>

      <main className="space-y-5 p-5 lg:p-8">
        <section className="grid gap-3 md:grid-cols-3">
          {[
            { label: '上架方案', value: `${products.filter(product => product.active && !product.deleted_at).length} 種`, icon: Gift },
            { label: '客戶可用堂數', value: `${availableSessions} 堂`, icon: Layers3 },
            { label: '本月登記銷售', value: money(monthlySales), icon: CircleDollarSign },
          ].map(stat => (
            <div key={stat.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-400">{stat.label}</p>
                <stat.icon size={17} className="text-lime-600" />
              </div>
              <p className="mt-3 font-mono text-2xl font-semibold tracking-tight text-slate-900">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex rounded-2xl bg-slate-100 p-1">
              <Button
                variant="ghost"
                size="sm"
                className={cn(activeTab === 'products' && 'bg-white text-slate-900 shadow-sm hover:bg-white')}
                onClick={() => { setActiveTab('products'); setSearch('') }}
              >
                <Gift size={14} /> 方案
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(activeTab === 'sales' && 'bg-white text-slate-900 shadow-sm hover:bg-white')}
                onClick={() => { setActiveTab('sales'); setSearch('') }}
              >
                <ReceiptText size={14} /> 銷售紀錄
              </Button>
            </div>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={activeTab === 'products' ? '搜尋方案名稱…' : '搜尋客戶、電話或銷售編號…'}
              className="w-full md:w-80"
            />
          </div>

          {loading ? (
            <div className="flex min-h-80 items-center justify-center"><Spinner size="lg" /></div>
          ) : activeTab === 'products' ? (
            filteredProducts.length ? (
              <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map(product => {
                  const totalSessions = product.voucher_product_items.reduce((sum, item) => sum + item.quantity, 0)
                  const original = product.voucher_product_items.reduce(
                    (sum, item) => sum + (item.services?.price ?? 0) * item.quantity, 0,
                  )
                  return (
                    <article key={product.id} className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[#FAFAF7] p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">BOOKR PASS</p>
                            <Badge variant={product.active && !product.deleted_at ? 'green' : 'slate'}>
                              {product.active && !product.deleted_at ? '上架中' : '已下架'}
                            </Badge>
                          </div>
                          <h2 className="mt-2 truncate text-lg font-semibold text-slate-900">{product.name}</h2>
                          <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">
                            {product.description || '未填寫方案說明'}
                          </p>
                        </div>
                        {isAdmin && !product.deleted_at && (
                          <div className="flex shrink-0">
                            <IconButton icon={Edit2} label="編輯方案" onClick={() => openProduct(product)} />
                            <IconButton icon={Trash2} label="封存方案" variant="danger" onClick={() => setArchiveTarget(product)} />
                          </div>
                        )}
                      </div>

                      <TicketNotches />

                      <div className="space-y-2">
                        {product.voucher_product_items.map(item => (
                          <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate text-slate-600">{item.services?.name ?? '課程已下架'}</span>
                            <span className="shrink-0 font-mono font-semibold text-slate-900">{item.quantity} 堂</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 flex items-end justify-between border-t border-slate-200 pt-4">
                        <div>
                          <p className="text-xs text-slate-400">{totalSessions} 堂 · {product.validity_days ? `${product.validity_days} 天` : '永久有效'}</p>
                          <p className="mt-1 font-mono text-xl font-semibold text-slate-900">{money(product.selling_price)}</p>
                          {original > product.selling_price && (
                            <p className="mt-0.5 text-xs font-medium text-lime-700">比單堂省 {money(original - product.selling_price)}</p>
                          )}
                        </div>
                        {product.active && !product.deleted_at && (
                          <Button size="sm" onClick={() => openSale(product)}>登記購買</Button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
                <Gift size={30} className="text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">{search ? '找不到符合的方案' : '還沒有商品券方案'}</p>
                <p className="mt-1 text-xs text-slate-400">建立單一課程多堂券，或組合不同課程。</p>
                {isAdmin && !search && <Button className="mt-4" size="sm" onClick={() => openProduct(null)}>建立第一個方案</Button>}
              </div>
            )
          ) : filteredSales.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    {['客戶', '商品券', '堂數進度', '實收', '效期', '狀態', '銷售編號'].map(label => (
                      <th key={label} className="px-5 py-3 text-left text-xs font-medium text-slate-500">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSales.map(sale => {
                    const status = voucherStatus(sale)
                    const total = sale.client_voucher_items.reduce((sum, item) => sum + item.total_quantity + item.adjustment_quantity, 0)
                    const used = sale.client_voucher_items.reduce((sum, item) => sum + item.used_quantity, 0)
                    const reserved = sale.client_voucher_items.reduce((sum, item) => sum + item.reserved_quantity, 0)
                    return (
                      <tr key={sale.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <p className="text-sm font-medium text-slate-800">{sale.clients?.full_name ?? '客戶已刪除'}</p>
                          <p className="text-xs text-slate-400">{sale.clients?.phone}</p>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">{sale.product_name_snapshot}</td>
                        <td className="px-5 py-4">
                          <p className="font-mono text-sm font-semibold text-slate-800">已用 {used} / {total}</p>
                          <p className="mt-0.5 text-xs text-slate-400">另有 {reserved} 堂已預約</p>
                        </td>
                        <td className="px-5 py-4 font-mono text-sm font-medium text-slate-800">{money(sale.paid_amount)}</td>
                        <td className="px-5 py-4 text-sm text-slate-500">
                          {sale.expires_on ?? '永久有效'}
                        </td>
                        <td className="px-5 py-4"><Badge variant={status.variant}>{status.label}</Badge></td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-400">{sale.sale_number}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <ReceiptText size={30} className="text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">{search ? '找不到符合的銷售紀錄' : '尚未登記任何商品券'}</p>
              {!search && <Button className="mt-4" size="sm" onClick={() => openSale()}>登記第一筆購買</Button>}
            </div>
          )}
        </section>

        <div className="flex items-center gap-2 px-1 text-xs text-slate-400">
          <CalendarClock size={14} /> 預約時會優先保留最早到期且符合課程的商品券。
        </div>
      </main>

      {productModalOpen && (
        <ProductModal
          open
          product={editingProduct}
          services={services}
          onClose={() => setProductModalOpen(false)}
          onSaved={() => { setProductModalOpen(false); void load() }}
        />
      )}
      {saleModalOpen && (
        <VoucherSaleModal
          open
          initialProduct={saleProduct}
          products={products}
          clients={clients}
          onClose={() => setSaleModalOpen(false)}
          onSaved={() => { setSaleModalOpen(false); setActiveTab('sales'); void load() }}
        />
      )}
      <ConfirmModal
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
        loading={archiving}
        title="封存商品券方案"
        description={`封存「${archiveTarget?.name ?? ''}」後不能再登記新購買，已售出的商品券仍可繼續使用。`}
        confirmLabel="確認封存"
      />
    </div>
  )
}
