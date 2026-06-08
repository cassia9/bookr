/**
 * Component Showcase - 組件庫展示頁
 *
 * 展示所有可用的 UI 組件及其變體
 * 訪問路由：/dev/components
 */

import { useState } from 'react'
import Button from '@/components/ui/buttons/Button'
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/cards/Card'
import FormField from '@/components/ui/forms/FormField'
import Input from '@/components/ui/forms/Input'
import Select, { SelectOption } from '@/components/ui/forms/Select'
import Checkbox from '@/components/ui/forms/Checkbox'
import Alert from '@/components/ui/feedback/Alert'
import Badge from '@/components/ui/feedback/Badge'
import Modal from '@/components/ui/modals/Modal'
import PageHeader from '@/components/ui/layout/PageHeader'
import { Copy, Check as CheckIcon } from 'lucide-react'

interface ComponentSection {
  id: string
  title: string
  description: string
}

const SECTIONS: ComponentSection[] = [
  { id: 'buttons', title: '按鈕 (Button)', description: '三種變體和多種尺寸' },
  { id: 'cards', title: '卡片 (Card)', description: '可組合的卡片容器' },
  { id: 'forms', title: '表單元素', description: 'FormField、Input、Select、Checkbox' },
  { id: 'feedback', title: '反饋組件', description: 'Alert 和 Badge' },
  { id: 'modals', title: '模態框 (Modal)', description: '不同尺寸的模態框' },
  { id: 'layout', title: '佈局 (PageHeader)', description: '頁面頭部組件' },
]

