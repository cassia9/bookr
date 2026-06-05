import { useState, useEffect } from 'react'
import { X, Plus, AlertCircle, Check, AlertTriangle } from 'lucide-react'
import dayjs from 'dayjs'
import { supabase } from '@/lib/supabase'
import { callPractitionerLeavesAPI } from '@/lib/practitioner-api'

interface PractitionerLeave {
  id: string
  start_date: string
  end_date: string
  reason?: string
  created_at: string
}

interface PractitionerLeaveManagerProps {
  practitionerId: string
  practitionerName: string
  onClose: () => void
}

export default function PractitionerLeaveManager({
  practitionerId,
  practitionerName,
  onClose,
}: PractitionerLeaveManagerProps) {
  const [leaves, setLeaves] = useState<PractitionerLeave[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [formData, setFormData] = useState({
    start_date: dayjs().format('YYYY-MM-DD'),
    end_date: dayjs().format('YYYY-MM-DD'),
    reason: '',
  })

  useEffect(() => {
    loadLeaves()
  }, [practitionerId])

  const loadLeaves = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('practitioner_leaves')
        .select('*')
        .eq('practitioner_id', practitionerId)
        .order('start_date', { ascending: false })

      if (error) throw error
      setLeaves(data || [])
    } catch (err) {
      console.error('Failed to load leaves:', err)
      setError('無法載入休假記錄')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddLeave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setWarning(null)
    setSuccess(false)

    // 驗證
    if (!formData.start_date || !formData.end_date) {
      setError('請選擇開始和結束日期')
      return
    }

    if (dayjs(formData.end_date).isBefore(formData.start_date)) {
      setError('結束日期不能早於開始日期')
      return
    }

    try {
      await callPractitionerLeavesAPI('create', {
        practitioner_id: practitionerId,
        start_date: formData.start_date,
        end_date: formData.end_date,
        reason: formData.reason.trim() || undefined,
      })

      setSuccess(true)
      setFormData({
        start_date: dayjs().format('YYYY-MM-DD'),
        end_date: dayjs().format('YYYY-MM-DD'),
        reason: '',
      })
      setShowForm(false)
      await loadLeaves()

      // 2秒後清除成功提示
      setTimeout(() => setSuccess(false), 2000)
    } catch (err) {
      console.error('Failed to add leave:', err)
      const message = err instanceof Error ? err.message : '新增休假失敗'
      if (message.includes('overlap')) {
        setWarning('此休假期間與其他休假重疊，但已保存')
        setSuccess(true)
      } else {
        setError(message)
      }
    }
  }

  const handleDeleteLeave = async (leaveId: string) => {
    if (!confirm('確認刪除此休假記錄？')) return

    try {
      await callPractitionerLeavesAPI('delete', { leave_id: leaveId })
      await loadLeaves()
    } catch (err) {
      console.error('Failed to delete leave:', err)
      alert('刪除失敗，請稍後重試')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-800">
        {/* 標題欄 */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">休假管理</h2>
            <p className="text-sm text-slate-400 mt-1">{practitionerName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition text-slate-400 hover:text-slate-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 內容 */}
        <div className="p-6 space-y-6">
          {/* 新增表單 */}
          {showForm && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-4">
              <h3 className="font-medium text-slate-50">新增休假</h3>

              {error && (
                <div className="bg-red-900/30 border border-red-700/50 rounded p-3 flex gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-50">{error}</p>
                </div>
              )}

              {warning && (
                <div className="bg-amber-900/30 border border-amber-700/50 rounded p-3 flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-50">{warning}</p>
                </div>
              )}

              {success && (
                <div className="bg-green-900/30 border border-green-700/50 rounded p-3 flex gap-2">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-green-50">休假已新增</p>
                </div>
              )}

              <form onSubmit={handleAddLeave} className="space-y-3">
                {/* 開始日期 */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    開始日期
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) =>
                      setFormData({ ...formData, start_date: e.target.value })
                    }
                    className="w-full h-9 px-3 text-sm border border-slate-600 bg-slate-700 rounded text-slate-50 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {/* 結束日期 */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    結束日期
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) =>
                      setFormData({ ...formData, end_date: e.target.value })
                    }
                    className="w-full h-9 px-3 text-sm border border-slate-600 bg-slate-700 rounded text-slate-50 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {/* 原因 */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    原因 (可選)
                  </label>
                  <input
                    type="text"
                    value={formData.reason}
                    onChange={(e) =>
                      setFormData({ ...formData, reason: e.target.value })
                    }
                    placeholder="例：年假、生病、進修"
                    className="w-full h-9 px-3 text-sm border border-slate-600 bg-slate-700 rounded text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                {/* 按鈕 */}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 h-8 text-sm px-3 border border-slate-600 bg-slate-700 hover:bg-slate-600 text-slate-50 rounded transition"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="flex-1 h-8 text-sm px-3 bg-green-600 hover:bg-green-700 text-white rounded transition font-medium"
                  >
                    新增
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* 新增按鈕 */}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full h-10 flex items-center justify-center gap-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium text-sm shadow-sm"
            >
              <Plus className="w-4 h-4" />
              新增休假
            </button>
          )}

          {/* 休假列表 */}
          {isLoading ? (
            <div className="text-center text-slate-400 py-6">載入中...</div>
          ) : leaves.length === 0 ? (
            <div className="text-center text-slate-400 py-6">
              {showForm ? '' : '暫無休假記錄'}
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-50 mb-3">
                休假記錄
              </h3>
              {leaves.map((leave) => (
                <div
                  key={leave.id}
                  className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-2 hover:bg-slate-800/80 transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-50">
                        {dayjs(leave.start_date).format('YYYY-MM-DD')}
                        {' 至 '}
                        {dayjs(leave.end_date).format('YYYY-MM-DD')}
                      </p>
                      {leave.reason && (
                        <p className="text-xs text-slate-400 mt-1">
                          原因：{leave.reason}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 mt-1">
                        {dayjs(leave.start_date).diff(
                          dayjs(leave.end_date),
                          'day'
                        ) === 0
                          ? '1 天'
                          : `${Math.abs(dayjs(leave.start_date).diff(dayjs(leave.end_date), 'day')) + 1} 天`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteLeave(leave.id)}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-600/20 rounded transition"
                      title="刪除休假"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
