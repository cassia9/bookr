import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import { toast } from '@/components/ui/Snackbar'

interface InvitationData {
  email: string
  storeName: string
}

interface FormData {
  name: string
  password: string
  showPassword: boolean
}

interface PasswordStrength {
  score: number
  requirements: {
    minLength: boolean
    hasUppercase: boolean
    hasLowercase: boolean
    hasNumber: boolean
  }
}

type PageState = 'loading' | 'valid' | 'invalid' | 'success'

export default function AcceptInvitationPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [pageState, setPageState] = useState<PageState>('loading')
  const [invitationData, setInvitationData] = useState<InvitationData | null>(null)
  const [form, setForm] = useState<FormData>({
    name: '',
    password: '',
    showPassword: false,
  })
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({
    score: 0,
    requirements: {
      minLength: false,
      hasUppercase: false,
      hasLowercase: false,
      hasNumber: false,
    },
  })
  const [errors, setErrors] = useState<{ name?: string; password?: string }>({})
  const [isLoading, setIsLoading] = useState(false)

  // 驗證 token
  useEffect(() => {
    if (!token) {
      setPageState('invalid')
      return
    }

    validateToken()
  }, [token])

  const validateToken = async () => {
    try {
      // 呼叫後端驗證 token
      const { data, error } = await (supabase.rpc as any)('validate_invitation_token', {
        p_token: token,
      })

      if (error || !data || !(data as any).valid) {
        console.error('Token validation error:', error || (data as any)?.message)
        setPageState('invalid')
        return
      }

      // Token 有效，從資料庫取得邀請資訊
      setInvitationData({
        email: (data as any).email,
        storeName: '預約系統', // TODO: 從 store 表取得店家名稱
      })
      setPageState('valid')
    } catch (error) {
      console.error('Unexpected error during token validation:', error)
      setPageState('invalid')
    }
  }

  const checkPasswordStrength = (password: string) => {
    const requirements = {
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
    }

    const score = Object.values(requirements).filter(Boolean).length

    setPasswordStrength({ score, requirements })
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target
    setForm({ ...form, password: value })
    checkPasswordStrength(value)

    if (errors.password) {
      setErrors({ ...errors, password: undefined })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 驗證
    const newErrors: typeof errors = {}

    if (!form.name.trim()) {
      newErrors.name = 'Name is required'
    }

    if (form.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }

    if (!passwordStrength.requirements.hasUppercase ||
        !passwordStrength.requirements.hasLowercase ||
        !passwordStrength.requirements.hasNumber) {
      newErrors.password = 'Password must contain uppercase, lowercase, and numbers'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setIsLoading(true)

    try {
      // 調用 accept-invitation Edge Function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-invitation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token,
            email: invitationData?.email,
            name: form.name,
            password: form.password,
          }),
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Registration failed')
      }

      // 成功
      setPageState('success')

      // 2秒後重定向
      setTimeout(() => {
        navigate('/login')
      }, 2000)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full p-8 border border-red-200 rounded-lg bg-red-50">
          <h2 className="text-lg font-semibold text-red-900 mb-2">
            邀請連結無效或已過期
          </h2>
          <p className="text-red-700 text-sm mb-4">
            邀請可能已過期（超過 30 天）或已被接受。請聯絡店家管理員重新邀請。
          </p>
          <button
            onClick={() => navigate('/login')}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            返回登入
          </button>
        </div>
      </div>
    )
  }

  if (pageState === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full p-8 border border-gray-200 rounded-lg bg-white text-center">
          <div className="mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
              <span className="text-3xl">✅</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            註冊成功！
          </h2>
          <p className="text-gray-600 mb-4">
            正在轉向登入頁面...
          </p>
          <div className="animate-pulse text-gray-500 text-sm">
            (2 秒後自動跳轉)
          </div>
        </div>
      </div>
    )
  }

  // pageState === 'valid'
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full p-8 border border-gray-200 rounded-lg bg-white">
        {/* 邀請標題 */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">✨</div>
          <h1 className="text-2xl font-bold text-blue-600 mb-1">歡迎加入</h1>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {invitationData?.storeName}
          </h2>
          <p className="text-sm text-gray-600">
            由管理員邀請
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email 預填 */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email 地址
            </label>
            <input
              id="email"
              type="email"
              value={invitationData?.email || ''}
              disabled
              className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-lg text-gray-600 cursor-default"
            />
            <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
              ✓ 已驗證
            </p>
          </div>

          {/* 名字輸入 */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              名字 *
            </label>
            <input
              id="name"
              type="text"
              placeholder="請輸入你的名字"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value })
                if (errors.name) setErrors({ ...errors, name: undefined })
              }}
              className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={isLoading}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          {/* 密碼輸入 */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              密碼 *
            </label>
            <div className="relative">
              <input
                id="password"
                type={form.showPassword ? 'text' : 'password'}
                placeholder="至少 8 個字符"
                value={form.password}
                onChange={handlePasswordChange}
                className={`w-full px-4 py-2.5 pr-12 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.password ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, showPassword: !form.showPassword })}
                className="absolute right-3 top-3 text-gray-600 hover:text-gray-800"
              >
                {form.showPassword ? '👁‍🗨' : '👁'}
              </button>
            </div>

            {/* 密碼強度指示 */}
            {form.password && (
              <div className="mt-3 space-y-2">
                {/* 強度條 */}
                <div className="flex gap-1 h-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-full ${
                        i < passwordStrength.score ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    ></div>
                  ))}
                </div>

                {/* 密碼要求 */}
                <div className="text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={passwordStrength.requirements.minLength ? 'text-green-600' : 'text-gray-400'}>
                      ✓
                    </span>
                    <span className={passwordStrength.requirements.minLength ? 'text-gray-700' : 'text-gray-400'}>
                      至少 8 個字符
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={passwordStrength.requirements.hasUppercase ? 'text-green-600' : 'text-gray-400'}>
                      ✓
                    </span>
                    <span className={passwordStrength.requirements.hasUppercase ? 'text-gray-700' : 'text-gray-400'}>
                      包含大寫字母
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={passwordStrength.requirements.hasLowercase ? 'text-green-600' : 'text-gray-400'}>
                      ✓
                    </span>
                    <span className={passwordStrength.requirements.hasLowercase ? 'text-gray-700' : 'text-gray-400'}>
                      包含小寫字母
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={passwordStrength.requirements.hasNumber ? 'text-green-600' : 'text-gray-400'}>
                      ✓
                    </span>
                    <span className={passwordStrength.requirements.hasNumber ? 'text-gray-700' : 'text-gray-400'}>
                      包含數字
                    </span>
                  </div>
                </div>
              </div>
            )}

            {errors.password && (
              <p className="mt-2 text-sm text-red-600">{errors.password}</p>
            )}
          </div>

          {/* 提交按鈕 */}
          <Button
            type="submit"
            className="w-full py-2.5"
            disabled={isLoading}
          >
            {isLoading ? '完成註冊中...' : '完成註冊'}
          </Button>
        </form>

        {/* 底部連結 */}
        <p className="text-center text-sm text-gray-600 mt-6">
          已有帳號？{' '}
          <button
            onClick={() => navigate('/login')}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            登入
          </button>
        </p>
      </div>
    </div>
  )
}
