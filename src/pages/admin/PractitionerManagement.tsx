import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import PractitionerTable from '@/components/practitioners/PractitionerTable'
import PractitionerForm from '@/components/practitioners/PractitionerForm'
import PractitionerLeaveManager from '@/components/practitioners/PractitionerLeaveManager'
import PractitionerDrawer from '@/components/PractitionerDrawer'
import StatsCard from '@/components/ui/StatsCard'
import Button from '@/components/ui/Button'
import SearchInput from '@/components/ui/SearchInput'
import Select from '@/components/ui/Select'
import { useAuth } from '@/lib/auth'

interface PractitionerStats {
  total: number
  onLeaveToday: number
}

interface PractitionerDetails {
  id: string
  name: string
  profession: string
}

export default function PractitionerManagement() {
  const { profile } = useAuth()
  const storeId = profile?.store_id ?? ''
  const [showForm, setShowForm] = useState(false)
  const [editingPractitionerId, setEditingPractitionerId] = useState<string | null>(null)
  const [showScheduleManager, setShowScheduleManager] = useState(false)
  const [scheduleManagerPractitionerId, setScheduleManagerPractitionerId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [tableRefreshKey, setTableRefreshKey] = useState(0)
  const [stats, setStats] = useState<PractitionerStats>({
    total: 0,
    onLeaveToday: 0,
  })
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [showDrawer, setShowDrawer] = useState(false)
  const [selectedPractitioner, setSelectedPractitioner] = useState<PractitionerDetails>()

  const loadStats = useCallback(async () => {
    if (!storeId) return
    try {
      setIsLoadingStats(true)

      // 獲取總數
      const { count: totalCount } = await supabase
        .from('practitioners')
        .select('id', { count: 'exact', head: 0 })
        .eq('store_id', storeId)
        .is('deleted_at', null)

      // 獲取今日休假數（統一使用 practitioner_blocks）
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const { count: onLeaveTodayCount } = await supabase
        .from('practitioner_blocks')
        .select('id', { count: 'exact', head: 0 })
        .eq('store_id', storeId)
        .lt('start_time', tomorrow.toISOString())
        .gt('end_time', today.toISOString())

      setStats({
        total: totalCount || 0,
        onLeaveToday: onLeaveTodayCount || 0,
      })
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setIsLoadingStats(false)
    }
  }, [storeId])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadStats()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadStats])

  const handleAddPractitioner = () => {
    setEditingPractitionerId(null)
    setShowForm(true)
  }

  const handleEditPractitioner = (id: string) => {
    setEditingPractitionerId(id)
    setShowForm(true)
  }

  const handleManageLeaves = (id: string) => {
    setScheduleManagerPractitionerId(id)
    setShowScheduleManager(true)
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingPractitionerId(null)
    setTableRefreshKey((current) => current + 1)
    loadStats() // 重新載入統計
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 頂部標題欄 */}
      <div className="bg-white px-6 py-6 shadow-md border-b border-slate-200/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">老師管理</h1>
            <p className="text-sm text-text-secondary mt-2">管理老師、課程指派、固定班表與休假時間</p>
          </div>

          {/* 操作按鈕 */}
          <div className="flex items-center gap-3">
            <Button onClick={handleAddPractitioner}>
              <Plus size={16} strokeWidth={2} />
              新增老師
            </Button>
          </div>
        </div>
      </div>

      {/* 主內容 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* 統計卡片 */}
        <div className="px-6 py-8 bg-white shadow-md border-b border-slate-200/50">
          {isLoadingStats ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 bg-slate-50 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <StatsCard
                label="總數"
                value={stats.total}
                subtitle="所有老師"
                color="blue"
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
            <div className="flex-1">
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="搜尋老師名字或課程..."
              />
            </div>
            <div className="w-40">
              <Select
                value={filterStatus}
                onChange={(v) => setFilterStatus(v as 'all' | 'active' | 'inactive')}
                options={[
                  { value: 'all', label: '全部狀態' },
                  { value: 'active', label: '活躍' },
                  { value: 'inactive', label: '停用' },
                ]}
              />
            </div>
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
            key={tableRefreshKey}
            searchTerm={searchTerm}
            filterStatus={filterStatus}
            onEdit={handleEditPractitioner}
            onManageLeaves={handleManageLeaves}
            onViewDetails={(practitioner) => {
              setSelectedPractitioner({
                id: practitioner.id,
                name: practitioner.full_name,
                profession: '老師',
              })
              setShowDrawer(true)
            }}
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

      {/* 固定班表與休假管理 */}
      {showScheduleManager && scheduleManagerPractitionerId && (
        <PractitionerLeaveManager
          storeId={storeId}
          practitionerId={scheduleManagerPractitionerId}
          practitionerName="" // 由組件內部載入
          onClose={() => {
            setShowScheduleManager(false)
            setScheduleManagerPractitionerId(null)
            void loadStats()
          }}
        />
      )}

      {/* 從業人員詳情抽屜 */}
      <PractitionerDrawer
        isOpen={showDrawer}
        practitioner={selectedPractitioner}
        onClose={() => {
          setShowDrawer(false)
          setSelectedPractitioner(undefined)
        }}
      />
    </div>
  )
}
