/**
 * 預約表單 - Step 2: 選擇老師 & 課程
 */

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import * as BookingAPI from '@/lib/bookings/api'

interface BookingStep2Props {
  selectedPractitioner: any | null
  selectedService: any | null
  storeId: string | null
  onPractitionerChange: (practitioner: any) => void
  onServiceChange: (service: any) => void
}

export default function BookingStep2({
  selectedPractitioner,
  selectedService,
  storeId,
  onPractitionerChange,
  onServiceChange,
}: BookingStep2Props) {
  const [practitioners, setPractitioners] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [isLoadingPractitioners, setIsLoadingPractitioners] = useState(true)
  const [isLoadingServices, setIsLoadingServices] = useState(false)

  // 載入老師列表
  useEffect(() => {
    if (!storeId) return

    const loadPractitioners = async () => {
      try {
        setIsLoadingPractitioners(true)
        const { data } = await supabase
          .from('practitioners')
          .select('id, full_name, color')
          .eq('store_id', storeId)
          .is('deleted_at', null)
          .order('full_name')

        setPractitioners(data || [])
      } catch (err) {
        console.error('Failed to load practitioners:', err)
      } finally {
        setIsLoadingPractitioners(false)
      }
    }

    loadPractitioners()
  }, [storeId])

  // 選擇老師時，載入該老師的課程
  const handleSelectPractitioner = async (practitioner: any) => {
    onPractitionerChange(practitioner)

    try {
      setIsLoadingServices(true)
      const practitionerServices = await BookingAPI.getPractitionerServices(
        practitioner.id
      )
      setServices(practitionerServices)
      onServiceChange(null)
    } catch (err) {
      console.error('Failed to load services:', err)
      setServices([])
    } finally {
      setIsLoadingServices(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* 選擇老師 */}
      <div>
        <label className="block text-sm font-semibold text-slate-900 mb-3">
          選擇老師 <span className="text-red-500">*</span>
        </label>

        {isLoadingPractitioners ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-slate-900" />
            <span className="text-sm text-slate-600 ml-2">載入中...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {practitioners.map((practitioner) => (
              <button
                key={practitioner.id}
                onClick={() => handleSelectPractitioner(practitioner)}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  selectedPractitioner?.id === practitioner.id
                    ? 'border-black bg-black/5'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded border border-slate-200"
                    style={{ backgroundColor: practitioner.color }}
                  />
                  <div className="font-medium text-sm text-slate-900">
                    {practitioner.full_name}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 選擇課程 */}
      {selectedPractitioner && (
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-3">
            選擇課程 <span className="text-red-500">*</span>
          </label>

          {isLoadingServices ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-slate-900" />
              <span className="text-sm text-slate-600 ml-2">載入課程中...</span>
            </div>
          ) : services.length > 0 ? (
            <div className="space-y-2">
              {services.map((service) => (
                <button
                  key={service.id}
                  onClick={() => onServiceChange(service)}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    selectedService?.id === service.id
                      ? 'border-black bg-black/5'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">
                        {service.name}
                      </div>
                      <div className="text-xs text-slate-600 mt-1 flex gap-3">
                        <span>⏱️ {service.duration_minutes} 分鐘</span>
                        <span>💰 ¥{service.price?.toLocaleString('zh-CN') || 0}</span>
                      </div>
                    </div>
                    {selectedService?.id === service.id && (
                      <div className="text-slate-500 text-sm">✓</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-slate-600 bg-slate-50 rounded-lg border border-slate-200">
              此老師暫無課程
            </div>
          )}
        </div>
      )}
    </div>
  )
}
