import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Alert from '../components/ui/Alert'

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
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200/80 p-8">
          <div className="mb-7 text-center">
            <div className="w-12 h-12 bg-black rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
              <span className="text-white text-lg">✦</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">預約管理系統</h1>
            <p className="text-sm text-slate-400 mt-1">請登入以繼續</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">電子信箱</label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">密碼</label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                disabled={loading}
              />
            </div>

            {error && <Alert variant="error">{error}</Alert>}

            <Button type="submit" loading={loading} className="w-full mt-1">
              登入
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
