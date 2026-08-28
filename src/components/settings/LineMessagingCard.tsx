import { useState } from 'react'
import {
  BellRing,
  CheckCircle,
  Copy,
  KeyRound,
  MessageCircleMore,
  Radio,
  Send,
  ShieldCheck,
} from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Toggle from '@/components/ui/Toggle'
import Select from '@/components/ui/Select'
import type { NotificationType, StoreChannelConnection } from '@/types/database'

export type TransactionNotificationType = Extract<
  NotificationType,
  | 'booking_received'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_rescheduled'
  | 'reminder'
>

export interface LineMessagingStatus {
  connection_id: string
  provider_id: string
  messaging_channel_id: string
  bot_basic_id: string | null
  bot_display_name: string
  status: 'active' | 'disconnected' | 'error'
  verified_at: string
  webhook_path: string
}

export interface TransactionNotificationSettings {
  booking_received_enabled: boolean
  booking_confirmed_enabled: boolean
  booking_cancelled_enabled: boolean
  booking_rescheduled_enabled: boolean
  reminder_enabled: boolean
  reminder_minutes_before: number
}

export type TransactionNotificationTemplates = Record<TransactionNotificationType, string>

export interface LineTestRecipient {
  value: string
  label: string
}

interface MessagingConfigurationInput {
  messagingChannelId: string
  channelAccessToken: string
  channelSecret: string
}

interface LineMessagingCardProps {
  activeConnection: StoreChannelConnection | null
  messagingStatus: LineMessagingStatus | null
  webhookUrl: string
  isAdmin: boolean
  connecting: boolean
  savingNotifications: boolean
  sendingTest: boolean
  testRecipients: LineTestRecipient[]
  settings: TransactionNotificationSettings
  templates: TransactionNotificationTemplates
  onConnect: (configuration: MessagingConfigurationInput) => Promise<boolean>
  onSettingChange: (
    key: keyof TransactionNotificationSettings,
    value: boolean | number,
  ) => void
  onTemplateChange: (type: TransactionNotificationType, value: string) => void
  onSaveNotifications: () => void
  onSendTest: (identityId: string) => Promise<boolean>
}

const notificationRows: Array<{
  type: TransactionNotificationType
  setting: keyof TransactionNotificationSettings
  title: string
  description: string
}> = [
  {
    type: 'booking_received',
    setting: 'booking_received_enabled',
    title: '收到預約申請',
    description: '人工確認模式下，客人送出預約後先告知已收到申請',
  },
  {
    type: 'booking_confirmed',
    setting: 'booking_confirmed_enabled',
    title: '預約已確認',
    description: '自動確認，或店家手動將預約改為已確認時發送',
  },
  {
    type: 'booking_cancelled',
    setting: 'booking_cancelled_enabled',
    title: '預約已取消',
    description: '預約首次改為已取消時發送',
  },
  {
    type: 'booking_rescheduled',
    setting: 'booking_rescheduled_enabled',
    title: '預約資料異動',
    description: '預約時間、課程或老師變更時發送',
  },
  {
    type: 'reminder',
    setting: 'reminder_enabled',
    title: '預約前 24 小時提醒',
    description: '只提醒仍為已確認、且尚未取消的預約',
  },
]

const previewStyles: Record<TransactionNotificationType, {
  title: string
  status: string
  accent: string
  headerText: string
  softBackground: string
  footerText: string
  footer: string
}> = {
  booking_received: {
    title: '預約申請已收到',
    status: '等待確認',
    accent: '#D8C8A8',
    headerText: '#3F382C',
    softBackground: '#F8F3E9',
    footerText: '#796A50',
    footer: '確認完成後，我們會再傳送通知。',
  },
  booking_confirmed: {
    title: '預約已確認',
    status: '已確認',
    accent: '#8DBA45',
    headerText: '#263514',
    softBackground: '#F2F8E7',
    footerText: '#58752E',
    footer: '請依預約時間抵達，如需調整請聯絡店家。',
  },
  booking_cancelled: {
    title: '預約已取消',
    status: '已取消',
    accent: '#C2414B',
    headerText: '#FFFFFF',
    softBackground: '#FFF0F1',
    footerText: '#C2414B',
    footer: '如需重新安排，歡迎再次使用預約連結。',
  },
  booking_rescheduled: {
    title: '預約時間已更新',
    status: '已更新',
    accent: '#5B5BD6',
    headerText: '#FFFFFF',
    softBackground: '#F1F0FF',
    footerText: '#5B5BD6',
    footer: '請留意新的預約時間。',
  },
  reminder: {
    title: '預約提醒',
    status: '即將開始',
    accent: '#2563A6',
    headerText: '#FFFFFF',
    softBackground: '#EDF6FF',
    footerText: '#2563A6',
    footer: '我們期待您的到來。',
  },
}

const previewValues = {
  customer_name: '王小明',
  service_name: '進階修復課程 90 分鐘',
  practitioner_name: '陳老師',
  start_time: '2026/08/29（六）10:45',
}

