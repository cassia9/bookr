import { useState, useEffect } from 'react'
import { Search, Plus, Trash2, Calendar, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { callPractitionersAPI } from '@/lib/practitioner-api'

interface Practitioner {
  id: string
  name: string
  color_hex: string
  is_active: boolean
  deleted_at: string | null
}

interface PractitionerListProps {
  selectedPractitionerId: string | null
  onSelectPractitioner: (id: string | null) => void
  onAddPractitioner: () => void
  onEditPractitioner: (id: string) => void
  onDeletePractitioner: (id: string) => void
  onManageLeaves: (id: string) => void
}

export default function PractitionerList({
  selectedPractitionerId,
  onSelectPractitioner,
  onAddPractitioner,
  onEditPractitioner,
  onDeletePractitioner,
  onManageLeaves,
}: PractitionerListProps) {
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  useEffect(() => {
    loadPractitioners()

    // 訂閱實時更新
    const subscription = supabase
      .channel('practitioners-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'practitioners',
        },
        () => {
          loadPractitioners()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const loadPractitioners = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('practitioners')
        .select('id, name, color_hex, is_active, deleted_at')
        .is('deleted_at', null) // 排除已軟刪除的老師
        .order('name', { ascending: true })

      if (error) throw error
      setPractitioners(data || [])
    } catch (error) {
      console.error('Failed to load practitioners:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredPractitioners = practitioners.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleDelete = async (id: string) => {
    try {
      await callPractitionersAPI('delete', { practitioner_id: id })
      setDeleteConfirmId(null)
      if (selectedPractitionerId === id) {
        onSelectPractitioner(null)
      }
      loadPractitioners()
    } catch (error) {
      console.error('Failed to delete practitioner:', error)
      alert('刪除失敗，請稍後重試')
    }
  }

  return (
    <aside className="w-60 bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden flex-shrink-0">
      {/* 標題欄 */}
      <div className="px-4 py-4 border-b border-slate-800">
        <h2 className="text-sm font-semibold text-slate-50 mb-3">從業人員</h2>

        {/* 搜尋框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="搜尋..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-700 bg-slate-800 rounded-lg text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="px-4 py-6 text-center text-sm text-slate-400">
            載入中...
          </div>
        ) : filteredPractitioners.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-400">
            {searchTerm
              ? '未找到相符老師'
              : '暫無老師，點擊下方新增'}
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredPractitioners.map((practitioner) => (
              <div
                key={practitioner.id}
                className={cn(
                  'p-3 border-l-4 transition-colors hover:bg-slate-800/50',
                  selectedPractitionerId === practitioner.id
                    ? 'bg-slate-800/80 border-l-green-500'
                    : 'border-l-transparent'
                )}
              >
                {/* 點擊行 */}
                <button
                  onClick={() => onSelectPractitioner(
                    selectedPractitionerId === practitioner.id
                      ? null
                      : practitioner.id
                  )}
                  className="w-full text-left mb-2"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {/* 顏色指示 */}
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm border border-slate-700"
                      style={{ backgroundColor: practitioner.color_hex }}
                      title={practitioner.name}
                    />
                    <span className="text-sm font-medium text-slate-50 truncate flex-1">
                      {practitioner.name}
                    </span>
                    {!practitioner.is_active && (
                      <span className="px-2 py-0.5 bg-slate-700 text-xs text-slate-300 rounded">
                        停用
                      </span>
                    )}
                  </div>
                </button>

                {/* 展開時顯示操作按鈕 */}
                {selectedPractitionerId === practitioner.id && (
                  <div className="flex gap-1">
                    {/* 管理休假按鈕 */}
                    <button
                      onClick={() => onManageLeaves(practitioner.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded border border-blue-700/30 transition"
                      title="管理休假"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      休假
                    </button>

                    {/* 編輯按鈕 */}
                    <button
                      onClick={() => onEditPractitioner(practitioner.id)}
                      className="flex-1 px-2 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-50 rounded border border-slate-600 transition"
                      title="編輯老師"
                    >
                      編輯
                    </button>

                    {/* 刪除按鈕 */}
                    {deleteConfirmId === practitioner.id ? (
                      <div className="absolute left-4 right-4 top-0 bottom-0 bg-red-900/95 border border-red-700 rounded p-3 flex flex-col items-center justify-center gap-2 z-10">
                        <AlertCircle className="w-4 h-4 text-red-300" />
                        <p className="text-xs text-red-100 text-center font-medium">
                          確認刪除？
                        </p>
                        <div className="flex gap-1 w-full">
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="flex-1 px-2 py-1 text-xs bg-red-800 hover:bg-red-700 text-red-100 rounded"
                          >
                            取消
                          </button>
                          <button
                            onClick={() => handleDelete(practitioner.id)}
                            className="flex-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded font-medium"
                          >
                            刪除
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(practitioner.id)}
                        className="flex-1 px-2 py-1.5 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-300 rounded border border-red-700/30 transition"
                        title="刪除老師"
                      >
                        <Trash2 className="w-3.5 h-3.5 mx-auto" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新增按鈕 */}
      <div className="px-4 py-4 border-t border-slate-800 bg-slate-900">
        <button
          onClick={onAddPractitioner}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium text-sm shadow-sm hover:shadow-md"
        >
          <Plus className="w-4 h-4" />
          新增老師
        </button>
      </div>
    </aside>
  )
}
