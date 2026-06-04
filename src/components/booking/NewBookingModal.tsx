/**
 * 新增 / 編輯預約 Modal — 共用元件
 * 可從行事曆、客戶管理等多處開啟
 * 使用 upsert_booking RPC 做衝突檢查 + 原子寫入
 */
import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { Clock, Timer, DollarSign } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Select from '../ui/Select'
import ClientCombobox from '../ui/ClientCombobox'
import DatePicker from '../ui/DatePicker'
import TimePicker from '../ui/TimePicker'
import { toast } from '../ui/Snackbar'
import { inputCls } from '../../lib/styles'
import { cn } from '../../lib/cn'
import type { Practitioner, Client, Service } from '../../types/database'

const STORE_ID = '00000000-0000-0000-0000-000000000001'

/** 取得當下最近的下一個 15 分鐘時段，上限 21:00 */
export function nearestSlot(): string {
  const now = new Date()
  const h = now.getHours()
  const m = now.getMinutes()
  const nextM = Math.ceil((m + 1) / 15) * 15
  const slotH = nextM >= 60 ? Math.min(h + 1, 21) : Math.min(h, 21)
  const slotM = nextM >= 60 ? 0 : nextM
  if (slotH === 21 && slotM > 0) return '21:00'
  return `${String(slotH).padStart(2, '0')}:${String(slotM).padStart(2, '0')}`
}

/** 編輯模式傳入的現有預約資料 */
export interface InitialBooking {
  id: string
  client_id: string
  practitioner_id: string
  service_id: string
  start_time: string    // ISO string
  notes: string | null
  buffer_minutes?: number
  price?: number
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  practitioners: Practitioner[]
  clients: Client[]
  services: Service[]
  onRefreshClients: () => void
  /** 'create'（預設）或 'edit'（更新現有預約） */
  mode?: 'create' | 'edit'
  /** 編輯模式：帶入現有預約資料 */
  initialBooking?: InitialBooking
  /** 預填客戶（從客戶管理頁開啟時帶入） */
  initialClientId?: string
  /** 預填從業人員（從甘特圖格子點擊時帶入） */
  initialPractitionerId?: string
  /** 預填日期，格式 'yyyy-MM-dd' */
  initialDate?: string
  /** 預填時間，格式 'HH:mm' */
  initialTime?: string
  /** 預設緩衝時間（來自店家設定） */
  defaultBufferMinutes?: number
}

