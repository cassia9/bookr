import { useState } from 'react'
import { CheckCircle, Copy, ExternalLink, Link2, ShieldCheck } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'

interface LineChannelCardProps {
  liffId: string
  channelId: string
  bookingUrl: string
  onLiffIdChange: (value: string) => void
  onChannelIdChange: (value: string) => void
}

type CopyTarget = 'endpoint' | 'liff' | null

const liffIdPattern = /^[0-9]+-[A-Za-z0-9_-]+$/
const channelIdPattern = /^[0-9]{5,32}$/

export default function LineChannelCard({
  liffId,
  channelId,
  bookingUrl,
  onLiffIdChange,
  onChannelIdChange,
}: LineChannelCardProps) {
  const [copied, setCopied] = useState<CopyTarget>(null)
  const normalizedLiffId = liffId.trim()
  const normalizedChannelId = channelId.trim()
  const hasAnySetting = Boolean(normalizedLiffId || normalizedChannelId)
  const isConfigured = liffIdPattern.test(normalizedLiffId)
    && channelIdPattern.test(normalizedChannelId)
  const lineBookingUrl = normalizedLiffId
    ? `https://liff.line.me/${normalizedLiffId}`
    : ''

  async function copy(value: string, target: Exclude<CopyTarget, null>) {
    await navigator.clipboard.writeText(value)
    setCopied(target)
    window.setTimeout(() => setCopied(null), 2000)
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-[#06C755]/10 via-white to-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#06C755] shadow-lg shadow-green-200/60">
            <span className="text-sm font-black leading-none text-white">LINE</span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">LINE 預約入口</h3>
              <Badge variant={isConfigured ? 'green' : hasAnySetting ? 'amber' : 'slate'}>
                {isConfigured ? '待實機驗證' : hasAnySetting ? '設定未完整' : '尚未設定'}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">客人從 LINE 開啟時帶入已驗證身分，一般網址仍可獨立預約</p>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!isConfigured}
          onClick={() => window.open(lineBookingUrl, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink size={13} />
          開啟測試
        </Button>
      </div>

      <div className="space-y-6 p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <FormField
            label="LIFF ID"
            hint="例：1234567890-AbCdEfGh"
          >
            <Input
              type="text"
              value={liffId}
              onChange={event => onLiffIdChange(event.target.value)}
              placeholder="1234567890-xxxxxxxx"
              autoComplete="off"
            />
          </FormField>

          <FormField
            label="LINE Login Channel ID"
            hint="公開識別值，不是 Channel Secret"
          >
            <Input
              type="text"
              inputMode="numeric"
              value={channelId}
              onChange={event => onChannelIdChange(event.target.value)}
              placeholder="輸入純數字 Channel ID"
              autoComplete="off"
            />
          </FormField>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <UrlRow
            icon={<Link2 size={14} />}
            label="LINE Developers Endpoint URL"
            value={bookingUrl}
            copied={copied === 'endpoint'}
            onCopy={() => copy(bookingUrl, 'endpoint')}
          />
          <UrlRow
            icon={<ShieldCheck size={14} />}
            label="Rich Menu／客戶 LINE 預約網址"
            value={lineBookingUrl}
            copied={copied === 'liff'}
            disabled={!lineBookingUrl}
            onCopy={() => copy(lineBookingUrl, 'liff')}
          />
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
          <p className="text-xs font-semibold text-slate-700">上線前檢查</p>
          <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
            <ChecklistItem done={Boolean(normalizedLiffId)}>已填入 LIFF ID</ChecklistItem>
            <ChecklistItem done={Boolean(normalizedChannelId)}>已填入 Login Channel ID</ChecklistItem>
            <ChecklistItem>Login 與 Messaging API 位於同一 Provider</ChecklistItem>
            <ChecklistItem>LIFF scopes 已啟用 openid、profile</ChecklistItem>
          </div>
        </div>

        <p className="text-xs leading-5 text-slate-400">
          Channel Secret 與 Access Token 不會儲存在此頁。第一階段只使用 LIFF ID 與公開 Channel ID，正式 LINE 身分會由後端向 LINE 驗證。
        </p>
      </div>
    </section>
  )
}

function UrlRow({ icon, label, value, copied, disabled = false, onCopy }: {
  icon: React.ReactNode
  label: string
  value: string
  copied: boolean
  disabled?: boolean
  onCopy: () => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-xs text-slate-700">
          {value || '完成設定後產生'}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={onCopy}
          className="shrink-0 px-2"
          aria-label={`複製${label}`}
        >
          {copied ? <CheckCircle size={13} className="text-green-600" /> : <Copy size={13} />}
          {copied ? '已複製' : '複製'}
        </Button>
      </div>
    </div>
  )
}

function ChecklistItem({ done, children }: { done?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle
        size={14}
        className={done ? 'mt-0.5 shrink-0 text-green-600' : 'mt-0.5 shrink-0 text-slate-300'}
      />
      <span>{children}</span>
    </div>
  )
}
