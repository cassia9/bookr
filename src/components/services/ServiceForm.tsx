import { useState, useEffect } from 'react'
import { createService, updateService, type Service } from '@/lib/services-api'
import Button from '@/components/ui/buttons/Button'
import Modal from '@/components/ui/modals/Modal'
import FormField from '@/components/ui/forms/FormField'
import Input from '@/components/ui/forms/Input'
import Alert from '@/components/ui/feedback/Alert'

interface ServiceFormProps {
  service?: Service | null
  onSuccess: () => void
  onCancel: () => void
}

export default function ServiceForm({
  service,
  onSuccess,
  onCancel,
}: ServiceFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration_minutes: 60,
    price: 0,
    active: true,
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // 初始化編輯時的數據
  useEffect(() => {
    if (service) {
      setFormData({
        name: service.name,
        description: service.description || '',
        duration_minutes: service.duration_minutes,
        price: service.price,
        active: service.active,
      })
    }
  }, [service])

  const validateForm = (): boolean => {
    setError(null)

    // 驗證課程名稱
    if (!formData.name.trim()) {
      setError('課程名稱不能為空')
      return false
    }

    if (formData.name.trim().length > 100) {
      setError('課程名稱不能超過 100 個字符')
      return false
    }

    // 驗證時長
    if (!Number.isInteger(formData.duration_minutes) || formData.duration_minutes < 15 || formData.duration_minutes > 480) {
      setError('時長必須是 15-480 分鐘之間的整數')
      return false
    }

    // 驗證定價
    if (typeof formData.price !== 'number' || formData.price < 0 || formData.price > 999999) {
      setError('定價必須在 0-999,999 之間')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!validateForm()) {
      return
    }

    try {
      setLoading(true)

      if (service) {
        // 編輯課程
        await updateService({
          service_id: service.id,
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          duration_minutes: formData.duration_minutes,
          price: formData.price,
          active: formData.active,
        })
        setSuccess(true)
        setTimeout(onSuccess, 1000)
      } else {
        // 新增課程
        await createService({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          duration_minutes: formData.duration_minutes,
          price: formData.price,
          active: formData.active,
        })
        setSuccess(true)
        setTimeout(onSuccess, 1000)
      }
    } catch (err) {
      console.error('Failed to save service:', err)
      setError(err instanceof Error ? err.message : '保存失敗，請稍後重試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title={service ? '編輯課程' : '新增課程'}
      subtitle={service ? '編輯課程信息和定價' : '新增一個可預約的課程'}
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
            message={service ? '課程已更新！' : '課程已新增！'}
          />
        )}

        {/* 基本信息卡片 */}
        <div className="border border-slate-200 rounded-lg bg-white p-5 space-y-5">
          <FormField
            label="課程名稱"
            required
            disabled={loading}
            hint="例：深層肌肉放鬆、瑜伽伸展、皮膚護理"
          >
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => {
                const value = e.target.value.slice(0, 100)
                setFormData({ ...formData, name: value })
              }}
              placeholder="輸入課程名稱"
              disabled={loading}
              maxLength={100}
            />
            <div className="text-xs text-slate-500 mt-1">
              {formData.name.length}/100
            </div>
          </FormField>

          <FormField
            label="課程描述"
            disabled={loading}
            hint="選填 - 簡短描述課程內容和效果"
          >
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              disabled={loading}
              placeholder="例：深層肌肉按摩，專注於放鬆肌肉緊張..."
              rows={3}
              className="w-full px-4 py-2.5 border border-slate-200 bg-white rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </FormField>
        </div>

        {/* 時長和定價卡片 */}
        <div className="border border-slate-200 rounded-lg bg-white p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="課程時長（分鐘）"
              required
              disabled={loading}
              hint="15-480 分鐘"
            >
              <Input
                type="number"
                value={formData.duration_minutes}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    duration_minutes: Math.max(15, Math.min(480, parseInt(e.target.value) || 0)),
                  })
                }
                disabled={loading}
                min={15}
                max={480}
              />
            </FormField>

            <FormField
              label="定價（¥）"
              required
              disabled={loading}
              hint="0-999,999"
            >
              <Input
                type="number"
                value={formData.price}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    price: Math.max(0, Math.min(999999, parseFloat(e.target.value) || 0)),
                  })
                }
                disabled={loading}
                min={0}
                max={999999}
                step={1}
              />
            </FormField>
          </div>
        </div>

        {/* 上架狀態卡片 */}
        <div className="border border-slate-200 rounded-lg bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-slate-900">
                上架狀態
              </label>
              <p className="text-xs text-slate-500 mt-1">
                {formData.active ? '此課程可供客戶預約' : '此課程已下架，客戶無法預約'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, active: !formData.active })}
              disabled={loading}
              className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${
                formData.active ? 'bg-green-500' : 'bg-slate-300'
              } ${loading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  formData.active ? 'translate-x-9' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
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
              ? service
                ? '更新中...'
                : '新增中...'
              : service
                ? '更新課程'
                : '新增課程'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
