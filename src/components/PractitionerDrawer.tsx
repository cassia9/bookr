import { X, Phone, Mail, Globe } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Practitioner {
  id: string
  name: string
  profession: string
  experience_years?: number
  certifications?: string
  rating?: number
  phone?: string
  email?: string
  work_hours?: {
    monday_to_friday: string
    saturday: string
    sunday: string
  }
  services?: Array<{
    id: string
    name: string
    duration: number
    price: number
  }>
}

interface PractitionerDrawerProps {
  isOpen: boolean
  practitioner?: Practitioner
  onClose: () => void
}

export default function PractitionerDrawer({ isOpen, practitioner, onClose }: PractitionerDrawerProps) {
  if (!practitioner) return null

  const getInitial = (name: string) => name.charAt(0)

  return (
    <>
      {/* 背景遮罩 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* 右側彈窗 */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 w-96 bg-white shadow-2xl transition-transform duration-300 z-50 overflow-y-auto',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* 標題區 */}
        <div className="p-6 border-b border-slate-200 sticky top-0 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">從業人員詳情</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors duration-200"
            >
              <X size={20} className="text-slate-600" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* 內容區 */}
        <div className="p-6 space-y-8">
          {/* 基本資訊 */}
          <section>
            <div className="flex items-start gap-4 mb-6">
              <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl font-semibold text-white">{getInitial(practitioner.name)}</span>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-slate-900">{practitioner.name}</h3>
                <p className="text-sm text-slate-600 mt-1">{practitioner.profession}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-50 border border-green-200 text-xs font-medium text-green-700">
                    <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                    線上
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* 專業資訊 */}
          <section>
            <h4 className="text-sm font-semibold text-slate-900 mb-4">專業資訊</h4>
            <div className="space-y-3">
              {practitioner.experience_years && (
                <div className="flex justify-between items-start p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-sm text-slate-600">經驗年數</span>
                  <span className="text-sm font-medium text-slate-900">{practitioner.experience_years} 年</span>
                </div>
              )}
              {practitioner.certifications && (
                <div className="flex justify-between items-start p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-sm text-slate-600">認證資格</span>
                  <span className="text-sm font-medium text-slate-900">{practitioner.certifications}</span>
                </div>
              )}
              {practitioner.rating && (
                <div className="flex justify-between items-start p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-sm text-slate-600">評價</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-slate-900">{practitioner.rating}</span>
                    <span className="text-yellow-500 text-xs">★★★★★</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 工作時段 */}
          {practitioner.work_hours && (
            <section>
              <h4 className="text-sm font-semibold text-slate-900 mb-4">工作時段</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center p-3 border border-slate-200 rounded-lg">
                  <span className="text-sm text-slate-600">週一 - 週五</span>
                  <span className="text-sm font-medium text-slate-900">{practitioner.work_hours.monday_to_friday}</span>
                </div>
                <div className="flex justify-between items-center p-3 border border-slate-200 rounded-lg">
                  <span className="text-sm text-slate-600">週六</span>
                  <span className="text-sm font-medium text-slate-900">{practitioner.work_hours.saturday}</span>
                </div>
                <div className="flex justify-between items-center p-3 border border-slate-200 rounded-lg">
                  <span className="text-sm text-slate-600">週日</span>
                  <span className="text-sm font-medium text-slate-700">休息</span>
                </div>
              </div>
            </section>
          )}

          {/* 服務課程 */}
          {practitioner.services && practitioner.services.length > 0 && (
            <section>
              <h4 className="text-sm font-semibold text-slate-900 mb-4">服務課程</h4>
              <div className="space-y-2">
                {practitioner.services.map((service) => (
                  <div
                    key={service.id}
                    className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors duration-200 cursor-pointer"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{service.name}</p>
                      <p className="text-xs text-slate-500 mt-1">{service.duration} 分鐘</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">${service.price}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 聯絡方式 */}
          <section>
            <h4 className="text-sm font-semibold text-slate-900 mb-4">聯絡方式</h4>
            <div className="space-y-3">
              {practitioner.phone && (
                <a
                  href={`tel:${practitioner.phone}`}
                  className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors duration-200"
                >
                  <Phone size={20} className="text-slate-600 flex-shrink-0" strokeWidth={1.5} />
                  <div>
                    <p className="text-sm text-slate-600">電話</p>
                    <p className="text-sm font-medium text-slate-900">{practitioner.phone}</p>
                  </div>
                </a>
              )}
              {practitioner.email && (
                <a
                  href={`mailto:${practitioner.email}`}
                  className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors duration-200"
                >
                  <Mail size={20} className="text-slate-600 flex-shrink-0" strokeWidth={1.5} />
                  <div>
                    <p className="text-sm text-slate-600">電子郵件</p>
                    <p className="text-sm font-medium text-slate-900">{practitioner.email}</p>
                  </div>
                </a>
              )}
              <button className="w-full flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors duration-200">
                <Globe size={20} className="text-slate-600 flex-shrink-0" strokeWidth={1.5} />
                <div className="text-left">
                  <p className="text-sm text-slate-600">個人網站</p>
                  <p className="text-sm font-medium text-slate-900">{practitioner.name}</p>
                </div>
              </button>
            </div>
          </section>

          {/* 操作按鈕 */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 text-slate-900 rounded-lg font-medium text-sm hover:bg-slate-50 transition-colors duration-200"
            >
              關閉
            </button>
            <button className="flex-1 px-4 py-2 bg-black text-white rounded-lg font-medium text-sm hover:bg-slate-900 transition-colors duration-200">
              預約課程
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
