import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  Inbox,
  RefreshCw,
  WifiOff,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/cn'
import Button from '../ui/Button'
import Drawer from '../ui/Drawer'
import IconButton from '../ui/IconButton'
import { toast } from '../ui/Snackbar'

type NotificationTab = 'pending' | 'all'

interface NotificationPayload {
  customer_name?: string
  service_name?: string
  practitioner_name?: string
  start_time?: string
  booking_status?: string
  source?: string
}

interface InAppNotification {
  id: string
  store_id: string
  recipient_user_id: string
  booking_id: string | null
  event_type: 'booking_created_pending' | 'booking_created_confirmed'
  title: string
  message: string
  payload_snapshot: NotificationPayload
  action_required: boolean
  read_at: string | null
  resolved_at: string | null
  deduplication_key: string
  created_at: string
}

interface NotificationContextValue {
  notifications: InAppNotification[]
  unreadCount: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  connected: boolean
  error: string | null
  tab: NotificationTab
  open: boolean
  banner: InAppNotification | null
  setTab: (tab: NotificationTab) => void
  setOpen: (open: boolean) => void
  dismissBanner: () => void
  openNotification: (notification: InAppNotification) => Promise<void>
  markAllRead: () => Promise<void>
  reload: () => Promise<void>
  loadMore: () => Promise<void>
}

const NotificationContext = createContext<NotificationContextValue | null>(null)
const notificationClient = supabase as unknown as SupabaseClient
const PAGE_SIZE = 50

function useNotificationCenter() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('通知元件必須放在 NotificationCenterProvider 內')
  return context
}

interface ProviderProps {
  userId: string | null
  storeId: string | null
  onOpenBooking: (bookingId: string) => void
  children: ReactNode
}

