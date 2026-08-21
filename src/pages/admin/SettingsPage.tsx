import { useState, useEffect, useCallback } from 'react'
import { Settings, Clock, Save, CheckCircle, Users, UserPlus, Mail, Send, RefreshCw, Trash2, Share2 } from 'lucide-react'
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
import Toggle from '@/components/ui/Toggle'
import { toast } from '@/components/ui/Snackbar'
import LineChannelCard from '@/components/settings/LineChannelCard'
import LineMessagingCard from '@/components/settings/LineMessagingCard'
import type {
  LineMessagingStatus,
  LineTestRecipient,
  TransactionNotificationSettings,
  TransactionNotificationTemplates,
  TransactionNotificationType,
} from '@/components/settings/LineMessagingCard'
import type { StoreChannelConnection } from '@/types/database'

const STORE_ID = '00000000-0000-0000-0000-000000000001'

// ── 型別 ────────────────────────────────────────────────────────────────────

type Tab = 'basic' | 'members' | 'channels'

interface Member {
  id: string
  email: string
  full_name: string
  role: 'member' | 'admin'
  created_at: string
}

interface PendingInvitation {
  id: string
  email: string
  role: 'member' | 'admin'
  created_at: string
  expires_at: string
}

interface InviteFunctionResponse {
  ok?: boolean
  warning?: string
  deliveryStatus?: 'sent' | 'failed'
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

async function functionErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      const body = await context.clone().json().catch(() => null) as { error?: string } | null
      if (body?.error) return body.error
    }
  }

  return error instanceof Error ? error.message : fallback
}

// ── 側欄標籤 ─────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'basic',    label: '基本設定', icon: Settings },
  { id: 'members',  label: '成員管理', icon: Users },
  { id: 'channels', label: '渠道設定', icon: Share2 },
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

// ── 渠道設定 Tab ─────────────────────────────────────────────────────────────

const BOOKING_URL_BASE = 'https://bookr-5ph.pages.dev/book'
const TRANSACTION_NOTIFICATION_TYPES: TransactionNotificationType[] = [
  'booking_received',
  'booking_confirmed',
  'booking_cancelled',
  'booking_rescheduled',
  'reminder',
]

const DEFAULT_NOTIFICATION_SETTINGS: TransactionNotificationSettings = {
  booking_received_enabled: true,
  booking_confirmed_enabled: true,
  booking_cancelled_enabled: true,
  booking_rescheduled_enabled: true,
  reminder_enabled: true,
  reminder_minutes_before: 1440,
}

const DEFAULT_NOTIFICATION_TEMPLATES: TransactionNotificationTemplates = {
  booking_received: '您好 {{customer_name}}，我們已收到您的預約申請。\n課程：{{service_name}}\n老師：{{practitioner_name}}\n時間：{{start_time}}\n確認後會再通知您。',
  booking_confirmed: '您好 {{customer_name}}，您的預約已確認。\n課程：{{service_name}}\n老師：{{practitioner_name}}\n時間：{{start_time}}',
  booking_cancelled: '您好 {{customer_name}}，您的預約已取消。\n課程：{{service_name}}\n原預約時間：{{start_time}}\n如需重新預約，歡迎再次使用預約連結。',
  booking_rescheduled: '您好 {{customer_name}}，您的預約資料已更新。\n課程：{{service_name}}\n老師：{{practitioner_name}}\n新時間：{{start_time}}',
  reminder: '提醒您明天的預約！\n課程：{{service_name}}\n老師：{{practitioner_name}}\n時間：{{start_time}}\n請準時到來 😊',
}

interface MessagingFunctionResponse {
  ok?: boolean
  code?: string
  error?: string
}