export default function NewBookingModal({
  open, onClose, onSaved,
  practitioners, clients, services, onRefreshClients,
  mode = 'create', initialBooking,
  initialClientId, initialPractitionerId, initialDate, initialTime,
  defaultBufferMinutes = 30,
}: Props) {
  const makeEmpty = () => {
    if (mode === 'edit' && initialBooking) {
      return {
        client_id:       initialBooking.client_id,
        practitioner_id: initialBooking.practitioner_id,
        service_id:      initialBooking.service_id,
        date:            format(parseISO(initialBooking.start_time), 'yyyy-MM-dd'),
        time:            format(parseISO(initialBooking.start_time), 'HH:mm'),
        notes:           initialBooking.notes ?? '',
        buffer_minutes:  initialBooking.buffer_minutes ?? defaultBufferMinutes,
        price:           initialBooking.price ?? null as number | null,
      }
    }
    return {
      client_id:       initialClientId ?? '',
      practitioner_id: initialPractitionerId ?? '',
      service_id:      '',
      date:            initialDate ?? format(new Date(), 'yyyy-MM-dd'),
      time:            initialTime ?? nearestSlot(),
      notes:           '',
      buffer_minutes:  defaultBufferMinutes,
      price:           null as number | null,   // null = 自動帶入服務定價
    }
  }

  const [form,   setForm]   = useState(makeEmpty)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset when opened
  useEffect(() => {
    if (open) {
      setForm(makeEmpty())
      setErrors({})
    }
  }, [open, mode, initialBooking?.id, initialClientId, initialPractitionerId, initialDate, initialTime, defaultBufferMinutes])

  const selectedService = services.find(s => s.id === form.service_id)

  // 選服務時自動帶入定價（僅在 null 時更新，避免覆蓋手動輸入）
  useEffect(() => {
    if (selectedService && form.price === null) {
      setForm(f => ({ ...f, price: selectedService.price }))
    }
  }, [form.service_id])

  /** Combobox 呼叫：建立新客戶，回傳新 client_id */
  async function handleCreateClient(name: string, phone: string): Promise<string | null> {
    const { data, error } = await supabase.from('clients').insert({
      full_name: name,
      phone:     phone || null,
      store_id:  STORE_ID,
    }).select().single()
    if (error) { toast.error('新增客戶失敗', error.message); return null }
    onRefreshClients()
    toast.success('已新增客戶', name)
    return (data as any).id as string
  }

  // End time preview
  let endTimePreview = ''
  if (selectedService && form.time) {
    try {
      const base = new Date(`2000-01-01T${form.time}`)
      endTimePreview = format(new Date(base.getTime() + selectedService.duration_minutes * 60000), 'HH:mm')
    } catch { /* ignore */ }
  }

  // Buffer end time preview
  let bufferEndPreview = ''
  if (endTimePreview && form.buffer_minutes > 0) {
    try {
      const base = new Date(`2000-01-01T${endTimePreview}`)
      bufferEndPreview = format(new Date(base.getTime() + form.buffer_minutes * 60000), 'HH:mm')
    } catch { /* ignore */ }
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.client_id)       e.client_id       = '請選擇客戶'
    if (!form.practitioner_id) e.practitioner_id = '請選擇從業人員'
    if (!form.service_id)      e.service_id      = '請選擇課程'
    if (!form.date)            e.date            = '請選擇日期'
    if (!form.time)            e.time            = '請選擇時間'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) { toast.warning('請填寫必要欄位'); return }
    setSaving(true)

    const start = new Date(`${form.date}T${form.time}`)
    const end   = new Date(start.getTime() + (selectedService?.duration_minutes ?? 60) * 60000)

    const { data, error } = await supabase.rpc('upsert_booking', {
      p_booking_id:      mode === 'edit' ? initialBooking!.id : null,
      p_client_id:       form.client_id,
      p_practitioner_id: form.practitioner_id,
      p_service_id:      form.service_id,
      p_start_time:      start.toISOString(),
      p_end_time:        end.toISOString(),
      p_buffer_minutes:  form.buffer_minutes,
      p_notes:           form.notes.trim() || null,
      p_store_id:        STORE_ID,
      p_price:           form.price ?? null,
    })

    setSaving(false)

    if (error) { toast.error('操作失敗', error.message); return }

    const result = data as { ok: boolean; error?: string; id?: string; conflict?: any }

    if (!result.ok) {
      if (result.error === 'PRACTITIONER_BLOCKED') {
        toast.error('從業人員不可預約', '該時段已被設定為封鎖時段（如休假），請更換時間或人員')
      } else if (result.error === 'TIME_CONFLICT' && result.conflict) {
        const c = result.conflict
        const cStart = format(new Date(c.start_time), 'HH:mm')
        const cEnd   = format(new Date(c.end_time),   'HH:mm')
        const bufMsg = c.buffer_minutes > 0 ? `（含 ${c.buffer_minutes} 分鐘緩衝）` : ''
        toast.error('時間衝突', `${c.client_name} · ${c.service_name} ${cStart}–${cEnd}${bufMsg}`)
      } else {
        toast.error('操作失敗', result.error ?? '未知錯誤')
      }
      return
    }

    const label = mode === 'edit' ? '預約已更新' : '預約已建立'
    toast.success(label, `${format(start, 'M/d HH:mm')} · ${selectedService?.name ?? ''}`)
    onSaved()
  }

  // 鎖定客戶（編輯模式 or 從客戶頁帶入）
  const lockedClientId = mode === 'edit' ? initialBooking?.client_id : initialClientId

  const modalTitle  = mode === 'edit' ? '編輯預約' : '新增預約'
  const submitLabel = mode === 'edit' ? '儲存變更' : '建立預約'

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} size="lg">
      <div className="space-y-4">

        {/* Client — Combobox */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">客戶 *</label>
          <ClientCombobox
            clients={clients}
            value={form.client_id}
            onChange={v => { setForm(f => ({ ...f, client_id: v })); setErrors(er => ({ ...er, client_id: '' })) }}
            onCreateClient={handleCreateClient}
            error={!!errors.client_id}
            locked={!!lockedClientId}
          />
          {errors.client_id && <p className="text-xs text-red-500 mt-1">{errors.client_id}</p>}
        </div>

        {/* Practitioner + Service */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">從業人員 *</label>
            <Select
              value={form.practitioner_id}
              onChange={v => { setForm(f => ({ ...f, practitioner_id: v })); setErrors(er => ({ ...er, practitioner_id: '' })) }}
              placeholder="選擇人員"
              error={!!errors.practitioner_id}
              options={practitioners.map(p => ({
                value: p.id,
                label: `${p.full_name}${p.title ? ` ${p.title}` : ''}`,
                color: p.color,
              }))}
            />
            {errors.practitioner_id && <p className="text-xs text-red-500 mt-1">{errors.practitioner_id}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">課程 *</label>
            <Select
              value={form.service_id}
              onChange={v => { setForm(f => ({ ...f, service_id: v })); setErrors(er => ({ ...er, service_id: '' })) }}
              placeholder="選擇課程"
              error={!!errors.service_id}
              options={services.map(s => ({
                value: s.id,
                label: `${s.name}｜${s.duration_minutes}min`,
              }))}
            />
            {errors.service_id && <p className="text-xs text-red-500 mt-1">{errors.service_id}</p>}
          </div>
        </div>

        {/* Date + Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">日期 *</label>
            <DatePicker
              value={form.date}
              onChange={v => { setForm(f => ({ ...f, date: v })); setErrors(er => ({ ...er, date: '' })) }}
              error={!!errors.date}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">時間 *</label>
            <TimePicker
              value={form.time}
              onChange={v => { setForm(f => ({ ...f, time: v })); setErrors(er => ({ ...er, time: '' })) }}
              error={!!errors.time}
            />
          </div>
        </div>

        {/* End time + buffer preview */}
        {endTimePreview && (
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-2xl text-xs text-indigo-700">
            <Clock size={13} strokeWidth={1.5} />
            結束時間：<span className="font-semibold">{endTimePreview}</span>
            <span className="text-indigo-400">（{selectedService?.duration_minutes} 分鐘）</span>
            {bufferEndPreview && (
              <>
                <span className="text-indigo-300 mx-1">·</span>
                <Timer size={12} strokeWidth={1.5} className="text-slate-400" />
                <span className="text-slate-500">緩衝至 <span className="font-semibold text-slate-600">{bufferEndPreview}</span></span>
              </>
            )}
          </div>
        )}

        {/* Buffer minutes stepper */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
              <Timer size={14} strokeWidth={1.5} className="text-slate-400" />
              緩衝時間
            </label>
            {defaultBufferMinutes > 0 && (
              <span className="text-xs text-slate-400">預設：{defaultBufferMinutes} 分鐘</span>
            )}
          </div>
          <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-2xl border border-slate-100">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, buffer_minutes: Math.max(0, f.buffer_minutes - 10) }))}
              disabled={form.buffer_minutes <= 0}
              className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition text-base font-medium bg-white shadow-sm"
            >
              −
            </button>
            <div className="flex-1 text-center">
              <span className="text-lg font-semibold text-slate-900">{form.buffer_minutes}</span>
              <span className="text-xs text-slate-400 ml-1">分鐘</span>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, buffer_minutes: f.buffer_minutes + 10 }))}
              className="w-8 h-8 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-white transition text-base font-medium bg-white shadow-sm"
            >
              +
            </button>
          </div>
        </div>

        {/* Price */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
              <DollarSign size={14} strokeWidth={1.5} className="text-slate-400" />
              實收金額
            </label>
            {selectedService && form.price !== selectedService.price && (
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, price: selectedService.price }))}
                className="text-xs text-indigo-500 hover:text-indigo-700 transition"
              >
                還原定價 NT${selectedService.price.toLocaleString()}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="text-sm text-slate-400 font-medium">NT$</span>
            <input
              type="number"
              min={0}
              step={50}
              value={form.price ?? ''}
              onChange={e => setForm(f => ({ ...f, price: e.target.value === '' ? null : Number(e.target.value) }))}
              placeholder={selectedService ? String(selectedService.price) : '0'}
              className="flex-1 bg-transparent text-slate-900 font-semibold text-base outline-none min-w-0"
            />
            {form.price !== null && form.price === 0 && (
              <span className="text-xs text-amber-500 font-medium">免費</span>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">備注</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2} placeholder="選填"
            className={cn(inputCls, 'resize-none')} />
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>取消</Button>
          <Button className="flex-1" loading={saving} onClick={handleSave}>{submitLabel}</Button>
        </div>
      </div>
    </Modal>
  )
}
