import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { createService, updateService, deleteService, getServices, type Service } from '@/lib/services-api'
import ServiceForm from '@/components/services/ServiceForm'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import SearchInput from '@/components/ui/SearchInput'
import Select from '@/components/ui/Select'
import Pagination from '@/components/ui/Pagination'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { toast } from '@/components/ui/Snackbar'
import { cn } from '@/lib/cn'

function statusBadge(service: Service): { label: string; variant: BadgeVariant } {
  if (service.deleted_at) return { label: '已刪除', variant: 'slate' }
  if (service.active) return { label: '上架中', variant: 'green' }
  return { label: '已下架', variant: 'amber' }
}

const ITEMS_PER_PAGE = 20

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { load() }, [])

  useEffect(() => {
    const sub = supabase.channel('services')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, load)
      .subscribe()
    return () => { sub.unsubscribe() }
  }, [])

  async function load() {
    try {
      setLoading(true)
      setServices(await getServices())
    } catch {
      toast.error('載入失敗', '無法載入課程列表')
    } finally {
      setLoading(false)
    }
  }

  const filtered = services.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
    const matchFilter = filterStatus === 'all'
      || (filterStatus === 'active' && s.active && !s.deleted_at)
      || (filterStatus === 'inactive' && (!s.active || !!s.deleted_at))
    return matchSearch && matchFilter
  })

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const paged = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  async function handleDelete(id: string) {
    setDeleting(true)
    try {
      await deleteService(id)
      toast.success('課程已刪除')
      setDeleteId(null)
      await load()
    } catch (e) {
      toast.error('刪除失敗', e instanceof Error ? e.message : undefined)
    } finally {
      setDeleting(false)
    }
  }

  function handleFormSuccess() {
    setShowForm(false)
    setEditingService(null)
    toast.success(editingService ? '課程已更新' : '課程已新增')
    load()
    setPage(1)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 頂部標題欄 */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">課程管理</h1>
            <p className="text-sm text-slate-500 mt-1">管理所有課程、定價和上架狀態</p>
          </div>
          <Button onClick={() => { setEditingService(null); setShowForm(true) }}>
            <Plus size={15} /> 新增課程
          </Button>
        </div>
      </div>

      {/* 搜尋 + 篩選 */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex gap-3">
          <SearchInput
            value={search}
            onChange={v => { setSearch(v); setPage(1) }}
            placeholder="搜尋課程名稱或描述…"
            className="flex-1"
          />
          <div className="w-40">
            <Select
              value={filterStatus}
              onChange={v => { setFilterStatus(v); setPage(1) }}
              options={[
                { value: 'all', label: '全部課程' },
                { value: 'active', label: '上架中' },
                { value: 'inactive', label: '已下架' },
              ]}
            />
          </div>
        </div>
        {(search || filterStatus !== 'all') && (
          <p className="text-xs text-slate-400 mt-2">篩選結果：{filtered.length} 個課程</p>
        )}
      </div>

      {/* 主內容 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : paged.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
            <p className="text-sm">{filtered.length === 0 ? '暫無課程' : '沒有符合條件的課程'}</p>
            {services.length === 0 && (
              <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
                新增第一個課程
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-auto bg-white">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-white border-b border-slate-200">
                  <tr>
                    {['課程名稱', '時長', '定價', '狀態', '建立日期', ''].map(h => (
                      <th key={h} className={cn(
                        'px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide',
                        h === '' ? 'text-right' : 'text-left',
                      )}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paged.map(s => {
                    const { label, variant } = statusBadge(s)
                    return (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-medium text-slate-900 text-sm">{s.name}</p>
                          {s.description && (
                            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-64">{s.description}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">{s.duration_minutes} 分鐘</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-800">
                          NT$ {s.price.toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={variant}>{label}</Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-400">
                          {new Date(s.created_at).toLocaleDateString('zh-TW')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            {!s.deleted_at && (
                              <>
                                <button
                                  onClick={() => { setEditingService(s); setShowForm(true) }}
                                  className="p-2 text-slate-400 hover:text-black hover:bg-slate-100 rounded-xl transition-colors"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => setDeleteId(s.id)}
                                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-6 py-3 bg-white border-t border-slate-200 flex justify-end">
                <Pagination page={page} totalPages={totalPages} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* 新增/編輯表單 */}
      {showForm && (
        <ServiceForm
          service={editingService}
          onSuccess={handleFormSuccess}
          onCancel={() => { setShowForm(false); setEditingService(null) }}
        />
      )}

      {/* 刪除確認 */}
      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        loading={deleting}
        title="確認刪除課程"
        description="該課程將被永久刪除，歷史預約記錄將保留但無法使用此課程。此操作無法撤銷。"
        confirmLabel="確認刪除"
      />
    </div>
  )
}
