/**
 * 預約表單 - Step 3: 選擇時間
 * 包括日期選擇、時間選擇和衝突檢測
 */

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import * as BookingAPI from '@/lib/bookings/api'
import Select from '@/components/ui/Select'

interface BookingStep3Props {
  selectedPractitioner: any | null
  selectedService: any | null
  startTime: string
  endTime: string
  hasConflict: boolean
  storeId: string | null
  onTimeChange: (startTime: string, endTime: string) => void
  onConflictChange: (hasConflict: boolean) => void
}

export default function BookingStep3({
  selectedPractitioner,
  selectedService,
  startTime,
  endTime,
  hasConflict,
  storeId,
  onTimeChange,
  onConflictChange,
}: BookingStep3Props) {
  const [date, setDate] = useState(startTime ? new Date(startTime).toISOString().split('T')[0] : '')
  const [time, setTime] = useState(startTime ? new Date(startTime).toTimeString().slice(0, 5) : '')
  const [durationMinutes, setDurationMinutes] = useState(
    selectedService?.duration_minutes || 60
  )
  const [isCheckingConflict, setIsCheckingConflict] = useState(false)

  // 更新日期
  const handleDateChange = (newDate: string) => {
    setDate(newDate)
    if (newDate && time) {
      updateTimes(newDate, time, durationMinutes)
    }
  }

  // 更新時間
  const handleTimeChange = (newTime: string) => {
    setTime(newTime)
    if (date && newTime) {
      updateTimes(date, newTime, durationMinutes)
    }
  }

  // 更新時長
  const handleDurationChange = (newDuration: number) => {
    setDurationMinutes(newDuration)
    if (date && time) {
      updateTimes(date, time, newDuration)
    }
  }

  // 更新時間和檢查衝突
  const updateTimes = async (newDate: string, newTime: string, newDuration: number) => {
    const [hours, minutes] = newTime.split(':').map(Number)
    const startDateTime = new Date(`${newDate}T${newTime}:00`)
    const endDateTime = new Date(startDateTime.getTime() + newDuration * 60000)

    const newStartTime = startDateTime.toISOString()
    const newEndTime = endDateTime.toISOString()

    onTimeChange(newStartTime, newEndTime)

    // 檢查衝突
    if (selectedPractitioner && storeId) {
      setIsCheckingConflict(true)
      try {
        const conflict = await BookingAPI.checkBookingConflict(
          storeId,
          selectedPractitioner.id,
          newStartTime,
          newEndTime
        )
        onConflictChange(conflict)
      } catch (err) {
        console.error('Failed to check conflict:', err)
      } finally {
        setIsCheckingConflict(false)
      }
    }
  }

  // 初始化日期
  useEffect(() => {
    if (!date) {
      const today = new Date().toISOString().split('T')[0]
      setDate(today)
    }
  }, [])

  // 當服務改變時，更新時長
  useEffect(() => {
    if (selectedService) {
      setDurationMinutes(selectedService.duration_minutes)
      if (date && time) {
        updateTimes(date, time, selectedService.duration_minutes)
      }
    }
  }, [selectedService?.id])

  const formatEndTime = () => {
    if (!startTime) return ''
    const endDate = new Date(endTime)
    return endDate.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  return (
    <div className="space-y-5">
      {/* 日期選擇 */}
      <div>
        <label className="block text-sm font-semibold text-slate-900 mb-2">
          預約日期 <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => handleDateChange(e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />
      </div>

      {/* 時間選擇 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            開始時間 <span className="text-red-500">*</span>
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => handleTimeChange(e.target.value)}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            結束時間
          </label>
          <input
            type="text"
            value={formatEndTime()}
            disabled
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600"
          />
        </div>
      </div>

      {/* 預約時長 */}
      <div>
        <label className="block text-sm font-semibold text-slate-900 mb-2">
          預約時長 <span className="text-red-500">*</span>
        </label>
        <Select
          value={String(durationMinutes)}
          onChange={(v) => handleDurationChange(Number(v))}
          options={[
            { value: '30',  label: '30 分鐘' },
            { value: '45',  label: '45 分鐘' },
            { value: '60',  label: '1 小時' },
            { value: '90',  label: '1.5 小時' },
            { value: '120', label: '2 小時' },
          ]}
        />
      </div>

      {/* 衝突警告 */}
      {hasConflict && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-red-900">時段已有預約</div>
            <div className="text-sm text-red-700 mt-1">
              所選時段與現有預約衝突，請選擇其他時間
            </div>
          </div>
        </div>
      )}

      {/* 時間摘要 */}
      {date && time && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="text-sm text-slate-600">
            <div>
              <span className="font-medium text-slate-900">預約時段：</span>
              {new Date(`${date}T${time}`).toLocaleDateString('zh-TW', {
                month: '2-digit',
                day: '2-digit',
                weekday: 'short',
              })}{' '}
              {time} - {formatEndTime()}
            </div>
            <div className="mt-2">
              <span className="font-medium text-slate-900">時長：</span>
              {durationMinutes} 分鐘
            </div>
          </div>
        </div>
      )}

      {isCheckingConflict && (
        <div className="text-center text-sm text-slate-600">
          <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-slate-300 border-t-slate-900 mr-2" />
          檢查衝突中...
        </div>
      )}
    </div>
  )
}
