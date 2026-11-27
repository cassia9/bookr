import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarOff, Edit2, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import {
  archiveStoreClosure,
  getStoreClosures,
  saveStoreClosure,
} from '@/lib/store-closures-api'
import type { StoreClosure, StoreClosureCategory } from '@/types/database'
import Button from '@/components/ui/Button'
import ConfirmModal from '@/components/ui/ConfirmModal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import Textarea from '@/components/ui/Textarea'
import TimePicker from '@/components/ui/TimePicker'
import Toggle from '@/components/ui/Toggle'
import { toast } from '@/components/ui/Snackbar'

const categoryOptions: Array<{ value: StoreClosureCategory; label: string }> = [
  { value: 'public_holiday', label: '國定假日' },
  { value: 'staff_trip', label: '員工旅遊' },
  { value: 'maintenance', label: '設備維護' },
  { value: 'emergency', label: '臨時狀況' },
  { value: 'other', label: '其他' },
]

const categoryLabel = Object.fromEntries(
  categoryOptions.map(option => [option.value, option.label]),
) as Record<StoreClosureCategory, string>

interface ClosureForm {
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  allDay: boolean
  category: StoreClosureCategory
  publicLabel: string
  internalNote: string
}

interface ConflictBooking {
  id: string
  start_time: string
  client_name: string
  practitioner_name: string
  service_name: string
}

interface ConflictPreviewResult {
  ok?: boolean
  error?: string
  conflicts?: ConflictBooking[]
}

function blankForm(): ClosureForm {
  const date = new Date().toLocaleDateString('en-CA')
  return {
    startDate: date,
    startTime: '09:00',
    endDate: date,
    endTime: '18:00',
    allDay: true,
    category: 'other',
    publicLabel: '店休',
    internalNote: '',
  }
}

