/**
 * Component Gallery — 本地預覽用，生產環境不會打包進去
 * 瀏覽：http://localhost:5173/dev/components
 */
import { useState } from 'react'
import {
  Scissors, Users, CheckCircle,
  Info, Trash2, Pencil, Plus, Star, Bell,
} from 'lucide-react'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Toggle from '../../components/ui/Toggle'
import Badge from '../../components/ui/Badge'
import Avatar from '../../components/ui/Avatar'
import { Card, CardHeader, CardBody } from '../../components/ui/Card'
import Spinner, { PageSpinner } from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import Select from '../../components/ui/Select'
import TimePicker from '../../components/ui/TimePicker'
import DatePicker from '../../components/ui/DatePicker'
import { toast } from '../../components/ui/Snackbar'
import { inputCls, STATUS_LABEL, STATUS_COLOR } from '../../lib/styles'
import { cn } from '../../lib/cn'

// ─── Sidebar nav items ────────────────────────────────────────────────────────
const SECTIONS = [
  'Button', 'Badge', 'Avatar', 'Toggle',
  'Input', 'Select', 'DatePicker', 'TimePicker', 'Card', 'Modal', 'Snackbar',
  'Spinner', 'EmptyState', 'Table', 'Status',
] as const
type Section = typeof SECTIONS[number]

export default function ComponentsPage() {
  const [active, setActive] = useState<Section>('Button')

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 bg-white border-r border-slate-100 shadow-md flex flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-200">
              <Star size={13} className="text-white" strokeWidth={1.5} />
            </div>
            <span className="text-sm font-semibold tracking-tight text-slate-900">元件庫</span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">Component Gallery</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {SECTIONS.map(s => (
            <button
              key={s}
              onClick={() => setActive(s)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-all',
                active === s
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800',
              )}
            >
              {s}
            </button>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-slate-100">
          <p className="text-xs text-slate-400">共 {SECTIONS.length} 個元件</p>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-1">{active}</h1>
          <p className="text-sm text-slate-400 mb-8">
            {DESCRIPTIONS[active]}
          </p>
          <SectionContent section={active} />
        </div>
      </main>
    </div>
  )
}

// ─── Section descriptions ──────────────────────────────────────────────────
const DESCRIPTIONS: Record<Section, string> = {
  Button:     'import Button from "@/components/ui/Button" — variants: primary / secondary / danger / ghost',
  Badge:      'import Badge from "@/components/ui/Badge" — variants: indigo / green / amber / red / slate / blue / violet / teal',
  Avatar:     'import Avatar from "@/components/ui/Avatar" — shape: circle / rounded, size: sm / md / lg / xl',
  Toggle:     'import Toggle from "@/components/ui/Toggle" — controlled component',
  Input:      '使用 inputCls 來自 "@/lib/styles" — 統一的輸入框樣式',
  Select:     'import Select from "@/components/ui/Select" — 自訂下拉，支援 color dot、focus 箭頭動畫、error state',
  DatePicker: 'import DatePicker from "@/components/ui/DatePicker" — 自訂日曆選擇器，週一起始，今天高亮，清除 / 今天快速鍵',
  TimePicker: 'import TimePicker from "@/components/ui/TimePicker" — 自訂時間選擇器，startHour/endHour/minuteStep 可設定',
  Card:       'import { Card, CardHeader, CardBody } from "@/components/ui/Card"',
  Modal:      'import Modal from "@/components/ui/Modal" — sizes: sm / md / lg',
  Snackbar:   'import { toast } from "@/components/ui/Snackbar" — success / error / warning / info',
  Spinner:    'import Spinner, { PageSpinner } from "@/components/ui/Spinner" — sizes: sm / md / lg',
  EmptyState: 'import EmptyState from "@/components/ui/EmptyState" — icon + title + description + action',
  Table:      '表格通用模式 — 圓角 rounded-2xl shadow-md，表頭 uppercase tracking-wide',
  Status:     '預約狀態 Badge — STATUS_LABEL / STATUS_COLOR 來自 "@/lib/styles"',
}