export default function ComponentShowcase() {
  const [activeSection, setActiveSection] = useState('buttons')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [checkboxValues, setCheckboxValues] = useState({
    agree: false,
    subscribe: false,
  })
  const [formValues, setFormValues] = useState({
    name: 'John Doe',
    status: 'active',
    message: 'This is a sample message',
  })
  const [alertType, setAlertType] = useState<'success' | 'error' | 'warning' | 'info'>('success')

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(id)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const CodeBlock = ({
    id,
    language = 'tsx',
    code,
  }: {
    id: string
    language?: string
    code: string
  }) => (
    <div className="relative bg-slate-900 rounded-lg p-4 text-sm font-mono text-slate-100 overflow-x-auto">
      <button
        onClick={() => copyToClipboard(code, id)}
        className="absolute top-2 right-2 p-2 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
        title="複製代碼"
      >
        {copiedCode === id ? (
          <CheckIcon className="w-4 h-4 text-green-500" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
      <pre>{code}</pre>
    </div>
  )

  const componentStatusOptions: SelectOption[] = [
    { value: 'active', label: '活躍' },
    { value: 'inactive', label: '停用' },
    { value: 'pending', label: '待確認' },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 頁面頭部 */}
      <PageHeader
        title="組件庫展示"
        subtitle="查看所有可用的 UI 組件及其用法"
      />

      <div className="flex gap-6 p-6">
        {/* 側邊欄 - 目錄 */}
        <aside className="w-48 flex-shrink-0">
          <div className="sticky top-6 bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h3 className="font-semibold text-sm text-slate-900">組件</h3>
            </div>
            <nav className="divide-y divide-slate-200">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    activeSection === section.id
                      ? 'bg-black text-white'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* 主內容 */}
        <main className="flex-1 max-w-4xl">
          {/* Button 組件 */}
          {activeSection === 'buttons' && (
            <Card>
              <CardHeader>
                <h2 className="text-2xl font-bold text-slate-900">Button 組件</h2>
                <p className="text-sm text-slate-600 mt-2">
                  多功能按鈕組件，支持三種變體和多種尺寸
                </p>
              </CardHeader>
              <CardBody className="space-y-8">
                {/* 變體演示 */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">變體 (Variant)</h3>
                  <div className="flex gap-3 flex-wrap">
                    <Button variant="primary">Primary 按鈕</Button>
                    <Button variant="secondary">Secondary 按鈕</Button>
                    <Button variant="danger">Danger 按鈕</Button>
                  </div>
                </div>

                {/* 尺寸演示 */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">尺寸 (Size)</h3>
                  <div className="flex gap-3 flex-wrap items-center">
                    <Button variant="primary" size="sm">小</Button>
                    <Button variant="primary" size="md">中</Button>
                    <Button variant="primary" size="lg">大</Button>
                  </div>
                </div>

                {/* 狀態演示 */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">狀態</h3>
                  <div className="flex gap-3 flex-wrap">
                    <Button variant="primary" isLoading>
                      載入中...
                    </Button>
                    <Button variant="primary" disabled>
                      禁用
                    </Button>
                  </div>
                </div>

                {/* 代碼示例 */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">使用範例</h3>
                  <CodeBlock
                    id="button-example"
                    code={`import Button from '@/components/ui/buttons/Button'

<Button variant="primary" size="md" onClick={handleClick}>
  保存
</Button>

<Button variant="secondary" disabled>
  取消
</Button>

<Button variant="danger" isLoading>
  刪除中...
</Button>`}
                  />
                </div>
              </CardBody>
            </Card>
          )}

          {/* Card 組件 */}
          {activeSection === 'cards' && (
            <Card>
              <CardHeader>
                <h2 className="text-2xl font-bold text-slate-900">Card 組件</h2>
                <p className="text-sm text-slate-600 mt-2">
                  可組合的卡片容器，支持 Header、Body、Footer
                </p>
              </CardHeader>
              <CardBody className="space-y-8">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">完整卡片</h3>
                  <Card>
                    <CardHeader>
                      <h4 className="font-semibold text-slate-900">卡片標題</h4>
                    </CardHeader>
                    <CardBody>
                      這是卡片的主要內容區域。可以放任何內容。
                    </CardBody>
                    <CardFooter className="flex gap-3">
                      <Button variant="secondary" size="sm">取消</Button>
                      <Button variant="primary" size="sm">確認</Button>
                    </CardFooter>
                  </Card>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">簡單卡片</h3>
                  <Card>
                    <CardBody>
                      只有內容，沒有 Header 和 Footer 的卡片。
                    </CardBody>
                  </Card>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">使用範例</h3>
                  <CodeBlock
                    id="card-example"
                    code={`import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/cards/Card'

<Card>
  <CardHeader>
    <h2>標題</h2>
  </CardHeader>
  <CardBody>
    內容
  </CardBody>
  <CardFooter>
    <Button>操作</Button>
  </CardFooter>
</Card>`}
                  />
                </div>
              </CardBody>
            </Card>
          )}

          {/* 表單組件 */}
          {activeSection === 'forms' && (
            <Card>
              <CardHeader>
                <h2 className="text-2xl font-bold text-slate-900">表單組件</h2>
                <p className="text-sm text-slate-600 mt-2">
                  FormField、Input、Select、Checkbox 等表單相關組件
                </p>
              </CardHeader>
              <CardBody className="space-y-8">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Input 輸入框</h3>
                  <FormField label="名字" required>
                    <Input
                      type="text"
                      placeholder="輸入名字"
                      value={formValues.name}
                      onChange={(e) =>
                        setFormValues({ ...formValues, name: e.target.value })
                      }
                    />
                  </FormField>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Select 下拉框</h3>
                  <FormField label="狀態">
                    <Select
                      options={componentStatusOptions}
                      value={formValues.status}
                      onChange={(e) =>
                        setFormValues({ ...formValues, status: e.target.value })
                      }
                    />
                  </FormField>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Checkbox 複選框</h3>
                  <div className="space-y-3">
                    <Checkbox
                      label="我同意服務條款"
                      checked={checkboxValues.agree}
                      onChange={(e) =>
                        setCheckboxValues({ ...checkboxValues, agree: e.target.checked })
                      }
                    />
                    <Checkbox
                      label="訂閱新聞通知"
                      checked={checkboxValues.subscribe}
                      onChange={(e) =>
                        setCheckboxValues({ ...checkboxValues, subscribe: e.target.checked })
                      }
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">使用範例</h3>
                  <CodeBlock
                    id="form-example"
                    code={`import FormField from '@/components/ui/forms/FormField'
import Input from '@/components/ui/forms/Input'
import Select from '@/components/ui/forms/Select'
import Checkbox from '@/components/ui/forms/Checkbox'

<FormField label="郵箱" required error={errors.email}>
  <Input type="email" />
</FormField>

<FormField label="狀態">
  <Select options={[...]} />
</FormField>

<Checkbox label="同意條款" />`}
                  />
                </div>
              </CardBody>
            </Card>
          )}

          {/* 反饋組件 */}
          {activeSection === 'feedback' && (
            <Card>
              <CardHeader>
                <h2 className="text-2xl font-bold text-slate-900">反饋組件</h2>
                <p className="text-sm text-slate-600 mt-2">
                  Alert 警告提示和 Badge 標籤組件
                </p>
              </CardHeader>
              <CardBody className="space-y-8">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Alert 警告提示</h3>
                  <div className="space-y-3">
                    <Alert type="success" message="操作成功完成！" />
                    <Alert type="error" title="出錯了" message="請檢查輸入的數據" />
                    <Alert type="warning" title="警告" message="此操作無法撤銷" />
                    <Alert type="info" message="提示信息" />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Badge 標籤</h3>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="success">已確認</Badge>
                    <Badge variant="warning">待確認</Badge>
                    <Badge variant="error">已取消</Badge>
                    <Badge variant="info">已完課</Badge>
                    <Badge variant="default">默認</Badge>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">使用範例</h3>
                  <CodeBlock
                    id="feedback-example"
                    code={`import Alert from '@/components/ui/feedback/Alert'
import Badge from '@/components/ui/feedback/Badge'

<Alert
  type="error"
  title="出錯了"
  message="請稍後重試"
  onClose={() => setError(null)}
/>

<Badge variant="success">成功</Badge>`}
                  />
                </div>
              </CardBody>
            </Card>
          )}

          {/* Modal 組件 */}
          {activeSection === 'modals' && (
            <Card>
              <CardHeader>
                <h2 className="text-2xl font-bold text-slate-900">Modal 模態框</h2>
                <p className="text-sm text-slate-600 mt-2">
                  可調整大小的模態框，支持 sm、md、lg 三種尺寸
                </p>
              </CardHeader>
              <CardBody className="space-y-8">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">打開模態框</h3>
                  <Button variant="primary" onClick={() => setShowModal(true)}>
                    打開 Modal
                  </Button>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">使用範例</h3>
                  <CodeBlock
                    id="modal-example"
                    code={`import Modal from '@/components/ui/modals/Modal'

<Modal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  title="新增老師"
  subtitle="添加一位新的老師到系統"
  size="lg"
>
  <div className="space-y-4">
    {/* 表單內容 */}
  </div>
</Modal>`}
                  />
                </div>
              </CardBody>
            </Card>
          )}

          {/* PageHeader 組件 */}
          {activeSection === 'layout' && (
            <Card>
              <CardHeader>
                <h2 className="text-2xl font-bold text-slate-900">PageHeader 組件</h2>
                <p className="text-sm text-slate-600 mt-2">
                  頁面頭部組件，包含標題、副標題和操作區域
                </p>
              </CardHeader>
              <CardBody className="space-y-8">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">演示</h3>
                  <p className="text-sm text-slate-600 mb-4">
                    此頁面頂部就是 PageHeader 的範例
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">使用範例</h3>
                  <CodeBlock
                    id="pageheader-example"
                    code={`import PageHeader from '@/components/ui/layout/PageHeader'

<PageHeader
  title="從業人員管理"
  subtitle="管理老師、課程指派和休假時間"
  action={<Button>新增</Button>}
/>`}
                  />
                </div>
              </CardBody>
            </Card>
          )}
        </main>
      </div>

      {/* Modal 演示 */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="模態框演示"
        subtitle="這是一個示例模態框"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-slate-700">
            這是模態框的內容。你可以在這裡放置任何組件，比如表單、卡片等。
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              關閉
            </Button>
            <Button variant="primary">確認</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