function timeInZone(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function formFromClosure(closure: StoreClosure, timezone: string): ClosureForm {
  return {
    startDate: closure.start_date,
    startTime: closure.all_day ? '09:00' : timeInZone(closure.starts_at, timezone),
    endDate: closure.end_date,
    endTime: closure.all_day ? '18:00' : timeInZone(closure.ends_at, timezone),
    allDay: closure.all_day,
    category: closure.category,
    publicLabel: closure.public_label,
    internalNote: closure.internal_note ?? '',
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${date}T12:00:00`))
}

function dateRangeLabel(closure: StoreClosure, timezone: string) {
  if (closure.all_day) {
    if (closure.start_date === closure.end_date) return `${formatDate(closure.start_date)} · 整日`
    return `${formatDate(closure.start_date)} — ${formatDate(closure.end_date)} · 整日`
  }
  const startTime = timeInZone(closure.starts_at, timezone)
  const endTime = timeInZone(closure.ends_at, timezone)
  if (closure.start_date === closure.end_date) {
    return `${formatDate(closure.start_date)} · ${startTime}–${endTime}`
  }
  return `${formatDate(closure.start_date)} ${startTime} — ${formatDate(closure.end_date)} ${endTime}`
}

function operationError(error: unknown) {
  const raw = error instanceof Error ? error.message : '操作失敗'
  const messages: Record<string, string> = {
    FORBIDDEN: '只有管理員可以變更店休',
    INVALID_INPUT: '請確認日期、公開文字與備註格式',
    CLOSURE_NOT_FOUND: '找不到這筆店休，請重新整理',
    OVERLAPPING_CLOSURE: '這段日期已包含在另一筆店休中，請改用編輯原有店休',
    INVALID_TIME_RANGE: '結束時間必須晚於開始時間',
    STORE_NOT_FOUND: '找不到店家時區設定，請重新整理後再試',
  }
  return messages[raw] ?? raw
}

export default function StoreClosuresSection() {
  const { isAdmin } = useAuth()
  const [closures, setClosures] = useState<StoreClosure[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<StoreClosure | null>(null)
  const [form, setForm] = useState<ClosureForm>(blankForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [archiveTarget, setArchiveTarget] = useState<StoreClosure | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [conflicts, setConflicts] = useState<ConflictBooking[]>([])
  const [conflictConfirmOpen, setConflictConfirmOpen] = useState(false)
  const [checkingConflicts, setCheckingConflicts] = useState(false)
  const [storeTimezone, setStoreTimezone] = useState('Asia/Taipei')

  const load = useCallback(async () => {
    try {
      setClosures(await getStoreClosures())
    } catch (error) {
      toast.error('無法載入店休日', operationError(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void getStoreClosures()
      .then(data => {
        if (active) setClosures(data)
      })
      .catch(error => {
        if (active) toast.error('無法載入店休日', operationError(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void supabase
      .from('stores')
      .select('timezone')
      .maybeSingle()
      .then(({ data }) => {
        if (active && data?.timezone) setStoreTimezone(data.timezone)
      })
    return () => { active = false }
  }, [])

  const upcomingClosures = useMemo(() => {
    const today = new Date().toLocaleDateString('en-CA')
    return closures.filter(closure => (
      closure.end_date > today
      || (closure.end_date === today && new Date(closure.ends_at) > new Date())
    ))
  }, [closures])

  function openForm(closure: StoreClosure | null) {
    setEditing(closure)
    setForm(closure ? formFromClosure(closure, storeTimezone) : blankForm())
    setErrors({})
    setModalOpen(true)
  }

  function validate() {
    const next: Record<string, string> = {}
    if (!form.startDate) next.startDate = '請選擇開始日期'
    if (!form.endDate) next.endDate = '請選擇結束日期'
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      next.endDate = '結束日期不可早於開始日期'
    }
    if (!form.allDay && (!form.startTime || !form.endTime)) {
      next.time = '請選擇完整的開始與結束時間'
    } else if (!form.allDay
      && `${form.endDate}T${form.endTime}` <= `${form.startDate}T${form.startTime}`) {
      next.time = '結束時間必須晚於開始時間'
    }
    if (!form.publicLabel.trim()) next.publicLabel = '請填寫客戶看到的文字'
    if (form.publicLabel.trim().length > 100) next.publicLabel = '公開文字最多 100 字'
    if (form.internalNote.length > 1000) next.internalNote = '內部備註最多 1,000 字'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function persistClosure() {
    setSaving(true)
    try {
      const result = await saveStoreClosure({
        id: editing?.id,
        startDate: form.startDate,
        startTime: form.startTime,
        endDate: form.endDate,
        endTime: form.endTime,
        allDay: form.allDay,
        category: form.category,
        publicLabel: form.publicLabel,
        internalNote: form.internalNote,
      })
      const conflictCount = result.conflict_count ?? 0
      toast.success(
        editing ? '店休已更新' : '店休已新增',
        conflictCount
          ? `這段期間已有 ${conflictCount} 筆預約，請到預約管理逐筆確認。`
          : '客戶端將停止開放這段時段的預約。',
      )
      setModalOpen(false)
      await load()
    } catch (error) {
      toast.error('無法儲存店休', operationError(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    if (!validate()) return
    setCheckingConflicts(true)
    try {
      const { data, error } = await supabase.rpc('preview_store_closure_window_conflicts', {
        p_start_date: form.startDate,
        p_start_time: form.startTime,
        p_end_date: form.endDate,
        p_end_time: form.endTime,
        p_all_day: form.allDay,
      })

      if (error) throw error
      const result = data as ConflictPreviewResult
      if (!result.ok) throw new Error(result.error ?? '操作失敗')
      const found = result.conflicts ?? []
      if (found.length > 0) {
        setConflicts(found)
        setConflictConfirmOpen(true)
      } else {
        await persistClosure()
      }
    } catch (error) {
      toast.error('無法檢查既有預約', operationError(error))
    } finally {
      setCheckingConflicts(false)
    }
  }

  async function handleArchive() {
    if (!archiveTarget) return
    setArchiving(true)
    try {
      await archiveStoreClosure(archiveTarget.id)
      toast.success('店休已移除', '該日期會重新開放客戶預約。')
      setArchiveTarget(null)
      await load()
    } catch (error) {
      toast.error('無法移除店休', operationError(error))
    } finally {
      setArchiving(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarOff size={16} className="text-rose-500" />
            <h3 className="text-sm font-semibold text-slate-800">臨時店休</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            店休日會從客戶預約時段中排除；後台管理員仍可覆寫特殊預約。
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" variant="secondary" onClick={() => openForm(null)}>
            <Plus size={14} /> 新增店休
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center"><Spinner size="md" /></div>
      ) : upcomingClosures.length ? (
        <div className="divide-y divide-slate-100">
          {upcomingClosures.map(closure => (
            <article key={closure.id} className="relative px-5 py-4 pl-8">
              <span className="absolute bottom-4 left-4 top-4 w-1 rounded-full bg-rose-400" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-semibold text-slate-900">{dateRangeLabel(closure, storeTimezone)}</p>
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600">
                      {categoryLabel[closure.category]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-700">客戶顯示：{closure.public_label}</p>
                  {closure.internal_note && (
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">內部備註：{closure.internal_note}</p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openForm(closure)}>
                      <Edit2 size={13} /> 編輯
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => setArchiveTarget(closure)}>
                      <Trash2 size={13} /> 移除
                    </Button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="text-sm font-medium text-slate-600">目前沒有即將到來的店休日</p>
          <p className="mt-1 text-xs text-slate-400">國定假日、員工旅遊或臨時維護都可以在這裡設定。</p>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '編輯店休' : '新增店休'}
        footer={(
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>取消</Button>
            <Button className="flex-1" loading={saving || checkingConflicts} onClick={handleSave}>儲存店休</Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="開始日期" required error={errors.startDate}>
              <Input
                type="date"
                value={form.startDate}
                error={Boolean(errors.startDate)}
                onChange={event => setForm(current => ({
                  ...current,
                  startDate: event.target.value,
                  endDate: current.endDate < event.target.value ? event.target.value : current.endDate,
                }))}
              />
            </FormField>
            <FormField label="結束日期" required error={errors.endDate}>
              <Input
                type="date"
                min={form.startDate}
                value={form.endDate}
                error={Boolean(errors.endDate)}
                onChange={event => setForm(current => ({ ...current, endDate: event.target.value }))}
              />
            </FormField>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">整日店休</p>
              <p className="mt-0.5 text-xs text-slate-400">關閉所選日期的全部預約時段</p>
            </div>
            <Toggle
              checked={form.allDay}
              ariaLabel="整日店休"
              onChange={allDay => setForm(current => ({ ...current, allDay }))}
            />
          </div>

          {!form.allDay && (
            <div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="開始時間" required error={errors.time}>
                  <TimePicker
                    value={form.startTime}
                    startHour={0}
                    endHour={23}
                    minuteStep={15}
                    error={Boolean(errors.time)}
                    onChange={startTime => setForm(current => ({ ...current, startTime }))}
                  />
                </FormField>
                <FormField label="結束時間" required>
                  <TimePicker
                    value={form.endTime}
                    startHour={0}
                    endHour={23}
                    minuteStep={15}
                    error={Boolean(errors.time)}
                    onChange={endTime => setForm(current => ({ ...current, endTime }))}
                  />
                </FormField>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                跨日店休會從開始日期與時間，連續關閉到結束日期與時間。
              </p>
            </div>
          )}

          <FormField label="原因分類" required>
            <Select
              value={form.category}
              onChange={value => setForm(current => ({
                ...current,
                category: value as StoreClosureCategory,
              }))}
              options={categoryOptions}
            />
          </FormField>

          <FormField label="客戶看到的文字" required hint="例：國定假日店休" error={errors.publicLabel}>
            <Input
              value={form.publicLabel}
              maxLength={100}
              error={Boolean(errors.publicLabel)}
              onChange={event => setForm(current => ({ ...current, publicLabel: event.target.value }))}
            />
          </FormField>

          <FormField label="內部備註" hint="只供後台人員查看" error={errors.internalNote}>
            <Textarea
              value={form.internalNote}
              maxLength={1000}
              placeholder="例：員工旅遊，既有預約由 Cassia 另行聯絡"
              onChange={event => setForm(current => ({ ...current, internalNote: event.target.value }))}
            />
          </FormField>

          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">
            儲存後會立即停止客戶在重疊時段送出預約；若時段內已有預約，系統會提示筆數但不會自動取消。
          </div>
        </div>
      </Modal>

      <Modal
        open={conflictConfirmOpen}
        onClose={() => setConflictConfirmOpen(false)}
        title={`店休期間已有 ${conflicts.length} 筆預約`}
        footer={(
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConflictConfirmOpen(false)}>返回調整</Button>
            <Button
              className="flex-1"
              loading={saving}
              onClick={() => {
                setConflictConfirmOpen(false)
                void persistClosure()
              }}
            >
              保留預約並儲存店休
            </Button>
          </div>
        )}
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
            儲存店休不會自動取消、改期或通知以下客戶，請稍後到預約管理逐筆處理。
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {conflicts.map(booking => (
              <div key={booking.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">{booking.client_name || '未知客戶'}</p>
                  <p className="shrink-0 font-mono text-xs text-slate-500">
                    {new Intl.DateTimeFormat('zh-TW', {
                      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
                    }).format(new Date(booking.start_time))}
                  </p>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {booking.service_name || '未知課程'} · {booking.practitioner_name || '未指定人員'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
        loading={archiving}
        title="移除店休"
        description={`移除「${archiveTarget?.public_label ?? ''}」後，該日期將重新開放客戶預約。`}
        confirmLabel="確認移除"
      />
    </section>
  )
}
