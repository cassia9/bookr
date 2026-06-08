# 組件庫使用指南

**版本**: 1.0  
**更新日期**: 2026-06-08  
**相關文檔**: [COMPONENT_ARCHITECTURE.md](./COMPONENT_ARCHITECTURE.md) | [DESIGN_GUIDELINES.md](./DESIGN_GUIDELINES.md)

---

## 🎯 快速開始

### 導入組件
```tsx
// 基礎組件
import Button from '@/components/ui/buttons/Button'
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/cards/Card'
import FormField from '@/components/ui/forms/FormField'

// 功能組件
import PractitionerForm from '@/components/features/practitioners/PractitionerForm'
import PractitionerTable from '@/components/features/practitioners/PractitionerTable'
```

### 基本使用
```tsx
// Button
<Button variant="primary" size="md" onClick={handleClick}>
  保存
</Button>

// Card
<Card>
  <CardHeader>
    <h2>卡片標題</h2>
  </CardHeader>
  <CardBody>
    卡片內容
  </CardBody>
  <CardFooter>
    <Button>操作</Button>
  </CardFooter>
</Card>

// FormField
<FormField label="老師名字" required error={errors.name}>
  <Input 
    value={form.name} 
    onChange={(e) => setForm({ ...form, name: e.target.value })}
  />
</FormField>
```

---

## 📦 核心組件詳解

### 1. Button（按鈕）

#### Props
```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'  // 默認：primary
  size?: 'sm' | 'md' | 'lg'                     // 默認：md
  disabled?: boolean
  isLoading?: boolean
  onClick?: () => void
}
```

#### 變體
```tsx
// 主要按鈕 - 用於主要操作
<Button variant="primary">保存</Button>

// 次要按鈕 - 用於次要操作
<Button variant="secondary">取消</Button>

// 危險按鈕 - 用於刪除等危險操作
<Button variant="danger">刪除</Button>
```

#### 尺寸
```tsx
<Button size="sm">小</Button>
<Button size="md">中</Button>      {/* 默認 */}
<Button size="lg">大</Button>
```

#### 載入狀態
```tsx
<Button isLoading={isSubmitting}>
  {isSubmitting ? '保存中...' : '保存'}
</Button>
```

#### ✅ 設計實現
- 背景色：`primary: black` | `secondary: slate-100` | `danger: red-100`
- 文字色：`primary: white` | `secondary: slate-900` | `danger: red-700`
- 邊框：無（primary） | slate-200（secondary）| 無（danger）
- Hover：加深背景色，增加陰影
- Focus：`ring-2 ring-offset-2 ring-black`（primary） | `ring-slate-300`（secondary）
- Active：`scale-95` 縮放效果
- Disabled：`opacity-50 cursor-not-allowed`

---

### 2. Card（卡片）

#### 結構
```tsx
<Card>
  <CardHeader>       {/* 可選 */}
    <h2>標題</h2>
  </CardHeader>
  <CardBody>         {/* 主要內容 */}
    內容區域
  </CardBody>
  <CardFooter>       {/* 可選 */}
    <Button>操作</Button>
  </CardFooter>
</Card>
```

#### Props
```tsx
interface CardProps {
  variant?: 'default' | 'stats' | 'data'  // 默認：default
  shadow?: 'sm' | 'md' | 'lg'              // 默認：sm
  interactive?: boolean                    // 添加 hover 效果
  className?: string
  children: React.ReactNode
}
```

#### 使用場景
```tsx
// 默認卡片 - 一般容器
<Card>
  <CardBody>普通卡片內容</CardBody>
</Card>

// 統計卡片 - 展示數據
<Card variant="stats">
  <CardBody>
    <p className="text-sm text-slate-600">總數</p>
    <p className="text-3xl font-bold text-slate-900">1,234</p>
  </CardBody>
</Card>

// 可交互卡片 - 可點擊
<Card interactive onClick={handleSelect}>
  <CardBody>點擊我</CardBody>
</Card>
```

