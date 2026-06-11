import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { callPractitionersAPI } from '@/lib/practitioner-api'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import FormField from '@/components/ui/FormField'
import Alert from '@/components/ui/Alert'
import Spinner from '@/components/ui/Spinner'

interface Service {
  id: string
  name: string
  duration_minutes: number
  price: number
}

interface PractitionerFormProps {
  practitionerId?: string
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

export default function PractitionerForm({ practitionerId, onSuccess, onCancel }: PractitionerFormProps) {
  const [form, setForm] = useState({
    name: '',
    color_hex: '#9333EA',
    bio: '',
    service_ids: [] as string[],
  })
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingServices, setLoadingServices] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadServices() }, [])
  useEffect(() => { if (practitionerId) loadPractitioner() }, [practitionerId])

  async function loadServices() {
    try {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, duration_minutes, price')
        .eq('active', true)
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      setServices(data || [])
    } catch (err) {
      setError('無法載入課程列表')
    } finally {
      setLoadingServices(false)
    }
  }

  async function loadPractitioner() {
    if (!practitionerId) return
    try {
      setLoading(true)
      const { data: p, error: pe } = await supabase
        .from('practitioners').select('*').eq('id', practitionerId).single()
      if (pe) throw pe

      const { data: ps, error: pse } = await supabase
        .from('practitioner_services').select('service_id').eq('practitioner_id', practitionerId)
      if (pse) throw pse

      setForm({
        name: p.full_name,
        color_hex: p.color,
        bio: p.bio || '',
        service_ids: ps.map((s: any) => s.service_id),
      })
    } catch {
      setError('無法載入老師資料')
    } finally {
      setLoading(false)
    }
  }

  function toggleService(id: string) {
    setForm(f => ({
      ...f,
      service_ids: f.service_ids.includes(id)
        ? f.service_ids.filter(s => s !== id)
        : [...f.service_ids, id],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) { setError('老師名字不能為空'); return }
    if (form.service_ids.length === 0) { setError('至少要選擇一個課程'); return }
    setLoading(true)
    try {
      if (practitionerId) {
        await callPractitionersAPI('update_services', {
          practitioner_id: practitionerId,
          service_ids: form.service_ids,
        })
      } else {
        await callPractitionersAPI('create', {
          name: form.name.trim(),
          color_hex: form.color_hex,
          bio: form.bio.trim() || undefined,
          service_ids: form.service_ids,
        })
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗，請稍後重試')
    } finally {
      setLoading(false)
    }
  }

  const isEdit = !!practitionerId
  const isValid = form.name.trim() !== '' && form.service_ids.length > 0

  return (
    <Modal
      open
      onClose={onCancel}
      title={isEdit ? '編輯老師' : '新增老師'}
      size="md"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={loading}>
            取消
          </Button>
          <Button variant="primary" className="flex-1" loading={loading} disabled={!isValid}
            onClick={handleSubmit as any}>
            {isEdit ? '更新老師' : '新增老師'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        {/* 名字 */}
        <FormField label="老師名字" required>
          <Input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="例：林老師"
            disabled={loading}
          />
        </FormField>

        {/* 識別顏色 */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">識別顏色 <span className="text-red-400">*</span></p>
          <div className="flex flex-wrap gap-2.5">
            {PRACTITIONER_COLORS.map(c => (
              <button
                key={c.hex}
                type="button"
                title={c.name}
                onClick={() => setForm(f => ({ ...f, color_hex: c.hex }))}
                disabled={loading}
                className="relative w-9 h-9 rounded-xl transition-all hover:scale-110 focus:outline-none disabled:opacity-50"
                style={{ backgroundColor: c.hex }}
              >
                {form.color_hex === c.hex && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Check size={16} className="text-white drop-shadow" strokeWidth={3} />
                  </span>
                )}
                {form.color_hex === c.hex && (
                  <span className="absolute inset-0 rounded-xl ring-2 ring-offset-2 ring-black" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 課程指派 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-500">可預約課程 <span className="text-red-400">*</span></p>
            {services.length > 0 && (
              <span className="text-xs text-slate-400">{form.service_ids.length}/{services.length} 已選</span>
            )}
          </div>
          {loadingServices ? (
            <div className="flex justify-center py-6"><Spinner size="sm" /></div>
          ) : services.length === 0 ? (
            <Alert variant="info">暫無可用課程，請先建立課程</Alert>
          ) : (
            <div className="space-y-2">
              {services.map(s => {
                const sel = form.service_ids.includes(s.id)
                return (
                  <label key={s.id} className={[
                    'flex items-start gap-3 px-4 py-3 rounded-2xl border-2 cursor-pointer transition-all',
                    sel ? 'border-black bg-black/5' : 'border-slate-200 hover:border-slate-300',
                  ].join(' ')}>
                    <div className="relative mt-0.5 shrink-0">
                      <input type="checkbox" checked={sel}
                        onChange={() => toggleService(s.id)} disabled={loading}
                        className="w-4 h-4 cursor-pointer appearance-none border-2 border-slate-300 rounded-md
                          checked:border-black checked:bg-black transition-all disabled:opacity-50" />
                      {sel && <Check size={10} strokeWidth={3} className="text-white absolute inset-0 m-auto pointer-events-none" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{s.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{s.duration_minutes} 分鐘 · NT$ {s.price.toLocaleString()}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {/* 簡介 */}
        <FormField label="簡介" hint="選填">
          <Textarea
            value={form.bio}
            onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
            placeholder="例：擅長運動傷害、肌筋膜放鬆…"
            rows={2}
            disabled={loading}
          />
        </FormField>
      </form>
    </Modal>
  )
}
