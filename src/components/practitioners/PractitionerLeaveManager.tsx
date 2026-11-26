import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarDays, CalendarOff, Clock3, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import FormField from '@/components/ui/FormField'
import Alert from '@/components/ui/Alert'
import ConfirmModal from '@/components/ui/ConfirmModal'
import TimePicker from '@/components/ui/TimePicker'
import Toggle from '@/components/ui/Toggle'
import { toast } from '@/components/ui/Snackbar'
import { cn } from '@/lib/cn'

interface Block {
  id: string
  start_time: string
  end_time: string
  reason: string | null
}

interface ScheduleDay {
  weekday: number
  is_working: boolean
  start_time: string
  end_time: string
}

interface BookingConflict {
  id: string
  start_time: string
  client_name: string
  service_name: string
}

interface RpcResult {
  ok?: boolean
  error?: string
  conflict_count?: number
  conflicts?: BookingConflict[]
}

interface Props {
  storeId: string
  practitionerId: string
  practitionerName: string
  onClose: () => void
  embedded?: boolean
}

interface ManagerShellProps {
  embedded: boolean
  onClose: () => void
  title: string
  footer?: ReactNode
  children: ReactNode
}

function ManagerShell({ embedded, onClose, title, footer, children }: ManagerShellProps) {
  if (embedded) {
    return (
      <div className="space-y-5">
        {children}
        {footer && <div className="border-t border-slate-100 pt-4">{footer}</div>}
      </div>
    )
  }

  return (
    <Modal open onClose={onClose} title={title} size="lg" footer={footer}>
      {children}
    </Modal>
  )
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const now = new Date()
const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  .toISOString()
  .slice(0, 10)

function normalizeTime(value: string | null | undefined, fallback: string) {
  return value?.slice(0, 5) || fallback
}

function rpcErrorMessage(code?: string) {
  const messages: Record<string, string> = {
    FORBIDDEN: '只有管理員可以調整老師班表與休假',
    INVALID_INPUT: '請確認日期與原因格式',
    INVALID_SCHEDULE: '請至少保留一個上班日，並確認每個時段',
    PRACTITIONER_NOT_FOUND: '找不到這位老師，請重新整理後再試',
    OVERLAPPING_LEAVE: '這段日期已經有休假紀錄',
  }
  return messages[code ?? ''] ?? '操作未完成，請稍後再試'
}

export default function PractitionerLeaveManager({
  storeId,
  practitionerId,
  practitionerName,
  onClose,
  embedded = false,
}: Props) {
  const [tab, setTab] = useState<'schedule' | 'leave'>('schedule')
  const [resolvedName, setResolvedName] = useState(practitionerName)
  const [schedule, setSchedule] = useState<ScheduleDay[]>([])
  const [usingStoreHours, setUsingStoreHours] = useState(false)
  const [scheduleLoading, setScheduleLoading] = useState(true)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduleConflicts, setScheduleConflicts] = useState<BookingConflict[]>([])

  const [blocks, setBlocks] = useState<Block[]>([])
  const [blocksLoading, setBlocksLoading] = useState(true)
  const [leaveSaving, setLeaveSaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [leaveConflicts, setLeaveConflicts] = useState<BookingConflict[]>([])
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState({ start_date: today, end_date: today, reason: '' })

  const workingCount = useMemo(
    () => schedule.filter(day => day.is_working).length,
    [schedule],
  )

  useEffect(() => {
    void Promise.all([loadSchedule(), loadBlocks(), loadPractitionerName()])
    // 三個載入函式只依賴下列老師與店家識別；身分切換時重新載入即可。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practitionerId, practitionerName, storeId])

  async function loadPractitionerName() {
    if (practitionerName) return
    const { data } = await supabase
      .from('practitioners')
      .select('full_name')
      .eq('id', practitionerId)
      .eq('store_id', storeId)
      .maybeSingle()
    setResolvedName(data?.full_name ?? '')
  }

  async function loadSchedule() {
    setScheduleLoading(true)
    setScheduleError(null)

    const [scheduleResult, storeResult] = await Promise.all([
      supabase
        .from('practitioner_weekly_schedules')
        .select('weekday, is_working, start_time, end_time')
        .eq('practitioner_id', practitionerId)
        .eq('store_id', storeId)
        .order('weekday'),
      supabase
        .from('stores')
        .select('open_time, close_time')
        .eq('id', storeId)
        .maybeSingle(),
    ])

    if (scheduleResult.error || storeResult.error) {
      setScheduleError('無法載入班表，請重新整理後再試')
      setScheduleLoading(false)
      return
    }

    const openTime = normalizeTime(storeResult.data?.open_time, '09:00')
    const closeTime = normalizeTime(storeResult.data?.close_time, '18:00')
    const rows = scheduleResult.data ?? []

    if (rows.length === 0) {
      setUsingStoreHours(true)
      setSchedule(WEEKDAYS.map((_, index) => ({
        weekday: index + 1,
        is_working: true,
        start_time: openTime,
        end_time: closeTime,
      })))
    } else {
      setUsingStoreHours(false)
      setSchedule(rows.map(row => ({
        weekday: row.weekday,
        is_working: row.is_working,
        start_time: normalizeTime(row.start_time, openTime),
        end_time: normalizeTime(row.end_time, closeTime),
      })))
    }
    setScheduleLoading(false)
  }

  async function loadBlocks() {
    setBlocksLoading(true)
    const { data, error } = await supabase
      .from('practitioner_blocks')
      .select('id, start_time, end_time, reason')
      .eq('practitioner_id', practitionerId)
      .eq('store_id', storeId)
      .order('start_time', { ascending: false })
    if (error) toast.error('無法載入休假紀錄', error.message)
    else setBlocks(data ?? [])
    setBlocksLoading(false)
  }

  function updateScheduleDay(weekday: number, patch: Partial<ScheduleDay>) {
    setSchedule(days => days.map(day => day.weekday === weekday ? { ...day, ...patch } : day))
    setScheduleError(null)
  }

  function validateSchedule() {
    if (workingCount === 0) {
      setScheduleError('每位老師至少需要保留一個上班日')
      return false
    }
    const invalidDay = schedule.find(day => day.is_working && day.end_time <= day.start_time)
    if (invalidDay) {
      setScheduleError(`週${WEEKDAYS[invalidDay.weekday - 1]}的下班時間必須晚於上班時間`)
      return false
    }
    return true
  }

  function schedulePayload() {
    return schedule.map(day => ({
      weekday: day.weekday,
      is_working: day.is_working,
      start_time: day.is_working ? day.start_time : null,
      end_time: day.is_working ? day.end_time : null,
    }))
  }

  async function requestScheduleSave() {
    if (!validateSchedule()) return
    setScheduleSaving(true)
    const { data, error } = await supabase.rpc('preview_practitioner_schedule_conflicts', {
      p_practitioner_id: practitionerId,
      p_schedule: schedulePayload(),
    })
    setScheduleSaving(false)

    if (error) {
      setScheduleError(error.message)
      return
    }
    const result = data as RpcResult
    if (!result.ok) {
      setScheduleError(rpcErrorMessage(result.error))
      return
    }
    if ((result.conflict_count ?? 0) > 0) {
      setScheduleConflicts(result.conflicts ?? [])
      return
    }
    await persistSchedule()
  }

  async function persistSchedule() {
    setScheduleSaving(true)
    const { data, error } = await supabase.rpc('save_practitioner_weekly_schedule', {
      p_practitioner_id: practitionerId,
      p_schedule: schedulePayload(),
    })
    setScheduleSaving(false)
    setScheduleConflicts([])

    if (error) {
      setScheduleError(error.message)
      return
    }
    const result = data as RpcResult
    if (!result.ok) {
      setScheduleError(rpcErrorMessage(result.error))
      return
    }
    setUsingStoreHours(false)
    toast.success('固定班表已儲存', '新的 C 端可預約時段會立即套用')
    await loadSchedule()
  }

  function validateLeave() {
    setLeaveError(null)
    if (!form.start_date || !form.end_date) {
      setLeaveError('請選擇完整的休假日期')
      return false
    }
    if (form.end_date < form.start_date) {
      setLeaveError('結束日期不能早於開始日期')
      return false
    }
    if (form.reason.trim().length > 500) {
      setLeaveError('休假原因不可超過 500 個字')
      return false
    }
    return true
  }

  async function requestLeaveSave() {
    if (!validateLeave()) return
    setLeaveSaving(true)
    const { data, error } = await supabase.rpc('preview_practitioner_leave_conflicts', {
      p_practitioner_id: practitionerId,
      p_start_date: form.start_date,
      p_end_date: form.end_date,
    })
    setLeaveSaving(false)

    if (error) {
      setLeaveError(error.message)
      return
    }
    const result = data as RpcResult
    if (!result.ok) {
      setLeaveError(rpcErrorMessage(result.error))
      return
    }
    if ((result.conflict_count ?? 0) > 0) {
      setLeaveConflicts(result.conflicts ?? [])
      return
    }
    await persistLeave()
  }

  async function persistLeave() {
    setLeaveSaving(true)
    const { data, error } = await supabase.rpc('save_practitioner_leave', {
      p_practitioner_id: practitionerId,
      p_start_date: form.start_date,
      p_end_date: form.end_date,
      p_reason: form.reason.trim() || null,
    })
    setLeaveSaving(false)
    setLeaveConflicts([])

    if (error) {
      setLeaveError(error.message)
      return
    }
    const result = data as RpcResult
    if (!result.ok) {
      setLeaveError(rpcErrorMessage(result.error))
      return
    }
    toast.success('休假已新增', '期間內將不再提供這位老師的預約時段')
    setForm({ start_date: today, end_date: today, reason: '' })
    await loadBlocks()
  }

  async function handleDelete() {
    if (!deleteId) return
    const { data, error } = await supabase.rpc('delete_practitioner_leave', {
      p_block_id: deleteId,
    })
    if (error) {
      toast.error('休假刪除失敗', error.message)
      return
    }
    const result = data as RpcResult
    if (!result.ok) {
      toast.error('休假刪除失敗', rpcErrorMessage(result.error))
      return
    }
    setDeleteId(null)
    toast.success('休假已刪除')
    await loadBlocks()
  }

  function formatDate(value: Date) {
    return new Intl.DateTimeFormat('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      timeZone: 'Asia/Taipei',
    }).format(value)
  }

  function formatRange(start: string, end: string) {
    const startDate = new Date(start)
    const inclusiveEnd = new Date(new Date(end).getTime() - 1)
    const first = formatDate(startDate)
    const last = formatDate(inclusiveEnd)
    return first === last ? first : `${first} 至 ${last}`
  }

  function conflictDescription(conflicts: BookingConflict[]) {
    const first = conflicts.slice(0, 3).map(conflict => {
      const date = new Intl.DateTimeFormat('zh-TW', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
        timeZone: 'Asia/Taipei', hour12: false,
      }).format(new Date(conflict.start_time))
      return `${date} ${conflict.client_name}・${conflict.service_name}`
    })
    const remaining = conflicts.length - first.length
    return `將影響 ${conflicts.length} 筆既有預約：${first.join('、')}${remaining > 0 ? `，另有 ${remaining} 筆` : ''}。確認後仍會保留預約，並標示衝突供管理員後續處理。`
  }

  return (
    <>
      <ManagerShell
        embedded={embedded}
        onClose={onClose}
        title={`排班與休假${resolvedName ? ` · ${resolvedName}` : ''}`}
        footer={tab === 'schedule' ? (
          <Button className="w-full" loading={scheduleSaving} onClick={requestScheduleSave}>
            儲存固定班表
          </Button>
        ) : undefined}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100">
            <Button
              variant={tab === 'schedule' ? 'primary' : 'ghost'}
              className="shadow-none"
              onClick={() => setTab('schedule')}
            >
              <CalendarDays size={15} /> 固定上班日
            </Button>
            <Button
              variant={tab === 'leave' ? 'primary' : 'ghost'}
              className="shadow-none"
              onClick={() => setTab('leave')}
            >
              <CalendarOff size={15} /> 臨時休假
            </Button>
          </div>

          {tab === 'schedule' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-7 gap-1.5" aria-label="每週上班日摘要">
                {WEEKDAYS.map((label, index) => {
                  const day = schedule[index]
                  return (
                    <div
                      key={label}
                      className={cn(
                        'rounded-2xl border px-1 py-2.5 text-center transition-colors',
                        day?.is_working
                          ? 'bg-slate-950 border-slate-950 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-400',
                      )}
                    >
                      <span className="block text-[10px] opacity-70">週</span>
                      <span className="block text-sm font-semibold">{label}</span>
                    </div>
                  )
                })}
              </div>

              {usingStoreHours && (
                <Alert variant="info" title="目前沿用店家營業時間">
                  這位既有老師尚未建立個別班表；儲存後才會改用下方設定。
                </Alert>
              )}
              {scheduleError && (
                <Alert variant="error" onClose={() => setScheduleError(null)}>
                  {scheduleError}
                </Alert>
              )}

              {scheduleLoading ? (
                <p className="text-center text-slate-400 py-8 text-sm">載入班表中…</p>
              ) : (
                <div className="space-y-2">
                  {schedule.map(day => (
                    <div
                      key={day.weekday}
                      className="grid grid-cols-[72px_1fr] gap-3 items-center rounded-2xl border border-slate-200 bg-white px-3 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <Toggle
                          checked={day.is_working}
                          ariaLabel={`週${WEEKDAYS[day.weekday - 1]}上班`}
                          onChange={is_working => updateScheduleDay(day.weekday, { is_working })}
                        />
                        <span className="text-sm font-semibold text-slate-700">
                          週{WEEKDAYS[day.weekday - 1]}
                        </span>
                      </div>
                      {day.is_working ? (
                        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                          <TimePicker
                            value={day.start_time}
                            startHour={0}
                            endHour={23}
                            minuteStep={15}
                            onChange={start_time => updateScheduleDay(day.weekday, { start_time })}
                          />
                          <span className="text-xs text-slate-400">至</span>
                          <TimePicker
                            value={day.end_time}
                            startHour={0}
                            endHour={23}
                            minuteStep={15}
                            onChange={end_time => updateScheduleDay(day.weekday, { end_time })}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-slate-400 py-2.5">
                          <Clock3 size={14} /> 不排班
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-400">
                已選 {workingCount} 個上班日；每個上班日目前支援一段固定時間。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">新增整日休假</p>
                    <p className="text-xs text-slate-400 mt-0.5">儲存前會先檢查受影響的既有預約</p>
                  </div>
                  <CalendarOff size={18} className="text-amber-500" />
                </div>
                {leaveError && (
                  <Alert variant="error" onClose={() => setLeaveError(null)}>{leaveError}</Alert>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="開始日期" required>
                    <Input
                      type="date"
                      value={form.start_date}
                      onChange={event => setForm(value => ({ ...value, start_date: event.target.value }))}
                    />
                  </FormField>
                  <FormField label="結束日期" required>
                    <Input
                      type="date"
                      value={form.end_date}
                      onChange={event => setForm(value => ({ ...value, end_date: event.target.value }))}
                    />
                  </FormField>
                </div>
                <FormField label="原因" hint="選填，最多 500 字">
                  <Input
                    value={form.reason}
                    maxLength={500}
                    placeholder="例：員工旅遊、年假"
                    onChange={event => setForm(value => ({ ...value, reason: event.target.value }))}
                  />
                </FormField>
                <Button className="w-full" loading={leaveSaving} onClick={requestLeaveSave}>
                  <Plus size={15} /> 新增休假
                </Button>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">已設定休假</p>
                {blocksLoading ? (
                  <p className="text-center text-slate-400 py-6 text-sm">載入休假中…</p>
                ) : blocks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center">
                    <CalendarOff size={22} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-400">目前沒有休假紀錄</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {blocks.map(block => (
                      <div key={block.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">{formatRange(block.start_time, block.end_time)}</p>
                          <p className="text-xs text-slate-400 mt-0.5 truncate">{block.reason || '未填寫原因'}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 shrink-0"
                          onClick={() => setDeleteId(block.id)}
                        >
                          <Trash2 size={14} /> 刪除
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </ManagerShell>

      <ConfirmModal
        open={scheduleConflicts.length > 0}
        onClose={() => setScheduleConflicts([])}
        onConfirm={persistSchedule}
        loading={scheduleSaving}
        title="班表會影響既有預約"
        description={conflictDescription(scheduleConflicts)}
        confirmLabel="仍要儲存"
        variant="primary"
      />

      <ConfirmModal
        open={leaveConflicts.length > 0}
        onClose={() => setLeaveConflicts([])}
        onConfirm={persistLeave}
        loading={leaveSaving}
        title="休假會影響既有預約"
        description={conflictDescription(leaveConflicts)}
        confirmLabel="仍要新增"
        variant="primary"
      />

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="刪除休假紀錄"
        description="刪除後，這段期間會重新依固定班表開放預約。"
        confirmLabel="確認刪除"
      />
    </>
  )
}
