import { useState, useEffect } from 'react'
import { Plus, Search, Trash2, Edit2, AlertCircle, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { createService, updateService, deleteService, getServices, type Service } from '@/lib/services-api'
import ServiceForm from '@/components/services/ServiceForm'

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const itemsPerPage = 20

  // 載入課程列表
  useEffect(() => {
    loadServices()
  }, [])

  // 實時訂閱課程變化
  useEffect(() => {
    const subscription = supabase
      .channel('services')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'services' },
        (payload) => {
          loadServices()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const loadServices = async () => {
    try {
      setIsLoading(true)
      const data = await getServices()
      setServices(data)
      setErrorMessage('')
    } catch (error) {
      console.error('Failed to load services:', error)
      setErrorMessage('無法載入課程列表，請稍後重試')
    } finally {
      setIsLoading(false)
    }
  }

  // 篩選和搜尋
  const filteredServices = services.filter((service) => {
    const matchesSearch = service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (service.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)

    let matchesFilter = true
    if (filterStatus === 'active') {
      matchesFilter = service.active && !service.deleted_at
    } else if (filterStatus === 'inactive') {
      matchesFilter = !service.active || service.deleted_at
    }

    return matchesSearch && matchesFilter
  })

  // 分頁
  const totalPages = Math.ceil(filteredServices.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedServices = filteredServices.slice(startIndex, startIndex + itemsPerPage)

  const handleAddService = () => {
    setEditingService(null)
    setShowForm(true)
  }

  const handleEditService = (service: Service) => {
    setEditingService(service)
    setShowForm(true)
  }

  const handleFormSuccess = async () => {
    setShowForm(false)
    setEditingService(null)
    const message = editingService ? '課程已更新' : '課程已新增'
    setSuccessMessage(message)
    setTimeout(() => setSuccessMessage(''), 3000)
    await loadServices()
    setCurrentPage(1)
  }

  const handleDeleteService = async (serviceId: string) => {
    try {
      setIsDeleting(true)
      await deleteService(serviceId)
      setSuccessMessage('課程已刪除')
      setDeleteConfirm(null)
      setTimeout(() => setSuccessMessage(''), 3000)
      await loadServices()
    } catch (error) {
      console.error('Failed to delete service:', error)
      setErrorMessage(error instanceof Error ? error.message : '刪除失敗')
    } finally {
      setIsDeleting(false)
    }
  }

  const formatPrice = (price: number) => {
    return `¥${price.toLocaleString('zh-CN')}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 頂部標題欄 */}
      <div className="bg-white px-6 py-6 shadow-md border-b border-slate-200/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-text-primary">課程管理</h1>
            <p className="text-sm text-text-secondary mt-2">管理所有課程、定價和上架狀態</p>
          </div>

          <button
            onClick={handleAddService}
            className="flex items-center gap-2 px-4 py-2.5 bg-black hover:bg-primary-hover text-white rounded-lg transition font-medium text-sm shadow-md hover:shadow-lg active:scale-95"
          >
            <Plus className="w-4 h-4" />
            新增課程
          </button>
        </div>
      </div>

      {/* 提示訊息 */}
      {successMessage && (
        <div className="mx-6 mt-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-sm text-green-700">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mx-6 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-sm text-red-700">{errorMessage}</span>
        </div>
      )}

      {/* 搜尋和篩選 */}
      <div className="px-6 py-5 border-b border-slate-200/50 space-y-3 bg-white shadow-xs">
        <div className="flex gap-3">
          {/* 搜尋框 */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input
              type="text"
              placeholder="搜尋課程名稱或描述..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 bg-white rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-0 focus:border-black transition"
            />
          </div>

          {/* 狀態篩選 */}
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')
              setCurrentPage(1)
            }}
            className="px-4 py-2.5 text-sm border border-slate-200 bg-white rounded-lg text-text-primary focus:outline-none focus:ring-0 focus:border-black transition"
          >
            <option value="all">全部課程</option>
            <option value="active">上架中</option>
            <option value="inactive">已下架</option>
          </select>
        </div>

        {/* 篩選指示 */}
        {(searchTerm || filterStatus !== 'all') && (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span>篩選結果：{filteredServices.length} 個課程</span>
          </div>
        )}
      </div>

      {/* 主內容 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
              <p className="text-text-secondary">載入課程中...</p>
            </div>
          </div>
        ) : paginatedServices.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-text-secondary mb-3">
                {filteredServices.length === 0 ? '暫無課程' : '沒有符合條件的課程'}
              </p>
              {filteredServices.length === 0 && (
                <button
                  onClick={handleAddService}
                  className="text-black hover:underline font-medium text-sm"
                >
                  新增第一個課程 →
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* 表格 */}
            <div className="flex-1 overflow-auto bg-slate-50">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-white border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-text-primary">課程名稱</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-text-primary">時長</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-text-primary">定價</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-text-primary">狀態</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-text-primary">建立日期</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-text-primary">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedServices.map((service) => (
                    <tr
                      key={service.id}
                      className="border-b border-slate-200 hover:bg-slate-50 transition"
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-text-primary">{service.name}</span>
                          {service.description && (
                            <span className="text-xs text-text-secondary mt-1 truncate">
                              {service.description}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-text-primary">
                        {service.duration_minutes} 分鐘
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-text-primary">
                        {formatPrice(service.price)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {service.deleted_at ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            已刪除
                          </span>
                        ) : service.active ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            上架中
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                            已下架
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-text-secondary">
                        {formatDate(service.created_at)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!service.deleted_at && (
                            <>
                              <button
                                onClick={() => handleEditService(service)}
                                className="p-2 text-slate-500 hover:text-black hover:bg-slate-100 rounded transition"
                                title="編輯"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(service.id)}
                                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition"
                                title="刪除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分頁 */}
            {totalPages > 1 && (
              <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between">
                <span className="text-sm text-text-secondary">
                  第 {currentPage} / {totalPages} 頁
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    上一頁
                  </button>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    下一頁
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 新增/編輯課程表單 */}
      {showForm && (
        <ServiceForm
          service={editingService}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setShowForm(false)
            setEditingService(null)
          }}
        />
      )}

      {/* 刪除確認對話框 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setDeleteConfirm(null)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">確認刪除課程</h3>
            <p className="text-sm text-slate-600 mb-6">
              該課程將被永久刪除，歷史預約記錄將保留但無法使用此課程。此操作無法撤銷。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition disabled:opacity-50"
                disabled={isDeleting}
              >
                取消
              </button>
              <button
                onClick={() => deleteConfirm && handleDeleteService(deleteConfirm)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-50"
                disabled={isDeleting}
              >
                {isDeleting ? '刪除中...' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
