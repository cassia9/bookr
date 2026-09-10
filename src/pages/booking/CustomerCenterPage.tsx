import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format, isAfter, parseISO } from 'date-fns'
import { zhTW } from 'date-fns/locale/zh-TW'
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Gift,
  History,
  Leaf,
  MapPin,
  ShieldCheck,
  TicketCheck,
  UserRound,
} from 'lucide-react'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { cn } from '../../lib/cn'
import {
  loadCustomerCenter,
  type CustomerCenterBooking,
  type CustomerCenterLoadResult,
  type CustomerCenterVoucher,
} from '../../lib/customer-center-api'

const statusMeta = {
  pending: { label: '等待確認', className: 'bg-[#F4E9D8] text-[#8A6737]' },
  confirmed: { label: '已確認', className: 'bg-[#E8F7CB] text-[#56811D]' },
  completed: { label: '已完成', className: 'bg-slate-100 text-slate-600' },
  cancelled: { label: '已取消', className: 'bg-rose-50 text-rose-500' },
  no_show: { label: '未到店', className: 'bg-slate-100 text-slate-500' },
} satisfies Record<CustomerCenterBooking['status'], { label: string; className: string }>

function dateTime(value: string) {
  return format(parseISO(value), 'M 月 d 日（EEE）HH:mm', { locale: zhTW })
}

function BookingCard({ booking }: { booking: CustomerCenterBooking }) {
  const status = statusMeta[booking.status]
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', status.className)}>
            {status.label}
          </span>
          <h3 className="mt-3 truncate text-lg font-semibold text-slate-900">{booking.service.name}</h3>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F1F7E7] text-[#6F9D2D]">
          <CalendarDays size={19} />
        </div>
      </div>
      <div className="mt-4 space-y-2.5 text-sm text-slate-600">
        <p className="flex items-center gap-2"><Clock3 size={15} className="text-slate-400" /> {dateTime(booking.startTime)}</p>
        <p className="flex items-center gap-2"><UserRound size={15} className="text-slate-400" /> {booking.practitioner.name}</p>
      </div>
      {booking.voucher && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-[#F7FAF1] px-3.5 py-3 text-xs font-medium text-[#64852E]">
          <TicketCheck size={15} />
          {booking.voucher.status === 'redeemed' ? '已使用' : '已保留'}「{booking.voucher.productName}」1 堂
        </div>
      )}
    </article>
  )
}

