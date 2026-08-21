import { useEffect, useState } from 'react'
import { CheckCircle, Link2, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'
import type { Database } from '@/types/database'

type ChannelIdentity = Database['public']['Tables']['customer_channel_identities']['Row']

interface CustomerChannelIdentitiesProps {
  clientId: string
  active: boolean
}

const CHANNEL_LABELS: Record<ChannelIdentity['channel'], string> = {
  line: 'LINE',
  messenger: 'Messenger',
  instagram: 'Instagram',
}

function maskedProviderUserId(value: string) {
  if (value.length <= 10) return '••••••••'
  return `${value.slice(0, 5)}••••••${value.slice(-4)}`
}

function formatLastSeen(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

export default function CustomerChannelIdentities({
  clientId,
  active,
}: CustomerChannelIdentitiesProps) {
  const [identities, setIdentities] = useState<ChannelIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    if (!active) return
    let mounted = true

    async function loadIdentities() {
      const { data, error } = await supabase
        .from('customer_channel_identities')
        .select('*')
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .order('last_seen_at', { ascending: false })

      if (!mounted) return
      setLoadFailed(Boolean(error))
      setIdentities(error ? [] : (data ?? []))
      setLoading(false)
    }

    void loadIdentities()
    return () => { mounted = false }
  }, [active, clientId])

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">已連結渠道</p>
        {identities.length > 0 && <Badge variant="green">已驗證</Badge>}
      </div>

      {loading ? (
        <div className="flex justify-center rounded-2xl border border-slate-100 bg-slate-50 py-5">
          <Spinner size="sm" />
        </div>
      ) : loadFailed ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          暫時無法載入渠道資訊，客戶與預約資料不受影響。
        </div>
      ) : identities.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-slate-400">
          <Link2 size={18} />
          <div>
            <p className="text-sm font-medium text-slate-500">尚未連結預約渠道</p>
            <p className="mt-0.5 text-xs">客人完成已驗證的 LINE 預約後會顯示在這裡</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {identities.map(identity => (
            <div
              key={identity.id}
              className="flex items-center gap-3 rounded-2xl border border-green-100 bg-green-50/70 px-4 py-3"
            >
              {identity.avatar_url ? (
                <img
                  src={identity.avatar_url}
                  alt={`${CHANNEL_LABELS[identity.channel]} 頭像`}
                  className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#06C755] text-white">
                  <MessageCircle size={18} />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {identity.display_name || CHANNEL_LABELS[identity.channel]}
                  </p>
                  <Badge variant="green">{CHANNEL_LABELS[identity.channel]}</Badge>
                </div>
                <p className="mt-1 font-mono text-[11px] text-slate-400">
                  {maskedProviderUserId(identity.provider_user_id)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  最近驗證：{formatLastSeen(identity.last_seen_at)}
                </p>
              </div>

              <CheckCircle size={17} className="shrink-0 text-green-600" aria-label="身分已驗證" />
            </div>
          ))}
        </div>
      )}

      <p className="mt-2 text-[11px] leading-4 text-slate-400">
        渠道身分與電話分開保存；客戶更換電話不會解除 LINE 連結。
      </p>
    </div>
  )
}
