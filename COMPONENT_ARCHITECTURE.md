# 組件庫架構與設計系統

**版本**: 1.0  
**更新日期**: 2026-06-08  
**狀態**: 規劃中

---

## 📁 推薦的文件夾結構

```
src/components/
├── ui/                          # 基礎 UI 組件
│   ├── buttons/
│   │   ├── Button.tsx           # 主要按鈕（Primary/Secondary/Danger）
│   │   └── IconButton.tsx       # 圖標按鈕
│   ├── modals/
│   │   ├── Modal.tsx            # 基礎模態框容器
│   │   ├── Drawer.tsx           # 側邊抽屜
│   │   └── Dialog.tsx           # 對話框
│   ├── cards/
│   │   ├── Card.tsx             # 基礎卡片
│   │   ├── StatsCard.tsx        # 統計卡片
│   │   └── DataCard.tsx         # 數據卡片
│   ├── tables/
│   │   ├── Table.tsx            # 基礎表格容器
│   │   ├── TableHeader.tsx      # 表頭
│   │   └── TableCell.tsx        # 表格單元格
│   ├── forms/
│   │   ├── FormField.tsx        # 表單字段容器
│   │   ├── Input.tsx            # 文本輸入框
│   │   ├── Select.tsx           # 下拉選擇
│   │   ├── Checkbox.tsx         # 複選框
│   │   └── ColorPicker.tsx      # 顏色選擇器
│   ├── feedback/
│   │   ├── Alert.tsx            # 警告提示
│   │   ├── Badge.tsx            # 標籤
│   │   └── Loading.tsx          # 載入動畫
│   └── layout/
│       ├── PageHeader.tsx       # 頁面頭部
│       ├── PageSection.tsx      # 頁面區塊
│       └── SearchBar.tsx        # 搜尋欄
│
├── features/                    # 功能模塊組件
│   ├── practitioners/
│   │   ├── PractitionerForm.tsx         # ✅ 已設計
│   │   ├── PractitionerTable.tsx        # ✅ 已設計
│   │   ├── PractitionerDrawer.tsx       # ✅ 已設計
│   │   └── PractitionerCard.tsx         # 待設計
│   ├── bookings/
│   │   ├── BookingTable.tsx             # 待設計
│   │   ├── BookingForm.tsx              # 待設計
│   │   ├── BookingStatus.tsx            # 待設計
│   │   └── BookingCard.tsx              # 待設計
│   └── clients/
│       ├── ClientTable.tsx              # 待設計
│       ├── ClientForm.tsx               # 待設計
│       └── ClientCard.tsx               # 待設計
│
└── layout/
    ├── Header.tsx
    ├── Sidebar.tsx
    └── Layout.tsx
```

---

## 🏗️ 組件層級系統

### 第一層：基礎原子組件（Atomic）
小、可複用、無邏輯的純 UI 組件

```
Button → IconButton → Badge
Input → Select → Checkbox
Card → Alert → Loading
```

**特點：**
- 不依賴業務邏輯
- 接受所有樣式作為 props
- 100% 無狀態或只有 UI 狀態

**示例：**
```tsx
// ui/Button.tsx
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'danger'
  size: 'sm' | 'md' | 'lg'
  disabled?: boolean
  children: React.ReactNode
  onClick?: () => void
}

export default function Button({ 
  variant = 'primary', 
  size = 'md', 
  ...props 
}: ButtonProps) {
  const baseClasses = 'font-medium rounded-lg transition-all duration-200'
  const variantClasses = {
    primary: 'bg-black text-white hover:bg-slate-900',
    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
    danger: 'bg-red-100 text-red-700 hover:bg-red-200'
  }
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base'
  }
  
  return (
    <button 
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`}
      {...props}
    />
  )
}
```

### 第二層：複合組件（Composite）
由多個基礎組件組成的組件

```
FormField (Input + Label + Error)
Card (Card + Title + Content + Footer)
Modal (Backdrop + Container + Header + Body + Footer)
```

**特點：**
- 組合多個原子組件
- 可能有簡單的內部狀態
- 提供便捷的 API

**示例：**
```tsx
// ui/FormField.tsx
interface FormFieldProps {
  label: string
  error?: string
  required?: boolean
  children: React.ReactNode
}

