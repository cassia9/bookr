import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import { toast } from '@/components/ui/Snackbar'
import ConfirmModal from '@/components/ui/ConfirmModal'

interface Member {
  id: string
  email: string
  full_name: string
  role: 'member' | 'admin'
  created_at: string
}

type EditingMember = Member | null
type DeletingMemberId = string | null

export default function MembersPage() {
  const navigate = useNavigate()
  const { session } = useAuth()

  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingMember, setEditingMember] = useState<EditingMember>(null)
  const [deletingMemberId, setDeletingMemberId] = useState<DeletingMemberId>(null)

  // 獲取成員列表
  useEffect(() => {
    loadMembers()
  }, [])

  const loadMembers = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, full_name, role, created_at')
        .order('created_at', { ascending: false })

      if (error) throw error
      setMembers(data || [])
    } catch (error: any) {
      showToast(error.message || 'Failed to load members', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditRole = async (newRole: 'member' | 'admin') => {
    if (!editingMember || !session) return

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/member-management?id=${editingMember.id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: editingMember.id,
            role: newRole,
          }),
        }
      )

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}: Failed to update member`
        try {
          const data = await response.json()
          errorMsg = data.error || errorMsg
        } catch {
          // response.json() 失敗，使用預設錯誤訊息
        }
        throw new Error(errorMsg)
      }

      // 更新本地狀態
      setMembers(members.map(m =>
        m.id === editingMember.id ? { ...m, role: newRole } : m
      ))

      showToast('Member role updated', 'success')
      setEditingMember(null)
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to update member role'
      showToast(errorMsg, 'error')
    }
  }

  const handleDeleteMember = async () => {
    if (!deletingMemberId || !session) return

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/member-management?id=${deletingMemberId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}: Failed to delete member`
        try {
          const data = await response.json()
          errorMsg = data.error || errorMsg
        } catch {
          // response.json() 失敗，使用預設錯誤訊息
        }
        throw new Error(errorMsg)
      }

      // 從列表移除
      setMembers(members.filter(m => m.id !== deletingMemberId))

      showToast('Member deleted', 'success')
      setDeletingMemberId(null)
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to delete member'
      showToast(errorMsg, 'error')
    }
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    if (type === 'success') {
      toast.success(message)
    } else {
      toast.error(message)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '剛剛'
    if (diffMins < 60) return `${diffMins}分鐘前`
    if (diffHours < 24) return `${diffHours}小時前`
    if (diffDays < 30) return `${diffDays}天前`
    return date.toLocaleDateString('zh-TW')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* 標題 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">成員列表</h1>
          <Button
            onClick={() => navigate('/admin/invite-member')}
            className="flex items-center gap-2"
          >
            + 邀請新成員
          </Button>
        </div>

        {/* 成員表格 */}
        <Card className="overflow-hidden">
          {isLoading ? (
            // 骨架屏
            <div className="p-6 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="flex-1 h-12 bg-gray-200 rounded"></div>
                  <div className="flex-1 h-12 bg-gray-200 rounded"></div>
                  <div className="flex-1 h-12 bg-gray-200 rounded"></div>
                  <div className="w-24 h-12 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : members.length === 0 ? (
            // 空狀態
            <div className="p-12 text-center">
              <p className="text-gray-500 mb-4">暫無成員</p>
              <p className="text-gray-400 text-sm">
                邀請團隊成員加入此店家，開始協作管理預約
              </p>
            </div>
          ) : (
            // 表格
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                      名字
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                      角色
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                      加入日期
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {members.map(member => (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {member.email}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {member.full_name || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          member.role === 'admin'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {member.role === 'admin' ? '管理員' : '一般成員'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(member.created_at)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => setEditingMember(member)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium mr-4"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => setDeletingMemberId(member.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* 編輯角色 Modal */}
      <Modal
        open={!!editingMember}
        onClose={() => setEditingMember(null)}
        title="編輯成員角色"
      >
        {editingMember && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">{editingMember.email}</p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="radio"
                  name="role"
                  value="member"
                  checked={editingMember.role === 'member'}
                  onChange={() => setEditingMember({ ...editingMember, role: 'member' })}
                  className="accent-black"
                />
                <span className="text-sm font-medium text-slate-700">一般成員</span>
              </label>
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="radio"
                  name="role"
                  value="admin"
                  checked={editingMember.role === 'admin'}
                  onChange={() => setEditingMember({ ...editingMember, role: 'admin' })}
                  className="accent-black"
                />
                <span className="text-sm font-medium text-slate-700">管理員</span>
              </label>
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
        open={!!deletingMemberId}
        onClose={() => setDeletingMemberId(null)}
        onConfirm={handleDeleteMember}
        title="確認刪除成員"
        description="你確定要刪除此成員？此操作無法撤銷。"
        confirmLabel="確認刪除"
      />

    </div>
  )
}
