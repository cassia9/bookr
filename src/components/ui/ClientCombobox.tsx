/**
 * ClientCombobox — 客戶選取 + 即時新增 合一元件
 *
 * 行為：
 * 1. 輸入姓名或電話 → 即時過濾既有客戶清單
 * 2. 找到 → 點選即選定，顯示 Chip
 * 3. 沒找到（或主動點） → 清單底部「＋ 建立新客戶『X』」
 * 4. 點「建立」→ 展開 inline 電話輸入，確認後呼叫 onCreateClient
 * 5. 已選定 → 顯示帶 × 的 Chip，點 × 清除可重新選
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Check, X, UserPlus, Search } from 'lucide-react'
import { cn } from '../../lib/cn'
import { shadow } from '../../lib/styles'
import Button from './Button'
import type { Client } from '../../types/database'

type Gender = 'male' | 'female' | 'unknown'

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'unknown', label: '未知' },
  { value: 'male',    label: '男' },
  { value: 'female',  label: '女' },
]

interface Props {
  clients: Client[]
  value: string                // selected client_id
  onChange: (clientId: string) => void
  /** 呼叫時插入 DB，回傳新客戶的 id（失敗回傳 null） */
  onCreateClient: (name: string, phone: string, gender: Gender) => Promise<string | null>
  error?: boolean
  disabled?: boolean
  /** 鎖定模式：顯示客戶但無法更改（編輯預約 / 從客戶頁帶入） */
  locked?: boolean
}

const MAX_RESULTS = 8