// ─── Section content ──────────────────────────────────────────────────────
function SectionContent({ section }: { section: Section }) {
  switch (section) {
    case 'Button':     return <ButtonSection />
    case 'Badge':      return <BadgeSection />
    case 'Avatar':     return <AvatarSection />
    case 'Toggle':     return <ToggleSection />
    case 'Input':      return <InputSection />
    case 'Select':     return <SelectSection />
    case 'DatePicker': return <DatePickerSection />
    case 'TimePicker': return <TimePickerSection />
    case 'Card':       return <CardSection />
    case 'Modal':      return <ModalSection />
    case 'Snackbar':   return <SnackbarSection />
    case 'Spinner':    return <SpinnerSection />
    case 'EmptyState': return <EmptyStateSection />
    case 'Table':      return <TableSection />
    case 'Status':     return <StatusSection />
    default:           return null
  }
}

// ─── Reusable preview block ──────────────────────────────────────────────────
function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="mb-8">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</p>
      <div className={cn('bg-white rounded-2xl border border-slate-100 shadow-sm p-6', className)}>
        {children}
      </div>
    </div>
  )
}

// ─── Button ──────────────────────────────────────────────────────────────────
function ButtonSection() {
  return (
    <>
      <Block title="Variants">
        <div className="flex flex-wrap gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
      </Block>
      <Block title="Sizes">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm"><Plus size={13} strokeWidth={2} />Small</Button>
          <Button size="md"><Plus size={15} strokeWidth={2} />Medium (default)</Button>
        </div>
      </Block>
      <Block title="States">
        <div className="flex flex-wrap gap-3">
          <Button loading>Loading…</Button>
          <Button disabled>Disabled</Button>
          <Button><Trash2 size={15} strokeWidth={1.5} />帶 Icon</Button>
        </div>
      </Block>
      <Block title="Icon-only action buttons（表格內）">
        <div className="flex gap-1">
          <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
            <Pencil size={15} strokeWidth={1.5} />
          </button>
          <button className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
            <Trash2 size={15} strokeWidth={1.5} />
          </button>
        </div>
      </Block>
    </>
  )
}

// ─── Badge ───────────────────────────────────────────────────────────────────
function BadgeSection() {
  const variants = ['indigo', 'green', 'amber', 'red', 'slate', 'blue', 'violet', 'teal'] as const
  return (
    <Block title="All variants">
      <div className="flex flex-wrap gap-2">
        {variants.map(v => <Badge key={v} variant={v}>{v}</Badge>)}
      </div>
    </Block>
  )
}

// ─── Avatar ──────────────────────────────────────────────────────────────────
const PRACTITIONER_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#22c55e', '#14b8a6', '#0ea5e9']

function AvatarSection() {
  return (
    <>
      <Block title="Shape: circle / rounded">
        <div className="flex items-center gap-4">
          <Avatar name="王小明" color="#6366f1" shape="circle" size="md" />
          <Avatar name="王小明" color="#6366f1" shape="rounded" size="md" />
          <span className="text-sm text-slate-400">circle（客戶） vs rounded（從業人員）</span>
        </div>
      </Block>
      <Block title="Sizes">
        <div className="flex items-end gap-4">
          {(['sm','md','lg','xl'] as const).map(s => (
            <div key={s} className="flex flex-col items-center gap-2">
              <Avatar name="王" color="#6366f1" size={s} shape="rounded" />
              <span className="text-xs text-slate-400">{s}</span>
            </div>
          ))}
        </div>
      </Block>
      <Block title="從業人員顏色系統">
        <div className="flex flex-wrap gap-3">
          {PRACTITIONER_COLORS.map((c, i) => (
            <Avatar key={c} name={`從業人員 ${i + 1}`} color={c} shape="rounded" size="md" />
          ))}
        </div>
      </Block>
      <Block title="無顏色（tailwind class）">
        <div className="flex items-center gap-3">
          <Avatar name="陳怡君" bgClass="bg-indigo-100" textClass="text-indigo-700" shape="circle" />
          <Avatar name="林小美" bgClass="bg-violet-100" textClass="text-violet-700" shape="circle" />
          <Avatar name="王大明" bgClass="bg-teal-100" textClass="text-teal-700" shape="circle" />
        </div>
      </Block>
    </>
  )
}