function ChannelsSettings() {
  const { isAdmin, profile } = useAuth()
  const storeId = profile?.store_id ?? STORE_ID
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lineSaving, setLineSaving] = useState(false)
  const [messagingConnecting, setMessagingConnecting] = useState(false)
  const [notificationsSaving, setNotificationsSaving] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const [providerId, setProviderId] = useState('')
  const [providerName, setProviderName] = useState('')
  const [officialAccountName, setOfficialAccountName] = useState('')
  const [officialAccountBasicId, setOfficialAccountBasicId] = useState('')
  const [liffId, setLiffId] = useState('')
  const [lineChannelId, setLineChannelId] = useState('')
  const [connectionHistory, setConnectionHistory] = useState<StoreChannelConnection[]>([])
  const [messagingStatus, setMessagingStatus] = useState<LineMessagingStatus | null>(null)
  const [testRecipients, setTestRecipients] = useState<LineTestRecipient[]>([])
  const [notificationSettings, setNotificationSettings] = useState<TransactionNotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  )
  const [notificationTemplates, setNotificationTemplates] = useState<TransactionNotificationTemplates>(
    DEFAULT_NOTIFICATION_TEMPLATES,
  )
  const [storeCode, setStoreCode] = useState('')
  const [confirmMode, setConfirmMode] = useState<'manual' | 'auto'>('manual')
  const [bookingEnabled, setBookingEnabled] = useState(true)

  const activeConnection = connectionHistory.find(connection => connection.status === 'active') ?? null
  const bookingUrl = storeCode
    ? `${BOOKING_URL_BASE}/${storeCode}`
    : `${BOOKING_URL_BASE}/${storeId}`

  const loadSettings = useCallback(async () => {
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('liff_id, line_login_channel_id, booking_confirmation_mode, booking_enabled, store_code')
      .eq('id', storeId)
      .single()

    if (storeError) {
      toast.error('載入渠道設定失敗', storeError.message)
      setLoading(false)
      return
    }

    setStoreCode(store.store_code ?? '')
    setConfirmMode((store.booking_confirmation_mode ?? 'manual') as 'manual' | 'auto')
    setBookingEnabled(store.booking_enabled ?? true)

    if (!isAdmin) {
      setConnectionHistory([])
      setProviderId('')
      setProviderName('')
      setOfficialAccountName('')
      setOfficialAccountBasicId('')
      setLiffId('')
      setLineChannelId('')
      setMessagingStatus(null)
      setTestRecipients([])
      setLoading(false)
      return
    }

    const { data: connections, error: connectionError } = await supabase
      .from('store_channel_connections')
      .select('*')
      .eq('channel', 'line')
      .order('connection_version', { ascending: false })

    if (connectionError) {
      toast.error('載入 LINE 串接失敗', connectionError.message)
      setLoading(false)
      return
    }

    const history = connections ?? []
    const formSource = history.find(connection => connection.status === 'active') ?? history[0]
    setConnectionHistory(history)
    setProviderId(formSource?.provider_id ?? '')
    setProviderName(formSource?.provider_name ?? '')
    setOfficialAccountName(formSource?.official_account_name ?? '')
    setOfficialAccountBasicId(formSource?.official_account_basic_id ?? '')
    setLiffId(formSource?.liff_id ?? store.liff_id ?? '')
    setLineChannelId(formSource?.login_channel_id ?? store.line_login_channel_id ?? '')

    const [
      messagingResult,
      notificationSettingResult,
      notificationTemplateResult,
      testRecipientResult,
    ] = await Promise.all([
      supabase.rpc('get_store_line_messaging_status'),
      supabase
        .from('notification_settings')
        .select([
          'booking_received_enabled',
          'booking_confirmed_enabled',
          'booking_cancelled_enabled',
          'booking_rescheduled_enabled',
          'reminder_enabled',
          'reminder_minutes_before',
        ].join(','))
        .eq('store_id', storeId)
        .maybeSingle(),
      supabase
        .from('notification_templates')
        .select('type, content')
        .in('type', TRANSACTION_NOTIFICATION_TYPES),
      supabase
        .from('customer_channel_identities')
        .select('id, display_name')
        .eq('store_id', storeId)
        .eq('channel', 'line')
        .eq('friend_status', 'friend')
        .eq('notifications_reachable', true)
        .is('deleted_at', null)
        .order('display_name'),
    ])

    if (messagingResult.error) {
      toast.error('載入 LINE 通知狀態失敗', messagingResult.error.message)
    } else {
      setMessagingStatus(messagingResult.data?.[0] ?? null)
    }

    if (notificationSettingResult.error) {
      toast.error('載入通知設定失敗', notificationSettingResult.error.message)
    } else if (notificationSettingResult.data) {
      setNotificationSettings({
        booking_received_enabled: notificationSettingResult.data.booking_received_enabled,
        booking_confirmed_enabled: notificationSettingResult.data.booking_confirmed_enabled,
        booking_cancelled_enabled: notificationSettingResult.data.booking_cancelled_enabled,
        booking_rescheduled_enabled: notificationSettingResult.data.booking_rescheduled_enabled,
        reminder_enabled: notificationSettingResult.data.reminder_enabled,
        reminder_minutes_before: notificationSettingResult.data.reminder_minutes_before,
      })
    }

    if (notificationTemplateResult.error) {
      toast.error('載入通知範本失敗', notificationTemplateResult.error.message)
    } else {
      const templates = { ...DEFAULT_NOTIFICATION_TEMPLATES }
      for (const template of notificationTemplateResult.data ?? []) {
        if (TRANSACTION_NOTIFICATION_TYPES.includes(template.type as TransactionNotificationType)) {
          templates[template.type as TransactionNotificationType] = template.content.replace(/\\n/g, '\n')
        }
      }
      setNotificationTemplates(templates)
    }

    if (testRecipientResult.error) {
      toast.error('載入 LINE 測試收件人失敗', testRecipientResult.error.message)
      setTestRecipients([])
    } else {
      setTestRecipients((testRecipientResult.data ?? []).map(identity => ({
        value: identity.id,
        label: identity.display_name || `LINE 客戶 ${identity.id.slice(0, 8)}`,
      })))
    }
    setLoading(false)
  }, [isAdmin, storeId])

  useEffect(() => {
    // Supabase 是外部資料源；loadSettings 僅在查詢完成後同步畫面狀態。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSettings()
  }, [loadSettings])

  function lineConnectionErrorMessage(code: string) {
    const messages: Record<string, string> = {
      FORBIDDEN: '只有店家管理員能變更官方 LINE 串接',
      INVALID_ACTION: '不支援的串接操作',
      INVALID_INPUT: '請確認 Provider、官方帳號、Channel ID 與 LIFF ID 格式',
      DISCONNECT_REQUIRED: '更換 Provider、Channel 或 LIFF 前，請先解除目前串接',
      NOT_CONNECTED: '目前沒有可解除的 LINE 串接',
    }
    return messages[code] ?? 'LINE 串接操作失敗，請稍後再試'
  }

  async function handleLineSave() {
    const normalizedProviderId = providerId.trim()
    const normalizedProviderName = providerName.trim()
    const normalizedOfficialAccountName = officialAccountName.trim()
    const normalizedOfficialAccountBasicId = officialAccountBasicId.trim()
    const normalizedLiffId = liffId.trim()
    const normalizedChannelId = lineChannelId.trim()

    if (!/^[0-9]{1,32}$/.test(normalizedProviderId)) {
      toast.error('Provider ID 格式錯誤', 'Provider ID 必須是 1～32 位純數字')
      return
    }
    if (!normalizedProviderName || !normalizedOfficialAccountName) {
      toast.error('串接資料未完整', '請填寫 Provider 名稱與官方帳號名稱')
      return
    }
    if (!/^[0-9]{5,32}$/.test(normalizedChannelId)) {
      toast.error('Channel ID 格式錯誤', 'LINE Login Channel ID 必須是 5～32 位純數字')
      return
    }
    if (!/^[0-9]+-[A-Za-z0-9_-]+$/.test(normalizedLiffId)) {
      toast.error('LIFF ID 格式錯誤', '請確認 LIFF ID 格式，例如 1234567890-AbCdEfGh')
      return
    }

    setLineSaving(true)
    const { data, error } = await supabase.rpc('manage_store_line_connection', {
      p_action: 'connect',
      p_provider_id: normalizedProviderId,
      p_provider_name: normalizedProviderName,
      p_official_account_name: normalizedOfficialAccountName,
      p_official_account_basic_id: normalizedOfficialAccountBasicId || null,
      p_line_login_channel_id: normalizedChannelId,
      p_liff_id: normalizedLiffId,
    })
    setLineSaving(false)

    if (error) {
      toast.error('LINE 串接失敗', error.message)
      return
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.ok !== true) {
      const code = data && typeof data === 'object' && !Array.isArray(data)
        ? String(data.error ?? '')
        : ''
      toast.error('LINE 串接失敗', lineConnectionErrorMessage(code))
      return
    }

    const detail = data.mode === 'reconnected'
      ? data.same_provider === true
        ? '已辨識為相同 Provider，既有客戶 LINE 身分會延續使用'
        : '已切換至不同 Provider，舊 LINE 身分已安全封存'
      : activeConnection
        ? '官方帳號顯示資料已更新'
        : '官方 LINE 預約入口已啟用'
    toast.success('LINE 串接已儲存', detail)
    await loadSettings()
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    const { data, error } = await supabase.rpc('manage_store_line_connection', {
      p_action: 'disconnect',
    })
    setDisconnecting(false)

    if (error) {
      toast.error('解除串接失敗', error.message)
      return
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.ok !== true) {
      const code = data && typeof data === 'object' && !Array.isArray(data)
        ? String(data.error ?? '')
        : ''
      toast.error('解除串接失敗', lineConnectionErrorMessage(code))
      return
    }

    setDisconnectOpen(false)
    toast.success('官方 LINE 已解除', 'LINE 預約入口已停止；一般預約與歷史資料不受影響')
    await loadSettings()
  }

  async function handleMessagingConnect(configuration: {
    messagingChannelId: string
    channelAccessToken: string
    channelSecret: string
  }) {
    if (!activeConnection?.provider_id) {
      toast.error('尚未完成官方 LINE 串接', '請先在上方補齊 Provider ID')
      return false
    }
    if (!/^[0-9]{5,32}$/.test(configuration.messagingChannelId)) {
      toast.error('Messaging Channel ID 格式錯誤', '請輸入 5～32 位純數字')
      return false
    }
    if (configuration.channelAccessToken.length < 20 || configuration.channelAccessToken.length > 4096) {
      toast.error('Channel Access Token 格式錯誤', '請重新從 LINE Developers 複製完整 Token')
      return false
    }
    if (configuration.channelSecret.length < 20 || configuration.channelSecret.length > 255) {
      toast.error('Channel Secret 格式錯誤', '請重新從 LINE Developers 複製完整 Secret')
      return false
    }

    setMessagingConnecting(true)
    try {
      const { data, error } = await supabase.functions.invoke<MessagingFunctionResponse>(
        'line-messaging-settings',
        {
          body: {
            action: 'connect',
            connectionId: activeConnection.id,
            providerId: activeConnection.provider_id,
            messagingChannelId: configuration.messagingChannelId,
            channelAccessToken: configuration.channelAccessToken,
            channelSecret: configuration.channelSecret,
          },
        },
      )

      if (error) {
        throw new Error(await functionErrorMessage(error, 'Messaging API 串接失敗'))
      }
      if (!data?.ok) {
        throw new Error(data?.error || 'Messaging API 串接失敗')
      }

      toast.success('LINE 推播已啟用', 'Token 已驗證並安全保存；請接著設定 Webhook URL')
      await loadSettings()
      return true
    } catch (error) {
      toast.error('LINE 推播串接失敗', error instanceof Error ? error.message : '請稍後再試')
      return false
    } finally {
      setMessagingConnecting(false)
    }
  }

  function validateNotificationTemplates() {
    const allowedVariables = new Set([
      'customer_name',
      'service_name',
      'practitioner_name',
      'start_time',
      'store_name',
    ])
    const variablePattern = /{{\s*([a-z_]+)\s*}}/g

    for (const type of TRANSACTION_NOTIFICATION_TYPES) {
      const template = notificationTemplates[type].trim()
      if (!template || template.length > 4500) return false

      for (const match of template.matchAll(variablePattern)) {
        if (!allowedVariables.has(match[1])) return false
      }

      const withoutVariables = template.replace(variablePattern, '')
      if (withoutVariables.includes('{{') || withoutVariables.includes('}}')) return false
    }
    return true
  }

  async function handleNotificationsSave() {
    if (!validateNotificationTemplates()) {
      toast.error('通知範本格式錯誤', '請只使用畫面列出的變數，並確認大括號完整')
      return
    }

    setNotificationsSaving(true)
    const { error: settingError } = await supabase
      .from('notification_settings')
      .update({
        ...notificationSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)

    if (settingError) {
      setNotificationsSaving(false)
      toast.error('儲存通知設定失敗', settingError.message)
      return
    }

    const templateResults = await Promise.all(
      TRANSACTION_NOTIFICATION_TYPES.map(type => supabase
        .from('notification_templates')
        .update({
          content: notificationTemplates[type].trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('store_id', storeId)
        .eq('type', type)),
    )
    setNotificationsSaving(false)

    const templateError = templateResults.find(result => result.error)?.error
    if (templateError) {
      toast.error('儲存通知範本失敗', templateError.message)
      return
    }

    toast.success('LINE 通知設定已儲存')
  }

  async function handleTestNotification(identityId: string) {
    setTestSending(true)
    try {
      const { data, error } = await supabase.functions.invoke<MessagingFunctionResponse>(
        'line-messaging-settings',
        { body: { action: 'test', identityId } },
      )

      if (error) throw new Error(await functionErrorMessage(error, '測試推播建立失敗'))
      if (!data?.ok) throw new Error(data?.error || '測試推播建立失敗')

      toast.success('測試推播已加入佇列', '背景服務會在下一輪處理並留下發送結果')
      return true
    } catch (error) {
      toast.error('無法建立測試推播', error instanceof Error ? error.message : '請稍後再試')
      return false
    } finally {
      setTestSending(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase
      .from('stores')
      .update({
        booking_confirmation_mode: confirmMode,
        booking_enabled: bookingEnabled,
      })
      .eq('id', storeId)
    setSaving(false)
    if (error) toast.error('儲存失敗', error.message)
    else toast.success('預約設定已儲存')
  }

  if (loading) return (
    <div className="flex justify-center items-center h-40">
      <Spinner size="md" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">渠道設定</h2>
        <p className="text-sm text-slate-500 mt-0.5">設定客戶端預約頁面的整合選項與行為</p>
      </div>

      <LineChannelCard
        providerId={providerId}
        providerName={providerName}
        officialAccountName={officialAccountName}
        officialAccountBasicId={officialAccountBasicId}
        liffId={liffId}
        channelId={lineChannelId}
        bookingUrl={bookingUrl}
        activeConnection={activeConnection}
        connectionHistory={connectionHistory}
        isAdmin={isAdmin}
        saving={lineSaving}
        onProviderIdChange={setProviderId}
        onProviderNameChange={setProviderName}
        onOfficialAccountNameChange={setOfficialAccountName}
        onOfficialAccountBasicIdChange={setOfficialAccountBasicId}
        onLiffIdChange={setLiffId}
        onChannelIdChange={setLineChannelId}
        onSave={handleLineSave}
        onDisconnect={() => setDisconnectOpen(true)}
      />

      <LineMessagingCard
        activeConnection={activeConnection}
        messagingStatus={messagingStatus}
        webhookUrl={messagingStatus
          ? `${import.meta.env.VITE_SUPABASE_URL}${messagingStatus.webhook_path}`
          : ''}
        isAdmin={isAdmin}
        connecting={messagingConnecting}
        savingNotifications={notificationsSaving}
        sendingTest={testSending}
        testRecipients={testRecipients}
        settings={notificationSettings}
        templates={notificationTemplates}
        onConnect={handleMessagingConnect}
        onSettingChange={(key, value) => setNotificationSettings(current => ({
          ...current,
          [key]: value,
        }))}
        onTemplateChange={(type, value) => setNotificationTemplates(current => ({
          ...current,
          [type]: value,
        }))}
        onSaveNotifications={handleNotificationsSave}
        onSendTest={handleTestNotification}
      />

      {/* 預約設定 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <h3 className="text-sm font-semibold text-slate-700">預約設定</h3>

        <FormField label="確認模式">
          <Select
            value={confirmMode}
            onChange={v => setConfirmMode(v as 'manual' | 'auto')}
            options={[
              { value: 'manual', label: '待確認 — 店家手動確認每筆預約' },
              { value: 'auto',   label: '自動確認 — 客戶預約後立即確認' },
            ]}
          />
        </FormField>

        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-slate-700">開放線上預約</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {bookingEnabled ? '客戶可透過預約連結進行預約' : '預約頁將顯示「暫停接受預約」'}
            </p>
          </div>
          <Toggle
            checked={bookingEnabled}
            onChange={setBookingEnabled}
            ariaLabel="切換線上預約"
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button variant="primary" loading={saving} onClick={handleSave}>
          <Save size={15} />
          儲存預約設定
        </Button>
      </div>

      <ConfirmModal
        open={disconnectOpen}
        onClose={() => setDisconnectOpen(false)}
        onConfirm={handleDisconnect}
        loading={disconnecting}
        title="解除官方 LINE 串接？"
        description="解除後，客人將無法從目前的 LINE LIFF 入口帶入身分預約。一般網頁預約、歷史預約、客戶資料與舊 LINE 身分紀錄都會保留。"
        confirmLabel="確認解除串接"
      />
    </div>
  )
}

// ── 成員管理 Tab ─────────────────────────────────────────────────────────────

function MembersSettings() {
  const { session } = useAuth()

  const [members, setMembers] = useState<Member[]>([])
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)

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
    const normalizedEmail = inviteEmail.trim().toLowerCase()
    if (!normalizedEmail) { setInviteEmailError('請輸入 Email'); return }
    if (!validateEmail(normalizedEmail)) { setInviteEmailError('請輸入有效的 Email 格式'); return }
    if (!session) return

    setInviteSending(true)
    try {
      const { data, error } = await supabase.functions.invoke<InviteFunctionResponse>('invite-member', {
        body: { email: normalizedEmail, role: inviteRole },
      })
      if (error) {
        throw new Error(await functionErrorMessage(error, '邀請發送失敗'))
      }

      if (data?.deliveryStatus === 'failed' || data?.warning) {
        toast.warning('邀請已建立', '信件暫時未寄出，可稍後從待接受名單重新發送')
      } else {
        toast.success('邀請已發送', `邀請信已寄到 ${normalizedEmail}`)
      }
      setInviteOpen(false)
      await loadPendingInvitations()
    } catch (error) {
      toast.error('發送失敗', error instanceof Error ? error.message : '請稍後再試')
    } finally {
      setInviteSending(false)
    }
  }

  useEffect(() => {
    loadMembers()
    loadPendingInvitations()
  }, [])

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

  async function loadPendingInvitations() {
    const { data, error } = await supabase
      .from('pending_invitations')
      .select('id, email, role, created_at, expires_at')
      .is('accepted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('載入邀請失敗', error.message)
      return
    }
    setPendingInvitations(data || [])
  }

  async function handleResend(inv: PendingInvitation) {
    if (!session) return
    setResendingId(inv.id)
    try {
      const { data, error } = await supabase.functions.invoke<InviteFunctionResponse>('invite-member', {
        body: { email: inv.email, role: inv.role },
      })
      if (error) {
        throw new Error(await functionErrorMessage(error, '邀請重新發送失敗'))
      }

      if (data?.deliveryStatus === 'failed' || data?.warning) {
        toast.warning('邀請已更新', '信件暫時未寄出，請稍後再試')
      } else {
        toast.success('邀請已重新發送', `新的邀請信已寄到 ${inv.email}`)
      }
      await loadPendingInvitations()
    } catch (error) {
      toast.error('重發失敗', error instanceof Error ? error.message : '請稍後再試')
    } finally {
      setResendingId(null)
    }
  }

  async function handleRevoke() {
    if (!revokingId) return
    const { data, error } = await supabase
      .from('pending_invitations')
      .delete()
      .eq('id', revokingId)
      .is('accepted_at', null)
      .select('id')
      .single()
    if (error) {
      toast.error('撤銷失敗', error.message)
      return
    }
    setPendingInvitations(previous => previous.filter(invitation => invitation.id !== data.id))
    toast.success('邀請已撤銷')
    setRevokingId(null)
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

  function expiryLabel(expiresAt: string) {
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
    if (days <= 0) return { text: '已過期', warn: true }
    if (days <= 3) return { text: `還有 ${days} 天`, warn: true }
    return { text: `還有 ${days} 天`, warn: false }
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

      {/* 已加入成員 */}
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

      {/* 待接受邀請 */}
      {pendingInvitations.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 px-1">
            待接受邀請 · {pendingInvitations.length}
          </h3>
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">角色</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">發出時間</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">到期</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingInvitations.map(inv => {
                  const expiry = expiryLabel(inv.expires_at)
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                            <Mail size={13} className="text-amber-400" />
                          </div>
                          <div>
                            <p className="text-sm text-slate-700">{inv.email}</p>
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                              邀請中
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge variant={inv.role === 'admin' ? 'indigo' : 'slate'}>
                          {inv.role === 'admin' ? '管理員' : '一般成員'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-400">
                        {timeAgo(inv.created_at)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-medium ${expiry.warn ? 'text-orange-500' : 'text-slate-400'}`}>
                          <Clock size={11} className="inline mr-1" />
                          {expiry.text}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="sm"
                            loading={resendingId === inv.id}
                            onClick={() => handleResend(inv)}
                          >
                            <RefreshCw size={13} />
                            重發
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setRevokingId(inv.id)}>
                            <Trash2 size={13} className="text-red-400" />
                            <span className="text-red-500">撤銷</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

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

      {/* 撤銷邀請確認 */}
      <ConfirmModal
        open={!!revokingId}
        onClose={() => setRevokingId(null)}
        onConfirm={handleRevoke}
        title="確認撤銷邀請"
        description="撤銷後，此邀請連結將立即失效，對方將無法使用原連結加入。"
        confirmLabel="確認撤銷"
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
      <div className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8 sm:py-6">
        <h1 className="text-2xl font-bold text-slate-900">設定</h1>
        <p className="text-sm text-slate-500 mt-0.5">管理店家設定與成員權限</p>
      </div>

      <div className="flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-8 lg:flex-row lg:gap-8 lg:py-8">
        {/* 左側分類導航 */}
        <aside className="w-full shrink-0 lg:w-44">
          <nav className="grid grid-cols-3 gap-1 lg:block lg:space-y-0.5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={[
                  'flex w-full items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-center text-xs font-medium transition-colors sm:text-sm lg:justify-start lg:px-3 lg:text-left',
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
          {activeTab === 'basic'    && <BasicSettings />}
          {activeTab === 'members'  && <MembersSettings />}
          {activeTab === 'channels' && <ChannelsSettings />}
        </div>
      </div>
    </div>
  )
}
