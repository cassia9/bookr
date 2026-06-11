/**
 * ComponentsPage — 元件庫
 * 路由：/admin/components
 * 瀏覽所有 UI 元件，開發時先在這裡找可用元件
 */
import { useState } from 'react'
import { Search, Mail, Lock } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import Select from '@/components/ui/Select'
import DatePicker from '@/components/ui/DatePicker'
import TimePicker from '@/components/ui/TimePicker'
import Modal from '@/components/ui/Modal'
import Toggle from '@/components/ui/Toggle'
import Spinner from '@/components/ui/Spinner'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import FormField from '@/components/ui/FormField'
import Alert from '@/components/ui/Alert'
import SearchInput from '@/components/ui/SearchInput'
import Pagination from '@/components/ui/Pagination'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { toast } from '@/components/ui/Snackbar'

// ── 類別區塊元件 ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-200">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

// ── 主頁面 ───────────────────────────────────────────────────────────────────

export default function ComponentsPage() {
  const [selectVal, setSelectVal] = useState('')
  const [dateVal, setDateVal] = useState('')
  const [timeVal, setTimeVal] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toggleA, setToggleA] = useState(false)
  const [toggleB, setToggleB] = useState(true)
  const [inputVal, setInputVal] = useState('')
  const [searchVal, setSearchVal] = useState('')
  const [pagePage, setPagePage] = useState(1)

  const practitionerOptions = [
    { value: '1', label: '王小明', color: '#6366f1' },
    { value: '2', label: '李美華', color: '#f59e0b' },
    { value: '3', label: '陳大為', color: '#10b981' },
  ]

  const BADGE_VARIANTS: BadgeVariant[] = ['indigo', 'green', 'amber', 'red', 'slate', 'blue', 'violet', 'teal']

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 頁首 */}
      <div className="bg-white border-b border-slate-200 px-8 py-6 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">元件庫</h1>
        <p className="text-sm text-slate-500 mt-1">開發前請先在這裡找可用元件，避免重複製作相同元件</p>
      </div>

      <div className="max-w-3xl mx-auto px-8 py-8">

        {/* ── 1. Button ── */}
        <Section title="Button 按鈕">
          <Row label="Variant">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
          </Row>
          <Row label="Size">
            <Button size="sm">小按鈕 sm</Button>
            <Button size="md">中按鈕 md</Button>
          </Row>
          <Row label="States">
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </Row>
          <div className="bg-slate-900 p-4 rounded-2xl">
            <p className="text-xs text-slate-400 mb-3 uppercase tracking-wide">深色背景</p>
            <div className="flex gap-3">
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
          </div>
        </Section>

        {/* ── 2. Badge ── */}
        <Section title="Badge 標籤">
          <Row label="所有 Variant">
            {BADGE_VARIANTS.map(v => (
              <Badge key={v} variant={v}>{v}</Badge>
            ))}
          </Row>
          <Row label="預約狀態">
            <Badge variant="amber">待確認</Badge>
            <Badge variant="blue">已確認</Badge>
            <Badge variant="green">已完課</Badge>
            <Badge variant="red">已取消</Badge>
            <Badge variant="slate">未到場</Badge>
          </Row>
        </Section>

        {/* ── 3. Select ── */}
        <Section title="Select 下拉選單">
          <Row label="帶顏色（從業人員）">
            <div className="w-72">
              <Select
                value={selectVal}
                onChange={setSelectVal}
                options={practitionerOptions}
                placeholder="選擇從業人員"
              />
            </div>
          </Row>
          <Row label="一般選項">
            <div className="w-72">
              <Select
                value={selectVal}
                onChange={setSelectVal}
                options={[
                  { value: 'a', label: '瑜伽課 · 60分鐘' },
                  { value: 'b', label: '按摩課 · 90分鐘' },
                  { value: 'c', label: '冥想課 · 45分鐘' },
                ]}
                placeholder="選擇課程"
              />
            </div>
          </Row>
          <Row label="Disabled">
            <div className="w-72">
              <Select value="" onChange={() => {}} options={[]} disabled placeholder="已停用" />
            </div>
          </Row>
        </Section>

        {/* ── 4. DatePicker ── */}
        <Section title="DatePicker 日期選擇">
          <Row label="預設">
            <div className="w-56">
              <DatePicker value={dateVal} onChange={setDateVal} />
            </div>
          </Row>
          {dateVal && (
            <p className="text-sm text-slate-600">選擇的日期：<span className="font-semibold">{dateVal}</span></p>
          )}
        </Section>

        {/* ── 5. TimePicker ── */}
        <Section title="TimePicker 時間選擇">
          <Row label="預設（每15分鐘）">
            <div className="w-40">
              <TimePicker value={timeVal} onChange={setTimeVal} />
            </div>
          </Row>
          {timeVal && (
            <p className="text-sm text-slate-600">選擇的時間：<span className="font-semibold">{timeVal}</span></p>
          )}
        </Section>

        {/* ── 6. Modal ── */}
        <Section title="Modal 對話框">
          <Row label="開啟 Modal">
            <Button onClick={() => setModalOpen(true)}>開啟 Modal</Button>
          </Row>
          <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Modal 示例">
            <div className="space-y-4">
              <p className="text-sm text-slate-600">這是一個 Modal 對話框，支援 Escape 鍵關閉、點擊背景關閉。</p>
              <div className="bg-slate-50 rounded-2xl p-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">標題</span>
                  <span className="font-medium">預約詳情</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">狀態</span>
                  <Badge variant="blue">已確認</Badge>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>取消</Button>
                <Button variant="primary" className="flex-1" onClick={() => setModalOpen(false)}>確認</Button>
              </div>
            </div>
          </Modal>
        </Section>

        {/* ── 7. Input / Textarea / FormField ── */}
        <Section title="Input 輸入框 / Textarea / FormField">
          <Row label="Input 基本">
            <div className="w-72">
              <Input value={inputVal} onChange={e => setInputVal(e.target.value)} placeholder="輸入文字…" />
            </div>
            <div className="w-72">
              <Input value="" onChange={() => {}} placeholder="有錯誤狀態" error />
            </div>
          </Row>
          <Row label="Input 帶圖示">
            <div className="w-72">
              <Input value="" onChange={() => {}} placeholder="搜尋…" prefix={<Search size={14} />} />
            </div>
            <div className="w-72">
              <Input type="email" value="" onChange={() => {}} placeholder="Email" prefix={<Mail size={14} />} />
            </div>
            <div className="w-72">
              <Input type="password" value="" onChange={() => {}} placeholder="密碼" prefix={<Lock size={14} />} />
            </div>
          </Row>
          <Row label="Textarea">
            <div className="w-full">
              <Textarea placeholder="多行文字輸入…" rows={3} />
            </div>
          </Row>
          <Row label="FormField 組合">
            <div className="w-72 space-y-3">
              <FormField label="老師名字" required>
                <Input value="" onChange={() => {}} placeholder="例：林老師" />
              </FormField>
              <FormField label="備注" hint="選填" error="此欄位不能為空">
                <Input value="" onChange={() => {}} error />
              </FormField>
            </div>
          </Row>
        </Section>

        {/* ── 8. Alert ── */}
        <Section title="Alert 提示橫幅">
          <div className="space-y-2 w-full">
            <Alert variant="success">操作成功！課程已儲存。</Alert>
            <Alert variant="error" onClose={() => {}}>發生錯誤，請稍後再試。</Alert>
            <Alert variant="warning">注意：此時段已有其他預約。</Alert>
            <Alert variant="info" title="提示">點擊卡片可查看詳細預約資訊。</Alert>
          </div>
        </Section>

        {/* ── 9. SearchInput / Pagination ── */}
        <Section title="SearchInput 搜尋框 / Pagination 分頁">
          <Row label="SearchInput">
            <div className="w-72">
              <SearchInput value={searchVal} onChange={setSearchVal} placeholder="搜尋客戶或課程…" />
            </div>
          </Row>
          <Row label="Pagination">
            <Pagination page={pagePage} totalPages={8} onChange={setPagePage} />
          </Row>
        </Section>

        {/* ── 10. ConfirmModal ── */}
        <Section title="ConfirmModal 確認對話框">
          <Row label="刪除確認">
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>開啟確認框</Button>
          </Row>
          <ConfirmModal
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={() => { toast.info('已確認'); setConfirmOpen(false) }}
            title="確認刪除課程"
            description="該課程將被永久刪除，歷史預約記錄將保留但無法使用此課程。此操作無法撤銷。"
            confirmLabel="確認刪除"
          />
        </Section>

        {/* ── 11. Toggle ── */}
        <Section title="Toggle 開關">
          <Row label="狀態">
            <div className="flex items-center gap-3">
              <Toggle checked={toggleA} onChange={setToggleA} />
              <span className="text-sm text-slate-600">{toggleA ? '開啟' : '關閉'}</span>
            </div>
            <div className="flex items-center gap-3">
              <Toggle checked={toggleB} onChange={setToggleB} />
              <span className="text-sm text-slate-600">{toggleB ? '開啟' : '關閉'}</span>
            </div>
            <div className="flex items-center gap-3">
              <Toggle checked={true} onChange={() => {}} disabled />
              <span className="text-sm text-slate-400">Disabled</span>
            </div>
          </Row>
        </Section>

        {/* ── 8. Spinner ── */}
        <Section title="Spinner 載入指示">
          <Row label="尺寸">
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
          </Row>
        </Section>

        {/* ── 9. Toast / Snackbar ── */}
        <Section title="Toast 通知">
          <Row label="觸發">
            <Button variant="secondary" size="sm" onClick={() => toast.success('操作成功！', '預約已儲存')}>
              ✓ Success
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast.error('發生錯誤', '請稍後再試')}>
              ✗ Error
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast.warning('注意', '時間有所衝突')}>
              ⚠ Warning
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast.info('提示', '此操作已完成')}>
              ℹ Info
            </Button>
          </Row>
          <p className="text-xs text-slate-400">Toast 通知會出現在畫面右下角，3秒後自動消失</p>
        </Section>

        {/* ── 10. 顏色（設計系統） ── */}
        <Section title="設計系統色板">
          <div className="grid grid-cols-5 gap-3">
            {[
              { name: 'Black', bg: 'bg-black', text: 'text-white' },
              { name: 'Slate 900', bg: 'bg-slate-900', text: 'text-white' },
              { name: 'Slate 500', bg: 'bg-slate-500', text: 'text-white' },
              { name: 'Slate 200', bg: 'bg-slate-200', text: 'text-slate-800' },
              { name: 'Slate 50', bg: 'bg-slate-50', text: 'text-slate-700 border border-slate-200' },
              { name: 'Indigo 600', bg: 'bg-indigo-600', text: 'text-white' },
              { name: 'Indigo 100', bg: 'bg-indigo-100', text: 'text-indigo-700' },
              { name: 'Emerald 600', bg: 'bg-emerald-600', text: 'text-white' },
              { name: 'Amber 500', bg: 'bg-amber-500', text: 'text-white' },
              { name: 'Red 500', bg: 'bg-red-500', text: 'text-white' },
            ].map(c => (
              <div key={c.name} className={`${c.bg} ${c.text} rounded-xl p-3 text-xs font-medium`}>
                {c.name}
              </div>
            ))}
          </div>
        </Section>

        {/* ── 11. 圓角（設計系統） ── */}
        <Section title="圓角規範">
          <div className="flex flex-wrap gap-4">
            {[
              { name: 'rounded-lg (8px)', cls: 'rounded-lg' },
              { name: 'rounded-xl (12px)', cls: 'rounded-xl' },
              { name: 'rounded-2xl (16px)', cls: 'rounded-2xl' },
              { name: 'rounded-3xl (24px)', cls: 'rounded-3xl' },
              { name: 'rounded-full', cls: 'rounded-full' },
            ].map(r => (
              <div key={r.name} className={`${r.cls} bg-indigo-100 text-indigo-700 px-4 py-2 text-xs font-medium`}>
                {r.name}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            原則：輸入框 rounded-2xl，Modal rounded-3xl，小標籤 rounded-full，行動按鈕 rounded-2xl
          </p>
        </Section>

      </div>
    </div>
  )
}