// ─── Toggle ──────────────────────────────────────────────────────────────────
function ToggleSection() {
  const [a, setA] = useState(true)
  const [b, setB] = useState(false)
  return (
    <>
      <Block title="States">
        <div className="space-y-4">
          <div className="flex items-center justify-between max-w-xs py-1 px-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-sm font-medium text-slate-700">已開啟</span>
            <Toggle checked={a} onChange={setA} />
          </div>
          <div className="flex items-center justify-between max-w-xs py-1 px-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-sm font-medium text-slate-700">已關閉</span>
            <Toggle checked={b} onChange={setB} />
          </div>
          <div className="flex items-center justify-between max-w-xs py-1 px-3 rounded-xl bg-slate-50 border border-slate-100 opacity-50">
            <span className="text-sm font-medium text-slate-700">Disabled</span>
            <Toggle checked={true} onChange={() => {}} disabled />
          </div>
        </div>
      </Block>
    </>
  )
}

// Tiny stateful wrappers so InputSection stays a plain function
function TimePickerInline() {
  const [t, setT] = useState('')
  return <TimePicker value={t} onChange={setT} />
}

function DatePickerInline() {
  const [d, setD] = useState(new Date().toISOString().slice(0, 10))
  return <DatePicker value={d} onChange={setD} />
}

function NativeSelectDemo() {
  const [val, setVal] = useState('')
  return (
    <div className="max-w-sm">
      <Select
        value={val}
        onChange={setVal}
        options={[
          { value: '1', label: '選項一' },
          { value: '2', label: '選項二' },
        ]}
        placeholder="選擇選項"
      />
    </div>
  )
}

// ─── Input ───────────────────────────────────────────────────────────────────
function InputSection() {
  return (
    <>
      <Block title="Text input">
        <div className="space-y-3 max-w-sm">
          <input className={inputCls} placeholder="請輸入文字" />
          <input className={inputCls} defaultValue="已填入的值" />
        </div>
      </Block>
      <Block title="With label">
        <div className="space-y-1.5 max-w-sm">
          <label className="block text-sm font-medium text-slate-700">課程名稱 *</label>
          <input className={inputCls} placeholder="例：60 分鐘全身伸展" />
        </div>
      </Block>
      <Block title="Error state">
        <div className="space-y-1 max-w-sm">
          <input className={cn(inputCls, 'border-red-400 focus:border-red-400 focus:ring-red-100')} defaultValue="錯誤輸入" />
          <p className="text-xs text-red-500">請填寫必要欄位</p>
        </div>
      </Block>
      <Block title="Select（自訂元件）">
        <NativeSelectDemo />
      </Block>
      <Block title="Textarea">
        <textarea className={inputCls + ' max-w-sm resize-none'} rows={3} placeholder="備注（選填）" />
      </Block>
      <Block title="Date / Time">
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <DatePickerInline />
          <TimePickerInline />
        </div>
      </Block>
      <Block title="Number">
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <input type="number" min={0} step={100} className={inputCls} placeholder="定價" />
          <input type="number" min={15} step={15} className={inputCls} placeholder="時長" />
        </div>
      </Block>
    </>
  )
}

