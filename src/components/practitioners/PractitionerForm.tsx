import { useState, useEffect } from 'react'
import { X, AlertCircle, Check, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { callPractitionersAPI } from '@/lib/practitioner-api'

interface Service {
  id: string
  name: string
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

  // 載入課程列表
  useEffect(() => {
    loadServices()
  }, [])

  // 如果是編輯模式，載入現有數據
  useEffect(() => {
    if (practitionerId) {
      loadPractitionerData()
    }
  }, [practitionerId])

  const loadServices = async () => {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('id, name')
        .eq('is_archived', false)
        .order('name')

      if (error) throw error
      setServices(data || [])
    } catch (err) {
      console.error('Failed to load services:', err)
      setError('無法載入課程列表')
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

      setFormData({
        name: practitioner.name,
        color_hex: practitioner.color_hex,
        bio: practitioner.bio || '',
        photo_url: practitioner.photo_url || '',
        service_ids: [], // 稍後載入
      })

      // 載入課程指派
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

    // 驗證
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
        // 編輯模式 - 更新課程指派
        await callPractitionersAPI('update_services', {
          practitioner_id: practitionerId,
          service_ids: formData.service_ids,
        })
        setSuccess(true)
        setTimeout(onSuccess, 1000)
      } else {
        // 新增模式
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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-200">
        {/* 標題欄 */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {practitionerId ? '編輯老師' : '新增老師'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {practitionerId ? '更新老師的基本資料和課程指派' : '新增一位老師到系統'}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors duration-200 text-slate-600 hover:text-slate-900"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        {/* 表單 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 錯誤提示 */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* 成功提示 */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3 animate-in fade-in slide-in-from-top-2">
              <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-700">
                {practitionerId ? '更新成功！' : '新增成功！'}
              </p>
            </div>
          )}

          {/* 基本信息卡片 */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-2">
                老師名字 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="例：林老師"
                disabled={loading}
                className="w-full px-4 py-2.5 border border-slate-200 bg-white rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* 識別顏色 */}
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-3">
                識別顏色 <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-4 gap-2.5">
                {PRACTITIONER_COLORS.map((color) => (
                  <button
                    key={color.hex}
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, color_hex: color.hex })
                    }
                    disabled={loading}
                    className="relative group transition-transform duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div
                      className={`w-full aspect-square rounded-lg transition-all duration-200 ${
                        formData.color_hex === color.hex
                          ? 'ring-2 ring-offset-2 ring-black shadow-md'
                          : 'border-2 border-slate-200 shadow-sm hover:shadow-md'
                      }`}
                      style={{ backgroundColor: color.hex }}
                    >
                      {formData.color_hex === color.hex && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Check className="w-5 h-5 text-white drop-shadow-lg" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      {color.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 課程指派卡片 */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-900 mb-3">
                可預約課程 <span className="text-red-500">*</span>
              </label>
              {isLoadingServices ? (
                <div className="flex items-center justify-center py-6">
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-slate-900" />
                  <span className="text-sm text-slate-600 ml-2">載入課程中...</span>
                </div>
              ) : services.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-slate-600">暫無可用課程，請先建立課程</p>
                </div>
              ) : (
                <div className="space-y-2 bg-white border border-slate-200 rounded-lg p-4">
                  {services.map((service) => (
                    <label
                      key={service.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors duration-150"
                    >
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={formData.service_ids.includes(service.id)}
                          onChange={() => handleServiceToggle(service.id)}
                          disabled={loading}
                          className="sr-only peer"
                        />
                        <div className="w-5 h-5 border-2 border-slate-300 rounded-md peer-checked:bg-black peer-checked:border-black peer-checked:shadow-md transition-all duration-200 peer-disabled:opacity-50" />
                        {formData.service_ids.includes(service.id) && (
                          <Check className="w-4 h-4 text-white absolute top-0.5 left-0.5 pointer-events-none" strokeWidth={3} />
                        )}
                      </div>
                      <span className="text-sm text-slate-900 font-medium flex-1">
                        {service.name}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 簡介卡片 */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
            <label className="block text-sm font-medium text-slate-900 mb-2">
              簡介 <span className="text-slate-400">(可選)</span>
            </label>
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
          </div>

          {/* 按鈕組 */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-900 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium text-sm"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-black text-white rounded-lg hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium text-sm shadow-md hover:shadow-lg active:scale-95"
            >
              {loading
                ? practitionerId
                  ? '更新中...'
                  : '新增中...'
                : practitionerId
                  ? '更新老師'
                  : '新增老師'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
