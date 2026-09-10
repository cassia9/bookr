import { useMemo, useState } from 'react'
import { Minus, Plus, RotateCcw, ShieldAlert } from 'lucide-react'
import {
  adjustClientVoucherItem,
  getAvailableQuantity,
  voidClientVoucher,
  type VoucherSaleWithRelations,
} from '../../lib/vouchers-api'
import Button from '../ui/Button'
import ConfirmModal from '../ui/ConfirmModal'
import FormField from '../ui/FormField'
import Input from '../ui/Input'
import Modal from '../ui/Modal'
import Select from '../ui/Select'
import { toast } from '../ui/Snackbar'
import Textarea from '../ui/Textarea'

function operationError(error: unknown) {
  const raw = error instanceof Error ? error.message : '操作失敗'
  const messages: Record<string, string> = {
    FORBIDDEN: '只有管理員可以調整或作廢商品券',
    INVALID_ADJUSTMENT: '請輸入調整堂數與原因',
    INSUFFICIENT_OR_INVALID_BALANCE: '扣除後的總堂數不能少於已使用或已預約堂數',
    REASON_REQUIRED: '請填寫作廢原因',
    VOUCHER_NOT_FOUND: '找不到這張商品券，請重新整理',
    VOUCHER_HAS_ACTIVITY: '已有使用或預約紀錄的商品券不能整張作廢；請改用堂數調整',
  }
  return messages[raw] ?? raw
}

export default function VoucherManageModal({
  open,
  sale,
  onClose,
  onChanged,
}: {
  open: boolean
  sale: VoucherSaleWithRelations
  onClose: () => void
  onChanged: () => void
}) {
  const [itemId, setItemId] = useState(sale.client_voucher_items[0]?.id ?? '')
  const [direction, setDirection] = useState<'add' | 'subtract'>('add')
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false)
  const [voiding, setVoiding] = useState(false)

  const selectedItem = useMemo(
    () => sale.client_voucher_items.find(item => item.id === itemId) ?? null,
    [itemId, sale.client_voucher_items],
  )
  const isVoided = sale.status === 'voided'

  async function handleAdjust() {
    const amount = Number(quantity)
    if (!itemId || !Number.isInteger(amount) || amount < 1 || !reason.trim()) {
      toast.error('請完成調整資料', '選擇課程、輸入正整數堂數，並填寫調整原因')
      return
    }

    setAdjusting(true)
    try {
      const available = await adjustClientVoucherItem(
        itemId,
        direction === 'add' ? amount : -amount,
        reason,
      )
      toast.success('商品券堂數已調整', `目前可用 ${available} 堂`)
      onChanged()
    } catch (error) {
      toast.error('無法調整商品券', operationError(error))
    } finally {
      setAdjusting(false)
    }
  }

  function requestVoid() {
    if (!voidReason.trim()) {
      toast.error('請填寫作廢原因')
      return
    }
    setVoidConfirmOpen(true)
  }

  async function handleVoid() {
    setVoiding(true)
    try {
      await voidClientVoucher(sale.id, voidReason)
      toast.success('商品券已作廢', sale.sale_number)
      setVoidConfirmOpen(false)
      onChanged()
    } catch (error) {
      toast.error('無法作廢商品券', operationError(error))
    } finally {
      setVoiding(false)
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="管理已售商品券"
        size="lg"
        footer={<Button variant="secondary" className="w-full" onClick={onClose}>關閉</Button>}
      >
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-[#FAFAF7] p-5">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-slate-400">{sale.sale_number}</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{sale.product_name_snapshot}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {sale.clients?.full_name ?? '客戶已刪除'} · 購買日 {sale.purchased_on}
            </p>
            <div className="mt-4 space-y-2 border-t border-dashed border-slate-200 pt-4">
              {sale.client_voucher_items.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-slate-600">{item.service_name_snapshot}</span>
                  <span className="shrink-0 font-mono text-xs font-semibold text-slate-800">
                    可用 {getAvailableQuantity(item)} · 預約 {item.reserved_quantity} · 已用 {item.used_quantity}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {!isVoided && (
            <section className="space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <RotateCcw size={16} className="text-lime-700" />
                  <h3 className="text-sm font-semibold text-slate-800">人工調整堂數</h3>
                </div>
                <p className="mt-1 text-xs text-slate-400">每次加減都會寫入商品券明細與稽核紀錄。</p>
              </div>

              <FormField label="調整課程" required>
                <Select
                  value={itemId}
                  onChange={setItemId}
                  options={sale.client_voucher_items.map(item => ({
                    value: item.id,
                    label: `${item.service_name_snapshot} · 可用 ${getAvailableQuantity(item)} 堂`,
                  }))}
                />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="調整方式" required>
                  <Select
                    value={direction}
                    onChange={value => setDirection(value as 'add' | 'subtract')}
                    options={[
                      { value: 'add', label: '增加堂數' },
                      { value: 'subtract', label: '扣除堂數' },
                    ]}
                  />
                </FormField>
                <FormField label="堂數" required hint={selectedItem ? `目前可用 ${getAvailableQuantity(selectedItem)} 堂` : undefined}>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={quantity}
                    onChange={event => setQuantity(event.target.value)}
                    prefix={direction === 'add' ? <Plus size={14} /> : <Minus size={14} />}
                    suffix={<span className="text-xs">堂</span>}
                  />
                </FormField>
              </div>

              <FormField label="調整原因" required>
                <Textarea
                  value={reason}
                  onChange={event => setReason(event.target.value)}
                  maxLength={1000}
                  placeholder="例：現場補登一堂、退款扣除一堂"
                />
              </FormField>

              <Button className="w-full" loading={adjusting} onClick={handleAdjust}>
                儲存堂數調整
              </Button>
            </section>
          )}

          <section className="border-t border-slate-200 pt-5">
            <div className="flex items-center gap-2 text-red-600">
              <ShieldAlert size={16} />
              <h3 className="text-sm font-semibold">作廢商品券</h3>
            </div>
            {isVoided ? (
              <div className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                已於 {sale.voided_at ? new Date(sale.voided_at).toLocaleString('zh-TW') : '先前'}作廢
                {sale.void_reason ? `：${sale.void_reason}` : ''}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-xs leading-5 text-slate-500">只有完全未使用、也沒有預約保留的商品券可整張作廢。</p>
                <FormField label="作廢原因" required>
                  <Textarea
                    value={voidReason}
                    onChange={event => setVoidReason(event.target.value)}
                    maxLength={1000}
                    placeholder="例：重複登記、全額退款"
                  />
                </FormField>
                <Button variant="danger" className="w-full" onClick={requestVoid}>作廢整張商品券</Button>
              </div>
            )}
          </section>
        </div>
      </Modal>

      <ConfirmModal
        open={voidConfirmOpen}
        onClose={() => setVoidConfirmOpen(false)}
        onConfirm={handleVoid}
        loading={voiding}
        title="確認作廢商品券"
        description={`作廢「${sale.product_name_snapshot}」後不可恢復，且無法再用於預約。原因：${voidReason}`}
        confirmLabel="確認作廢"
        variant="danger"
      />
    </>
  )
}
