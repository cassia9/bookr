import { useState } from 'react'
import {
  Building2,
  CheckCircle,
  Copy,
  ExternalLink,
  History,
  Link2,
  ShieldCheck,
  Unplug,
} from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import type { StoreChannelConnection } from '@/types/database'

interface LineChannelCardProps {
  providerId: string
  providerName: string
  officialAccountName: string
  officialAccountBasicId: string
  liffId: string
  channelId: string
  bookingUrl: string
  activeConnection: StoreChannelConnection | null
  connectionHistory: StoreChannelConnection[]
  isAdmin: boolean
  saving: boolean
  onProviderIdChange: (value: string) => void
  onProviderNameChange: (value: string) => void
  onOfficialAccountNameChange: (value: string) => void
  onOfficialAccountBasicIdChange: (value: string) => void
  onLiffIdChange: (value: string) => void
  onChannelIdChange: (value: string) => void
  onSave: () => void
  onDisconnect: () => void
}

type CopyTarget = 'endpoint' | 'liff' | null

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function LineChannelCard({
  providerId,
  providerName,
  officialAccountName,
  officialAccountBasicId,
  liffId,
  channelId,
  bookingUrl,
  activeConnection,
  connectionHistory,
  isAdmin,
  saving,
  onProviderIdChange,
  onProviderNameChange,
  onOfficialAccountNameChange,
  onOfficialAccountBasicIdChange,
  onLiffIdChange,
  onChannelIdChange,
  onSave,
  onDisconnect,
}: LineChannelCardProps) {
  const [copied, setCopied] = useState<CopyTarget>(null)
  const isConnected = Boolean(activeConnection)
  const isLegacyConnection = isConnected && !activeConnection?.provider_id
  const lineBookingUrl = isConnected && activeConnection?.liff_id
    ? `https://liff.line.me/${activeConnection.liff_id}`
    : ''
  const identifiersLocked = isConnected && !isLegacyConnection

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
              <h3 className="text-sm font-semibold text-slate-900">店家官方 LINE 串接</h3>
              <Badge variant={isConnected ? (isLegacyConnection ? 'amber' : 'green') : 'slate'}>
                {isConnected ? (isLegacyConnection ? '資料待補' : '已串接') : '未串接'}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              管理 LINE Provider、Login Channel 與官方帳號；一般預約網址不受解除串接影響
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!lineBookingUrl}
          onClick={() => window.open(lineBookingUrl, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink size={13} />
          開啟 LINE 測試
        </Button>
      </div>

      <div className="space-y-6 p-6">
        {activeConnection ? (
          <div className="grid gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <ConnectionDetail label="Provider" value={activeConnection.provider_name || '資料待補'} />
            <ConnectionDetail label="Provider ID" value={activeConnection.provider_id || '資料待補'} mono />
            <ConnectionDetail label="官方帳號" value={activeConnection.official_account_name || '資料待補'} />
            <ConnectionDetail label="LINE Login Channel" value={activeConnection.login_channel_id} mono />
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Unplug size={18} className="mt-0.5 shrink-0 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-700">目前沒有啟用中的官方 LINE</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                LINE 預約入口已停止。歷史預約、客戶資料與舊 LINE 身分紀錄仍會保留。
              </p>
            </div>
          </div>
        )}

        {!isAdmin && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-xs leading-5 text-amber-800">只有店家管理員能查看與變更官方 LINE 串接設定。</p>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Building2 size={15} className="text-slate-500" />
            <h4 className="text-sm font-semibold text-slate-700">
              {isConnected ? '目前串接資料' : connectionHistory.length > 0 ? '重新串接資料' : '建立串接'}
            </h4>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <FormField label="Provider 名稱" required hint="LINE Developers 顯示名稱" disabled={!isAdmin}>
              <Input
                value={providerName}
                onChange={event => onProviderNameChange(event.target.value)}
                placeholder="例：Bookr 測試 Provider"
                maxLength={100}
                autoComplete="off"
                disabled={!isAdmin}
              />
            </FormField>

            <FormField label="Provider ID" required hint="純數字公開識別值" disabled={!isAdmin || identifiersLocked}>
              <Input
                value={providerId}
                onChange={event => onProviderIdChange(event.target.value)}
                placeholder="輸入 Provider ID"
                inputMode="numeric"
                maxLength={32}
                autoComplete="off"
                disabled={!isAdmin || identifiersLocked}
              />
            </FormField>

            <FormField label="官方帳號名稱" required hint="供後台辨識，不是密鑰" disabled={!isAdmin}>
              <Input
                value={officialAccountName}
                onChange={event => onOfficialAccountNameChange(event.target.value)}
                placeholder="例：Bookr 官方帳號"
                maxLength={100}
                autoComplete="off"
                disabled={!isAdmin}
              />
            </FormField>

            <FormField label="官方帳號 Basic ID" hint="選填，例：@bookr" disabled={!isAdmin}>
              <Input
                value={officialAccountBasicId}
                onChange={event => onOfficialAccountBasicIdChange(event.target.value)}
                placeholder="@xxxxxxxx"
                maxLength={100}
                autoComplete="off"
                disabled={!isAdmin}
              />
            </FormField>

            <FormField label="LINE Login Channel ID" required hint="公開識別值，不是 Channel Secret" disabled={!isAdmin || isConnected}>
              <Input
                value={channelId}
                onChange={event => onChannelIdChange(event.target.value)}
                placeholder="輸入純數字 Channel ID"
                inputMode="numeric"
                maxLength={32}
                autoComplete="off"
                disabled={!isAdmin || isConnected}
              />
            </FormField>

            <FormField label="LIFF ID" required hint="例：1234567890-AbCdEfGh" disabled={!isAdmin || isConnected}>
              <Input
                value={liffId}
                onChange={event => onLiffIdChange(event.target.value)}
                placeholder="1234567890-xxxxxxxx"
                maxLength={100}
                autoComplete="off"
                disabled={!isAdmin || isConnected}
              />
            </FormField>
          </div>

          {isConnected && (
            <p className="text-xs leading-5 text-slate-400">
              若要更換 Provider、Login Channel 或 LIFF，請先解除目前串接。Provider 名稱與官方帳號資料可直接更新。
            </p>
          )}

          {isAdmin && (
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
              {isConnected && (
                <Button type="button" variant="danger" onClick={onDisconnect}>
                  <Unplug size={14} />
                  解除官方 LINE 串接
                </Button>
              )}
              <Button type="button" variant="primary" loading={saving} onClick={onSave}>
                <ShieldCheck size={14} />
                {isConnected ? (isLegacyConnection ? '補齊串接資料' : '更新串接資料') : '確認並串接'}
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <UrlRow
            icon={<Link2 size={14} />}
            label="一般網頁預約網址"
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

        {connectionHistory.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <History size={14} className="text-slate-500" />
              <p className="text-xs font-semibold text-slate-700">串接版本紀錄</p>
              <Badge variant="slate">{connectionHistory.length} 版</Badge>
            </div>
            <div className="mt-3 divide-y divide-slate-200">
              {connectionHistory.slice(0, 3).map(connection => (
                <div key={connection.id} className="flex flex-col gap-1 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge variant={connection.status === 'active' ? 'green' : 'slate'}>
                      V{connection.connection_version} · {connection.status === 'active' ? '使用中' : '已解除'}
                    </Badge>
                    <span className="truncate text-slate-600">
                      {connection.provider_name || 'Provider 資料待補'}／{connection.official_account_name || '官方帳號資料待補'}
                    </span>
                  </div>
                  <span className="shrink-0 text-slate-400">
                    {connection.status === 'active'
                      ? `串接於 ${formatDate(connection.connected_at)}`
                      : `解除於 ${formatDate(connection.disconnected_at)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs leading-5 text-slate-400">
          本頁不會儲存 Channel Secret、Access Token 或其他密鑰。解除與重新串接都會留下審計紀錄；不同 Provider 重綁時，舊 LINE 身分會安全封存。
        </p>
      </div>
    </section>
  )
}

function ConnectionDetail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700/70">{label}</p>
      <p className={`mt-1 truncate text-xs font-semibold text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
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
          {value || '完成串接後產生'}
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