export function NotificationCenterProvider({
  userId,
  storeId,
  onOpenBooking,
  children,
}: ProviderProps) {
  const [notifications, setNotifications] = useState<InAppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<NotificationTab>('pending')
  const [open, setOpen] = useState(false)
  const [banner, setBanner] = useState<InAppNotification | null>(null)

  const refreshUnreadCount = useCallback(async () => {
    if (!userId || !storeId) return
    const { count, error: countError } = await notificationClient
      .from('in_app_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', userId)
      .eq('store_id', storeId)
      .is('read_at', null)

    if (!countError) setUnreadCount(count ?? 0)
  }, [storeId, userId])

  const buildListQuery = useCallback(() => {
    let query = notificationClient
      .from('in_app_notifications')
      .select('*')
      .eq('recipient_user_id', userId as string)
      .eq('store_id', storeId as string)

    if (tab === 'pending') {
      query = query.eq('action_required', true).is('resolved_at', null)
    }

    return query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
  }, [storeId, tab, userId])

  const reload = useCallback(async () => {
    if (!userId || !storeId) {
      setNotifications([])
      setUnreadCount(0)
      setHasMore(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    const [{ data, error: listError }] = await Promise.all([
      buildListQuery().limit(PAGE_SIZE),
      refreshUnreadCount(),
    ])

    if (listError) {
      setError('通知暫時無法載入，請稍後重試')
    } else {
      const rows = (data ?? []) as InAppNotification[]
      setNotifications(rows)
      setHasMore(rows.length === PAGE_SIZE)
    }
    setLoading(false)
  }, [buildListQuery, refreshUnreadCount, storeId, userId])

  const loadMore = useCallback(async () => {
    const oldest = notifications.at(-1)
    if (!oldest || !hasMore || loadingMore) return

    setLoadingMore(true)
    const { data, error: loadError } = await buildListQuery()
      .lt('created_at', oldest.created_at)
      .limit(PAGE_SIZE)

    if (loadError) {
      toast.error('通知載入失敗', '請稍後再試')
    } else {
      const rows = (data ?? []) as InAppNotification[]
      setNotifications(current => [...current, ...rows])
      setHasMore(rows.length === PAGE_SIZE)
    }
    setLoadingMore(false)
  }, [buildListQuery, hasMore, loadingMore, notifications])

  const fetchOne = useCallback(async (notificationId: string) => {
    if (!userId || !storeId) return null
    const { data } = await notificationClient
      .from('in_app_notifications')
      .select('*')
      .eq('id', notificationId)
      .eq('recipient_user_id', userId)
      .eq('store_id', storeId)
      .maybeSingle()
    return data as InAppNotification | null
  }, [storeId, userId])

  const syncNotification = useCallback(async (
    notificationId: string,
    showBanner: boolean,
  ) => {
    const notification = await fetchOne(notificationId)
    if (!notification) return

    setNotifications(current => {
      const visibleInTab = tab === 'all'
        || (notification.action_required && !notification.resolved_at)
      if (!visibleInTab) return current.filter(item => item.id !== notification.id)

      const existingIndex = current.findIndex(item => item.id === notification.id)
      if (existingIndex < 0) return [notification, ...current]
      return current.map(item => item.id === notification.id ? notification : item)
    })

    if (showBanner) setBanner(notification)
    await refreshUnreadCount()
  }, [fetchOne, refreshUnreadCount, tab])

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  useEffect(() => {
    if (!banner) return
    const timer = window.setTimeout(() => setBanner(null), 8000)
    return () => window.clearTimeout(timer)
  }, [banner])

  useEffect(() => {
    if (!userId || !storeId) return

    const topic = `notifications:user:${userId}`
    const channel = notificationClient
      .channel(topic, { config: { private: true } })
      .on('broadcast', { event: 'notification_created' }, payload => {
        const notificationId = payload.payload?.notification_id
        if (typeof notificationId === 'string') {
          void syncNotification(notificationId, true)
        }
      })
      .on('broadcast', { event: 'notification_updated' }, payload => {
        const notificationId = payload.payload?.notification_id
        if (typeof notificationId === 'string') {
          void syncNotification(notificationId, false)
        }
      })
      .subscribe(status => {
        const isSubscribed = status === 'SUBSCRIBED'
        setConnected(isSubscribed)
        if (isSubscribed) void reload()
      })

    return () => {
      setConnected(false)
      void notificationClient.removeChannel(channel)
    }
  }, [reload, storeId, syncNotification, userId])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [reload])

  async function markRead(notification: InAppNotification) {
    if (notification.read_at) return
    const readAt = new Date().toISOString()
    setNotifications(current => current.map(item => (
      item.id === notification.id ? { ...item, read_at: readAt } : item
    )))
    setUnreadCount(current => Math.max(0, current - 1))

    const { data, error: readError } = await notificationClient
      .rpc('mark_in_app_notification_read', {
        p_notification_id: notification.id,
      })

    if (readError || data !== true) {
      await reload()
      toast.error('未能更新已讀狀態', '通知內容仍可正常查看')
    }
  }

  async function openNotification(notification: InAppNotification) {
    setBanner(null)
    setOpen(false)
    if (notification.booking_id) onOpenBooking(notification.booking_id)
    else toast.info('這筆預約已無法查看')
    await markRead(notification)
  }

  async function markAllRead() {
    const { error: markError } = await notificationClient
      .rpc('mark_all_in_app_notifications_read')

    if (markError) {
      toast.error('未能全部標為已讀', '請稍後再試')
      return
    }

    const readAt = new Date().toISOString()
    setNotifications(current => current.map(item => ({ ...item, read_at: item.read_at ?? readAt })))
    setUnreadCount(0)
  }

  const value: NotificationContextValue = {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    hasMore,
    connected,
    error,
    tab,
    open,
    banner,
    setTab,
    setOpen,
    dismissBanner: () => setBanner(null),
    openNotification,
    markAllRead,
    reload,
    loadMore,
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

export function NotificationBell({ className }: { className?: string }) {
  const { unreadCount, setOpen } = useNotificationCenter()
  const label = unreadCount > 0 ? `通知中心，${unreadCount} 則未讀` : '通知中心'

  return (
    <div className={cn('relative shrink-0', className)}>
      <IconButton
        icon={Bell}
        label={label}
        onClick={() => setOpen(true)}
        className="text-slate-500 hover:text-slate-900"
      />
      {unreadCount > 0 && (
        <span className="pointer-events-none absolute -right-1.5 -top-1.5 min-w-4 h-4 px-1 rounded-full bg-[#E6574F] text-white text-[9px] font-bold leading-4 text-center ring-2 ring-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </div>
  )
}

export function NotificationCenterSurface() {
  const {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    hasMore,
    connected,
    error,
    tab,
    open,
    banner,
    setTab,
    setOpen,
    dismissBanner,
    openNotification,
    markAllRead,
    reload,
    loadMore,
  } = useNotificationCenter()

  return (
    <>
      {banner && (
        <div
          className="fixed top-4 inset-x-4 sm:left-auto sm:right-5 sm:w-[390px] z-[60]"
          role="status"
          aria-live="polite"
        >
          <NotificationBanner
            notification={banner}
            onOpen={() => void openNotification(banner)}
            onDismiss={dismissBanner}
          />
        </div>
      )}

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="通知中心"
        subtitle={unreadCount > 0 ? `${unreadCount} 則未讀通知` : '所有通知都已讀'}
        width="md"
        headerActions={unreadCount > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => void markAllRead()}>
            全部已讀
          </Button>
        ) : undefined}
      >
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm px-5 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1">
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={tab === 'pending'}
                onClick={() => setTab('pending')}
                className={cn(
                  'rounded-xl shadow-none',
                  tab === 'pending' && 'bg-white text-slate-900 shadow-sm hover:bg-white',
                )}
              >
                待處理
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={tab === 'all'}
                onClick={() => setTab('all')}
                className={cn(
                  'rounded-xl shadow-none',
                  tab === 'all' && 'bg-white text-slate-900 shadow-sm hover:bg-white',
                )}
              >
                全部通知
              </Button>
            </div>
            <div className={cn(
              'flex items-center gap-1.5 text-[11px]',
              connected ? 'text-emerald-600' : 'text-slate-400',
            )}>
              <span className={cn(
                'w-1.5 h-1.5 rounded-full',
                connected ? 'bg-emerald-500' : 'bg-slate-300',
              )} />
              {connected ? '即時同步' : '重新連線中'}
            </div>
          </div>
        </div>

        <div className="px-4 py-4">
          {loading ? (
            <NotificationSkeleton />
          ) : error ? (
            <div className="py-16 text-center">
              <WifiOff size={32} strokeWidth={1.5} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">通知暫時無法載入</p>
              <p className="mt-1 text-xs text-slate-400">連線恢復後可以再次讀取</p>
              <Button variant="secondary" size="sm" className="mt-4" onClick={() => void reload()}>
                <RefreshCw size={13} /> 重新載入
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                <Inbox size={22} strokeWidth={1.5} className="text-slate-400" />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-700">
                {tab === 'pending' ? '目前沒有待處理預約' : '目前沒有通知'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                客戶送出預約後會即時出現在這裡
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {notifications.map(notification => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onOpen={() => void openNotification(notification)}
                />
              ))}
              {hasMore && (
                <Button
                  variant="ghost"
                  className="w-full"
                  loading={loadingMore}
                  onClick={() => void loadMore()}
                >
                  載入更多
                </Button>
              )}
            </div>
          )}
        </div>
      </Drawer>
    </>
  )
}

function NotificationBanner({
  notification,
  onOpen,
  onDismiss,
}: {
  notification: InAppNotification
  onOpen: () => void
  onDismiss: () => void
}) {
  const pending = notification.action_required && !notification.resolved_at
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
      <div className={cn('absolute inset-y-0 left-0 w-1.5', pending ? 'bg-[#E6574F]' : 'bg-[#6BAA45]')} />
      <div className="flex items-start gap-3.5 pl-5 pr-3 py-4">
        <div className={cn(
          'w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center',
          pending ? 'bg-[#FFF0EC] text-[#D94841]' : 'bg-[#EEF6E8] text-[#5B933A]',
        )}>
          {pending ? <CalendarClock size={19} /> : <CheckCircle2 size={19} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900">{notification.title}</p>
            <Button variant="ghost" size="sm" className="-mr-1 px-2 text-slate-400" onClick={onDismiss}>
              關閉
            </Button>
          </div>
          <p className="mt-0.5 text-sm text-slate-600 truncate">{notification.message}</p>
          <p className="mt-1.5 text-xs text-slate-400">
            {formatBookingTime(notification.payload_snapshot.start_time)}
            {' · '}{notification.payload_snapshot.practitioner_name ?? '未指定老師'}
          </p>
          <Button variant="ghost" size="sm" className="mt-2 -ml-3 text-indigo-600" onClick={onOpen}>
            查看預約
          </Button>
        </div>
      </div>
    </div>
  )
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: InAppNotification
  onOpen: () => void
}) {
  const pending = notification.action_required && !notification.resolved_at
  return (
    <Button
      variant="ghost"
      onClick={onOpen}
      className={cn(
        'relative w-full h-auto items-start justify-start gap-3 rounded-2xl border px-4 py-3.5 text-left active:scale-[0.99]',
        notification.read_at
          ? 'border-slate-100 bg-white hover:bg-slate-50'
          : 'border-indigo-100 bg-indigo-50/55 hover:bg-indigo-50',
      )}
    >
      <span className={cn(
        'mt-0.5 flex w-9 h-9 shrink-0 items-center justify-center rounded-xl',
        pending ? 'bg-[#FFF0EC] text-[#D94841]' : 'bg-[#EEF6E8] text-[#5B933A]',
      )}>
        {pending ? <CalendarClock size={17} /> : <CheckCircle2 size={17} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-900">{notification.title}</span>
          {!notification.read_at && <span className="w-2 h-2 shrink-0 rounded-full bg-[#E6574F]" />}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-600">{notification.message}</span>
        <span className="mt-2 block text-xs leading-relaxed text-slate-400">
          {formatBookingTime(notification.payload_snapshot.start_time)}
          <br />
          {notification.payload_snapshot.practitioner_name ?? '未指定老師'}
          {' · '}{relativeTime(notification.created_at)}
        </span>
      </span>
      <span className={cn(
        'mt-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
        pending ? 'bg-[#FFF0EC] text-[#C93E37]' : 'bg-slate-100 text-slate-500',
      )}>
        {pending ? '待處理' : '已處理'}
      </span>
    </Button>
  )
}

function NotificationSkeleton() {
  return (
    <div className="space-y-3" aria-label="載入通知中">
      {[0, 1, 2].map(index => (
        <div key={index} className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
      ))}
    </div>
  )
}

function formatBookingTime(value?: string) {
  if (!value) return '時間待確認'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '時間待確認'
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return '剛剛'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分鐘前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小時前`
  return `${Math.floor(seconds / 86400)} 天前`
}
