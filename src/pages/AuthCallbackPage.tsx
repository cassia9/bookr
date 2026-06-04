import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Google OAuth 登入後會跳回這個頁面，處理完 session 再導向後台
export default function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/admin', { replace: true })
      } else {
        navigate('/login', { replace: true })
      }
    })
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-slate-500">
        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">登入中，請稍候...</span>
      </div>
    </div>
  )
}
