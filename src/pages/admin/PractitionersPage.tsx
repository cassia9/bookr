import { useState, useEffect } from 'react'
import { UserCircle, Plus, Pencil, Trash2, CalendarOff, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { zhTW } from 'date-fns/locale/zh-TW'
import { supabase } from '../../lib/supabase'
import type { Practitioner, PractitionerBlock } from '../../types/database'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Toggle from '../../components/ui/Toggle'
import DatePicker from '../../components/ui/DatePicker'
import TimePicker from '../../components/ui/TimePicker'
import PractitionerDrawer from '../../components/PractitionerDrawer'

const STORE_ID = '00000000-0000-0000-0000-000000000001'

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6', '#0ea5e9',
]

const empty = { full_name: '', title: '', phone: '', color: COLORS[0], active: true }

const inputCls = 'w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-slate-50 hover:bg-white focus:bg-white'

const emptyBlock = {
  startDate: format(new Date(), 'yyyy-MM-dd'),
  startTime: '09:00',
  endDate:   format(new Date(), 'yyyy-MM-dd'),
  endTime:   '18:00',
  reason:    '',
}

export default function PractitionersPage() {
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Practitioner | null>(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Practitioner | null>(null)

  // Block management state
  const [blocksPractitioner, setBlocksPractitioner]   = useState<Practitioner | null>(null)
  const [blocks,             setBlocks]               = useState<PractitionerBlock[]>([])
  const [blocksLoading,      setBlocksLoading]        = useState(false)
  const [blockForm,          setBlockForm]            = useState(emptyBlock)
  const [blockSaving,        setBlockSaving]          = useState(false)
  const [blockErrors,        setBlockErrors]          = useState<Record<string, string>>({})
  const [deleteBlockTarget,  setDeleteBlockTarget]    = useState<PractitionerBlock | null>(null)

  // Drawer state
  const [selectedPractitioner, setSelectedPractitioner] = useState<Practitioner | null>(null)
  const [showDrawer, setShowDrawer] = useState(false)

  useEffect(() => { fetchPractitioners() }, [])

  async function fetchPractitioners() {
    setLoading(true)
    const { data } = await supabase
      .from('practitioners')
      .select('*')
      .eq('store_id', STORE_ID)
      .order('created_at', { ascending: true })
    setPractitioners(data ?? [])
    setLoading(false)
  }

  // ── Practitioner CRUD ──────────────────────────────────────────────

  function openAdd() {
    setEditing(null)
    setForm(empty)
    setModalOpen(true)
  }

  function openEdit(p: Practitioner) {
    setEditing(p)
    setForm({ full_name: p.full_name, title: p.title ?? '', phone: p.phone ?? '', color: p.color, active: p.active })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.full_name.trim()) return
    setSaving(true)
    if (editing) {
      await supabase.from('practitioners').update(form).eq('id', editing.id)
    } else {
      await supabase.from('practitioners').insert({ ...form, store_id: STORE_ID })
    }
    setSaving(false)
    setModalOpen(false)
    fetchPractitioners()
  }

  async function handleToggleActive(p: Practitioner) {
    await supabase.from('practitioners').update({ active: !p.active }).eq('id', p.id)
    fetchPractitioners()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await supabase.from('practitioners').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    fetchPractitioners()
  }

  // ── Block management ───────────────────────────────────────────────

  async function openBlocks(p: Practitioner) {
    setBlocksPractitioner(p)
    setBlockForm(emptyBlock)
    setBlockErrors({})
    await fetchBlocks(p.id)
  }

  async function fetchBlocks(practitionerId: string) {
    setBlocksLoading(true)
    const { data } = await supabase
      .from('practitioner_blocks')
      .select('*')
      .eq('practitioner_id', practitionerId)
      .order('start_time', { ascending: true })
    setBlocks(data ?? [])
    setBlocksLoading(false)
  }

  function validateBlock() {
    const e: Record<string, string> = {}
    if (!blockForm.startDate) e.startDate = '請選擇開始日期'
    if (!blockForm.startTime) e.startTime = '請選擇開始時間'
    if (!blockForm.endDate)   e.endDate   = '請選擇結束日期'
    if (!blockForm.endTime)   e.endTime   = '請選擇結束時間'
    if (!e.startDate && !e.startTime && !e.endDate && !e.endTime) {
      const start = new Date(`${blockForm.startDate}T${blockForm.startTime}`)
      const end   = new Date(`${blockForm.endDate}T${blockForm.endTime}`)
      if (end <= start) e.endDate = '結束時間必須晚於開始時間'
    }
    setBlockErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleAddBlock() {
    if (!blocksPractitioner || !validateBlock()) return
    setBlockSaving(true)
    const start = new Date(`${blockForm.startDate}T${blockForm.startTime}`)
    const end   = new Date(`${blockForm.endDate}T${blockForm.endTime}`)
    await supabase.from('practitioner_blocks').insert({
      practitioner_id: blocksPractitioner.id,
      store_id:        STORE_ID,
      start_time:      start.toISOString(),
      end_time:        end.toISOString(),
      reason:          blockForm.reason.trim() || null,
    })
    setBlockSaving(false)
    setBlockForm(emptyBlock)
    setBlockErrors({})
    fetchBlocks(blocksPractitioner.id)
  }

  async function handleDeleteBlock() {
    if (!deleteBlockTarget || !blocksPractitioner) return
    await supabase.from('practitioner_blocks').delete().eq('id', deleteBlockTarget.id)
    setDeleteBlockTarget(null)
    fetchBlocks(blocksPractitioner.id)
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2.5">
          <UserCircle size={24} strokeWidth={1.5} className="text-indigo-500" />
          從業人員管理
        </h1>
        <Button onClick={openAdd}>
          <Plus size={16} strokeWidth={2} />
          新增從業人員
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : practitioners.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-12 text-center">
          <UserCircle size={40} strokeWidth={1.5} className="mx-auto mb-3 text-slate-200" />
          <p className="text-slate-500 font-medium">還沒有從業人員</p>
          <p className="text-sm text-slate-400 mt-1">點「新增從業人員」建立第一位</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="text-left px-5 py-3.5 font-medium text-slate-500 text-xs uppercase tracking-wide">姓名</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-500 text-xs uppercase tracking-wide">職稱</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-500 text-xs uppercase tracking-wide">電話</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-500 text-xs uppercase tracking-wide">顏色</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-500 text-xs uppercase tracking-wide">啟用</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {practitioners.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-2xl flex items-center justify-center text-white text-sm font-semibold shrink-0 shadow-sm"
                        style={{ backgroundColor: p.color }}>
                        {p.full_name[0]}
                      </div>
                      <span className="font-medium text-slate-900">{p.full_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-500 text-sm">{p.title || '—'}</td>
                  <td className="px-5 py-4 text-slate-500 text-sm">{p.phone || '—'}</td>
                  <td className="px-5 py-4">
                    <div className="w-6 h-6 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: p.color }} />
                  </td>
                  <td className="px-5 py-4">
                    <Toggle checked={p.active} onChange={() => handleToggleActive(p)} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setSelectedPractitioner(p)
                          setShowDrawer(true)
                        }}
                        title="查看詳情"
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-colors"
                      >
                        <UserCircle size={15} strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={() => openBlocks(p)}
                        title="管理不可預約時段"
                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-2xl transition-colors"
                      >
                        <CalendarOff size={15} strokeWidth={1.5} />
                      </button>
                      <button onClick={() => openEdit(p)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-colors">
                        <Pencil size={15} strokeWidth={1.5} />
                      </button>
                      <button onClick={() => setDeleteTarget(p)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-colors">
                        <Trash2 size={15} strokeWidth={1.5} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit / Add modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? '編輯從業人員' : '新增從業人員'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">姓名 *</label>
            <input
              value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="例：王小明"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">職稱</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="例：伸展師"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">電話</label>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="09xx-xxx-xxx"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">行事曆顯示顏色</label>
            <div className="flex gap-2.5 flex-wrap p-3 bg-slate-50 rounded-2xl border border-slate-100">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className="w-7 h-7 rounded-full transition-transform hover:scale-110 active:scale-95"
                  style={{ backgroundColor: c, outline: form.color === c ? `3px solid ${c}` : 'none', outlineOffset: '2px' }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between py-1 px-3 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-sm font-medium text-slate-700">啟用</span>
            <Toggle checked={form.active} onChange={v => setForm(f => ({ ...f, active: v }))} />
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>取消</Button>
            <Button className="flex-1" loading={saving} onClick={handleSave}>
              {editing ? '儲存變更' : '新增'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete practitioner modal ── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="刪除從業人員" size="sm">
        <p className="text-sm text-slate-600 mb-5">
          確定要刪除「<span className="font-semibold text-slate-900">{deleteTarget?.full_name}</span>」嗎？此動作無法復原。
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button variant="danger" className="flex-1" onClick={handleDelete}>刪除</Button>
        </div>
      </Modal>

      {/* ── Blocks management modal ── */}
      <Modal
        open={!!blocksPractitioner}
        onClose={() => setBlocksPractitioner(null)}
        title={`不可預約時段 — ${blocksPractitioner?.full_name ?? ''}`}
        size="lg"
      >
        <div className="space-y-5">
          {/* Add new block form */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">新增封鎖時段</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">開始日期 *</label>
                <DatePicker
                  value={blockForm.startDate}
                  onChange={v => setBlockForm(f => ({ ...f, startDate: v }))}
                  error={!!blockErrors.startDate}
                />
                {blockErrors.startDate && <p className="text-xs text-red-500 mt-1">{blockErrors.startDate}</p>}
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">開始時間 *</label>
                <TimePicker
                  value={blockForm.startTime}
                  onChange={v => setBlockForm(f => ({ ...f, startTime: v }))}
                  startHour={0}
                  endHour={23}
                  minuteStep={30}
                  error={!!blockErrors.startTime}
                />
                {blockErrors.startTime && <p className="text-xs text-red-500 mt-1">{blockErrors.startTime}</p>}
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">結束日期 *</label>
                <DatePicker
                  value={blockForm.endDate}
                  onChange={v => setBlockForm(f => ({ ...f, endDate: v }))}
                  error={!!blockErrors.endDate}
                />
                {blockErrors.endDate && <p className="text-xs text-red-500 mt-1">{blockErrors.endDate}</p>}
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">結束時間 *</label>
                <TimePicker
                  value={blockForm.endTime}
                  onChange={v => setBlockForm(f => ({ ...f, endTime: v }))}
                  startHour={0}
                  endHour={23}
                  minuteStep={30}
                  error={!!blockErrors.endTime}
                />
                {blockErrors.endTime && <p className="text-xs text-red-500 mt-1">{blockErrors.endTime}</p>}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1.5">原因（選填）</label>
              <input
                value={blockForm.reason}
                onChange={e => setBlockForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="例：年假、臨時請假"
                className="w-full px-3 py-2 rounded-2xl border border-slate-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-white"
              />
            </div>

            <Button loading={blockSaving} onClick={handleAddBlock}>
              <Plus size={15} strokeWidth={2} /> 新增封鎖時段
            </Button>
          </div>

          {/* Existing blocks list */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              已設定的封鎖時段
            </p>
            {blocksLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : blocks.length === 0 ? (
              <div className="py-6 text-center bg-white rounded-2xl border border-slate-100">
                <CalendarOff size={24} strokeWidth={1.5} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm text-slate-400">尚無封鎖時段</p>
              </div>
            ) : (
              <div className="space-y-2">
                {blocks.map(b => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-slate-100 hover:border-red-100 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {format(parseISO(b.start_time), 'yyyy/MM/dd HH:mm', { locale: zhTW })}
                        {' — '}
                        {format(parseISO(b.end_time), 'yyyy/MM/dd HH:mm', { locale: zhTW })}
                      </p>
                      {b.reason && (
                        <p className="text-xs text-slate-400 mt-0.5">{b.reason}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setDeleteBlockTarget(b)}
                      className="ml-3 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors flex-shrink-0"
                      title="刪除此封鎖時段"
                    >
                      <X size={15} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Delete block confirmation ── */}
      <Modal open={!!deleteBlockTarget} onClose={() => setDeleteBlockTarget(null)} title="刪除封鎖時段" size="sm">
        <p className="text-sm text-slate-600 mb-5">確定要刪除這個封鎖時段嗎？刪除後該時段將可再度接受預約。</p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteBlockTarget(null)}>取消</Button>
          <Button variant="danger" className="flex-1" onClick={handleDeleteBlock}>刪除</Button>
        </div>
      </Modal>

      {/* ── Practitioner Details Drawer ── */}
      {selectedPractitioner && (
        <PractitionerDrawer
          isOpen={showDrawer}
          practitioner={{
            id: selectedPractitioner.id,
            name: selectedPractitioner.full_name,
            profession: selectedPractitioner.title || '從業人員',
            phone: selectedPractitioner.phone,
            email: selectedPractitioner.email,
          }}
          onClose={() => setShowDrawer(false)}
        />
      )}
    </div>
  )
}
