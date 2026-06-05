import { useState, useEffect } from 'react'
import { Plus, Search, Download, Filter } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/cn'
import PractitionerTable from '@/components/practitioners/PractitionerTable'
import PractitionerForm from '@/components/practitioners/PractitionerForm'
import PractitionerLeaveManager from '@/components/practitioners/PractitionerLeaveManager'
import StatsCard from '@/components/ui/StatsCard'

interface PractitionerStats {
  total: number
  active: number
  inactive: number
  onLeaveToday: number
}

export default function PractitionerManagement() {
  const [showForm, setShowForm] = useState(false)
  const [editingPractitionerId, setEditingPractitionerId] = useState<string | null>(null)
  const [showLeaveManager, setShowLeaveManager] = useState(false)
  const [leaveManagerPractitionerId, setLeaveManagerPractitionerId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [stats, setStats] = useState<PractitionerStats>({
    total: 0,
    active: 0,
    inactive: 0,
    onLeaveToday: 0,
  })
  const [isLoadingStats, setIsLoadingStats] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      setIsLoadingStats(true)

      // 獲取總數
      const { count: totalCount } = await supabase
        .from('practitioners')
        .select('id', { count: 'exact', head: 0 })
        .is('deleted_at', null)

      // 獲取活躍數
      const { count: activeCount } = await supabase
        .from('practitioners')
        .select('id', { count: 'exact', head: 0 })
        .eq('is_active', true)
        .is('deleted_at', null)

      // 獲取停用數
      const { count: inactiveCount } = await supabase
        .from('practitioners')
        .select('id', { count: 'exact', head: 0 })
        .eq('is_active', false)
        .is('deleted_at', null)

      // 獲取今日休假數
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const { count: onLeaveTodayCount } = await supabase
        .from('practitioner_leaves')
        .select('id', { count: 'exact', head: 0 })
        .lte('start_date', today.toISOString().split('T')[0])
        .gte('end_date', today.toISOString().split('T')[0])

      setStats({
        total: totalCount || 0,
        active: activeCount || 0,
        inactive: inactiveCount || 0,
        onLeaveToday: onLeaveTodayCount || 0,
      })
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setIsLoadingStats(false)
    }
  }

  const handleAddPractitioner = () => {
    setEditingPractitionerId(null)
    setShowForm(true)
  }

  const handleEditPractitioner = (id: string) => {
    setEditingPractitionerId(id)
    setShowForm(true)
  }

  const handleManageLeaves = (id: string) => {
    setLeaveManagerPractitionerId(id)
    setShowLeaveManager(true)
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingPractitionerId(null)
    loadStats() // 重新載入統計
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 頂部標題欄 */}
      <div className="bg-white px-6 py-6 shadow-md border-b border-slate-200/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-text-primary">從業人員管理</h1>
            <p className="text-sm text-text-secondary mt-2">管理老師、課程指派和休假時間</p>
          </div>

          {/* 操作按鈕 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {}}
              className="p-2.5 hover:bg-surface-secondary rounded-lg transition text-text-secondary hover:text-text-primary"
              title="篩選"
            >
              <Filter className="w-5 h-5" />
            </button>
            <button
              onClick={() => {}}
              className="p-2.5 hover:bg-surface-secondary rounded-lg transition text-text-secondary hover:text-text-primary"
              title="匯出"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={handleAddPractitioner}
              className="flex items-center gap-2 px-4 py-2.5 bg-black hover:bg-primary-hover text-white rounded-lg transition font-medium text-sm shadow-md hover:shadow-lg active:scale-95"
            >
              <Plus className="w-4 h-4" />
              新增老師
            </button>
          </div>
        </div>
      </div>

      {/* 主內容 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* 統計卡片 */}
        <div className="px-6 py-8 bg-white shadow-md border-b border-slate-200/50">
          {isLoadingStats ? (
            <div className="grid grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-24 bg-slate-100 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-6">
              <StatsCard
                label="總數"
                value={stats.total}
                subtitle="所有老師"
                color="blue"
              />
              <StatsCard
                label="活躍"
                value={stats.active}
                subtitle="可接受預約"
                color="green"
              />
              <StatsCard
                label="停用"
                value={stats.inactive}
                subtitle="暫停服務"
                color="gray"
              />
              <StatsCard
                label="今日休假"
                value={stats.onLeaveToday}
                subtitle="在假期中"
                color="amber"
              />
            </div>
          )}
        </div>

        {/* 搜尋和篩選 */}
        <div className="px-6 py-5 border-b border-slate-200/50 space-y-3 bg-white shadow-xs">
          <div className="flex gap-3">
            {/* 搜尋框 */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <input
                type="text"
                placeholder="搜尋老師名字或課程..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 bg-white rounded-lg text-text-primary placeholder-text-secondary focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
              />
            </div>

            {/* 狀態篩選 */}
            <select
              value={filterStatus}
              onChange={(e) =>
                setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')
              }
              className="px-4 py-2.5 text-sm border border-slate-200 bg-white rounded-lg text-text-primary focus:outline-none focus:ring-1 focus:ring-black focus:border-black transition"
            >
              <option value="all">全部狀態</option>
              <option value="active">活躍</option>
              <option value="inactive">停用</option>
            </select>
          </div>

          {/* 篩選指示 */}
          {(searchTerm || filterStatus !== 'all') && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-text-secondary">
                {searchTerm && `搜尋: "${searchTerm}"`}
                {searchTerm && filterStatus !== 'all' && ' • '}
                {filterStatus !== 'all' && `篩選: ${filterStatus === 'active' ? '活躍' : '停用'}`}
              </p>
            </div>
          )}
        </div>

        {/* 表格區域 */}
        <div className="flex-1 overflow-auto bg-slate-50">
          <PractitionerTable
            searchTerm={searchTerm}
            filterStatus={filterStatus}
            onEdit={handleEditPractitioner}
            onManageLeaves={handleManageLeaves}
            onRefresh={loadStats}
          />
        </div>
      </div>

      {/* 新增/編輯表單 */}
      {showForm && (
        <PractitionerForm
          practitionerId={editingPractitionerId || undefined}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setShowForm(false)
            setEditingPractitionerId(null)
          }}
        />
      )}

      {/* 休假管理 */}
      {showLeaveManager && leaveManagerPractitionerId && (
        <PractitionerLeaveManager
          practitionerId={leaveManagerPractitionerId}
          practitionerName="" // 由組件內部載入
          onClose={() => {
            setShowLeaveManager(false)
            setLeaveManagerPractitionerId(null)
          }}
        />
      )}
    </div>
  )
}