function VoucherCard({ voucher }: { voucher: CustomerCenterVoucher }) {
  const expired = Boolean(voucher.expiresOn && voucher.expiresOn < new Date().toLocaleDateString('en-CA'))
  const unavailable = voucher.status === 'voided' || expired
  const available = voucher.items.reduce((sum, item) => sum + item.availableQuantity, 0)

  return (
    <article className={cn(
      'relative overflow-hidden rounded-[28px] border p-5 shadow-sm',
      unavailable ? 'border-slate-200 bg-slate-50' : 'border-[#D9E9BD] bg-[#F7FAF1]',
    )}>
      <div className="absolute -left-3 top-[92px] h-6 w-6 rounded-full bg-slate-50" />
      <div className="absolute -right-3 top-[92px] h-6 w-6 rounded-full bg-slate-50" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.18em] text-slate-400">BOOKR PASS</p>
          <h3 className="mt-1.5 text-lg font-semibold text-slate-900">{voucher.productName}</h3>
          <p className="mt-1 font-mono text-sm font-semibold text-[#64852E]">
            {unavailable ? (voucher.status === 'voided' ? '已作廢' : '已到期') : `還有 ${available} 堂可用`}
          </p>
        </div>
        <Gift size={22} className={unavailable ? 'text-slate-300' : 'text-[#75A438]'} />
      </div>

      <div className="my-4 border-t border-dashed border-slate-300" />

      <div className="space-y-3">
        {voucher.items.map(item => {
          const used = Math.max(0, item.totalQuantity - item.availableQuantity - item.reservedQuantity)
          return (
            <div key={item.id}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-slate-600">{item.serviceName}</span>
                <span className="shrink-0 font-mono font-semibold text-slate-800">
                  {item.availableQuantity} / {item.totalQuantity} 堂
                </span>
              </div>
              <div className="flex gap-1" aria-label={`已使用 ${used} 堂，已預約 ${item.reservedQuantity} 堂`}>
                {Array.from({ length: item.totalQuantity }, (_, index) => (
                  <span
                    key={index}
                    className={cn(
                      'h-1.5 flex-1 rounded-full',
                      index < used
                        ? 'bg-slate-300'
                        : index < used + item.reservedQuantity
                          ? 'bg-[#D8BE87]'
                          : 'bg-[#83B842]',
                    )}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex justify-between border-t border-slate-200 pt-3 text-xs text-slate-400">
        <span>購買日 {voucher.purchasedOn}</span>
        <span>{voucher.expiresOn ? `有效至 ${voucher.expiresOn}` : '永久有效'}</span>
      </div>
    </article>
  )
}

function MessageState({ result, storeId }: { result: Exclude<CustomerCenterLoadResult, { kind: 'ready' }>; storeId: string }) {
  const isOutside = result.kind === 'outside_line'
  const isUnlinked = result.kind === 'unlinked'
  const title = isUnlinked
    ? '尚未連結客戶資料'
    : isOutside
      ? '請從 LINE 開啟'
      : '客戶中心暫時無法開啟'
  const message = isOutside
    ? '為了保護您的預約資料，請從店家 LINE 官方帳號開啟客戶中心。'
    : isUnlinked
      ? '目前的 LINE 帳號還沒有連結客戶資料，完成一次 LINE 預約後即可查看。'
      : result.message

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F8F5] px-6 py-12">
      <div className="w-full max-w-sm rounded-[32px] border border-slate-200 bg-white p-7 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-[#EFF6E3] text-[#6F9D2D]">
          {isUnlinked ? <UserRound size={25} /> : <ShieldCheck size={25} />}
        </div>
        <h1 className="mt-5 text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
        {isUnlinked && (
          <Link to={`/book/${storeId}`} className="mt-5 block">
            <Button className="w-full">前往預約 <ChevronRight size={16} /></Button>
          </Link>
        )}
      </div>
    </main>
  )
}

export default function CustomerCenterPage() {
  const { storeId = '' } = useParams<{ storeId: string }>()
  const [result, setResult] = useState<CustomerCenterLoadResult | null>(null)
  const [activeTab, setActiveTab] = useState<'bookings' | 'vouchers'>('bookings')

  useEffect(() => {
    let active = true
    void loadCustomerCenter(storeId).then(next => {
      if (active) setResult(next)
    })
    return () => { active = false }
  }, [storeId])

  const { upcoming, history } = useMemo(() => {
    const bookings = result?.kind === 'ready' ? result.data.bookings : []
    const now = new Date()
    return {
      upcoming: bookings.filter(booking => (
        isAfter(parseISO(booking.startTime), now)
        && !['completed', 'cancelled', 'no_show'].includes(booking.status)
      )).sort((a, b) => a.startTime.localeCompare(b.startTime)),
      history: bookings.filter(booking => (
        !isAfter(parseISO(booking.startTime), now)
        || ['completed', 'cancelled', 'no_show'].includes(booking.status)
      )).sort((a, b) => b.startTime.localeCompare(a.startTime)),
    }
  }, [result])

  if (!result) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F7F8F5]"><Spinner size="lg" /></div>
  }
  if (result.kind !== 'ready') return <MessageState result={result} storeId={storeId} />

  const vouchers = result.data.vouchers
  const activeVoucherCount = vouchers.filter(voucher => (
    voucher.status === 'active'
    && (!voucher.expiresOn || voucher.expiresOn >= new Date().toLocaleDateString('en-CA'))
    && voucher.items.some(item => item.availableQuantity > 0)
  )).length

  return (
    <div className="min-h-screen bg-[#F7F8F5] pb-10 text-slate-900">
      <header className="bg-[#1F211C] px-5 pb-8 pt-[max(24px,env(safe-area-inset-top))] text-white">
        <div className="mx-auto max-w-lg">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {result.data.store.logoUrl ? (
                <img src={result.data.store.logoUrl} alt="" className="h-11 w-11 rounded-2xl object-cover" />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"><Leaf size={21} /></div>
              )}
              <div className="min-w-0">
                <p className="truncate text-xs text-white/55">{result.data.store.name}</p>
                <h1 className="truncate text-xl font-semibold">嗨，{result.data.client.name}</h1>
              </div>
            </div>
            {result.session.pictureUrl && (
              <img src={result.session.pictureUrl} alt="LINE 頭像" className="h-10 w-10 rounded-full border-2 border-white/20 object-cover" />
            )}
          </div>
          <p className="mt-5 text-sm leading-6 text-white/60">預約行程與剩餘堂數，都整理在這裡。</p>
          {result.data.store.address && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-white/45"><MapPin size={13} /> {result.data.store.address}</p>
          )}
        </div>
      </header>

      <main className="mx-auto -mt-4 max-w-lg px-4">
        <div className="grid grid-cols-2 rounded-[24px] border border-slate-200 bg-white p-1.5 shadow-sm">
          <Button
            variant="ghost"
            className={cn('rounded-[18px] py-3', activeTab === 'bookings' && 'bg-black text-white hover:bg-black')}
            onClick={() => setActiveTab('bookings')}
          >
            <CalendarDays size={16} /> 我的預約
          </Button>
          <Button
            variant="ghost"
            className={cn('rounded-[18px] py-3', activeTab === 'vouchers' && 'bg-black text-white hover:bg-black')}
            onClick={() => setActiveTab('vouchers')}
          >
            <Gift size={16} /> 我的商品券
            {activeVoucherCount > 0 && <span className="rounded-full bg-[#8FC34A] px-1.5 text-[10px] text-white">{activeVoucherCount}</span>}
          </Button>
        </div>

        {activeTab === 'bookings' ? (
          <div className="mt-6 space-y-7">
            <section>
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={16} className="text-[#75A438]" /> 接下來的預約</h2>
                <span className="font-mono text-xs text-slate-400">{upcoming.length} 筆</span>
              </div>
              <div className="space-y-3">
                {upcoming.length
                  ? upcoming.map(booking => <BookingCard key={booking.id} booking={booking} />)
                  : <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/60 px-5 py-10 text-center text-sm text-slate-400">目前沒有即將到來的預約</div>}
              </div>
            </section>

            {history.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold text-slate-500"><History size={16} /> 過往預約</div>
                <div className="space-y-3">{history.map(booking => <BookingCard key={booking.id} booking={booking} />)}</div>
              </section>
            )}
          </div>
        ) : (
          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Gift size={16} className="text-[#75A438]" /> 商品券餘額</h2>
              <span className="font-mono text-xs text-slate-400">{vouchers.length} 張</span>
            </div>
            <div className="space-y-3">
              {vouchers.length
                ? vouchers.map(voucher => <VoucherCard key={voucher.id} voucher={voucher} />)
                : <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/60 px-5 py-10 text-center text-sm text-slate-400">目前沒有商品券</div>}
            </div>
          </section>
        )}

        <Link to={`/book/${result.data.store.id}`} className="mt-7 block">
          <Button className="w-full py-3.5">預約下一堂 <ChevronRight size={17} /></Button>
        </Link>
        <p className="mt-3 text-center text-[11px] text-slate-400">資料僅供查看，如需異動請聯絡店家。</p>
      </main>
    </div>
  )
}
