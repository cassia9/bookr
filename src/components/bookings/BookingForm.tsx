/**
 * 預約表單組件 - 主容器
 * Phase 1 實現 - 新增/編輯預約
 * 2026-06-10
 */

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BookingStep, BookingFormState, Client, Booking } from '@/types/booking'
import * as BookingAPI from '@/lib/bookings/api'
import BookingStep1 from './BookingStep1'
import BookingStep2 from './BookingStep2'
import BookingStep3 from './BookingStep3'
import BookingStep4 from './BookingStep4'

interface BookingFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  editingBookingId?: string
}

export default function BookingForm({
  isOpen,
  onClose,
  onSuccess,
  editingBookingId,
}: BookingFormProps) {
  const [state, setState] = useState<BookingFormState>({
    step: 1,
    formData: {},
    selectedClient: null,
    selectedPractitioner: null,
    selectedService: null,
    isLoading: false,
    error: null,
    hasConflict: false,
  })

  const [storeId, setStoreId] = useState<string | null>(null)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const initForm = async () => {
      try {
        // 獲取 store_id
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: userData } = await supabase
          .from('users')
          .select('store_id')
          .eq('id', user.id)
          .single()

        if (userData) setStoreId(userData.store_id)

        // 如果是編輯模式，載入預約數據
        if (editingBookingId) {
          const { data: booking } = await supabase
            .from('bookings')
            .select('*')
            .eq('id', editingBookingId)
            .single()

          if (booking) {
            setEditingBooking(booking)
            setState(prev => ({
              ...prev,
              formData: {
                client_id: booking.client_id,
                practitioner_id: booking.practitioner_id,
                service_id: booking.service_id,
                start_time: booking.start_time,
                end_time: booking.end_time,
                notes: booking.notes || '',
              },
            }))
          }
        }
      } catch (err) {
        console.error('Failed to initialize form:', err)
        setState(prev => ({
          ...prev,
          error: '初始化表單失敗',
        }))
      }
    }

    initForm()
  }, [isOpen, editingBookingId])

  const handleNext = async () => {
    setState(prev => ({ ...prev, error: null }))

    // 驗證當前步驟
    if (state.step === 1 && !state.selectedClient) {
      setState(prev => ({ ...prev, error: '請選擇客戶' }))
      return
    }
    if (state.step === 2 && (!state.selectedPractitioner || !state.selectedService)) {
      setState(prev => ({ ...prev, error: '請選擇老師和課程' }))
      return
    }
    if (state.step === 3 && (!state.formData.start_time || !state.formData.end_time)) {
      setState(prev => ({ ...prev, error: '請選擇預約時間' }))
      return
    }

    if (state.step < 4) {
      setState(prev => ({ ...prev, step: (prev.step + 1) as BookingStep }))
    }
  }

  const handlePrev = () => {
    if (state.step > 1) {
      setState(prev => ({ ...prev, step: (prev.step - 1) as BookingStep }))
    }
  }

  const handleSubmit = async () => {
    if (!storeId || !state.selectedClient || !state.formData.start_time || !state.formData.end_time) {
      setState(prev => ({ ...prev, error: '表單數據不完整' }))
      return
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const bookingData = {
        client_id: state.selectedClient.id,
        practitioner_id: state.formData.practitioner_id!,
        service_id: state.formData.service_id!,
        start_time: state.formData.start_time,
        end_time: state.formData.end_time,
        notes: state.formData.notes || '',
      }

      if (editingBookingId) {
        await BookingAPI.updateBooking(editingBookingId, bookingData)
      } else {
        await BookingAPI.createBooking(storeId, bookingData)
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
      }))
      onSuccess()
      onClose()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '操作失敗'
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMsg,
      }))
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* 標題 */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-900">
              {editingBookingId ? '✏️ 編輯預約' : '➕ 新增預約'}
            </h2>
            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded">
              {state.step}/4
            </span>
          </div>

          {/* 進度條 */}
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  step <= state.step ? 'bg-black' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* 錯誤提示 */}
        {state.error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{state.error}</p>
          </div>
        )}

        {/* 表單內容 */}
        <div className="p-6 space-y-6">
          {state.step === 1 && (
            <BookingStep1
              selectedClient={state.selectedClient}
              storeId={storeId}
              onChange={(client) => {
                setState(prev => ({ ...prev, selectedClient: client }))
              }}
            />
          )}

          {state.step === 2 && (
            <BookingStep2
              selectedPractitioner={state.selectedPractitioner}
              selectedService={state.selectedService}
              storeId={storeId}
              onPractitionerChange={(practitioner) => {
                setState(prev => ({
                  ...prev,
                  selectedPractitioner: practitioner,
                  selectedService: null,
                }))
              }}
              onServiceChange={(service) => {
                setState(prev => ({
                  ...prev,
                  selectedService: service,
                  formData: {
                    ...prev.formData,
                    service_id: service.id,
                    end_time: prev.formData.start_time
                      ? new Date(
                          new Date(prev.formData.start_time).getTime() +
                            service.duration_minutes * 60000
                        ).toISOString()
                      : '',
                  },
                }))
              }}
            />
          )}

          {state.step === 3 && (
            <BookingStep3
              selectedPractitioner={state.selectedPractitioner}
              selectedService={state.selectedService}
              startTime={state.formData.start_time}
              endTime={state.formData.end_time}
              hasConflict={state.hasConflict}
              storeId={storeId}
              onTimeChange={(startTime, endTime) => {
                setState(prev => ({
                  ...prev,
                  formData: {
                    ...prev.formData,
                    start_time: startTime,
                    end_time: endTime,
                  },
                }))
              }}
              onConflictChange={(hasConflict) => {
                setState(prev => ({ ...prev, hasConflict }))
              }}
            />
          )}

          {state.step === 4 && (
            <BookingStep4
              client={state.selectedClient}
              practitioner={state.selectedPractitioner}
              service={state.selectedService}
              startTime={state.formData.start_time}
              endTime={state.formData.end_time}
              notes={state.formData.notes || ''}
              onNotesChange={(notes) => {
                setState(prev => ({
                  ...prev,
                  formData: { ...prev.formData, notes },
                }))
              }}
            />
          )}
        </div>

        {/* 按鈕 */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={state.isLoading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            取消
          </button>

          {state.step > 1 && (
            <button
              onClick={handlePrev}
              disabled={state.isLoading}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
              上一步
            </button>
          )}

          {state.step < 4 ? (
            <button
              onClick={handleNext}
              disabled={state.isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-slate-900 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              下一步
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={state.isLoading || state.hasConflict}
              className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-slate-900 rounded-lg transition-colors disabled:opacity-50"
            >
              {state.isLoading ? '⏳ 提交中...' : editingBookingId ? '✓ 更新預約' : '✓ 新增預約'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
