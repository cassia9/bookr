/**
 * 預約表單組件 - 主容器
 * Phase 1 實現
 * 2026-06-10
 *
 * TODO: 等待 /frontend-design 的實現完成
 * 此文件為占位符，將被完整實現替換
 */

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BookingStep, BookingFormState, Client } from '@/types/booking'

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

  useEffect(() => {
    // 獲取當前用戶的 store_id
    const getUserStoreId = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await supabase
          .from('users')
          .select('store_id')
          .eq('id', user.id)
          .single()

        if (data) setStoreId(data.store_id)
      } catch (err) {
        console.error('Failed to get store_id:', err)
      }
    }

    getUserStoreId()
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* 占位符 - 等待前端設計實現 */}
        <div className="p-8 text-center">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            {editingBookingId ? '編輯預約' : '新增預約'}
          </h2>
          <p className="text-sm text-slate-600 mb-6">
            表單實現已準備，等待 Phase 1 完整代碼部署...
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
          >
            關閉
          </button>
        </div>

        {/*
          TODO: 實現以下步驟
          Step 1: 選擇客戶（搜尋 + 新增）
          Step 2: 選擇老師 & 課程
          Step 3: 選擇時間
          Step 4: 確認 & 新增
        */}
      </div>
    </div>
  )
}