export default function ClientCombobox({
  clients, value, onChange, onCreateClient,
  error, disabled, locked,
}: Props) {
  const [query,     setQuery]     = useState('')
  const [open,      setOpen]      = useState(false)
  const [creating,   setCreating]   = useState(false)
  const [newPhone,   setNewPhone]   = useState('')
  const [newGender,  setNewGender]  = useState<Gender>('unknown')
  const [saving,     setSaving]     = useState(false)
  const [highlight, setHighlight] = useState(-1)      // 鍵盤高亮 index

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const phoneRef     = useRef<HTMLInputElement>(null)

  const selectedClient = value ? clients.find(c => c.id === value) : null

  // 過濾客戶（name 或 phone 包含 query）
  const filtered = query.trim()
    ? clients
        .filter(c =>
          c.full_name.toLowerCase().includes(query.toLowerCase()) ||
          (c.phone ?? '').includes(query)
        )
        .slice(0, MAX_RESULTS)
    : clients.slice(0, MAX_RESULTS)

  // 是否顯示「建立新客戶」選項：有 query 且 query 不是完全匹配某位客戶
  const showCreate = query.trim().length > 0 &&
    !clients.some(c => c.full_name === query.trim())

  // 總選項數（用於鍵盤 highlight）
  const totalOptions = filtered.length + (showCreate ? 1 : 0)

  // Click outside → close
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  // focus phone input when creating mode opens
  useEffect(() => {
    if (creating) phoneRef.current?.focus()
  }, [creating])

  function openDropdown() {
    if (disabled || locked) return
    setOpen(true)
    setHighlight(-1)
  }

  function closeDropdown() {
    setOpen(false)
    setCreating(false)
    setNewPhone('')
    setNewGender('unknown')
    setHighlight(-1)
    if (!selectedClient) setQuery('')
  }

  function selectClient(client: Client) {
    onChange(client.id)
    setQuery('')
    setOpen(false)
    setCreating(false)
    setHighlight(-1)
  }

  function clearSelection() {
    onChange('')
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function startCreating() {
    setCreating(true)
    setHighlight(-1)
  }

  async function handleCreate() {
    if (!query.trim() || saving) return
    setSaving(true)
    const id = await onCreateClient(query.trim(), newPhone.trim(), newGender)
    setSaving(false)
    if (id) {
      onChange(id)
      setQuery('')
      setOpen(false)
      setCreating(false)
      setNewPhone('')
      setNewGender('unknown')
    }
  }

  // 鍵盤導航
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') openDropdown()
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlight(h => Math.min(h + 1, totalOptions - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlight(h => Math.max(h - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (creating) { handleCreate(); return }
        if (highlight >= 0 && highlight < filtered.length) {
          selectClient(filtered[highlight])
        } else if (highlight === filtered.length && showCreate) {
          startCreating()
        }
        break
      case 'Escape':
        closeDropdown()
        break
    }
  }, [open, highlight, filtered, showCreate, creating, query])

  // ── Locked / selected chip ──────────────────────────────────────
  if (locked && selectedClient) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-indigo-50 rounded-2xl border border-indigo-100">
        <div className="w-7 h-7 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
          {selectedClient.full_name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{selectedClient.full_name}</p>
          {selectedClient.phone && <p className="text-xs text-slate-500">{selectedClient.phone}</p>}
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">

      {/* ── Selected chip ── */}
      {selectedClient ? (
        <div className={cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-2xl border transition-colors',
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-50 border-slate-200' : 'bg-white border-indigo-200 ring-1 ring-indigo-100',
        )}>
          <div
            className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0"
          >
            {selectedClient.full_name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 leading-tight">{selectedClient.full_name}</p>
            {selectedClient.phone && <p className="text-xs text-slate-400 leading-tight">{selectedClient.phone}</p>}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={clearSelection}
              className="p-1 text-slate-300 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0"
              aria-label="清除選取"
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      ) : (
        /* ── Search input ── */
        <div className={cn(
          'flex items-center gap-2 px-3 py-2.5 rounded-2xl border text-sm transition-all',
          'bg-slate-50 hover:bg-white',
          open
            ? 'border-indigo-400 ring-2 ring-indigo-100 bg-white'
            : error
            ? 'border-red-400 ring-2 ring-red-100'
            : 'border-slate-200',
          disabled && 'opacity-50 cursor-not-allowed',
        )}>
          <Search size={14} strokeWidth={1.5} className="text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setCreating(false); openDropdown() }}
            onFocus={openDropdown}
            onKeyDown={handleKeyDown}
            placeholder="搜尋姓名或電話…"
            disabled={disabled}
            className="flex-1 bg-transparent outline-none text-slate-800 placeholder:text-slate-400 min-w-0"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(''); setCreating(false) }}
              className="text-slate-300 hover:text-slate-500 transition-colors flex-shrink-0">
              <X size={13} strokeWidth={2} />
            </button>
          )}
        </div>
      )}

      {/* ── Dropdown ── */}
      {open && !selectedClient && (
        <div className={cn(
          'absolute z-50 left-0 right-0 top-full mt-1.5',
          `bg-white rounded-2xl border border-slate-200 ${shadow.float}`,
          'overflow-hidden',
        )}>

          {/* Client list */}
          {filtered.length > 0 && (
            <div className="py-1 max-h-48 overflow-y-auto">
              {filtered.map((client, i) => (
                <button
                  key={client.id}
                  type="button"
                  onMouseDown={e => e.preventDefault()} // prevent blur before click
                  onClick={() => selectClient(client)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                    highlight === i ? 'bg-indigo-50' : 'hover:bg-slate-50',
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-semibold text-xs flex-shrink-0">
                    {client.full_name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 leading-tight">{client.full_name}</p>
                    {client.phone && <p className="text-xs text-slate-400 leading-tight">{client.phone}</p>}
                  </div>
                  {client.id === value && <Check size={14} strokeWidth={2} className="text-indigo-500 flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {/* Empty state (no query) */}
          {filtered.length === 0 && !query.trim() && (
            <div className="py-8 text-center text-sm text-slate-400">
              輸入姓名或電話開始搜尋
            </div>
          )}

          {/* No results */}
          {filtered.length === 0 && query.trim() && !showCreate && (
            <div className="py-6 text-center text-sm text-slate-400">找不到符合的客戶</div>
          )}

          {/* ── Create new client ── */}
          {showCreate && (
            <>
              {filtered.length > 0 && <div className="border-t border-slate-100 mx-3" />}

              {!creating ? (
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={startCreating}
                  onMouseEnter={() => setHighlight(filtered.length)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                    highlight === filtered.length ? 'bg-indigo-50' : 'hover:bg-slate-50',
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <UserPlus size={13} strokeWidth={2} className="text-indigo-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-indigo-700 leading-tight">
                      建立新客戶「<span className="font-semibold">{query.trim()}</span>」
                    </p>
                    <p className="text-xs text-indigo-400 leading-tight">點擊可選填電話後確認</p>
                  </div>
                </button>
              ) : (
                /* Inline phone input */
                <div
                  className="px-3 py-3 space-y-2.5"
                  onMouseDown={e => e.preventDefault()}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
                      {query.trim()[0]}
                    </div>
                    <p className="text-sm font-semibold text-slate-900 truncate">{query.trim()}</p>
                  </div>
                  <input
                    ref={phoneRef}
                    type="tel"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') closeDropdown() }}
                    placeholder="電話（選填）"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-slate-50"
                  />
                  {/* 性別快選 */}
                  <div className="flex gap-1.5">
                    {GENDER_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setNewGender(opt.value)}
                        className={cn(
                          'flex-1 py-1.5 rounded-xl text-xs font-medium border transition-colors',
                          newGender === opt.value
                            ? 'bg-indigo-500 text-white border-indigo-500'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => setCreating(false)}
                    >
                      返回
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      loading={saving}
                      onClick={handleCreate}
                    >
                      確認建立
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="h-1" />{/* bottom padding */}
        </div>
      )}
    </div>
  )
}
