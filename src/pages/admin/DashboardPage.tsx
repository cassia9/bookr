import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  subDays, format,
} from 'date-fns'
import { zhTW } from 'date-fns/locale/zh-TW'
import {
  TrendingUp, TrendingDown, CalendarDays,
  CheckCircle2, Banknote, Clock, AlertCircle,
  Users, BookOpen, Minus,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Badge from '@/components/ui/Badge'
import Spinner from '@/components/ui/Spinner'

// ── 型別 ─────────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'quarter'

interface KPI {
  today_bookings: number
  today_completed: number
  month_bookings: number
  month_completed: number
  month_revenue: number
  pending_count: number
  prev_month_bookings: number
  prev_month_revenue: number
}

interface PractitionerStat {
  practitioner_id: string
  full_name: string
  color: string
  booking_count: number
  completed_count: number
  revenue: number
  completion_rate: number
}

interface ServiceStat {
  service_id: string
  service_name: string
  booking_count: number
  revenue: number
  avg_price: number
}

interface DailyStat {
  stat_date: string
  booking_count: number
  completed_count: number
  revenue: number
}

// ── 工具函式 ─────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return `NT$ ${n.toLocaleString('zh-TW')}`
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`
}

function calcChange(curr: number, prev: number) {
  if (prev === 0) return null
  return ((curr - prev) / prev) * 100
}

function getPeriodRange(period: Period) {
  const now = new Date()
  switch (period) {
    case 'week':
      return {
        start: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        end: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      }
    case 'month':
      return {
        start: format(startOfMonth(now), 'yyyy-MM-dd'),
        end: format(endOfMonth(now), 'yyyy-MM-dd'),
      }
    case 'quarter':
      return {
        start: format(subDays(now, 89), 'yyyy-MM-dd'),
        end: format(now, 'yyyy-MM-dd'),
      }
  }
}

// ── 子元件：環比箭頭 ──────────────────────────────────────────────────────────

function ChangeIndicator({ change }: { change: number | null }) {
  if (change === null) return <span className="text-xs text-slate-400">—</span>
  const up = change >= 0
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? '+' : ''}{change.toFixed(1)}%
      <span className="text-slate-400 font-normal ml-0.5">vs 上月</span>
    </span>
  )
}

// ── 子元件：KPI 卡 ────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: string
  sub?: React.ReactNode
  accent?: string
}

function KpiCard({ icon, label, value, sub, accent = 'bg-slate-100 text-slate-600' }: KpiCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
        <span className={`p-1.5 rounded-xl ${accent}`}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
        {sub && <div className="mt-1">{sub}</div>}
      </div>
    </div>
  )
}

// ── 子元件：自訂 Tooltip ───────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-800 mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.name} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.name}
          </span>
          <span className="font-medium text-slate-800 tabular-nums">
            {entry.name === '收入' ? fmtMoney(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── 主頁面 ────────────────────────────────────────────────────────────────────

const PERIODS: { id: Period; label: string }[] = [
  { id: 'week',    label: '本週' },
  { id: 'month',   label: '本月' },
  { id: 'quarter', label: '近 90 天' },
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<Period>('month')

  const [kpi,           setKpi]           = useState<KPI | null>(null)
  const [practitioners, setPractitioners] = useState<PractitionerStat[]>([])
  const [services,      setServices]      = useState<ServiceStat[]>([])
  const [daily,         setDaily]         = useState<DailyStat[]>([])

  const [loadingKpi,     setLoadingKpi]     = useState(true)
  const [loadingDetail,  setLoadingDetail]  = useState(true)

  // KPI — 固定本月，不跟著 period 切換
  useEffect(() => {
    setLoadingKpi(true)
    supabase.rpc('get_dashboard_kpi').then(({ data, error }) => {
      if (!error && data?.[0]) setKpi(data[0] as KPI)
      setLoadingKpi(false)
    })
  }, [])

  // 排行 + 趨勢 — 跟著 period 切換
  const loadDetail = useCallback(async () => {
    setLoadingDetail(true)
    const { start, end } = getPeriodRange(period)

    const [practRes, svcRes, dailyRes] = await Promise.all([
      supabase.rpc('get_practitioner_stats', { p_start: start, p_end: end }),
      supabase.rpc('get_service_stats',      { p_start: start, p_end: end }),
      supabase.rpc('get_daily_stats',        { p_start: start, p_end: end }),
    ])

    if (!practRes.error)  setPractitioners((practRes.data  ?? []) as PractitionerStat[])
    if (!svcRes.error)    setServices((svcRes.data          ?? []) as ServiceStat[])
    if (!dailyRes.error)  setDaily((dailyRes.data           ?? []) as DailyStat[])
    setLoadingDetail(false)
  }, [period])

  useEffect(() => { loadDetail() }, [loadDetail])

  // 課程最大值（進度條用）
  const maxBookingCount = Math.max(...services.map(s => s.booking_count), 1)

  // 完課率 Badge
  function rateBadge(rate: number) {
    if (rate >= 80) return <Badge variant="green">{fmtPct(rate)}</Badge>
    if (rate >= 60) return <Badge variant="amber">{fmtPct(rate)}</Badge>
    return <Badge variant="red">{fmtPct(rate)}</Badge>
  }

  // 今日日期
  const today = format(new Date(), 'yyyy年MM月dd日', { locale: zhTW })

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── 頁首 ── */}
      <div className="bg-white border-b border-slate-200 px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">數據總覽</h1>
            <p className="text-sm text-slate-400 mt-0.5">{today}</p>
          </div>

          {/* 時間段切換 */}
          <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-0.5">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={[
                  'px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all',
                  period === p.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">

        {/* ── 待確認提醒橫幅 ── */}
        {!loadingKpi && kpi && kpi.pending_count > 0 && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
            <AlertCircle size={16} className="text-amber-500 shrink-0" />
            <p className="text-sm text-amber-800 flex-1">
              <span className="font-semibold">{kpi.pending_count} 筆預約</span>
              {' '}待確認，請盡快處理以避免客戶久等
            </p>
            <button
              onClick={() => navigate('/admin/bookings')}
              className="text-xs font-medium text-amber-700 underline underline-offset-2 shrink-0 hover:text-amber-900 transition-colors"
            >
              前往處理 →
            </button>
          </div>
        )}

        {/* ── KPI 卡（固定本月） ── */}
        {loadingKpi ? (
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 h-28 animate-pulse" />
            ))}
          </div>
        ) : kpi ? (
          <div className="grid grid-cols-4 gap-4">
            <KpiCard
              icon={<CalendarDays size={15} />}
              label="今日預約"
              accent="bg-indigo-50 text-indigo-600"
              value={String(kpi.today_bookings)}
              sub={
                <span className="text-xs text-slate-400">
                  完課 {kpi.today_completed} 筆
                </span>
              }
            />
            <KpiCard
              icon={<Clock size={15} />}
              label="本月預約"
              accent="bg-blue-50 text-blue-600"
              value={String(kpi.month_bookings)}
              sub={<ChangeIndicator change={calcChange(kpi.month_bookings, kpi.prev_month_bookings)} />}
            />
            <KpiCard
              icon={<CheckCircle2 size={15} />}
              label="本月完課"
              accent="bg-emerald-50 text-emerald-600"
              value={String(kpi.month_completed)}
              sub={
                <span className="text-xs text-slate-400">
                  完課率{' '}
                  <span className="font-semibold text-slate-600">
                    {kpi.month_bookings > 0
                      ? fmtPct((kpi.month_completed / kpi.month_bookings) * 100)
                      : '—'}
                  </span>
                </span>
              }
            />
            <KpiCard
              icon={<Banknote size={15} />}
              label="本月收入"
              accent="bg-amber-50 text-amber-600"
              value={fmtMoney(kpi.month_revenue)}
              sub={<ChangeIndicator change={calcChange(kpi.month_revenue, kpi.prev_month_revenue)} />}
            />
          </div>
        ) : null}

        {/* ── 中段：老師排行 + 熱門課程 ── */}
        {loadingDetail ? (
          <div className="flex justify-center items-center h-48">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5">

            {/* 老師排行 */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Users size={15} className="text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-800">老師排行</h2>
                <span className="ml-auto text-xs text-slate-400">
                  {PERIODS.find(p => p.id === period)?.label}
                </span>
              </div>

              {practitioners.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-300 gap-2">
                  <Users size={28} />
                  <p className="text-sm">此期間無資料</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-2.5 text-left text-xs text-slate-400 font-semibold">老師</th>
                      <th className="px-4 py-2.5 text-right text-xs text-slate-400 font-semibold">預約</th>
                      <th className="px-4 py-2.5 text-right text-xs text-slate-400 font-semibold">完課率</th>
                      <th className="px-4 py-2.5 text-right text-xs text-slate-400 font-semibold">收入</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {practitioners.map((p, i) => (
                      <tr key={p.practitioner_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs text-slate-300 w-4 text-center font-mono">{i + 1}</span>
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: p.color || '#94a3b8' }}
                            />
                            <span className="text-sm font-medium text-slate-700">{p.full_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm text-slate-600 tabular-nums">
                            {p.booking_count}
                            <span className="text-slate-300 text-xs ml-1">/ {p.completed_count}完</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {p.booking_count > 0 ? rateBadge(p.completion_rate) : <Minus size={12} className="text-slate-300 ml-auto" />}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-slate-800 tabular-nums">
                            {p.revenue > 0 ? `NT$ ${p.revenue.toLocaleString()}` : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 熱門課程 Top 5 */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <BookOpen size={15} className="text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-800">熱門課程 Top 5</h2>
                <span className="ml-auto text-xs text-slate-400">
                  {PERIODS.find(p => p.id === period)?.label}
                </span>
              </div>

              {services.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-300 gap-2">
                  <BookOpen size={28} />
                  <p className="text-sm">此期間無資料</p>
                </div>
              ) : (
                <div className="px-5 py-4 space-y-4">
                  {services.map((s, i) => {
                    const pct = (s.booking_count / maxBookingCount) * 100
                    return (
                      <div key={s.service_id}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-300 w-4 text-center font-mono">{i + 1}</span>
                            <span className="text-sm font-medium text-slate-700">{s.service_name}</span>
                          </div>
                          <div className="flex items-center gap-3 text-right">
                            <span className="text-xs text-slate-400 tabular-nums">
                              {s.booking_count} 筆
                            </span>
                            <span className="text-sm font-semibold text-slate-800 tabular-nums w-24">
                              {s.revenue > 0 ? `NT$ ${s.revenue.toLocaleString()}` : '—'}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-slate-800 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 趨勢圖 ── */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-800">預約量與收入趨勢</h2>
            <span className="ml-auto text-xs text-slate-400">
              {PERIODS.find(p => p.id === period)?.label}
            </span>
          </div>

          {loadingDetail ? (
            <div className="flex justify-center items-center h-56">
              <Spinner size="md" />
            </div>
          ) : daily.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-slate-300 gap-2">
              <CalendarDays size={28} />
              <p className="text-sm">此期間無預約資料</p>
            </div>
          ) : (
            <div className="px-4 py-5">
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={daily} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="stat_date"
                    tickFormatter={d => format(new Date(d), 'MM/dd')}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12, color: '#94a3b8', paddingTop: 8 }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="booking_count"
                    name="預約數"
                    fill="#e2e8f0"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={24}
                  />
                  <Line
                    yAxisId="right"
                    dataKey="revenue"
                    name="收入"
                    stroke="#0f172a"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#0f172a' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
