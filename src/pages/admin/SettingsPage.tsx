/**
 * SettingsPage — 店家設定
 * 目前可設定：營業時間（open_time / close_time）、預設緩衝時間
 */
import { useState, useEffect } from 'react'
import { Settings, Clock, Save, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { toast } from '@/components/ui/Snackbar'

const STORE_ID = '00000000-0000-0000-0000-000000000001'

// 產生整點選項列表
function hourOptions(start = 0, end = 23) {
  return Array.from({ length: end - start + 1 }, (_, i) => {
    const h = start + i
    return { value: h, label: `${String(h).padStart(2, '0')}:00` }
  })
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 表單狀態
  const [openHour, setOpenHour] = useState(9)
  const [closeHour, setCloseHour] = useState(21)
  const [bufferMinutes, setBufferMinutes] = useState(30)
  const [storeName, setStoreName] = useState('')

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('stores')
        .select('name, open_time, close_time, default_buffer_minutes')
        .eq('id', STORE_ID)
        .single()
      if (!error && data) {
        setStoreName(data.name ?? '')
        // open_time 格式為 "09:00:00"
        setOpenHour(parseInt(data.open_time ?? '09:00', 10))
        setCloseHour(parseInt(data.close_time ?? '21:00', 10))
        setBufferMinutes(data.default_buffer_minutes ?? 30)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    if (openHour >= closeHour) {
      toast.error('設定錯誤', '開始時間必須早於結束時間')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('stores')
      .update({
        name: storeName.trim() || undefined,
        open_time: `${String(openHour).padStart(2, '0')}:00:00`,
        close_time: `${String(closeHour).padStart(2, '0')}:00:00`,
        default_buffer_minutes: bufferMinutes,
      })
      .eq('id', STORE_ID)
    setSaving(false)
    if (error) {
      toast.error('儲存失敗', error.message)
    } else {
      toast.success('設定已儲存', '行事曆和甘特圖將在下次開啟時套用新設定')
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* 頁首 */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Settings size={22} className="text-slate-600" />
            店家設定
          </h1>
          <p className="text-sm text-slate-500 mt-1">設定適用於行事曆、甘特圖，以及線上預約的可預約時間範圍</p>
        </div>

        {/* 基本資料 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">基本資料</h2>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">店家名稱</label>
            <Input
              type="text"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
            />
          </div>
        </div>

        {/* 營業時間 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700">營業時間</h2>
          </div>
          <p className="text-xs text-slate-400 -mt-3">
            行事曆與甘特圖的顯示時間範圍，同時也限制線上預約的可選時段
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">開始時間</label>
              <Select
                value={String(openHour)}
                onChange={v => setOpenHour(Number(v))}
                options={hourOptions(6, 14).map(o => ({ value: String(o.value), label: o.label }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">結束時間</label>
              <Select
                value={String(closeHour)}
                onChange={v => setCloseHour(Number(v))}
                options={hourOptions(15, 24).map(o => ({ value: String(o.value), label: o.label }))}
              />
            </div>
          </div>

          {/* 預覽 */}
          <div className="bg-slate-50 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-slate-600">
            <CheckCircle size={14} className="text-emerald-500 shrink-0" />
            可預約時段：{String(openHour).padStart(2, '0')}:00 – {String(closeHour).padStart(2, '0')}:00
            <span className="text-slate-400 ml-1">（共 {closeHour - openHour} 小時）</span>
          </div>
        </div>

        {/* 預設緩衝時間 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">預設緩衝時間</h2>
          <p className="text-xs text-slate-400 -mt-2">每筆預約結束後自動預留的準備時間（可在新增預約時個別調整）</p>

          <div className="flex items-center gap-3">
            {[0, 15, 30, 45, 60].map(min => (
              <button
                key={min}
                onClick={() => setBufferMinutes(min)}
                className={[
                  'flex-1 py-2 rounded-xl text-sm font-medium border transition-all',
                  bufferMinutes === min
                    ? 'bg-black text-white border-black shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
                ].join(' ')}
              >
                {min === 0 ? '無' : `${min}分`}
              </button>
            ))}
          </div>
        </div>

        {/* 儲存按鈕 */}
        <div className="flex justify-end">
          <Button variant="primary" loading={saving} onClick={handleSave}>
            <Save size={15} />
            儲存設定
          </Button>
        </div>

      </div>
    </div>
  )
}
