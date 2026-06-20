/**
 * ClientsPage — 客戶管理
 * 路由：/admin/clients
 *
 * 功能：
 * - 客戶列表（搜尋、分頁）
 * - 新增 / 編輯 / 軟刪除客戶
 * - 右側 Drawer 詳情：統計卡片 + 預約歷史
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Users, Plus, Phone, Mail, ChevronRight,
  CalendarDays, TrendingUp, Clock, ChevronDown,
  Check, X, DollarSign, FileText,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { zhTW } from 'date-fns/locale/zh-TW'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import FormField from '@/components/ui/FormField'
import Textarea from '@/components/ui/Textarea'
import Modal from '@/components/ui/Modal'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Drawer from '@/components/ui/Drawer'
import Badge from '@/components/ui/Badge'
import SearchInput from '@/components/ui/SearchInput'
import Pagination from '@/components/ui/Pagination'
import Spinner from '@/components/ui/Spinner'
import { toast } from '@/components/ui/Snackbar'
import { cn } from '@/lib/cn'
import type { ClientStat } from '@/types/database'

const STORE_ID = '00000000-0000-0000-0000-000000000001'
const PAGE_SIZE = 20

type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'

interface ClientBooking {
  id: string
  client_id: string
  practitioner_id: string
  service_id: string
  start_time: string
  end_time: string
  status: BookingStatus
  price: number
  notes: string | null
  buffer_minutes: number
  practitioner_name: string
  service_name: string
  service_duration: number
}

// ── 狀態 Badge 設定 ──────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending:   { label: '待確認', variant: 'amber'  as const },
  confirmed: { label: '已確認', variant: 'blue'   as const },
  completed: { label: '已完課', variant: 'green'  as const },
  cancelled: { label: '已取消', variant: 'red'    as const },
  no_show:   { label: '未到場', variant: 'slate'  as const },
}

// ── 格式化工具 ──────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return format(parseISO(iso), 'yyyy/MM/dd', { locale: zhTW })
}
function fmtDateTime(iso: string) {
  return format(parseISO(iso), 'yyyy/MM/dd HH:mm', { locale: zhTW })
}
function fmtMoney(n: number) {
  return `NT$${n.toLocaleString()}`
}

// ── 統計卡片 ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 flex items-start gap-3">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon size={16} strokeWidth={1.75} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className="text-base font-bold text-slate-900 leading-tight mt-0.5 break-all">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── 客戶表單（新增 / 編輯）────────────────────────────────────────────────────

interface ClientFormProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editing?: ClientStat | null
}

function ClientFormModal({ open, onClose, onSaved, editing }: ClientFormProps) {
  const isEdit = !!editing
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setForm({
        full_name: editing?.full_name ?? '',
        phone:     editing?.phone     ?? '',
        email:     editing?.email     ?? '',
        notes:     editing?.notes     ?? '',
      })
      setErrors({})
    }
  }, [open, editing?.id])

  function validate() {
    const e: Record<string, string> = {}
    if (!form.full_name.trim())  e.full_name = '請輸入客戶姓名'
    if (!form.phone.trim())      e.phone     = '請輸入電話號碼'
    else if (form.phone.trim().replace(/[-\s]/g, '').length < 6)
                                 e.phone     = '電話號碼至少 6 碼'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)

    const payload = {
      full_name: form.full_name.trim(),
      phone:     form.phone.trim(),
      email:     form.email.trim() || null,
      notes:     form.notes.trim() || null,
      store_id:  STORE_ID,
    }

    let error: any

    if (isEdit) {
      ;({ error } = await supabase.from('clients').update(payload).eq('id', editing!.id))
    } else {
      ;({ error } = await supabase.from('clients').insert(payload))
    }

    setSaving(false)

    if (error) {
      if (error.code === '23505') {
        setErrors({ phone: '此電話號碼已有其他客戶使用' })
      } else {
        toast.error(isEdit ? '更新失敗' : '新增失敗', error.message)
      }
      return
    }

    toast.success(isEdit ? '客戶資料已更新' : '客戶已新增')
    onSaved()
  }

  const setField = (field: string, value: string) => {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: '' }))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? '編輯客戶' : '新增客戶'}
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>取消</Button>
          <Button className="flex-1" loading={saving} onClick={handleSave}>
            {isEdit ? '儲存變更' : '新增客戶'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <FormField label="姓名" required error={errors.full_name}>
          <Input
            value={form.full_name}
            onChange={e => setField('full_name', e.target.value)}
            placeholder="例：王小美"
            error={!!errors.full_name}
            autoFocus
          />
        </FormField>

        <FormField label="電話" required error={errors.phone}>
          <Input
            value={form.phone}
            onChange={e => setField('phone', e.target.value)}
            placeholder="例：0912345678"
            error={!!errors.phone}
            prefix={<Phone size={14} className="text-slate-400" />}
          />
        </FormField>

        <FormField label="Email" hint="選填">
          <Input
            type="email"
            value={form.email}
            onChange={e => setField('email', e.target.value)}
            placeholder="例：client@email.com"
            prefix={<Mail size={14} className="text-slate-400" />}
          />
        </FormField>

        <FormField label="備注" hint="選填">
          <Textarea
            value={form.notes}
            onChange={e => setField('notes', e.target.value)}
            placeholder="過敏史、偏好、特殊需求…"
            rows={3}
          />
        </FormField>
      </div>
    </Modal>
  )
}

// ── 狀態操作設定 ────────────────────────────────────────────────────────────

const STATUS_ACTIONS: Partial<Record<BookingStatus, { label: string; next: BookingStatus; style: string }[]>> = {
  pending: [
    { label: '確認預約', next: 'confirmed', style: 'bg-indigo-500 hover:bg-indigo-600 text-white' },
    { label: '取消',     next: 'cancelled', style: 'bg-white hover:bg-red-50 text-red-600 border border-red-200' },
  ],
  confirmed: [
    { label: '完課',   next: 'completed', style: 'bg-emerald-500 hover:bg-emerald-600 text-white' },
    { label: '未到場', next: 'no_show',   style: 'bg-slate-500 hover:bg-slate-600 text-white' },
    { label: '取消',   next: 'cancelled', style: 'bg-white hover:bg-red-50 text-red-600 border border-red-200' },
  ],
}

// ── 客戶詳情 Drawer ───────────────────────────────────────────────────────────

interface ClientDrawerProps {
  client: ClientStat | null
  open: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onStatsRefresh: () => void
}

function ClientDrawer({ client, open, onClose, onEdit, onDelete, onStatsRefresh }: ClientDrawerProps) {
  const [bookings,    setBookings]    = useState<ClientBooking[]>([])
  const [loading,     setLoading]     = useState(false)
  const [expandedId,  setExpandedId]  = useState<string | null>(null)
  // 每筆預約的 local edit state: bookingId → {price, notes}
  const [editMap,     setEditMap]     = useState<Record<string, { price: string; notes: string }>>({})
  const [savingId,    setSavingId]    = useState<string | null>(null)
  // cancel inline confirm
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const notesTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const loadBookings = useCallback(() => {
    if (!client) return
    setLoading(true)
    supabase
      .rpc('get_client_bookings', { p_client_id: client.id })
      .then(({ data, error }) => {
        if (!error) {
          const list = (data as ClientBooking[]) ?? []
          setBookings(list)
          // 初始化 editMap（不覆蓋用戶正在編輯的）
          setEditMap(prev => {
            const next = { ...prev }
            list.forEach(b => {
              if (!next[b.id]) {
                next[b.id] = { price: String(b.price), notes: b.notes ?? '' }
              }
            })
            return next
          })
        }
        setLoading(false)
      })
  }, [client])

  useEffect(() => {
    if (!open || !client) return
    setExpandedId(null)
    setCancelTarget(null)
    loadBookings()
  }, [open, client?.id])

  // 更新預約狀態
  async function updateStatus(bookingId: string, newStatus: BookingStatus) {
    setSavingId(bookingId)
    const { error } = await supabase
      .from('bookings')
      .update({ status: newStatus })
      .eq('id', bookingId)

    if (error) {
      toast.error('更新失敗', error.message)
    } else {
      toast.success('狀態已更新')
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b))
      if (newStatus === 'completed' || newStatus === 'cancelled' || newStatus === 'no_show') {
        setExpandedId(null)
        onStatsRefresh()
      }
    }
    setSavingId(null)
    setCancelTarget(null)
  }

  // 更新價格（blur 儲存）
  async function savePrice(bookingId: string) {
    const raw = editMap[bookingId]?.price ?? '0'
    const newPrice = Math.max(0, parseInt(raw.replace(/\D/g, '')) || 0)
    const original = bookings.find(b => b.id === bookingId)?.price ?? 0
    if (newPrice === original) return

    setSavingId(bookingId)
    const { error } = await supabase
      .from('bookings')
      .update({ price: newPrice })
      .eq('id', bookingId)

    if (error) {
      toast.error('儲存失敗', error.message)
      setEditMap(prev => ({ ...prev, [bookingId]: { ...prev[bookingId], price: String(original) } }))
    } else {
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, price: newPrice } : b))
      onStatsRefresh()
    }
    setSavingId(null)
  }

  // 更新備注（debounce 1.5s 自動儲存）
  function handleNotesChange(bookingId: string, value: string) {
    setEditMap(prev => ({ ...prev, [bookingId]: { ...prev[bookingId], notes: value } }))
    clearTimeout(notesTimers.current[bookingId])
    notesTimers.current[bookingId] = setTimeout(async () => {
      const { error } = await supabase
        .from('bookings')
        .update({ notes: value || null })
        .eq('id', bookingId)
      if (!error) {
        setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, notes: value || null } : b))
      }
    }, 1500)
  }

  if (!client) return null

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={client.full_name}
      subtitle={client.phone}
      width="md"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onEdit}>編輯資料</Button>
          <Button variant="danger" className="flex-1" onClick={onDelete}>刪除客戶</Button>
        </div>
      }
    >
      <div className="px-6 py-5 space-y-6">

        {/* 聯絡資訊 */}
        <div className="space-y-1.5">
          {client.email && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Mail size={13} className="text-slate-400 shrink-0" />
              {client.email}
            </div>
          )}
          {client.notes && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 text-sm text-amber-800 leading-relaxed mt-2">
              {client.notes}
            </div>
          )}
          <p className="text-xs text-slate-400 pt-1">
            客戶建立：{fmtDate(client.created_at)}
          </p>
        </div>

        {/* 統計卡片 */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">消費統計</p>
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="累計預約"
              value={`${client.booking_count} 次`}
              sub={client.completed_count > 0 ? `完課 ${client.completed_count} 次` : undefined}
              icon={CalendarDays}
              color="bg-indigo-500"
            />
            <StatCard
              label="總消費"
              value={fmtMoney(client.total_spent)}
              sub={client.avg_spent > 0 ? `平均 ${fmtMoney(client.avg_spent)}` : undefined}
              icon={TrendingUp}
              color="bg-emerald-500"
            />
            {client.first_booking_at && (
              <StatCard
                label="首次預約"
                value={fmtDate(client.first_booking_at)}
                icon={CalendarDays}
                color="bg-slate-400"
              />
            )}
            {client.last_booking_at && (
              <StatCard
                label="最後預約"
                value={fmtDate(client.last_booking_at)}
                icon={Clock}
                color="bg-slate-400"
              />
            )}
          </div>
        </div>

        {/* 預約歷史 */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            預約紀錄
            {bookings.length > 0 && (
              <span className="ml-1.5 font-normal text-slate-400 normal-case">
                共 {bookings.length} 筆
              </span>
            )}
          </p>

          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner size="sm" />
            </div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CalendarDays size={28} className="mx-auto mb-2 text-slate-200" />
              <p className="text-sm">尚無預約紀錄</p>
            </div>
          ) : (
            <div className="space-y-2">
              {bookings.map(b => {
                const cfg       = STATUS_CONFIG[b.status]
                const isExpanded = expandedId === b.id
                const isEditable = b.status === 'pending' || b.status === 'confirmed'
                const actions    = STATUS_ACTIONS[b.status]
                const edit       = editMap[b.id] ?? { price: String(b.price), notes: b.notes ?? '' }
                const isSaving   = savingId === b.id

                return (
                  <div
                    key={b.id}
                    className={cn(
                      'rounded-xl border transition-colors',
                      isExpanded
                        ? 'bg-white border-indigo-200 shadow-sm'
                        : 'bg-slate-50 border-slate-100 hover:border-slate-200',
                    )}
                  >
                    {/* 收合列 — 點擊切換展開 */}
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : b.id)}
                      className="w-full text-left px-3.5 py-3 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{b.service_name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {fmtDateTime(b.start_time)} · {b.practitioner_name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          <span className="text-xs font-semibold text-slate-600">
                            {b.price > 0 ? fmtMoney(b.price) : '免費'}
                          </span>
                        </div>
                        <ChevronDown
                          size={14}
                          className={cn(
                            'text-slate-400 transition-transform shrink-0',
                            isExpanded && 'rotate-180',
                          )}
                        />
                      </div>
                    </button>

                    {/* 展開內容 */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 px-3.5 py-3 space-y-3">

                        {/* 服務詳情 */}
                        <p className="text-xs text-slate-500">
                          時長：{b.service_duration} 分鐘
                          {b.buffer_minutes > 0 && ` · 緩衝 ${b.buffer_minutes} 分鐘`}
                        </p>

                        {/* 價格 */}
                        {isEditable ? (
                          <div>
                            <label className="text-xs font-medium text-slate-500 flex items-center gap-1 mb-1">
                              <DollarSign size={11} />
                              價格（NT$）
                            </label>
                            <input
                              type="number"
                              min={0}
                              value={edit.price}
                              onChange={e => setEditMap(prev => ({
                                ...prev,
                                [b.id]: { ...prev[b.id], price: e.target.value },
                              }))}
                              onBlur={() => savePrice(b.id)}
                              disabled={isSaving}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 disabled:opacity-50"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-sm text-slate-700">
                            <DollarSign size={13} className="text-slate-400" />
                            {b.price > 0 ? fmtMoney(b.price) : '免費'}
                          </div>
                        )}

                        {/* 備注 */}
                        {isEditable ? (
                          <div>
                            <label className="text-xs font-medium text-slate-500 flex items-center gap-1 mb-1">
                              <FileText size={11} />
                              備注
                            </label>
                            <textarea
                              value={edit.notes}
                              onChange={e => handleNotesChange(b.id, e.target.value)}
                              disabled={isSaving}
                              rows={2}
                              placeholder="輸入備注…"
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 disabled:opacity-50"
                            />
                          </div>
                        ) : b.notes ? (
                          <div className="flex gap-1.5 text-xs text-slate-500 italic">
                            <FileText size={12} className="text-slate-300 shrink-0 mt-0.5" />
                            {b.notes}
                          </div>
                        ) : null}

                        {/* 狀態操作按鈕 */}
                        {actions && (
                          <div>
                            {/* 取消確認 inline */}
                            {cancelTarget === b.id ? (
                              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                                <p className="text-xs text-red-700 mb-2 font-medium">確定要取消這筆預約？</p>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => updateStatus(b.id, 'cancelled')}
                                    disabled={isSaving}
                                    className="flex-1 text-xs py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                                  >
                                    <Check size={12} /> 確定取消
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCancelTarget(null)}
                                    className="flex-1 text-xs py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition-colors flex items-center justify-center gap-1"
                                  >
                                    <X size={12} /> 算了
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {actions.map(action => (
                                  <button
                                    key={action.next}
                                    type="button"
                                    disabled={isSaving}
                                    onClick={() => {
                                      if (action.next === 'cancelled') {
                                        setCancelTarget(b.id)
                                      } else {
                                        updateStatus(b.id, action.next)
                                      }
                                    }}
                                    className={cn(
                                      'text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50',
                                      action.style,
                                    )}
                                  >
                                    {isSaving ? '…' : action.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </Drawer>
  )
}

// ── 主頁面 ───────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [clients,  setClients]  = useState<ClientStat[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [page,     setPage]     = useState(1)

  // Modal / Drawer 狀態
  const [addOpen,       setAddOpen]       = useState(false)
  const [editingClient, setEditingClient] = useState<ClientStat | null>(null)
  const [drawerClient,  setDrawerClient]  = useState<ClientStat | null>(null)
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [deleteTarget,  setDeleteTarget]  = useState<ClientStat | null>(null)

  const loadClients = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('client_stats')
      .select('*')
      .eq('store_id', STORE_ID)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('無法載入客戶資料', error.message)
    } else {
      setClients((data as ClientStat[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadClients() }, [loadClients])

  // 本地搜尋過濾
  const filtered = clients.filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      c.full_name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    )
  })

  // 分頁
  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged       = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // 搜尋時重置頁碼
  useEffect(() => { setPage(1) }, [search])

  // 全站統計
  const totalSpent    = clients.reduce((s, c) => s + c.total_spent, 0)
  const totalBookings = clients.reduce((s, c) => s + c.completed_count, 0)

  function openDrawer(client: ClientStat) {
    setDrawerClient(client)
    setDrawerOpen(true)
  }

  function handleEdit(client: ClientStat) {
    setEditingClient(client)
    setDrawerOpen(false)
  }

  function handleDelete(client: ClientStat) {
    setDeleteTarget(client)
    setDrawerOpen(false)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const { error } = await supabase
      .from('clients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteTarget.id)

    if (error) {
      toast.error('刪除失敗', error.message)
    } else {
      toast.success('客戶已刪除', deleteTarget.full_name)
      setDeleteTarget(null)
      setDrawerOpen(false)
      setDrawerClient(null)
      loadClients()
    }
  }

  function handleSaved() {
    setAddOpen(false)
    setEditingClient(null)
    loadClients()
    // 若是編輯已選中的客戶，重新載入 Drawer
    if (drawerClient && editingClient?.id === drawerClient.id) {
      setDrawerOpen(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">

      {/* 頁首 */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Users size={20} className="text-slate-600" />
              客戶管理
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              共 {clients.length} 位客戶
              {totalBookings > 0 && ` · ${totalBookings} 次完課 · 總消費 ${fmtMoney(totalSpent)}`}
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={15} strokeWidth={2} />
            新增客戶
          </Button>
        </div>
      </div>

      {/* 搜尋列 */}
      <div className="shrink-0 px-8 py-4">
        <div className="max-w-sm">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="搜尋姓名、電話或 Email…"
          />
        </div>
      </div>

      {/* 表格區 */}
      <div className="flex-1 overflow-auto px-8 pb-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Spinner size="lg" />
          </div>
        ) : paged.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
            <Users size={40} className="mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500 font-medium">
              {search ? `找不到符合「${search}」的客戶` : '尚無客戶資料'}
            </p>
            {!search && (
              <Button className="mt-4" onClick={() => setAddOpen(true)}>
                <Plus size={15} /> 新增第一位客戶
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">姓名</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">電話</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Email</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">預約 / 完課</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">總消費</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">最後預約</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {paged.map((client, i) => (
                  <tr
                    key={client.id}
                    onClick={() => openDrawer(client)}
                    className={cn(
                      'group cursor-pointer transition-colors hover:bg-slate-50',
                      i < paged.length - 1 && 'border-b border-slate-50',
                      drawerClient?.id === client.id && 'bg-indigo-50/60',
                    )}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <span className="text-sm font-semibold text-slate-600">
                            {client.full_name[0]}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{client.full_name}</p>
                          {client.notes && (
                            <p className="text-xs text-slate-400 truncate max-w-[160px]">{client.notes}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-slate-600 font-mono">{client.phone}</span>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <span className="text-sm text-slate-500">{client.email ?? '—'}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-sm font-medium text-slate-900">{client.booking_count}</span>
                      <span className="text-xs text-slate-400 ml-1">/ {client.completed_count}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right hidden lg:table-cell">
                      <span className="text-sm font-semibold text-slate-900">
                        {client.total_spent > 0 ? fmtMoney(client.total_spent) : '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right hidden lg:table-cell">
                      <span className="text-sm text-slate-500">
                        {client.last_booking_at ? fmtDate(client.last_booking_at) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <ChevronRight
                        size={16}
                        className={cn(
                          'text-slate-300 transition-colors',
                          'group-hover:text-slate-500',
                          drawerClient?.id === client.id && 'text-indigo-400',
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 分頁 */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
                <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 新增客戶 Modal */}
      <ClientFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={handleSaved}
      />

      {/* 編輯客戶 Modal */}
      <ClientFormModal
        open={!!editingClient}
        onClose={() => setEditingClient(null)}
        onSaved={handleSaved}
        editing={editingClient}
      />

      {/* 刪除確認 */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="確認刪除客戶"
        description={
          deleteTarget
            ? deleteTarget.upcoming_count > 0
              ? `${deleteTarget.full_name} 目前有 ${deleteTarget.upcoming_count} 筆未來預約，刪除後預約仍保留但客戶資料將無法恢復。確認刪除？`
              : `刪除後 ${deleteTarget.full_name} 的客戶資料將無法恢復，歷史預約紀錄將保留。`
            : ''
        }
        confirmLabel="確認刪除"
      />

      {/* 客戶詳情 Drawer */}
      <ClientDrawer
        client={drawerClient}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEdit={() => handleEdit(drawerClient!)}
        onDelete={() => handleDelete(drawerClient!)}
        onStatsRefresh={loadClients}
      />

    </div>
  )
}
