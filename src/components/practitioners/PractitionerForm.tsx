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

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title={practitionerId ? '編輯老師' : '新增老師'}
      subtitle={practitionerId ? '更新老師的基本資料和課程指派' : '新增一位老師到系統'}
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
            <div className="flex flex-wrap gap-2">
              {PRACTITIONER_COLORS.map((color) => (
                <button
                  key={color.hex}
                  type="button"
                  onClick={() =>
                    setFormData({ ...formData, color_hex: color.hex })
                  }
                  disabled={loading}
                  className="relative group transition-transform duration-200 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={color.name}
                >
                  <div
                    className={`w-9 h-9 rounded-lg transition-all duration-200 ${
                      formData.color_hex === color.hex
                        ? 'ring-2 ring-offset-2 ring-black shadow-md'
                        : 'border-2 border-slate-200 shadow-sm hover:shadow-md'
                    }`}
                    style={{ backgroundColor: color.hex }}
                  >
                    {formData.color_hex === color.hex && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Check className="w-4 h-4 text-white drop-shadow-lg" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {color.name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 課程指派卡片 */}
        <div className="border border-slate-200 rounded-lg bg-white p-5 space-y-4">
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
              <Alert
                type="info"
                message="暫無可用課程，請先建立課程"
              />
            ) : (
              <div className="space-y-2">
                {services.map((service) => (
                  <Checkbox
                    key={service.id}
                    label={service.name}
                    checked={formData.service_ids.includes(service.id)}
                    onChange={() => handleServiceToggle(service.id)}
                    disabled={loading}
                  />
                ))}
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
            disabled={loading}
            className="flex-1"
          >
            {loading
              ? practitionerId
                ? '更新中...'
                : '新增中...'
              : practitionerId
                ? '更新老師'
                : '新增老師'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
