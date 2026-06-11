import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import FormField from '@/components/ui/FormField'
import Alert from '@/components/ui/Alert'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { toast } from '@/components/ui/Snackbar'

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
  const [deleteId, setDeleteId] = useState<string | null>(null)

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
    if (error) toast.error('無法載入封鎖時段')
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
    toast.success('休假時段已新增')
    setForm({ start_date: today, end_date: today, reason: '' })
    setShowForm(false)
    loadBlocks()
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('practitioner_blocks').delete().eq('id', id)
    if (error) { toast.error('刪除失敗'); return }
    toast.success('休假記錄已刪除')
    setDeleteId(null)
    loadBlocks()
  }

  function formatRange(start: string, end: string) {
    const fmt = (d: Date) => `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
    const s = new Date(start), e = new Date(end)
    return fmt(s) === fmt(e) ? fmt(s) : `${fmt(s)} 至 ${fmt(e)}`
  }

  function dayCount(start: string, end: string) {
    const diff = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000)
    return diff <= 0 ? '1 天' : `${diff + 1} 天`
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="休假管理"
        size="sm"
        footer={
          !showForm ? (
            <Button className="w-full" onClick={() => { setShowForm(true); setError(null) }}>
              <Plus size={14} /> 新增休假
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400 -mt-2">{practitionerName}</p>

          {/* 新增表單 */}
          {showForm && (
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-200">
              <p className="text-xs font-semibold text-slate-700">新增休假時段</p>
              {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}
              <form onSubmit={handleAdd} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="開始日期">
                    <Input type="date" value={form.start_date}
                      onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                  </FormField>
                  <FormField label="結束日期">
                    <Input type="date" value={form.end_date}
                      onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                  </FormField>
                </div>
                <FormField label="原因" hint="選填">
                  <Input type="text" value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="例：年假、出國、生病" />
                </FormField>
                <div className="flex gap-2 pt-1">
                  <Button variant="secondary" className="flex-1" type="button"
                    onClick={() => { setShowForm(false); setError(null) }}>
                    取消
                  </Button>
                  <Button className="flex-1" type="submit" loading={saving}>新增</Button>
                </div>
              </form>
            </div>
          )}

          {/* 記錄列表 */}
          {loading ? (
            <p className="text-center text-slate-400 py-6 text-sm">載入中…</p>
          ) : blocks.length === 0 ? (
            <p className="text-center text-slate-400 py-4 text-sm">暫無休假記錄</p>
          ) : (
            <div className="space-y-2">
              {blocks.map(b => (
                <div key={b.id} className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{formatRange(b.start_time, b.end_time)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {dayCount(b.start_time, b.end_time)}
                      {b.reason && <span className="ml-2">· {b.reason}</span>}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-400 hover:bg-red-50 shrink-0 ml-2"
                    onClick={() => setDeleteId(b.id)}>
                    刪除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="確認刪除休假記錄"
        description="此筆休假記錄將被移除，老師在此期間將可被預約。"
        confirmLabel="確認刪除"
      />
    </>
  )
}
