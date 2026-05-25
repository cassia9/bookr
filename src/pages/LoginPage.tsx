import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/cn'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError('帳號或密碼錯誤，請重試')
    } else {
      navigate('/admin')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div className="mb-8 text-center">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
              <span className="text-white text-xl">✦</span>
            </div>
            <h1 className="text-xl font-semibold text-slate-900">預約管理系統</h1>
            <p className="text-sm text-slate-500 mt-1">請登入以繼續</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                電子信箱
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className={cn(
                  'w-full px-3 py-2 rounded-lg border text-sm outline-none',
                  'border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100',
                  'placeholder:text-slate-400 transition'
                )}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                密碼
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className={cn(
                  'w-full px-3 py-2 rounded-lg border text-sm outline-none',
                  'border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100',
                  'placeholder:text-slate-400 transition'
                )}
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full py-2.5 px-4 rounded-lg text-sm font-medium transition',
                'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800',
                'disabled:opacity-60 disabled:cursor-not-allowed'
              )}
            >
              {loading ? '登入中...' : '登入'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
