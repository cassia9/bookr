import { useState, useEffect } from 'react'
import { Settings, Clock, Save, CheckCircle, Users, UserPlus, Mail, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'

import { useAuth } from '@/lib/auth'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import FormField from '@/components/ui/FormField'
import Modal from '@/components/ui/Modal'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import { toast } from '@/components/ui/Snackbar'

const STORE_ID = '00000000-0000-0000-0000-000000000001'

// ── 型別 ────────────────────────────────────────────────────────────────────

type Tab = 'basic' | 'members'

interface Member {
  id: string
  email: string
  full_name: string
  role: 'member' | 'admin'
  created_at: string
}

// ── 工具函式 ─────────────────────────────────────────────────────────────────

function hourOptions(start = 0, end = 23) {
  return Array.from({ length: end - start + 1 }, (_, i) => {
    const h = start + i
    return { value: String(h), label: `${String(h).padStart(2, '0')}:00` }
  })
}

function timeAgo(dateString: string) {
  const date = new Date(dateString)
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMs / 3600000)
  const days = Math.floor(diffMs / 86400000)
  if (mins < 1) return '剛剛'
  if (mins < 60) return `${mins}分鐘前`
  if (hours < 24) return `${hours}小時前`
  if (days < 30) return `${days}天前`
  return date.toLocaleDateString('zh-TW')
}

// ── 側欄標籤 ─────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'basic',   label: '基本設定', icon: Settings },
  { id: 'members', label: '成員管理', icon: Users },
]

// ── 基本設定 Tab ─────────────────────────────────────────────────────────────

function BasicSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openHour, setOpenHour] = useState(9)
  const [closeHour, setCloseHour] = useState(21)
  const [bufferMinutes, setBufferMinutes] = useState(30)
  const [storeName, setStoreName] = useState('')

  useEffect(() => {
    supabase
      .from('stores')
      .select('name, open_time, close_time, default_buffer_minutes')
      .eq('id', STORE_ID)
      .single()
      .then(({ data }) => {
        if (data) {
          setStoreName(data.name ?? '')
          setOpenHour(parseInt(data.open_time ?? '09:00', 10))
          setCloseHour(parseInt(data.close_time ?? '21:00', 10))
          setBufferMinutes(data.default_buffer_minutes ?? 30)
        }
        setLoading(false)
      })
  }, [])

  async function handleSave() {
    if (openHour >= closeHour) {
      toast.error('設定錯誤', '開始時間必須早於結束時間')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('stores')
      .update({
        name: storeName.trim() || undefined,
        open_time: `${String(openHour).padStart(2, '0')}:00:00`,
        close_time: `${String(closeHour).padStart(2, '0')}:00:00`,
        default_buffer_minutes: bufferMinutes,
      })
      .eq('id', STORE_ID)
    setSaving(false)
    if (error) toast.error('儲存失敗', error.message)
    else toast.success('設定已儲存', '行事曆和甘特圖將在下次開啟時套用')
  }

  if (loading) return (
    <div className="flex justify-center items-center h-40">
      <Spinner size="md" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">基本設定</h2>
        <p className="text-sm text-slate-500 mt-0.5">設定適用於行事曆、甘特圖，以及線上預約的可預約時間範圍</p>
      </div>

      {/* 店家資料 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">店家資料</h3>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">店家名稱</label>
          <Input
            type="text"
            value={storeName}
            onChange={e => setStoreName(e.target.value)}
            placeholder="輸入店家名稱"
          />
        </div>
      </section>

      {/* 營業時間 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">營業時間</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">行事曆與甘特圖的顯示時間範圍，同時限制線上預約的可選時段</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">開始時間</label>
            <Select
              value={String(openHour)}
              onChange={v => setOpenHour(Number(v))}
              options={hourOptions(6, 14)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">結束時間</label>
            <Select
              value={String(closeHour)}
              onChange={v => setCloseHour(Number(v))}
              options={hourOptions(15, 24)}
            />
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-slate-600">
          <CheckCircle size={14} className="text-emerald-500 shrink-0" />
          可預約時段：{String(openHour).padStart(2, '0')}:00 – {String(closeHour).padStart(2, '0')}:00
          <span className="text-slate-400 ml-1">（共 {closeHour - openHour} 小時）</span>
        </div>
      </section>

      {/* 緩衝時間 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">預設緩衝時間</h3>
          <p className="text-xs text-slate-400 mt-1">每筆預約結束後自動預留的準備時間（可在新增預約時個別調整）</p>
        </div>
        <div className="flex items-center gap-3">
          {[0, 15, 30, 45, 60].map(min => (
            <button
              key={min}
              onClick={() => setBufferMinutes(min)}
              className={[
                'flex-1 py-2 rounded-xl text-sm font-medium border transition-all',
                bufferMinutes === min
                  ? 'bg-black text-white border-black shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300',
              ].join(' ')}
            >
              {min === 0 ? '無' : `${min}分`}
            </button>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <Button variant="primary" loading={saving} onClick={handleSave}>
          <Save size={15} />
          儲存設定
        </Button>
      </div>
    </div>
  )
}

// ── 成員管理 Tab ─────────────────────────────────────────────────────────────

function MembersSettings() {
  const { session, profile } = useAuth()

  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // 邀請 Modal 狀態
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member')
  const [inviteEmailError, setInviteEmailError] = useState('')
  const [inviteSending, setInviteSending] = useState(false)

  function validateEmail(email: string) {
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)
  }

  function openInvite() {
    setInviteEmail('')
    setInviteRole('member')
    setInviteEmailError('')
    setInviteOpen(true)
  }

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail) { setInviteEmailError('請輸入 Email'); return }
    if (!validateEmail(inviteEmail)) { setInviteEmailError('請輸入有效的 Email 格式'); return }
    if (!session) return

    setInviteSending(true)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: inviteEmail, role: inviteRole, storeName: profile?.full_name || '預約系統' }),
        }
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      toast.success('邀請已發送', `邀請信已寄到 ${inviteEmail}`)
      setInviteOpen(false)
    } catch (err: any) {
      toast.error('發送失敗', err.message)
    } finally {
      setInviteSending(false)
    }
  }

  useEffect(() => { loadMembers() }, [])

  async function loadMembers() {
    setLoading(true)
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, created_at')
      .order('created_at', { ascending: false })
    if (error) toast.error('載入失敗', error.message)
    else setMembers(data || [])
    setLoading(false)
  }

  async function handleEditRole(newRole: 'member' | 'admin') {
    if (!editingMember || !session) return
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/member-management?id=${editingMember.id}`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingMember.id, role: newRole }),
      }
    )
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error('更新失敗', d.error ?? `HTTP ${res.status}`)
      return
    }
    setMembers(members.map(m => m.id === editingMember.id ? { ...m, role: newRole } : m))
    toast.success('角色已更新')
    setEditingMember(null)
  }

  async function handleDelete() {
    if (!deletingId || !session) return
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/member-management?id=${deletingId}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      }
    )
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error('刪除失敗', d.error ?? `HTTP ${res.status}`)
      return
    }
    setMembers(members.filter(m => m.id !== deletingId))
    toast.success('成員已移除')
    setDeletingId(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">成員管理</h2>
          <p className="text-sm text-slate-500 mt-0.5">管理能夠存取此管理後台的帳號與角色權限</p>
        </div>
        <Button variant="primary" size="sm" onClick={openInvite}>
          <UserPlus size={15} />
          邀請成員
        </Button>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <Spinner size="md" />
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
            <Users size={32} className="text-slate-300" />
            <p className="text-sm">尚無成員，點右上角邀請第一位成員</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">成員</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">角色</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">加入時間</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map(member => (
                <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-slate-500">
                          {(member.full_name || member.email)?.[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{member.full_name || '—'}</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <Mail size={11} />
                          {member.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={member.role === 'admin' ? 'indigo' : 'slate'}>
                      {member.role === 'admin' ? '管理員' : '一般成員'}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-400">
                    {timeAgo(member.created_at)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditingMember(member)}>編輯</Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeletingId(member.id)}>
                        <span className="text-red-500">刪除</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 編輯角色 Modal */}
      <Modal open={!!editingMember} onClose={() => setEditingMember(null)} title="編輯成員角色">
        {editingMember && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">{editingMember.email}</p>
            <div className="space-y-2">
              {(['member', 'admin'] as const).map(role => (
                <label
                  key={role}
                  className="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    checked={editingMember.role === role}
                    onChange={() => setEditingMember({ ...editingMember, role })}
                    className="accent-black"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    {role === 'admin' ? '管理員' : '一般成員'}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setEditingMember(null)}>取消</Button>
              <Button variant="primary" className="flex-1" onClick={() => handleEditRole(editingMember.role)}>儲存</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 刪除確認 */}
      <ConfirmModal
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="確認移除成員"
        description="你確定要移除此成員的存取權限？此操作無法撤銷。"
        confirmLabel="確認移除"
      />

      {/* 邀請新成員 Modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="邀請新成員">
        <form onSubmit={handleInviteSubmit} className="space-y-5">
          <p className="text-sm text-slate-500">邀請信將寄到對方信箱，對方點擊連結後即可設定密碼加入。</p>

          <FormField label="Email 地址" required hint="用於發送邀請郵件" error={inviteEmailError}>
            <Input
              type="email"
              placeholder="john@example.com"
              value={inviteEmail}
              onChange={e => { setInviteEmail(e.target.value); setInviteEmailError('') }}
              onBlur={() => { if (inviteEmail && !validateEmail(inviteEmail)) setInviteEmailError('請輸入有效的 Email 格式') }}
              error={!!inviteEmailError}
              disabled={inviteSending}
            />
          </FormField>

          <FormField label="成員角色" required>
            <Select
              value={inviteRole}
              onChange={v => setInviteRole(v as 'member' | 'admin')}
              options={[
                { value: 'member', label: '一般成員 — 只能查看和操作自己的預約' },
                { value: 'admin', label: '管理員 — 擁有完整管理員權限' },
              ]}
              disabled={inviteSending}
            />
          </FormField>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setInviteOpen(false)} disabled={inviteSending}>
              取消
            </Button>
            <Button type="submit" variant="primary" className="flex-1" loading={inviteSending}>
              <Send size={14} />
              發送邀請
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ── 主頁面 ───────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('basic')

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 頁首 */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <h1 className="text-2xl font-bold text-slate-900">設定</h1>
        <p className="text-sm text-slate-500 mt-0.5">管理店家設定與成員權限</p>
      </div>

      <div className="flex gap-8 px-8 py-8 max-w-5xl">
        {/* 左側分類導航 */}
        <aside className="w-44 shrink-0">
          <nav className="space-y-0.5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={[
                  'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-colors',
                  activeTab === id
                    ? 'bg-black text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                ].join(' ')}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* 右側內容 */}
        <div className="flex-1 min-w-0">
          {activeTab === 'basic'   && <BasicSettings />}
          {activeTab === 'members' && <MembersSettings />}
        </div>
      </div>
    </div>
  )
}
