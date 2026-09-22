import { useState } from 'react'
import { createService, updateService, type Service } from '@/lib/services-api'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import FormField from '@/components/ui/FormField'
import Alert from '@/components/ui/Alert'
import Toggle from '@/components/ui/Toggle'
import { parseIntegerInput } from '@/lib/numeric-input'

interface ServiceFormProps {
  service?: Service | null
  onSuccess: () => void
  onCancel: () => void
}

function formFromService(service?: Service | null) {
  return {
    name: service?.name ?? '',
    description: service?.description ?? '',
    duration_minutes: String(service?.duration_minutes ?? 60),
    price: String(service?.price ?? 0),
    active: service?.active ?? true,
  }
}

export default function ServiceForm({ service, onSuccess, onCancel }: ServiceFormProps) {
  const [form, setForm] = useState(() => formFromService(service))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function validate(): { durationMinutes: number; price: number } | null {
    if (!form.name.trim()) { setError('課程名稱不能為空'); return null }
    if (form.name.length > 100) { setError('課程名稱不能超過 100 個字'); return null }
    const durationMinutes = parseIntegerInput(form.duration_minutes)
    if (durationMinutes === null || durationMinutes < 15 || durationMinutes > 480) {
      setError('時長必須是 15–480 之間的整數分鐘')
      return null
    }
    const price = parseIntegerInput(form.price)
    if (price === null || price > 999999) {
      setError('定價必須是 0–999,999 之間的整數')
      return null
    }
    return { durationMinutes, price }
  }

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setError(null)
    const values = validate()
    if (!values) return
    setLoading(true)
    try {
      if (service) {
        await updateService({
          service_id: service.id,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          duration_minutes: values.durationMinutes,
          price: values.price,
          active: form.active,
        })
      } else {
        await createService({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          duration_minutes: values.durationMinutes,
          price: values.price,
          active: form.active,
        })
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗，請稍後重試')
    } finally {
      setLoading(false)
    }
  }

  const isEdit = !!service

  return (
    <Modal
      open
      onClose={onCancel}
      title={isEdit ? '編輯課程' : '新增課程'}
      size="md"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={loading}>
            取消
          </Button>
          <Button variant="primary" className="flex-1" loading={loading} onClick={handleSubmit}>
            {isEdit ? '更新課程' : '新增課程'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>
        )}

        <FormField label="課程名稱" required hint={`${form.name.length}/100`}>
          <Input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value.slice(0, 100) }))}
            placeholder="例：深層肌肉放鬆、瑜伽伸展"
            disabled={loading}
            maxLength={100}
          />
        </FormField>

        <FormField label="課程描述" hint="選填">
          <Textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="簡短描述課程內容和效果…"
            rows={3}
            disabled={loading}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="時長（分鐘）" required hint="15–480">
            <Input
              type="text"
              inputMode="numeric"
              value={form.duration_minutes}
              onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
              disabled={loading}
            />
          </FormField>
          <FormField label="定價（NT$）" required>
            <Input
              type="text"
              inputMode="numeric"
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              disabled={loading}
              prefix={<span className="text-xs">NT$</span>}
            />
          </FormField>
        </div>

        <div className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-700">上架狀態</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {form.active ? '此課程可供客戶預約' : '此課程已下架，客戶無法預約'}
            </p>
          </div>
          <Toggle
            checked={form.active}
            onChange={v => setForm(f => ({ ...f, active: v }))}
            disabled={loading}
          />
        </div>
      </form>
    </Modal>
  )
}