export default function FormField({ 
  label, 
  error, 
  required,
  children 
}: FormFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-900 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-sm text-red-600 mt-1">{error}</p>
      )}
    </div>
  )
}
```

### 第三層：功能組件（Feature）
特定功能的完整組件，可能包含業務邏輯

```
PractitionerForm → 新增/編輯老師
PractitionerTable → 老師列表
BookingCard → 預約卡片
```

**特點：**
- 包含完整業務邏輯
- 直接連接 Supabase
- 可能有複雜的狀態管理

**示例：**
```tsx
// features/practitioners/PractitionerForm.tsx
export default function PractitionerForm({ 
  practitionerId, 
  onSuccess 
}: PractitionerFormProps) {
  const [formData, setFormData] = useState(...)
  const [loading, setLoading] = useState(false)
  
  const handleSubmit = async (e: React.FormEvent) => {
    // 業務邏輯...
  }
  
  return (
    <Modal>
      <FormField label="老師名字" required>
        <Input value={formData.name} onChange={...} />
      </FormField>
      {/* ... */}
    </Modal>
  )
}
```

---

## 🎨 命名規範

### 組件文件名
```
PascalCase.tsx
├── Button.tsx           ✅ 正確
├── IconButton.tsx       ✅ 正確
├── button.tsx           ❌ 錯誤
└── ButtonComponent.tsx  ❌ 避免 "Component" 後綴
```

### Props 接口名
```
ComponentNameProps
├── ButtonProps          ✅ 正確
├── IconButtonProps      ✅ 正確
└── ButtonComponentProps ❌ 避免
```

### 文件夾命名
```
PascalCase（複數）
├── buttons/             ✅ 正確
├── modals/              ✅ 正確
└── form-fields/         ❌ 避免 kebab-case
```

### Variant 命名
```
variant: 'primary' | 'secondary' | 'danger' | 'success'
size: 'sm' | 'md' | 'lg' | 'xl'
status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
```

---

## 🔄 組件複用策略

### 規則 1：優先提取共同部分
當發現多個頁面有相同的 UI 模式時，立即提取為共用組件。

**例子：** 所有管理頁面都有相同的：
- 頂部標題欄 → `PageHeader.tsx`
- 統計卡片區域 → `StatsCard.tsx`
- 搜尋+篩選欄 → `SearchBar.tsx` + `FilterBar.tsx`

### 規則 2：Props 優於複製
寧可用 props 控制變體，也不要複製組件。

```tsx
// ✅ 好的做法
<Card variant="stats" title="總數" value={100} />
<Card variant="data" title="詳情" data={data} />

// ❌ 避免
<StatsCard title="總數" value={100} />
<DataCard title="詳情" data={data} />
```

### 規則 3：組件組合優於繼承
使用組件組合構建複雜 UI，而不是使用繼承。

```tsx
// ✅ 好的做法
<Card>
  <Card.Header>
    <h2>標題</h2>
  </Card.Header>
  <Card.Body>
    內容
  </Card.Body>
  <Card.Footer>
    <Button>操作</Button>
  </Card.Footer>
</Card>

// ❌ 避免
<AdvancedCard title="標題" body="內容" footer={...} />
```

---

## ✅ 核心組件清單

### 已完成（✅）
- [x] PractitionerForm - 新增/編輯老師表單
- [x] PractitionerTable - 老師列表表格
- [x] PractitionerDrawer - 老師詳情抽屜
- [x] Button - 基礎按鈕
- [x] StatsCard - 統計卡片

### 優先級 P0（立即）
- [ ] FormField - 表單字段容器
- [ ] Input - 文本輸入框
- [ ] Select - 下拉選擇
- [ ] Modal - 基礎模態框
- [ ] Card - 基礎卡片
- [ ] Table - 基礎表格
- [ ] Alert - 警告提示

### 優先級 P1（本週）
- [ ] ColorPicker - 顏色選擇器
- [ ] Badge - 標籤
- [ ] Loading - 載入動畫
- [ ] PageHeader - 頁面頭部
- [ ] Checkbox - 複選框

### 優先級 P2（本月）
- [ ] BookingTable - 預約列表
- [ ] ClientTable - 客戶列表
- [ ] SearchBar - 搜尋欄
- [ ] FilterBar - 篩選欄

---

## 🛣️ 後續頁面遷移路線圖

### Phase 1：基礎組件提取（1-2天）
將 PractitionerForm、Table、Drawer 的可複用部分提取為基礎組件。

### Phase 2：預約管理頁面遷移（2-3天）
使用新的組件庫重新設計 BookingsPage 和相關組件。

### Phase 3：其他頁面遷移（3-5天）
逐個遷移：
1. ClientsPage（客戶管理）
2. ServicesPage（課程管理）
3. DashboardPage（數據看板）
4. MembersPage（成員管理）

### Phase 4：最終統一（1-2天）
確保所有頁面風格一致，進行全局測試。

---

## 📚 文檔結構

- `DESIGN_GUIDELINES.md` - 設計原則和樣式規範
- `COMPONENT_ARCHITECTURE.md` - 組件架構（本文檔）
- `COMPONENT_LIBRARY.md` - 各組件的使用指南（待建立）
- `src/components/ui/README.md` - 基礎組件文檔
- `src/components/features/README.md` - 功能組件文檔

---

## 🎯 核心原則

1. **一致性優先** - 所有組件遵循統一的樣式語言
2. **易用性** - 組件 API 簡潔、文檔清晰
3. **可維護性** - 組件職責單一、依賴明確
4. **可擴展性** - 預留足夠的 props 用於變體
5. **性能** - 避免不必要的重新渲染

---

**下一步：** 根據本文檔提出的結構，開始提取和建立基礎組件庫。
