import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, Trash2, Calendar, Eye, Edit2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { callPractitionersAPI } from '@/lib/practitioner-api'

interface Practitioner {
  id: string
  full_name: string
  color: string
  active: boolean
  bookingCount?: number
  serviceCount?: number
}

interface PractitionerTableProps {
  searchTerm: string
  filterStatus: 'all' | 'active' | 'inactive'
  onEdit: (id: string) => void
  onManageLeaves: (id: string) => void
  onViewDetails: (practitioner: Practitioner) => void
  onRefresh: () => void
}

export default function PractitionerTable({
  searchTerm,
  filterStatus,
  onEdit,
  onManageLeaves,
  onViewDetails,
  onRefresh,
}: PractitionerTableProps) {
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [deleteConfirmPractitionerId, setDeleteConfirmPractitionerId] = useState<string | null>(null)
  const [deleteConfirmPractitioner, setDeleteConfirmPractitioner] = useState<Practitioner | null>(null)
  const [menuPosition, setMenuPosition] = useState<'top' | 'bottom'>('bottom')
  const [menuCoords, setMenuCoords] = useState<{ x: number; y: number } | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)

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

  // 點擊外部關閉菜單
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('td')) {
        setOpenMenuId(null)
        setMenuCoords(null)
      }
    }

    if (openMenuId) {
      document.addEventListener('click', handleClickOutside)
      return () => {
        document.removeEventListener('click', handleClickOutside)
      }
    }
  }, [openMenuId])

  const loadPractitioners = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('practitioners')
        .select('id, full_name, color, active')
        .is('deleted_at', null)
        .order('full_name', { ascending: true })

      if (error) throw error

      // 為每個老師計算預約數和課程數
      const practitionersWithStats = await Promise.all(
        (data || []).map(async (p) => {
          const { count: bookingCount } = await supabase
            .from('bookings')
            .select('id', { count: 'exact', head: 0 })
            .eq('practitioner_id', p.id)
            .in('status', ['pending', 'confirmed'])

          const { count: serviceCount } = await supabase
            .from('practitioner_services')
            .select('id', { count: 'exact', head: 0 })
            .eq('practitioner_id', p.id)

          return {
            ...p,
            bookingCount: bookingCount || 0,
            serviceCount: serviceCount || 0,
          }
        })
      )

      setPractitioners(practitionersWithStats)
    } catch (error) {
      console.error('Failed to load practitioners:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await callPractitionersAPI('delete', { practitioner_id: id })
      setDeleteConfirmId(null)
      setOpenMenuId(null)
      loadPractitioners()
      onRefresh()
    } catch (error) {
      console.error('Failed to delete practitioner:', error)
      alert('刪除失敗，請稍後重試')
    }
  }

  // 篩選和搜尋
  const filteredPractitioners = practitioners.filter((p) => {
    // 搜尋過濾
    if (
      searchTerm &&
      !p.full_name.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false
    }

    // 狀態過濾
    if (filterStatus === 'active' && !p.active) {
      return false
    }
    if (filterStatus === 'inactive' && p.active) {
      return false
    }

    return true
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-text-secondary">載入中...</div>
      </div>
    )
  }

  if (filteredPractitioners.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-text-secondary mb-2">
            {searchTerm || filterStatus !== 'all'
              ? '未找到相符的老師'
              : '暫無老師'}
          </p>
          <p className="text-xs text-text-secondary/70">
            {!searchTerm && filterStatus === 'all'
              ? '點擊「新增老師」開始添加'
              : '調整搜尋或篩選條件'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-x-auto p-6">
      <div className="bg-white rounded-xl shadow-lg border-0">
        <div className="overflow-hidden">
          <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200/50">
            <th className="px-6 py-3 text-left text-xs font-semibold text-text-primary">
              名字
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-text-primary">
              識別色
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-text-primary">
              課程
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-text-primary">
              預約數
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-text-primary">
              狀態
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-text-primary">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {filteredPractitioners.map((practitioner) => (
            <tr
              key={practitioner.id}
              className="border-b border-slate-200/30 hover:bg-slate-100 transition-colors group relative"
            >
              {/* 名字 */}
              <td className="px-6 py-4 text-sm text-text-primary font-medium">
                {practitioner.full_name}
              </td>

              {/* 識別色 */}
              <td className="px-6 py-4 text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded border border-slate-200 shadow-sm"
                    style={{ backgroundColor: practitioner.color }}
                    title={practitioner.color}
                  />
                  <span className="text-xs text-text-secondary">
                    {practitioner.color}
                  </span>
                </div>
              </td>

              {/* 課程數 */}
              <td className="px-6 py-4 text-sm text-text-primary">
                <span className="inline-block px-2 py-1 bg-info-light border border-info rounded text-xs text-info">
                  {practitioner.serviceCount || 0} 個課程
                </span>
              </td>

              {/* 預約數 */}
              <td className="px-6 py-4 text-sm text-text-primary">
                <span className="font-semibold">
                  {practitioner.bookingCount || 0}
                </span>
                <span className="text-xs text-text-secondary ml-1">場預約</span>
              </td>

              {/* 狀態 */}
              <td className="px-6 py-4 text-sm">
                {practitioner.active ? (
                  <span className="inline-block px-2 py-1 bg-success-light border border-success rounded text-xs text-success">
                    活躍
                  </span>
                ) : (
                  <span className="inline-block px-2 py-1 bg-surface-secondary border border-slate-200 rounded text-xs text-text-secondary">
                    停用
                  </span>
                )}
              </td>

              {/* 操作 */}
              <td className="px-6 py-4 text-right">
                <div className="relative inline-block">
                  <button
                    ref={(el) => {
                      if (openMenuId === practitioner.id) {
                        menuButtonRef.current = el
                      }
                    }}
                    onClick={(e) => {
                      const button = e.currentTarget
                      const rect = button.getBoundingClientRect()
                      // 計算菜單位置
                      const shouldShowAbove = rect.top > 250
                      setMenuPosition(shouldShowAbove ? 'top' : 'bottom')
                      setMenuCoords({
                        x: rect.right - 192, // w-48 = 192px
                        y: shouldShowAbove ? rect.top : rect.bottom,
                      })
                      setOpenMenuId(
                        openMenuId === practitioner.id ? null : practitioner.id
                      )
                    }}
                    className="p-1 hover:bg-surface-secondary rounded transition text-text-secondary hover:text-text-primary"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {/* 菜單使用 Portal 渲染 */}
                  {openMenuId === practitioner.id && menuCoords && createPortal(
                    <div
                      className="fixed w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-40"
                      style={{
                        left: `${menuCoords.x}px`,
                        top: `${menuCoords.y + (menuPosition === 'bottom' ? 8 : -180)}px`,
                      }}
                    >
                      <button
                        onClick={() => {
                          onEdit(practitioner.id)
                          setOpenMenuId(null)
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surface-secondary flex items-center gap-2"
                      >
                        <Edit2 className="w-4 h-4" />
                        編輯
                      </button>
                      <button
                        onClick={() => {
                          onManageLeaves(practitioner.id)
                          setOpenMenuId(null)
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surface-secondary flex items-center gap-2"
                      >
                        <Calendar className="w-4 h-4" />
                        管理休假
                      </button>
                      <button
                        onClick={() => {
                          onViewDetails(practitioner)
                          setOpenMenuId(null)
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surface-secondary flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        查看詳情
                      </button>
                      <div className="border-t border-slate-200 my-1" />
                      <button
                        onClick={() => {
                          setDeleteConfirmPractitionerId(practitioner.id)
                          setDeleteConfirmPractitioner(practitioner)
                          setOpenMenuId(null)
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-danger hover:bg-danger-light flex items-center gap-2 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        刪除
                      </button>
                    </div>,
                    document.body
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
        </div>
      </div>

      {/* 刪除確認對話框 */}
      {deleteConfirmPractitionerId && deleteConfirmPractitioner && createPortal(
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setDeleteConfirmPractitionerId(null)
            setDeleteConfirmPractitioner(null)
          }}
        >
          <div
            className="bg-white rounded-lg shadow-lg border border-slate-200 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 內容區 */}
            <div className="p-6 space-y-5">
              {/* 標題 */}
              <h2 className="text-base font-semibold text-slate-900">
                確定要刪除老師嗎？
              </h2>

              {/* 說明文字 */}
              <p className="text-sm text-slate-600 leading-relaxed">
                將刪除「<span className="font-medium text-slate-900">{deleteConfirmPractitioner.full_name}</span>」的所有資料。此操作無法撤銷。
              </p>
            </div>

            {/* 按鈕區 */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setDeleteConfirmPractitionerId(null)
                  setDeleteConfirmPractitioner(null)
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors duration-150 cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={() => {
                  handleDelete(deleteConfirmPractitionerId)
                  setDeleteConfirmPractitionerId(null)
                  setDeleteConfirmPractitioner(null)
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors duration-150 cursor-pointer"
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
