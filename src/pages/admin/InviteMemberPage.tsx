import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { toast } from '@/components/ui/Snackbar'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import FormField from '@/components/ui/FormField'

interface InviteFormState {
  email: string
  role: 'member' | 'admin'
}

export default function InviteMemberPage() {
  const navigate = useNavigate()
  const { session, profile } = useAuth()

  const [form, setForm] = useState<InviteFormState>({
    email: '',
    role: 'member',
  })

  const [errors, setErrors] = useState<{ email?: string }>({})
  const [isLoading, setIsLoading] = useState(false)

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
    return emailRegex.test(email)
  }

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target
    setForm({ ...form, email: value })

    // 清除错误
    if (errors.email) {
      setErrors({})
    }
  }

  const handleEmailBlur = () => {
    if (form.email && !validateEmail(form.email)) {
      setErrors({ email: 'Please enter a valid email address' })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 验证
    if (!form.email) {
      setErrors({ email: 'Email is required' })
      return
    }

    if (!validateEmail(form.email)) {
      setErrors({ email: 'Please enter a valid email address' })
      return
    }

    if (!session) {
      toast.error('Session expired, please login again')
      navigate('/login')
      return
    }

    setIsLoading(true)

    try {
      // 调用 invite-member Edge Function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: form.email,
            role: form.role,
            storeName: profile?.full_name || '預約系統',
          }),
        }
      )

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}: Failed to send invitation`
        try {
          const data = await response.json()
          errorMsg = data.error || errorMsg
        } catch {
          // response.json() 失敗，使用預設錯誤訊息
        }
        throw new Error(errorMsg)
      }

      // 成功
      toast.success(`Invitation sent to ${form.email}`)

      // 重置表单
      setForm({ email: '', role: 'member' })
      setErrors({})
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to send invitation'
      toast.error(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-width-md mx-auto">
        <Card className="p-8">
          <h1 className="text-2xl font-bold mb-2">邀請新成員</h1>
          <p className="text-gray-600 mb-6">
            邀請團隊成員加入此店家，開始協作管理預約
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email 輸入 */}
            <FormField label="Email 地址" required hint="用於發送邀請郵件" error={errors.email}>
              <Input
                type="email"
                placeholder="john@example.com"
                value={form.email}
                onChange={handleEmailChange}
                onBlur={handleEmailBlur}
                error={!!errors.email}
                disabled={isLoading}
              />
            </FormField>

            {/* 角色選擇 */}
            <FormField label="成員角色" required>
              <Select
                value={form.role}
                onChange={(v) => {
                  setForm(prev => ({ ...prev, role: v as 'member' | 'admin' }))
                }}
                options={[
                  { value: 'member', label: '一般成員 — 只能查看和操作自己的預約' },
                  { value: 'admin', label: '管理員 — 擁有完整管理員權限' },
                ]}
                disabled={isLoading}
              />
            </FormField>

            {/* 提交按鈕 */}
            <Button
              type="submit"
              className="w-full py-2.5"
              disabled={isLoading}
            >
              {isLoading ? '發送中...' : '發送邀請'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
