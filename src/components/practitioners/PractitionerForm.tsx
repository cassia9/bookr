import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { callPractitionersAPI } from '@/lib/practitioner-api'
import Button from '@/components/ui/buttons/Button'
import Modal from '@/components/ui/modals/Modal'
import FormField from '@/components/ui/forms/FormField'
import Input from '@/components/ui/forms/Input'
import Checkbox from '@/components/ui/forms/Checkbox'
import Alert from '@/components/ui/feedback/Alert'

interface Service {
  id: string
  name: string
  duration_minutes: number
  price: number
}

interface PractitionerFormProps {
  practitionerId?: string // 編輯時提供
  onSuccess: () => void
  onCancel: () => void
}

const PRACTITIONER_COLORS = [
  { name: '紫色', hex: '#9333EA' },
  { name: '藍色', hex: '#3B82F6' },
  { name: '綠色', hex: '#22C55E' },
  { name: '紅色', hex: '#EF4444' },
  { name: '橙色', hex: '#F97316' },
  { name: '粉色', hex: '#EC4899' },
  { name: '青色', hex: '#06B6D4' },
  { name: '靛色', hex: '#6366F1' },
]

export default function PractitionerForm({
  practitionerId,
  onSuccess,
  onCancel,
}: PractitionerFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    color_hex: '#9333EA',
    bio: '',
    photo_url: '',
    service_ids: [] as string[],
  })

  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoadingServices, setIsLoadingServices] = useState(true)
  const [practitionerName, setPractitionerName] = useState<string | null>(null)
  const [practitionerUpdatedAt, setPractitionerUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    loadServices()
  }, [])

  useEffect(() => {
    if (practitionerId) {
      loadPractitionerData()
    }
  }, [practitionerId])

  const loadServices = async () => {
    try {
      console.log('📚 開始載入課程列表...')

      // 嘗試方法 1: 帶 RLS 條件的查詢
      let { data, error } = await supabase
        .from('services')
        .select('id, name, duration_minutes, price')
        .eq('active', true)
        .is('deleted_at', null)
        .order('name')

      if (error) {
        console.warn('⚠️ 方法 1 失敗，嘗試方法 2:', error)

        // 降級方案: 使用公開 API 規則取得課程
        const { data: publicData, error: publicError } = await supabase
          .from('services')
          .select('id, name, duration_minutes, price')
          .eq('active', true)
          .is('deleted_at', null)
          .order('name')

        if (publicError) {
          console.error('❌ 兩種方法都失敗:', publicError)
          throw publicError
        }

        data = publicData
      }

      console.log('✅ 課程載入成功，共', data?.length, '個課程')
      if (data && data.length > 0) {
        console.log('📝 課程列表:', data.map(s => s.name).join(', '))
      }
      setServices(data || [])
    } catch (err) {
      console.error('❌ Failed to load services:', err)
      const errorMsg = err instanceof Error ? err.message : '無法載入課程列表'
      console.error('詳細錯誤:', errorMsg)
      setError(`無法載入課程列表: ${errorMsg}`)
    } finally {
      setIsLoadingServices(false)
    }
  }

  const loadPractitionerData = async () => {
    if (!practitionerId) return

    try {
      setLoading(true)
      const { data: practitioner, error } = await supabase
        .from('practitioners')
        .select('*')
        .eq('id', practitionerId)
        .single()

      if (error) throw error

      // 保存用於顯示在標題的信息
      setPractitionerName(practitioner.full_name)
      setPractitionerUpdatedAt(practitioner.updated_at || null)

      setFormData({
        name: practitioner.full_name,
        color_hex: practitioner.color,
        bio: practitioner.bio || '',
        photo_url: practitioner.photo_url || '',
        service_ids: [],
      })

      const { data: services, error: servicesError } = await supabase
        .from('practitioner_services')
        .select('service_id')
        .eq('practitioner_id', practitionerId)

      if (servicesError) throw servicesError
      setFormData((prev) => ({
        ...prev,
        service_ids: services.map((s) => s.service_id),
      }))
    } catch (err) {
      console.error('Failed to load practitioner:', err)
      setError('無法載入老師信息')
    } finally {
      setLoading(false)
    }
  }

  const handleServiceToggle = (serviceId: string) => {
    setFormData((prev) => ({
      ...prev,
      service_ids: prev.service_ids.includes(serviceId)
        ? prev.service_ids.filter((id) => id !== serviceId)
        : [...prev.service_ids, serviceId],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!formData.name.trim()) {
      setError('老師名字不能為空')
      return
    }

    if (formData.service_ids.length === 0) {
      setError('至少要選擇一個課程')
      return
    }

    try {
      setLoading(true)

      if (practitionerId) {
        await callPractitionersAPI('update_services', {
          practitioner_id: practitionerId,
          service_ids: formData.service_ids,
        })
        setSuccess(true)
        setTimeout(onSuccess, 1000)
      } else {
        await callPractitionersAPI('create', formData)
        setSuccess(true)
        setTimeout(onSuccess, 1000)
      }
    } catch (err) {
      console.error('Failed to save practitioner:', err)
      setError(err instanceof Error ? err.message : '保存失敗，請稍後重試')
    } finally {
      setLoading(false)
    }
  }

  // 計算表單是否有效（名字非空且至少選 1 個課程）
  const isFormValid = formData.name.trim() !== '' && formData.service_ids.length > 0

  // 格式化時間用於顯示
  const formatUpdatedTime = (dateString: string | null) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title={practitionerId ? '✏️ 編輯老師' : '➕ 新增老師'}
      subtitle={
        practitionerId
          ? `更新 ${practitionerName} 的基本資料和課程指派${
              practitionerUpdatedAt
                ? ` • 最後更新：${formatUpdatedTime(practitionerUpdatedAt)}`
                : ''
            }`
          : '新增一位老師到系統'
      }
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 錯誤提示 */}
        {error && (
          <Alert
            type="error"
            title="出錯了"
            message={error}
            onClose={() => setError(null)}
            closable
          />
        )}

        {/* 成功提示 */}
        {success && (
          <Alert
            type="success"
            message={practitionerId ? '更新成功！' : '新增成功！'}
          />
        )}

        {/* 基本信息卡片 */}
        <div className="border border-slate-200 rounded-lg bg-white p-5 space-y-5">
          <FormField
            label="老師名字"
            required
            disabled={loading}
          >
            <Input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="例：林老師"
              disabled={loading}
            />
          </FormField>

          {/* 識別顏色 */}
          <div>
            <label className="block text-sm font-medium text-slate-900 mb-3">
              識別顏色 <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {PRACTITIONER_COLORS.map((color) => {
                const isSelected = formData.color_hex === color.hex
                return (
                  <button
                    key={color.hex}
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, color_hex: color.hex })
                    }
                    disabled={loading}
                    className="relative transition-transform duration-150 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
                    title={color.name}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg transition-all duration-150 ${
                        isSelected
                          ? 'ring-2 ring-offset-2 ring-black shadow-lg'
                          : 'border border-slate-300 shadow-sm hover:shadow-md'
                      }`}
                      style={{ backgroundColor: color.hex }}
                    >
                      {isSelected && (
                        <Check className="w-5 h-5 text-white absolute inset-0 m-auto drop-shadow-lg" strokeWidth={3} />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 課程指派卡片 */}
        <div className="border border-slate-200 rounded-lg bg-white p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-900">
                可預約課程 <span className="text-red-500">*</span>
              </label>
              {services.length > 0 && (
                <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded">
                  {formData.service_ids.length}/{services.length} 已選
                </span>
              )}
            </div>
            {isLoadingServices ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-slate-900" />
                <span className="text-sm text-slate-600 ml-2">載入課程中...</span>
              </div>
            ) : services.length === 0 ? (
              <Alert
                type="info"
                message="暫無可用課程，請先建立課程"
              />
            ) : (
              <div className="space-y-3">
                {services.map((service) => {
                  const isSelected = formData.service_ids.includes(service.id)
                  return (
                    <label
                      key={service.id}
                      className={`flex items-start gap-3 p-4 rounded-lg border-2 transition-all duration-150 cursor-pointer group ${
                        isSelected
                          ? 'border-black bg-black/5 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex-shrink-0 w-5 h-5 mt-1 relative">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleServiceToggle(service.id)}
                          disabled={loading}
                          className="w-5 h-5 cursor-pointer appearance-none border-2 border-slate-300 rounded checked:border-black checked:bg-black transition-all duration-150 disabled:opacity-50"
                        />
                        {isSelected && (
                          <Check className="w-3 h-3 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={3} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium transition-colors duration-150 ${isSelected ? 'text-slate-900' : 'text-slate-700 group-hover:text-slate-900'}`}>
                          {service.name}
                          {isSelected && <span className="ml-2 text-slate-500 text-sm">✓</span>}
                        </div>
                        <div className="text-sm text-slate-500 mt-1 flex items-center gap-3">
                          <span>⏱️ {service.duration_minutes} 分鐘</span>
                          <span>💰 ¥{service.price.toLocaleString('zh-CN')}</span>
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 簡介卡片 */}
        <div className="border border-slate-200 rounded-lg bg-white p-5">
          <FormField
            label="簡介"
            hint="選填 - 輸入老師的簡短介紹或專長"
            disabled={loading}
          >
            <textarea
              value={formData.bio}
              onChange={(e) =>
                setFormData({ ...formData, bio: e.target.value })
              }
              disabled={loading}
              placeholder="例：擅長運動傷害、肌筋膜放鬆..."
              rows={3}
              className="w-full px-4 py-2.5 border border-slate-200 bg-white rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </FormField>
        </div>

        {/* 按鈕組 */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
            className="flex-1"
          >
            取消
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={loading || !isFormValid}
            className="flex-1"
            title={!isFormValid ? '需要填寫老師名字並選擇至少 1 個課程' : ''}
          >
            {loading
              ? practitionerId
                ? '⏳ 更新中...'
                : '⏳ 新增中...'
              : practitionerId
                ? '✓ 更新老師'
                : '✓ 新增老師'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
