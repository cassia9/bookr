import { useState, useEffect } from 'react'
import { X, AlertCircle, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'

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
        // 編輯模式
        const { error } = await supabase.functions.invoke(
          'practitioners-crud',
          {
            body: {
              practitioner_id: practitionerId,
              service_ids: formData.service_ids,
            },
            headers: {
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
          }
        )

        if (error) throw error
        setSuccess(true)
        setTimeout(onSuccess, 1000)
      } else {
        // 新增模式
        const { error } = await supabase.functions.invoke(
          'practitioners-crud',
          {
            body: formData,
            headers: {
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
          }
        )

        if (error) throw error
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-800">
        {/* 標題欄 */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-50">
            {practitionerId ? '編輯老師' : '新增老師'}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-slate-800 rounded-lg transition text-slate-400 hover:text-slate-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表單 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* 錯誤提示 */}
          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-50">{error}</p>
            </div>
          )}

          {/* 成功提示 */}
          {success && (
            <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-4 flex gap-3">
              <Check className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-50">
                {practitionerId ? '更新成功！' : '新增成功！'}
              </p>
            </div>
          )}

          {/* 老師名字 */}
          <div>
            <label className="block text-sm font-medium text-slate-50 mb-2">
              老師名字 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="例：林老師"
              className="w-full h-10 px-3 border border-slate-700 bg-slate-800 rounded-lg text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>

          {/* 顏色選擇 */}
          <div>
            <label className="block text-sm font-medium text-slate-50 mb-3">
              識別顏色 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-4 gap-3">
              {PRACTITIONER_COLORS.map((color) => (
                <button
                  key={color.hex}
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, color_hex: color.hex })
                  }
                  className="relative group"
                >
                  <div
                    className="w-full aspect-square rounded-lg border-2 transition-all shadow-sm hover:shadow-md"
                    style={{
                      backgroundColor: color.hex,
                      borderColor:
                        formData.color_hex === color.hex
                          ? '#F8FAFC'
                          : 'transparent',
                      opacity: formData.color_hex === color.hex ? 1 : 0.7,
                    }}
                  />
                  {formData.color_hex === color.hex && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Check className="w-5 h-5 text-white drop-shadow-lg" />
                    </div>
                  )}
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-xs text-slate-50 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
                    {color.name}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 課程指派 */}
          <div>
            <label className="block text-sm font-medium text-slate-50 mb-3">
              可預約課程 <span className="text-red-500">*</span>
            </label>
            {isLoadingServices ? (
              <div className="text-sm text-slate-400">載入課程中...</div>
            ) : services.length === 0 ? (
              <div className="text-sm text-slate-400">
                暫無可用課程，請先建立課程
              </div>
            ) : (
              <div className="space-y-2 bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                {services.map((service) => (
                  <label
                    key={service.id}
                    className="flex items-center gap-3 cursor-pointer hover:bg-slate-700/50 p-2 rounded transition"
                  >
                    <input
                      type="checkbox"
                      checked={formData.service_ids.includes(service.id)}
                      onChange={() => handleServiceToggle(service.id)}
                      className="w-5 h-5 border-2 border-slate-600 bg-slate-800 rounded accent-green-500 cursor-pointer"
                    />
                    <span className="text-sm text-slate-50 font-medium">
                      {service.name}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 簡介 (可選) */}
          <div>
            <label className="block text-sm font-medium text-slate-50 mb-2">
              簡介 (可選)
            </label>
            <textarea
              value={formData.bio}
              onChange={(e) =>
                setFormData({ ...formData, bio: e.target.value })
              }
              placeholder="例：擅長運動傷害、肌筋膜放鬆..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-700 bg-slate-800 rounded-lg text-slate-50 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
            />
          </div>

          {/* 按鈕 */}
          <div className="flex gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 h-10 px-4 border border-slate-700 bg-slate-800 text-slate-50 rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-10 px-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium shadow-sm hover:shadow-md"
            >
              {loading
                ? '保存中...'
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