function renderPreviewTemplate(template: string, storeName: string) {
  const values = { ...previewValues, store_name: storeName }
  return Object.entries(values).reduce(
    (message, [variable, value]) => message.replace(
      new RegExp(`{{\\s*${variable}\\s*}}`, 'g'),
      value,
    ),
    template.replace(/\\n/g, '\n'),
  )
}

function previewIntro(renderedText: string) {
  const detailLinePattern = /^(課程|老師|時間|原預約時間|新時間)\s*[：:]/
  return renderedText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !detailLinePattern.test(line))
    .join('\n')
}

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

export default function LineMessagingCard({
  activeConnection,
  messagingStatus,
  webhookUrl,
  isAdmin,
  connecting,
  savingNotifications,
  sendingTest,
  testRecipients,
  settings,
  templates,
  onConnect,
  onSettingChange,
  onTemplateChange,
  onSaveNotifications,
  onSendTest,
}: LineMessagingCardProps) {
  const [messagingChannelId, setMessagingChannelId] = useState('')
  const [channelAccessToken, setChannelAccessToken] = useState('')
  const [channelSecret, setChannelSecret] = useState('')
  const [copied, setCopied] = useState(false)
  const [testIdentityId, setTestIdentityId] = useState('')

  const isActive = messagingStatus?.status === 'active'
  const baseConnectionReady = Boolean(activeConnection?.provider_id)

  async function handleConnect() {
    const saved = await onConnect({
      messagingChannelId: messagingChannelId.trim(),
      channelAccessToken: channelAccessToken.trim(),
      channelSecret: channelSecret.trim(),
    })
    if (saved) {
      setMessagingChannelId('')
      setChannelAccessToken('')
      setChannelSecret('')
    }
  }

  async function copyWebhookUrl() {
    if (!webhookUrl) return
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-[#06C755]/10 via-white to-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 shadow-lg shadow-slate-300/60">
            <MessageCircleMore size={20} className="text-white" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">LINE 預約通知</h3>
              <Badge variant={isActive ? 'green' : messagingStatus?.status === 'error' ? 'amber' : 'slate'}>
                {isActive ? '推播已啟用' : messagingStatus?.status === 'error' ? '需檢查' : '尚未啟用'}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              透過 Messaging API 發送預約申請、確認、取消、異動與提醒
            </p>
          </div>
        </div>

        {isActive && (
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
            <Radio size={14} />
            背景通知服務可用
          </div>
        )}
      </div>

      <div className="space-y-6 p-6">
        {!activeConnection ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-900">請先完成上方官方 LINE 串接</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                Messaging API 必須和 LINE Login Channel 位於同一個 Provider，才能安全對應同一位客人。
              </p>
            </div>
          </div>
        ) : !activeConnection.provider_id ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <ShieldCheck size={17} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-xs leading-5 text-amber-800">
              這是舊版串接資料，請先在上方補齊 Provider ID，再設定 Messaging API。
            </p>
          </div>
        ) : null}

        {isActive && messagingStatus && (
          <div className="grid gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatusDetail label="官方帳號" value={messagingStatus.bot_display_name} />
            <StatusDetail label="Basic ID" value={messagingStatus.bot_basic_id || 'LINE 未提供'} mono />
            <StatusDetail label="Messaging Channel" value={messagingStatus.messaging_channel_id} mono />
            <StatusDetail label="最近驗證" value={formatDate(messagingStatus.verified_at)} />
          </div>
        )}

        {isAdmin && baseConnectionReady && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound size={15} className="text-slate-500" />
              <div>
                <h4 className="text-sm font-semibold text-slate-700">
                  {isActive ? '替換 Messaging API 憑證' : '啟用 Messaging API'}
                </h4>
                <p className="mt-0.5 text-xs text-slate-400">
                  Provider ID 固定沿用上方串接：{activeConnection?.provider_id}
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <FormField label="Messaging API Channel ID" required hint="純數字公開識別值">
                <Input
                  value={messagingChannelId}
                  onChange={event => setMessagingChannelId(event.target.value)}
                  placeholder={messagingStatus?.messaging_channel_id || '輸入 Channel ID'}
                  inputMode="numeric"
                  maxLength={32}
                  autoComplete="off"
                />
              </FormField>

              <div className="hidden lg:block" />

              <FormField label="Channel Access Token" required hint="只傳送至後端 Vault，不會再次顯示">
                <Input
                  type="password"
                  value={channelAccessToken}
                  onChange={event => setChannelAccessToken(event.target.value)}
                  placeholder="貼上 Messaging API Token"
                  maxLength={4096}
                  autoComplete="new-password"
                />
              </FormField>

              <FormField label="Channel Secret" required hint="用於驗證 LINE Webhook 簽章">
                <Input
                  type="password"
                  value={channelSecret}
                  onChange={event => setChannelSecret(event.target.value)}
                  placeholder="貼上 Channel Secret"
                  maxLength={255}
                  autoComplete="new-password"
                />
              </FormField>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                <p className="text-xs leading-5 text-slate-500">
                  系統會先向 LINE 驗證 Token 與官方帳號，再將 Token／Secret 加密保存；瀏覽器與資料表查詢都不會取得明文。
                </p>
              </div>
              <Button
                type="button"
                variant="primary"
                loading={connecting}
                onClick={handleConnect}
                className="shrink-0"
              >
                <ShieldCheck size={14} />
                {isActive ? '驗證並替換憑證' : '驗證並啟用推播'}
              </Button>
            </div>
          </div>
        )}

        {isActive && messagingStatus && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Radio size={13} />
              LINE Developers Webhook URL
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-xs text-slate-700">{webhookUrl}</code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copyWebhookUrl}
                className="shrink-0 px-2"
              >
                {copied ? <CheckCircle size={13} className="text-green-600" /> : <Copy size={13} />}
                {copied ? '已複製' : '複製'}
              </Button>
            </div>
          </div>
        )}

        {isActive && messagingStatus && isAdmin && (
          <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-700">發送測試推播</h4>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                只能選擇同店、已驗證且目前可接收訊息的 LINE 客戶；操作會留下審計紀錄。
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <FormField label="測試收件人" className="min-w-0 flex-1">
                <Select
                  value={testIdentityId}
                  onChange={setTestIdentityId}
                  options={testRecipients}
                  placeholder={testRecipients.length > 0 ? '選擇可接收推播的客戶' : '目前沒有可測試的 LINE 客戶'}
                  disabled={sendingTest || testRecipients.length === 0}
                />
              </FormField>
              <Button
                type="button"
                variant="primary"
                loading={sendingTest}
                disabled={!testIdentityId || testRecipients.length === 0}
                onClick={() => void onSendTest(testIdentityId)}
                className="shrink-0"
              >
                <Send size={14} />
                加入測試佇列
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-4 border-t border-slate-100 pt-6">
          <div className="flex items-start gap-2">
            <BellRing size={16} className="mt-0.5 shrink-0 text-slate-500" />
            <div>
              <h4 className="text-sm font-semibold text-slate-700">交易通知與文字範本</h4>
              <p className="mt-0.5 text-xs leading-5 text-slate-400">
                可使用 customer_name、service_name、practitioner_name、start_time、store_name 變數；系統只接受白名單變數。
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {notificationRows.map(row => {
              const checked = Boolean(settings[row.setting])
              return (
                <div key={row.type} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{row.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate-400">{row.description}</p>
                    </div>
                    <Toggle
                      checked={checked}
                      onChange={value => onSettingChange(row.setting, value)}
                      disabled={!isAdmin}
                      ariaLabel={`切換${row.title}`}
                    />
                  </div>
                  <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        訊息文字
                      </p>
                      <Textarea
                        value={templates[row.type]}
                        onChange={event => onTemplateChange(row.type, event.target.value)}
                        rows={7}
                        maxLength={4500}
                        disabled={!isAdmin || !checked}
                        aria-label={`${row.title}訊息範本`}
                        className="min-h-44 font-mono text-xs leading-6"
                      />
                    </div>
                    <LineFlexPreview
                      type={row.type}
                      template={templates[row.type]}
                      storeName={messagingStatus?.bot_display_name || '時運翡翠'}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {isAdmin && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="primary"
                loading={savingNotifications}
                onClick={onSaveNotifications}
              >
                <Send size={14} />
                儲存通知設定
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function LineFlexPreview({
  type,
  template,
  storeName,
}: {
  type: TransactionNotificationType
  template: string
  storeName: string
}) {
  const style = previewStyles[type]
  const intro = previewIntro(renderPreviewTemplate(template, storeName))
  const details = [
    ['課程', previewValues.service_name],
    ['老師', previewValues.practitioner_name],
    [type === 'booking_rescheduled' ? '新時間' : '時間', previewValues.start_time],
    ['店家', storeName],
  ]

  return (
    <div aria-live="polite" aria-label={`${style.title} LINE 卡片預覽`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          LINE 卡片預覽
        </p>
        <span className="text-[11px] text-slate-400">範例資料</span>
      </div>
      <div className="rounded-[24px] bg-[#DCE5EC] p-3 shadow-inner shadow-slate-300/50">
        <div className="overflow-hidden rounded-[18px] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
          <div className="px-5 py-4" style={{
            backgroundColor: style.accent,
            color: style.headerText,
          }}>
            <div className="flex items-center justify-between gap-3 text-[10px] font-bold tracking-wide opacity-90">
              <span>BOOKR · 預約通知</span>
              <span>{style.status}</span>
            </div>
            <p className="mt-2 text-lg font-bold leading-tight">{style.title}</p>
          </div>

          <div className="space-y-4 px-5 py-4">
            {intro && (
              <p className="whitespace-pre-line break-words text-xs leading-5 text-slate-600">
                {intro}
              </p>
            )}
            <div className="border-t border-slate-200 pt-1">
              {details.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[58px_minmax(0,1fr)] gap-2 py-1.5 text-xs">
                  <span className="text-slate-400">{label}</span>
                  <span className="break-words font-semibold text-slate-800">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 py-3 text-center text-[11px] leading-4" style={{
            backgroundColor: style.softBackground,
            color: style.footerText,
          }}>
            {style.footer}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusDetail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700/70">{label}</p>
      <p className={`mt-1 truncate text-xs font-semibold text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}
