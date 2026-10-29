import { Navigate } from 'react-router-dom'
import { UserRoundX } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import Button from '../ui/Button'

interface Props {
  children: React.ReactNode
  adminOnly?: boolean
}

export default function ProtectedRoute({ children, adminOnly = false }: Props) {
  const { session, profile, isAdmin, loading, profileError, signOut, retryProfile } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (!profile && profileError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <UserRoundX size={24} />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">帳號資料暫時無法載入</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            登入已完成，但成員資料讀取失敗。請重新檢查；若仍無法載入，再登出後重新登入。
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" className="flex-1" onClick={() => void signOut()}>
              登出並重新登入
            </Button>
            <Button className="flex-1" onClick={() => void retryProfile()}>
              重新檢查
            </Button>
          </div>
          <p className="mt-4 break-all text-xs text-slate-400">登入帳號：{session.user.email ?? '無法辨識'}</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <UserRoundX size={24} />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">帳號尚未完成店家設定</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            此登入帳號目前沒有有效的成員或店家資料，因此無法安全載入預約與商品券。
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" className="flex-1" onClick={() => void signOut()}>
              登出並更換帳號
            </Button>
            <Button className="flex-1" onClick={() => window.location.reload()}>
              重新檢查
            </Button>
          </div>
          <p className="mt-4 break-all text-xs text-slate-400">登入帳號：{session.user.email ?? '無法辨識'}</p>
        </div>
      </div>
    )
  }

  if (adminOnly && !isAdmin) return <Navigate to="/admin/calendar" replace />

  return <>{children}</>
}
