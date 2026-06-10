/**
 * 預約表單 - Step 4: 確認預約
 * 顯示預約摘要和備註欄位
 */

interface BookingStep4Props {
  client: any | null
  practitioner: any | null
  service: any | null
  startTime: string
  endTime: string
  notes: string
  onNotesChange: (notes: string) => void
}

export default function BookingStep4({
  client,
  practitioner,
  service,
  startTime,
  endTime,
  notes,
  onNotesChange,
}: BookingStep4Props) {
  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString)
    return {
      date: date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
      }),
      time: date.toLocaleTimeString('zh-TW', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    }
  }

  const startInfo = formatDateTime(startTime)
  const endInfo = formatDateTime(endTime)

  return (
    <div className="space-y-5">
      {/* 預約摘要 */}
      <div className="space-y-3">
        {/* 客戶 */}
        <div className="p-4 border border-slate-200 rounded-lg">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            客戶
          </div>
          <div className="flex items-center gap-3">
            <div className="text-lg font-semibold text-slate-900">
              {client?.name}
            </div>
            {client?.phone && (
              <div className="text-sm text-slate-600">{client.phone}</div>
            )}
          </div>
        </div>

        {/* 老師 */}
        <div className="p-4 border border-slate-200 rounded-lg">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            從業人員
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded border border-slate-200"
              style={{ backgroundColor: practitioner?.color }}
            />
            <div className="text-lg font-semibold text-slate-900">
              {practitioner?.full_name}
            </div>
          </div>
        </div>

        {/* 課程 */}
        <div className="p-4 border border-slate-200 rounded-lg">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            課程
          </div>
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-slate-900">
              {service?.name}
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-600">
                ⏱️ {service?.duration_minutes} 分鐘
              </div>
              <div className="text-sm font-medium text-slate-900">
                💰 ¥{service?.price?.toLocaleString('zh-CN') || 0}
              </div>
            </div>
          </div>
        </div>

        {/* 時間 */}
        <div className="p-4 border border-slate-200 rounded-lg">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
            預約時間
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">日期</div>
              <div className="font-medium text-slate-900">{startInfo.date}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">時段</div>
              <div className="font-medium text-slate-900">
                {startInfo.time} - {endInfo.time}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 備註欄位 */}
      <div>
        <label className="block text-sm font-semibold text-slate-900 mb-2">
          備註（選填）
        </label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="例：客戶要求特別提醒、特殊需求等"
          rows={3}
          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
        />
      </div>

      {/* 確認提示 */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="text-sm text-blue-900">
          <div className="font-medium">✓ 確認預約詳情</div>
          <div className="mt-2 text-xs space-y-1">
            <div>• 客戶：{client?.name}</div>
            <div>• 老師：{practitioner?.full_name}</div>
            <div>• 課程：{service?.name}</div>
            <div>• 時間：{startInfo.date} {startInfo.time} - {endInfo.time}</div>
          </div>
        </div>
      </div>

      {/* 政策提示 */}
      <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg">
        點擊「新增預約」後，系統將自動發送確認通知給客戶（如設定）。預約可隨時編輯或取消。
      </div>
    </div>
  )
}