// ─── Select ──────────────────────────────────────────────────────────────────
function SelectSection() {
  const [basic, setBasic] = useState('')
  const [withColor, setWithColor] = useState('')
  const [errVal, setErrVal] = useState('')
  const [showError, setShowError] = useState(false)

  const courseOptions = [
    { value: '1', label: '60 分鐘全身舒壓按摩' },
    { value: '2', label: '90 分鐘深層伸展' },
    { value: '3', label: '美白煥膚療程｜60min' },
    { value: '4', label: '頭肩頸舒壓｜45min' },
  ]
  const practitionerOptions = [
    { value: 'p1', label: '王小明 · 伸展師', color: '#6366f1' },
    { value: 'p2', label: '陳怡君 · 按摩師', color: '#ec4899' },
    { value: 'p3', label: '林大偉 · 美容師', color: '#22c55e' },
    { value: 'p4', label: '張美惠 · 伸展師', color: '#f97316' },
  ]

  return (
    <>
      <Block title="Basic">
        <div className="max-w-xs space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">選擇課程</label>
          <Select
            value={basic}
            onChange={setBasic}
            options={courseOptions}
            placeholder="請選擇課程"
          />
          {basic && <p className="text-xs text-slate-400">已選：{courseOptions.find(o => o.value === basic)?.label}</p>}
        </div>
      </Block>

      <Block title="With color dot（從業人員）">
        <div className="max-w-xs space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">指定人員</label>
          <Select
            value={withColor}
            onChange={setWithColor}
            options={practitionerOptions}
            placeholder="不指定人員"
          />
        </div>
      </Block>

      <Block title="Error state">
        <div className="max-w-xs space-y-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">課程 *</label>
            <Select
              value={errVal}
              onChange={v => { setErrVal(v); setShowError(false) }}
              options={courseOptions}
              placeholder="請選擇課程"
              error={showError && !errVal}
            />
            {showError && !errVal && <p className="text-xs text-red-500">請選擇課程</p>}
          </div>
          <Button variant="secondary" onClick={() => setShowError(true)}>觸發驗證</Button>
        </div>
      </Block>

      <Block title="Disabled">
        <div className="max-w-xs">
          <Select
            value="1"
            onChange={() => {}}
            options={courseOptions}
            disabled
          />
        </div>
      </Block>
    </>
  )
}

// ─── DatePicker ──────────────────────────────────────────────────────────────
function DatePickerSection() {
  const [d1, setD1] = useState('')
  const [d2, setD2] = useState(new Date().toISOString().slice(0, 10))
  const [d3, setD3] = useState('')
  const [showErr, setShowErr] = useState(false)

  return (
    <>
      <Block title="Basic（空值）">
        <div className="max-w-xs space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">預約日期</label>
          <DatePicker value={d1} onChange={setD1} />
          {d1 && <p className="text-xs text-slate-400">已選：{d1}</p>}
        </div>
      </Block>

      <Block title="Pre-selected（今天）">
        <div className="max-w-xs">
          <DatePicker value={d2} onChange={setD2} />
        </div>
      </Block>

      <Block title="Error state">
        <div className="max-w-xs space-y-3">
          <DatePicker
            value={d3}
            onChange={v => { setD3(v); setShowErr(false) }}
            error={showErr && !d3}
          />
          {showErr && !d3 && <p className="text-xs text-red-500">請選擇日期</p>}
          <Button variant="secondary" onClick={() => setShowErr(true)}>觸發驗證</Button>
        </div>
      </Block>

      <Block title="Disabled">
        <div className="max-w-xs">
          <DatePicker value="2026-06-01" onChange={() => {}} disabled />
        </div>
      </Block>
    </>
  )
}

// ─── TimePicker ──────────────────────────────────────────────────────────────
function TimePickerSection() {
  const [t1, setT1] = useState('')
  const [t2, setT2] = useState('14:00')
  const [t3, setT3] = useState('')
  const [showErr, setShowErr] = useState(false)

  return (
    <>
      <Block title="Basic">
        <div className="max-w-xs space-y-1.5">
          <label className="block text-sm font-medium text-slate-700">開始時間</label>
          <TimePicker value={t1} onChange={setT1} />
          {t1 && <p className="text-xs text-slate-400">已選：{t1}</p>}
        </div>
      </Block>

      <Block title="Pre-selected value">
        <div className="max-w-xs">
          <TimePicker value={t2} onChange={setT2} />
        </div>
      </Block>

      <Block title="Error state">
        <div className="max-w-xs space-y-3">
          <TimePicker
            value={t3}
            onChange={v => { setT3(v); setShowErr(false) }}
            error={showErr && !t3}
          />
          {showErr && !t3 && <p className="text-xs text-red-500">請選擇時間</p>}
          <Button variant="secondary" onClick={() => setShowErr(true)}>觸發驗證</Button>
        </div>
      </Block>

      <Block title="自訂範圍（每 30 分鐘）">
        <div className="max-w-xs">
          <TimePickerCustom />
        </div>
      </Block>

      <Block title="Disabled">
        <div className="max-w-xs">
          <TimePicker value="10:30" onChange={() => {}} disabled />
        </div>
      </Block>
    </>
  )
}

