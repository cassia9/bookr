import { useState, useEffect } from 'react'
import { MoreVertical, Trash2, Calendar, Eye, Edit2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import { callPractitionersAPI } from '@/lib/practitioner-api'

interface Practitioner {
  id: string
  name: string
  color_hex: string
  is_active: boolean
  bookingCount?: number
  serviceCount?: number
}

interface PractitionerTableProps {
  searchTerm: string
  filterStatus: 'all' | 'active' | 'inactive'
  onEdit: (id: string) => void
  onManageLeaves: (id: string) => void
  onRefresh: () => void
}

export default function PractitionerTable({
  searchTerm,
  filterStatus,
  onEdit,
  onManageLeaves,
  onRefresh,
}: PractitionerTableProps) {
  const [practitioners, setPractitioners] = useState<Practitioner[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
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
        .select('id, name, color_hex, is_active')
        .is('deleted_at', null)
        .order('name', { ascending: true })

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
      !p.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false
    }

    // 狀態過濾
    if (filterStatus === 'active' && !p.is_active) {
      return false
    }
    if (filterStatus === 'inactive' && p.is_active) {
      return false
    }

    return true
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">載入中...</div>
      </div>
    )
  }

  if (filteredPractitioners.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-slate-400 mb-2">
            {searchTerm || filterStatus !== 'all'
              ? '未找到相符的老師'
              : '暫無老師'}
          </p>
          <p className="text-xs text-slate-500">
            {!searchTerm && filterStatus === 'all'
              ? '點擊「新增老師」開始添加'
              : '調整搜尋或篩選條件'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-surface-secondary border-b border-border">
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
              className="border-b border-border hover:bg-surface-secondary transition group relative"
            >
              {/* 名字 */}
              <td className="px-6 py-4 text-sm text-text-primary font-medium">
                {practitioner.name}
              </td>

              {/* 識別色 */}
              <td className="px-6 py-4 text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded border border-border shadow-sm"
                    style={{ backgroundColor: practitioner.color_hex }}
                    title={practitioner.color_hex}
                  />
                  <span className="text-xs text-text-secondary">
                    {practitioner.color_hex}
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
                {practitioner.is_active ? (
                  <span className="inline-block px-2 py-1 bg-success-light border border-success rounded text-xs text-success">
                    活躍
                  </span>
                ) : (
                  <span className="inline-block px-2 py-1 bg-surface-secondary border border-border rounded text-xs text-text-secondary">
                    停用
                  </span>
                )}
              </td>

              {/* 操作 */}
              <td className="px-6 py-4 text-right">
                <div className="relative inline-block">
                  <button
                    onClick={() =>
                      setOpenMenuId(
                        openMenuId === practitioner.id ? null : practitioner.id
                      )
                    }
                    className="p-1 hover:bg-surface-secondary rounded transition text-text-secondary hover:text-text-primary"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {/* 下拉菜單 */}
                  {openMenuId === practitioner.id && (
                    <div className="absolute right-0 mt-1 w-48 bg-white border border-border rounded-lg shadow-xl z-20">
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
                          // 導航到該老師的預約
                          window.location.href = `/admin/bookings?practitioner=${practitioner.id}`
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-surface-secondary flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        查看預約
                      </button>
                      <div className="border-t border-border my-1" />
                      {deleteConfirmId === practitioner.id ? (
                        <>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="w-full text-left px-4 py-2 text-xs text-text-secondary hover:text-text-primary"
                          >
                            取消刪除
                          </button>
                          <button
                            onClick={() =>
                              handleDelete(practitioner.id)
                            }
                            className="w-full text-left px-4 py-2 text-xs bg-danger-light text-danger hover:bg-danger/20 flex items-center gap-2"
                          >
                            <Trash2 className="w-3 h-3" />
                            確認刪除
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() =>
                            setDeleteConfirmId(practitioner.id)
                          }
                          className="w-full text-left px-4 py-2 text-sm text-danger hover:bg-danger-light flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          刪除
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
