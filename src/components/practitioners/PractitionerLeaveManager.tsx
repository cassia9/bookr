import { useState, useEffect } from 'react'
import { X, Plus, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const STORE_ID = '00000000-0000-0000-0000-000000000001'

interface Block {
  id: string
  start_time: string
  end_time: string
  reason: string | null
  created_at: string
}

interface Props {
  practitionerId: string
  practitionerName: string
  onClose: () => void
}

export default function PractitionerLeaveManager({ practitionerId, practitionerName, onClose }: Props) {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ start_date: today, end_date: today, reason: '' })

  useEffect(() => { loadBlocks() }, [practitionerId])

  async function loadBlocks() {
    setLoading(true)
    const { data, error } = await supabase
      .from('practitioner_blocks')
      .select('*')
      .eq('practitioner_id', practitionerId)
      .eq('store_id', STORE_ID)
      .order('start_time', { ascending: false })
    if (error) setError('無法載入封鎖時段')
    else setBlocks(data ?? [])
    setLoading(false)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.start_date || !form.end_date) { setError('請選擇日期'); return }
    if (form.end_date < form.start_date) { setError('結束日期不能早於開始日期'); return }

    setSaving(true)
    const { error } = await supabase.from('practitioner_blocks').insert({
      practitioner_id: practitionerId,
      store_id: STORE_ID,
      start_time: `${form.start_date}T00:00:00+08:00`,
      end_time: `${form.end_date}T23:59:59+08:00`,
      reason: form.reason.trim() || null,
    })
    setSaving(false)

    if (error) { setError('新增失敗：' + error.message); return }
    setForm({ start_date: today, end_date: today, reason: '' })
    setShowForm(false)
    loadBlocks()
  }

  async function handleDelete(id: string) {
    if (!confirm('確認刪除此休假記錄？')) return
    const { error } = await supabase.from('practitioner_blocks').delete().eq('id', id)
    if (error) { alert('刪除失敗'); return }
    loadBlocks()
  }

  function formatRange(start: string, end: string) {
    const s = new Date(start)
    const e = new Date(end)
    const fmt = (d: Date) => `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
    if (fmt(s) === fmt(e)) return fmt(s)
    return `${fmt(s)} 至 ${fmt(e)}`
  }

  function dayCount(start: string, end: string) {
    const diff = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000)
    return diff <= 0 ? '1 天' : `${diff + 1} 天`
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* 標題 */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="text-base font-semibold text-slate-900">休假管理</h2>
            <p className="text-sm text-slate-500 mt-0.5">{practitionerName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* 新增表單 */}
          {showForm && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
              <h3 className="font-medium text-slate-800 text-sm">新增休假時段</h3>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
              <form onSubmit={handleAdd} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">開始日期</label>
                    <input type="date" value={form.start_date}
                      onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                      className="w-full h-9 px-3 text-sm border border-slate-200 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-black" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">結束日期</label>
                    <input type="date" value={form.end_date}
                      onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                      className="w-full h-9 px-3 text-sm border border-slate-200 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-black" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">原因（選填）</label>
                  <input type="text" value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="例：年假、出國、生病"
                    className="w-full h-9 px-3 text-sm border border-slate-200 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-black placeholder-slate-400" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => { setShowForm(false); setError(null) }}
                    className="flex-1 h-9 text-sm border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition">
                    取消
                  </button>
                  <button type="submit" disabled={saving}
                    className="flex-1 h-9 text-sm bg-black hover:bg-gray-800 text-white rounded-lg transition font-medium disabled:opacity-50">
                    {saving ? '新增中...' : '新增'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 新增按鈕 */}
          {!showForm && (
            <button onClick={() => { setShowForm(true); setError(null) }}
              className="w-full h-10 flex items-center justify-center gap-2 bg-black hover:bg-gray-800 text-white rounded-xl transition font-medium text-sm">
              <Plus className="w-4 h-4" /> 新增休假
            </button>
          )}

          {/* 列表 */}
          {loading ? (
            <p className="text-center text-slate-400 py-6 text-sm">載入中...</p>
          ) : blocks.length === 0 ? (
            <p className="text-center text-slate-400 py-6 text-sm">暫無休假記錄</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">休假記錄</p>
              {blocks.map(b => (
                <div key={b.id} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{formatRange(b.start_time, b.end_time)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {dayCount(b.start_time, b.end_time)}
                      {b.reason && <span className="ml-2 text-slate-400">· {b.reason}</span>}
                    </p>
                  </div>
                  <button onClick={() => handleDelete(b.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition ml-3 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