function TimePickerCustom() {
  const [t, setT] = useState('')
  return (
    <TimePicker
      value={t}
      onChange={setT}
      startHour={9}
      endHour={18}
      minuteStep={30}
      placeholder="09:00 – 18:00，每 30 分"
    />
  )
}

// ─── Card ────────────────────────────────────────────────────────────────────
function CardSection() {
  return (
    <>
      <Block title="Basic card">
        <Card className="max-w-sm">
          <CardBody>這是一張卡片</CardBody>
        </Card>
      </Block>
      <Block title="Card with header + action">
        <Card className="max-w-sm">
          <CardHeader
            title="課程管理"
            description="管理可預約的課程項目"
            action={<Button size="sm"><Plus size={13} />新增</Button>}
          />
          <CardBody className="text-sm text-slate-500">卡片內容區域</CardBody>
        </Card>
      </Block>
      <Block title="KPI card pattern">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '今日預約', value: '3', unit: '筆', iconCls: 'text-blue-500' },
            { label: '本月預約', value: '24', unit: '筆', iconCls: 'text-indigo-500' },
            { label: '完課營收', value: 'NT$ 48k', iconCls: 'text-emerald-500' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-2xl p-4 shadow-md border border-slate-100">
              <p className="text-xs font-medium text-slate-600 mb-2">{k.label}</p>
              <p className="text-2xl font-bold text-slate-900">
                {k.value}
                {k.unit && <span className="text-sm font-normal text-slate-500 ml-1">{k.unit}</span>}
              </p>
            </div>
          ))}
        </div>
      </Block>
      <Block title="Hoverable card">
        <Card hoverable className="max-w-xs p-4">
          <p className="text-sm font-medium text-slate-800">可點擊卡片</p>
          <p className="text-xs text-slate-400 mt-1">hover 時浮起</p>
        </Card>
      </Block>
    </>
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────
function ModalSection() {
  const [size, setSize] = useState<'sm' | 'md' | 'lg' | null>(null)
  return (
    <>
      <Block title="Sizes">
        <div className="flex gap-3">
          {(['sm', 'md', 'lg'] as const).map(s => (
            <Button key={s} variant="secondary" onClick={() => setSize(s)}>
              Open {s.toUpperCase()}
            </Button>
          ))}
        </div>
      </Block>
      <Modal open={!!size} onClose={() => setSize(null)} title={`Modal — ${size?.toUpperCase()}`} size={size ?? 'md'}>
        <p className="text-sm text-slate-600 mb-5">
          這是 <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">size="{size}"</code> 的 Modal。
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setSize(null)}>取消</Button>
          <Button className="flex-1" onClick={() => setSize(null)}>確認</Button>
        </div>
      </Modal>
    </>
  )
}