#### ✅ 設計實現
- 背景：white (`bg-white`)
- 邊框：1px slate-200 (`border border-slate-200`)
- 圓角：16px (`rounded-lg`)
- 內間距：`p-6`
- 陰影：`shadow-sm` | 預設 Hover → `shadow-md`
- Interactive：`cursor-pointer hover:shadow-md transition-shadow`

---

### 3. FormField（表單字段容器）

#### Props
```tsx
interface FormFieldProps {
  label: string
  error?: string
  required?: boolean
  hint?: string
  disabled?: boolean
  children: React.ReactNode
}
```

#### 基本使用
```tsx
<FormField label="郵箱" required error={errors.email}>
  <Input 
    type="email"
    value={form.email}
    onChange={(e) => setForm({ ...form, email: e.target.value })}
  />
</FormField>
```

#### 帶提示文本
```tsx
<FormField 
  label="密碼"
  hint="至少 8 個字符"
  error={errors.password}
>
  <Input type="password" />
</FormField>
```

#### ✅ 設計實現
- 標籤：`text-sm font-medium text-slate-900 mb-2`
- 必填標記：紅色星號 (`text-red-500`)
- 提示文本：`text-xs text-slate-500 mt-1`
- 錯誤文本：`text-xs text-red-600 mt-1`
- 禁用狀態：`opacity-50 cursor-not-allowed`

---

### 4. Input（輸入框）

#### Props
```tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
  disabled?: boolean
  prefix?: React.ReactNode
  suffix?: React.ReactNode
}
```

#### 基本使用
```tsx
<Input 
  type="text"
  placeholder="輸入名字"
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>
```

#### 帶前綴/後綴
```tsx
// 帶圖標前綴
<Input 
  prefix={<Search className="w-4 h-4" />}
  placeholder="搜尋..."
/>

// 帶驗證狀態
<Input 
  error={!!errors.email}
  value={email}
/>
```

#### ✅ 設計實現
- 背景：white (`bg-white`)
- 邊框：1px slate-200 (`border border-slate-200`)
- 圓角：8px (`rounded-lg`)
- 內間距：`px-4 py-2.5`
- Focus：`ring-2 ring-black ring-offset-2`
- 文字色：slate-900 | Placeholder → slate-400
- Error：邊框改為紅色 (`border-red-500`)

---

### 5. Select（下拉選擇）

#### Props
```tsx
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: boolean
  options: Array<{ value: string; label: string }>
}
```

#### 基本使用
```tsx
<Select
  value={status}
  onChange={(e) => setStatus(e.target.value)}
  options={[
    { value: 'all', label: '全部' },
    { value: 'active', label: '活躍' },
    { value: 'inactive', label: '停用' }
  ]}
/>
```

#### ✅ 設計實現
- 與 Input 統一風格
- 背景：white + 下拉指示符
- Focus 環：`ring-2 ring-black ring-offset-2`

---

### 6. Checkbox（複選框）

#### Props
```tsx
interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  checked?: boolean
  onChange?: (checked: boolean) => void
}
```

#### 基本使用
```tsx
<Checkbox
  label="我同意服務條款"
  checked={agreed}
  onChange={(checked) => setAgreed(checked)}
/>
```

#### ✅ 設計實現
- 未選中：`w-5 h-5 border-2 border-slate-300 rounded-md`
- 選中：`bg-black border-black`
- Hover：`shadow-sm transition-all`
- 禁用：`opacity-50 cursor-not-allowed`

---

### 7. Badge（標籤）

#### Props
```tsx
interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  children: React.ReactNode
}
```

#### 使用
```tsx
<Badge variant="success">已確認</Badge>
<Badge variant="warning">待確認</Badge>
<Badge variant="error">已取消</Badge>
<Badge variant="info">已完課</Badge>
```

#### ✅ 設計實現
- Success：`bg-green-100 text-green-700 border border-green-200`
- Warning：`bg-amber-100 text-amber-700 border border-amber-200`
- Error：`bg-red-100 text-red-700 border border-red-200`
- Info：`bg-blue-100 text-blue-700 border border-blue-200`
- Default：`bg-slate-100 text-slate-700 border border-slate-200`

