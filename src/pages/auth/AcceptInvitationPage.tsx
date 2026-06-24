import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import FormField from '@/components/ui/FormField'
import { toast } from '@/components/ui/Snackbar'

interface InvitationInfo {
  email: string
  storeName: string
  role: string
}

interface PasswordReqs {
  minLength: boolean
  hasUppercase: boolean
  hasLowercase: boolean
  hasNumber: boolean
}

type PageState = 'loading' | 'valid' | 'invalid' | 'success'

export default function AcceptInvitationPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [pageState, setPageState] = useState<PageState>('loading')
  const [invalidMessage, setInvalidMessage] = useState('')
  const [info, setInfo] = useState<InvitationInfo | null>(null)

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const passwordReqs: PasswordReqs = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
  }
  const passwordValid = Object.values(passwordReqs).every(Boolean)

  useEffect(() => {
    if (!token) {
      setInvalidMessage('邀請連結無效，請確認連結是否完整。')
      setPageState('invalid')
      return
    }
    validateToken()
  }, [token])

  async function validateToken() {
    try {
      const { data, error } = await supabase
        .rpc('validate_invitation_token', { p_token: token })
        .single()

      if (error || !data || !(data as any).valid) {
        const msg = (data as any)?.message
        if (msg === 'Invitation already accepted') {
          setInvalidMessage('此邀請連結已被使用，請直接登入。')
        } else if (msg === 'Invitation expired') {
          setInvalidMessage('邀請連結已過期，請聯絡管理員重新發送。')
        } else {
          setInvalidMessage('邀請連結無效，請確認連結是否完整。')
        }
        setPageState('invalid')
        return
      }

      const tokenData = data as any

      // 取得店家名稱
      const { data: storeData } = await supabase
        .from('stores')
        .select('name')
        .eq('id', tokenData.store_id)
        .single()

      setInfo({
        email: tokenData.email,
        storeName: storeData?.name || '預約管理系統',
        role: tokenData.role === 'admin' ? '管理員' : '成員',
      })
      setPageState('valid')
    } catch {
      setInvalidMessage('驗證時發生錯誤，請稍後再試。')
      setPageState('invalid')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const newErrors: Record<string, string> = {}
    if (!name.trim()) newErrors.name = '請輸入你的姓名'
    if (!passwordValid) newErrors.password = '密碼需符合所有要求'
    if (password !== confirmPassword) newErrors.confirmPassword = '兩次密碼不一致'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-invitation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, email: info?.email, name: name.trim(), password }),
        }
      )

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || '加入失敗，請稍後再試')
      }

      // 自動登入
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: info!.email,
        password,
      })

      setPageState('success')

      if (!signInError) {
        setTimeout(() => navigate('/admin/bookings'), 1500)
      } else {
        setTimeout(() => navigate('/login'), 1500)
      }
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Loading ──
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Invalid ──
  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" strokeWidth={1.5} />
          <h2 className="text-base font-semibold text-slate-900 mb-2">連結無法使用</h2>
          <p className="text-sm text-slate-500 mb-6">{invalidMessage}</p>
          <Button variant="secondary" className="w-full" onClick={() => navigate('/login')}>
            前往登入
          </Button>
        </div>
      </div>
    )
  }

  // ── Success ──
  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" strokeWidth={1.5} />
          <h2 className="text-base font-semibold text-slate-900 mb-1">加入成功！</h2>
          <p className="text-sm text-slate-500">正在進入系統…</p>
        </div>
      </div>
    )
  }

  // ── Valid：填寫表單 ──
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-slate-100">
          <p className="text-xs font-medium text-violet-600 uppercase tracking-widest mb-1">
            你受到邀請
          </p>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            加入 {info?.storeName}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            身份：{info?.role}．設定密碼後即可開始使用
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">
          {/* Email 唯讀 */}
          <FormField label="受邀 Email">
            <Input
              type="email"
              value={info?.email || ''}
              disabled
              suffix={<CheckCircle2 className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />}
            />
          </FormField>

          {/* 姓名 */}
          <FormField label="你的姓名" required error={errors.name}>
            <Input
              type="text"
              placeholder="請輸入姓名"
              value={name}
              error={!!errors.name}
              onChange={(e) => {
                setName(e.target.value)
                setErrors((prev) => ({ ...prev, name: '' }))
              }}
              disabled={isSubmitting}
            />
          </FormField>

          {/* 密碼 */}
          <FormField label="設定密碼" required error={errors.password}>
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="至少 8 個字元，含大寫、小寫與數字"
              value={password}
              error={!!errors.password}
              onChange={(e) => {
                setPassword(e.target.value)
                setErrors((prev) => ({ ...prev, password: '' }))
              }}
              disabled={isSubmitting}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-slate-400 hover:text-slate-600 pointer-events-auto"
                >
                  {showPassword
                    ? <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                    : <Eye className="w-4 h-4" strokeWidth={1.5} />}
                </button>
              }
            />
            {/* 密碼要求 checklist */}
            {password && (
              <div className="mt-2 grid grid-cols-2 gap-1">
                {[
                  { ok: passwordReqs.minLength, label: '至少 8 字元' },
                  { ok: passwordReqs.hasUppercase, label: '含大寫字母' },
                  { ok: passwordReqs.hasLowercase, label: '含小寫字母' },
                  { ok: passwordReqs.hasNumber, label: '含數字' },
                ].map(({ ok, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    <span className={`text-xs ${ok ? 'text-slate-600' : 'text-slate-400'}`}>{label}</span>
                  </div>
                ))}
              </div>
            )}
          </FormField>

          {/* 確認密碼 */}
          <FormField label="確認密碼" required error={errors.confirmPassword}>
            <Input
              type={showConfirm ? 'text' : 'password'}
              placeholder="再次輸入密碼"
              value={confirmPassword}
              error={!!errors.confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                setErrors((prev) => ({ ...prev, confirmPassword: '' }))
              }}
              disabled={isSubmitting}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="text-slate-400 hover:text-slate-600 pointer-events-auto"
                >
                  {showConfirm
                    ? <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                    : <Eye className="w-4 h-4" strokeWidth={1.5} />}
                </button>
              }
            />
          </FormField>

          <div className="pt-2">
            <Button type="submit" className="w-full" loading={isSubmitting}>
              完成並加入
            </Button>
          </div>
        </form>

        <div className="px-8 pb-6 text-center">
          <p className="text-xs text-slate-400">
            已有帳號？{' '}
            <button
              onClick={() => navigate('/login')}
              className="text-violet-600 hover:text-violet-700 font-medium"
            >
              前往登入
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