// ─── Snackbar ────────────────────────────────────────────────────────────────
function SnackbarSection() {
  return (
    <Block title="觸發各種狀態">
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => toast.success('預約已建立', '2026/06/01 14:00 · 全身舒壓按摩')}>
          <CheckCircle size={15} strokeWidth={1.5} /> Success
        </Button>
        <Button variant="danger" onClick={() => toast.error('建立失敗', '請確認必填欄位已填寫')}>
          Error
        </Button>
        <Button variant="secondary" onClick={() => toast.warning('請填寫必要欄位')}>
          Warning
        </Button>
        <Button variant="ghost" onClick={() => toast.info('系統維護通知', '將於今晚 23:00 進行例行維護')}>
          <Info size={15} strokeWidth={1.5} /> Info
        </Button>
        <Button variant="secondary" onClick={() => {
          toast.success('預約建立成功')
          setTimeout(() => toast.error('連線逾時，請重試'), 400)
          setTimeout(() => toast.warning('尚有 1 個欄位未填'), 800)
        }}>
          <Bell size={15} strokeWidth={1.5} /> 連發三則
        </Button>
      </div>
    </Block>
  )
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
function SpinnerSection() {
  return (
    <>
      <Block title="Sizes">
        <div className="flex items-center gap-6">
          {(['sm', 'md', 'lg'] as const).map(s => (
            <div key={s} className="flex flex-col items-center gap-2">
              <Spinner size={s} />
              <span className="text-xs text-slate-400">{s}</span>
            </div>
          ))}
        </div>
      </Block>
      <Block title="PageSpinner（整頁 loading）">
        <PageSpinner />
      </Block>
    </>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
function EmptyStateSection() {
  return (
    <>
      <Block title="Basic">
        <EmptyState
          icon={<Scissors size={40} strokeWidth={1.5} />}
          title="還沒有課程"
          description="點「新增課程」建立第一個課程"
        />
      </Block>
      <Block title="With action button">
        <EmptyState
          icon={<Users size={40} strokeWidth={1.5} />}
          title="還沒有客戶資料"
          description="新增第一位客戶開始管理預約"
          action={<Button><Plus size={15} strokeWidth={2} />新增客戶</Button>}
        />
      </Block>
    </>
  )
}

// ─── Table ───────────────────────────────────────────────────────────────────
function TableSection() {
  const rows = [
    { name: '全身舒壓按摩', duration: 60, price: 1800, active: true },
    { name: '90 分鐘深層伸展', duration: 90, price: 2500, active: true },
    { name: '美白煥膚療程', duration: 60, price: 2200, active: false },
  ]
  return (
    <Block title="標準表格模式" className="p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/80">
            <th className="text-left px-5 py-3.5 font-medium text-slate-500 text-xs uppercase tracking-wide">課程名稱</th>
            <th className="text-left px-5 py-3.5 font-medium text-slate-500 text-xs uppercase tracking-wide">時長</th>
            <th className="text-left px-5 py-3.5 font-medium text-slate-500 text-xs uppercase tracking-wide">定價</th>
            <th className="text-left px-5 py-3.5 font-medium text-slate-500 text-xs uppercase tracking-wide">上架</th>
            <th className="px-5 py-3.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map(r => (
            <tr key={r.name} className="hover:bg-slate-50/70 transition-colors">
              <td className="px-5 py-4">
                <p className={cn('font-medium', r.active ? 'text-slate-900' : 'text-slate-400')}>{r.name}</p>
              </td>
              <td className="px-5 py-4 text-slate-500 text-xs">{r.duration} 分鐘</td>
              <td className="px-5 py-4 text-slate-700 font-medium">NT$ {r.price.toLocaleString()}</td>
              <td className="px-5 py-4">
                <Toggle checked={r.active} onChange={() => {}} />
              </td>
              <td className="px-5 py-4">
                <div className="flex items-center justify-end gap-1">
                  <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                    <Pencil size={15} strokeWidth={1.5} />
                  </button>
                  <button className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors">
                    <Trash2 size={15} strokeWidth={1.5} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Block>
  )
}

// ─── Status ──────────────────────────────────────────────────────────────────
function StatusSection() {
  return (
    <>
      <Block title="Booking status badges">
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <span key={key} className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium', STATUS_COLOR[key])}>
              {label}
            </span>
          ))}
        </div>
      </Block>
      <Block title="Status in table context">
        <div className="space-y-2">
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-50 text-sm">
              <span className="text-slate-600 font-mono text-xs">{key}</span>
              <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', STATUS_COLOR[key])}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </Block>
    </>
  )
}