---

### 8. Modal（模態框）

#### Props
```tsx
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  size?: 'sm' | 'md' | 'lg'      // 默認：md
  children: React.ReactNode
}
```

#### 完整示例
```tsx
<Modal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  title="新增老師"
  subtitle="添加一位新的老師到系統"
  size="lg"
>
  <div className="space-y-4">
    <FormField label="名字" required>
      <Input />
    </FormField>
    {/* 更多字段... */}
  </div>
</Modal>
```

#### ✅ 設計實現
- 背景遮罩：`bg-black/40 backdrop-blur-sm`
- 容器：白色背景 + 圓角 + 陰影（`shadow-2xl`）
- 邊框：slate-200
- 大小：
  - sm: `max-w-sm`（384px）
  - md: `max-w-2xl`（672px）
  - lg: `max-w-4xl`（896px）
- 頭部：標題 + 副標題 + 關閉按鈕
- 底部：通常為操作按鈕組

---

### 9. Alert（警告提示）

#### Props
```tsx
interface AlertProps {
  type: 'success' | 'warning' | 'error' | 'info'
  title?: string
  message: string
  action?: { label: string; onClick: () => void }
  onClose?: () => void
}
```

#### 使用
```tsx
<Alert
  type="error"
  title="出錯了"
  message="老師名字不能為空"
  onClose={() => setError(null)}
/>

<Alert
  type="success"
  message="保存成功！"
/>
```

#### ✅ 設計實現
- Success：綠色邊框 + 背景（`border-green-200 bg-green-50`）
- Error：紅色邊框 + 背景（`border-red-200 bg-red-50`）
- Warning：琥珀色邊框 + 背景（`border-amber-200 bg-amber-50`）
- Info：藍色邊框 + 背景（`border-blue-200 bg-blue-50`）

---

## 🔗 組件組合示例

### 完整表單
```tsx
<Card>
  <CardHeader>
    <h2>新增老師</h2>
  </CardHeader>
  <CardBody className="space-y-6">
    <FormField label="名字" required error={errors.name}>
      <Input 
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
    </FormField>

    <FormField label="狀態" required>
      <Select
        options={[
          { value: 'active', label: '活躍' },
          { value: 'inactive', label: '停用' }
        ]}
        value={form.status}
        onChange={(e) => setForm({ ...form, status: e.target.value })}
      />
    </FormField>

    <FormField label="描述">
      <textarea className="w-full px-4 py-2.5 border border-slate-200 rounded-lg" />
    </FormField>
  </CardBody>
  <CardFooter className="flex gap-3">
    <Button variant="secondary">取消</Button>
    <Button variant="primary">保存</Button>
  </CardFooter>
</Card>
```

### 數據列表
```tsx
<Card>
  <CardHeader>
    <h2>老師列表</h2>
  </CardHeader>
  <CardBody>
    <div className="space-y-2">
      {practitioners.map((p) => (
        <div
          key={p.id}
          className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <div>
            <p className="font-medium text-slate-900">{p.name}</p>
            <p className="text-sm text-slate-600">{p.profession}</p>
          </div>
          <Badge variant={p.is_active ? 'success' : 'error'}>
            {p.is_active ? '活躍' : '停用'}
          </Badge>
        </div>
      ))}
    </div>
  </CardBody>
</Card>
```

---

## 🚀 下一步

1. **開始提取組件**：按優先級 P0 逐個實現基礎組件
2. **建立 Storybook**（可選）：為組件庫建立互動文檔
3. **測試**：為每個組件編寫單元測試
4. **遷移現有頁面**：使用新組件庫重構現有頁面

---

**相關文件：**
- [COMPONENT_ARCHITECTURE.md](./COMPONENT_ARCHITECTURE.md) - 架構設計
- [DESIGN_GUIDELINES.md](./DESIGN_GUIDELINES.md) - 設計規則
