import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Tags } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import IconButton from '@/components/ui/IconButton'
import Toggle from '@/components/ui/Toggle'
import Alert from '@/components/ui/Alert'
import { saveServiceCategories, type ServiceCategory } from '@/lib/services-api'
import { toast } from '@/components/ui/Snackbar'

interface Props {
  open: boolean
  storeId: string
  categories: ServiceCategory[]
  onClose: () => void
  onSaved: () => void
}

interface CategoryDraft {
  id: string
  name: string
  active: boolean
}

export default function ServiceCategoriesModal({
  open,
  storeId,
  categories,
  onClose,
  onSaved,
}: Props) {
  const [drafts, setDrafts] = useState<CategoryDraft[]>(() => categories.map(category => ({
    id: category.id,
    name: category.name,
    active: category.active,
  })))
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function hasDuplicateName(items: CategoryDraft[]) {
    const names = items.map(item => item.name.trim().toLocaleLowerCase('zh-TW'))
    return names.some((name, index) => !name || names.indexOf(name) !== index)
  }

  function addCategory() {
    const name = newName.trim()
    if (!name) {
      setError('請先輸入類別名稱')
      return
    }
    const next = [...drafts, { id: crypto.randomUUID(), name, active: true }]
    if (hasDuplicateName(next)) {
      setError('類別名稱不可重複')
      return
    }
    setDrafts(next)
    setNewName('')
    setError('')
  }

  function moveCategory(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= drafts.length) return
    setDrafts(current => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  async function handleSave() {
    if (hasDuplicateName(drafts)) {
      setError('類別名稱不能留白或重複')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveServiceCategories(
        storeId,
        drafts.map((category, index) => ({
          ...category,
          sort_order: (index + 1) * 10,
        })),
      )
      toast.success('課程類別已儲存')
      onSaved()
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '類別儲存失敗，請稍後再試')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="管理課程類別"
      size="md"
      footer={(
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button className="flex-1" onClick={handleSave} loading={saving}>
            儲存類別
          </Button>
        </div>
      )}
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
            <Tags size={16} />
            客戶會依此順序看到課程分類
          </div>
          <p className="mt-1 text-xs leading-5 text-indigo-700/80">
            停用類別不會刪除課程，相關課程會回到「其他服務」。
          </p>
        </div>

        {error && <Alert variant="error" onClose={() => setError('')}>{error}</Alert>}

        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={event => setNewName(event.target.value.slice(0, 80))}
            onKeyDown={event => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              addCategory()
            }}
            placeholder="例：基礎修復、進階課程"
            maxLength={80}
            disabled={saving}
          />
          <Button variant="secondary" onClick={addCategory} disabled={saving || !newName.trim()}>
            <Plus size={15} /> 新增
          </Button>
        </div>

        {drafts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center">
            <p className="text-sm font-medium text-slate-500">尚未建立課程類別</p>
            <p className="mt-1 text-xs text-slate-400">未分類課程仍會顯示在「其他服務」。</p>
          </div>
        ) : (
          <div className="space-y-2">
            {drafts.map((category, index) => (
              <div
                key={category.id}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2.5"
              >
                <div className="flex shrink-0 flex-col">
                  <IconButton
                    icon={ArrowUp}
                    label="向上移動"
                    size="sm"
                    disabled={saving || index === 0}
                    onClick={() => moveCategory(index, -1)}
                  />
                  <IconButton
                    icon={ArrowDown}
                    label="向下移動"
                    size="sm"
                    disabled={saving || index === drafts.length - 1}
                    onClick={() => moveCategory(index, 1)}
                  />
                </div>
                <Input
                  value={category.name}
                  onChange={event => setDrafts(current => current.map(item => (
                    item.id === category.id ? { ...item, name: event.target.value.slice(0, 80) } : item
                  )))}
                  maxLength={80}
                  disabled={saving}
                  aria-label={`類別名稱：${category.name}`}
                />
                <div className="shrink-0 px-1 text-center">
                  <Toggle
                    checked={category.active}
                    onChange={active => setDrafts(current => current.map(item => (
                      item.id === category.id ? { ...item, active } : item
                    )))}
                    disabled={saving}
                    ariaLabel={`${category.name}上架狀態`}
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    {category.active ? '顯示' : '停用'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
