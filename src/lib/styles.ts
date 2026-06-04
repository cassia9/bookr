/**
 * 共用 className 常數
 * 所有頁面的 input / select / textarea 請統一使用這裡的值
 */

export const inputCls =
  'w-full px-3 py-2.5 rounded-2xl border border-slate-200 text-sm outline-none ' +
  'focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition ' +
  'bg-slate-50 hover:bg-white focus:bg-white placeholder:text-slate-400'

export const inputErrorCls =
  'w-full px-3 py-2.5 rounded-2xl border border-red-400 text-sm outline-none ' +
  'focus:border-red-400 focus:ring-2 focus:ring-red-100 transition ' +
  'bg-white placeholder:text-slate-400'

export const selectCls = inputCls   // select 使用相同樣式

// ── 圓角等級（語意化 Token）───────────────────────────────────────────────
/**
 * 全站統一圓角系統。此處為語意化對應，對應 Tailwind 類名。
 *
 * 使用方式：
 *   import { radius } from '../../lib/styles'
 *   <div className={`bg-white ${radius.lg} border`}>...</div>
 *
 * Token        Tailwind 類名    px   用途
 * ──────────────────────────────────────────────────────────────────
 * radius.sm    rounded-xl       12   小型互動元素：icon button、chip、badge 容器
 * radius.md    rounded-2xl      16   標準元素：input、select、button、tag
 * radius.lg    rounded-3xl      24   容器元素：卡片、面板、表格容器、Modal
 * radius.pill  rounded-full     —    膠囊/圓形：頭像、Badge pill、Spinner
 */
export const radius = {
  sm:   'rounded-xl',
  md:   'rounded-2xl',
  lg:   'rounded-3xl',
  pill: 'rounded-full',
} as const

export type RadiusLevel = keyof typeof radius

// ── 陰影等級（語意化 Token）────────────────────────────────────────────────
/**
 * 全站統一陰影系統。值定義於 index.css @theme，此處為語意化對應。
 *
 * 使用方式：
 *   import { shadow } from '../../lib/styles'
 *   <div className={shadow.card}>...</div>
 *
 * Token       Tailwind 類名    用途
 * ─────────────────────────────────────────────────────────────
 * shadow.xs      shadow-sm    Active pill、Toggle thumb、inline chip
 * shadow.card    shadow-md    一般內容卡片、表格容器
 * shadow.panel   shadow-lg    側邊欄、抽屜型面板
 * shadow.float   shadow-xl    下拉選單、Snackbar、Tooltip 浮層
 * shadow.overlay shadow-2xl   Modal 彈窗（最高層級）
 */
export const shadow = {
  xs:      'shadow-sm',
  card:    'shadow-md',
  panel:   'shadow-lg',
  float:   'shadow-xl',
  overlay: 'shadow-2xl',
} as const

export type ShadowLevel = keyof typeof shadow

/** Booking 狀態對應文字 */
export const STATUS_LABEL: Record<string, string> = {
  pending:   '待確認',
  confirmed: '已確認',
  completed: '已完課',
  cancelled: '已取消',
  no_show:   '未到場',
}

/** Booking 狀態對應 Tailwind className */
export const STATUS_COLOR: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100  text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
  no_show:   'bg-red-100   text-red-500',
}
