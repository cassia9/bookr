# 組件庫遷移計劃

**版本**: 1.0  
**更新日期**: 2026-06-08  
**狀態**: 進行中

---

## 📋 概述

本文檔描述如何將現有頁面逐步遷移到新的組件庫系統。遷移完成後，所有管理頁面都將使用統一的組件和設計系統。

---

## 🔄 遷移流程

### Phase 1：基礎組件庫構建（3-5 天）

**目標**：提取並實現所有 P0 級別的基礎組件

#### 任務列表
- [ ] 新建 `src/components/ui/buttons/Button.tsx`
- [ ] 新建 `src/components/ui/cards/Card.tsx`
- [ ] 新建 `src/components/ui/forms/FormField.tsx`
- [ ] 新建 `src/components/ui/forms/Input.tsx`
- [ ] 新建 `src/components/ui/forms/Select.tsx`
- [ ] 新建 `src/components/ui/forms/Checkbox.tsx`
- [ ] 新建 `src/components/ui/modals/Modal.tsx`
- [ ] 新建 `src/components/ui/feedback/Alert.tsx`
- [ ] 新建 `src/components/ui/feedback/Badge.tsx`
- [ ] 新建 `src/components/ui/layout/PageHeader.tsx`
- [ ] 為每個組件編寫文檔和示例

**輸出物**：
- 完整的基礎組件庫
- 每個組件的 README 文檔
- 組件樣式完全一致

---

### Phase 2：預約管理頁面遷移（2-3 天）

**目標**：使用新組件庫重構 BookingsPage、BookingManagement 等頁面

#### 現有分析
```
BookingsPage.tsx
├── 行事曆視圖（react-big-calendar）
├── 甘特圖視圖
├── 預約詳情彈窗
└── 新增預約表單
```

#### 遷移步驟
1. 提取現有的表單邏輯 → 新建 `BookingForm.tsx`
2. 提取現有的表格邏輯 → 新建 `BookingTable.tsx`
3. 提取預約卡片 → 新建 `BookingCard.tsx`
4. 使用新 Button、Modal、FormField 重構表單
5. 統一顏色、邊框、間距風格

#### 預計改動
```
src/components/features/bookings/
├── BookingForm.tsx          ← 新建
├── BookingTable.tsx         ← 新建
├── BookingCard.tsx          ← 新建
└── BookingStatus.tsx        ← 新建（狀態標籤）

src/pages/admin/
├── BookingsPage.tsx         ← 改造
└── BookingManagement.tsx    ← 改造
```

---

### Phase 3：其他頁面遷移（3-5 天）

**優先級順序**：

#### 優先級 1（高）：客戶管理
```
ClientsPage
├── 客戶列表表格
├── 新增/編輯客戶表單
└── 客戶詳情卡片

遷移成本：低（與老師管理類似）
預計時間：1 天
```

**具體任務**：
```tsx
// 1. 新建 src/components/features/clients/ClientForm.tsx
// 2. 新建 src/components/features/clients/ClientTable.tsx
// 3. 新建 src/components/features/clients/ClientDrawer.tsx
// 4. 使用新組件庫重構 ClientsPage.tsx
```

#### 優先級 2（中）：課程管理
```
ServicesPage
├── 課程列表表格
├── 新增/編輯課程表單
└── 課程詳情卡片

遷移成本：中等
預計時間：1 天
```

#### 優先級 3（中）：成員管理
```
MembersPage
├── 成員列表
├── 邀請成員表單
└── 成員權限編輯

遷移成本：中等（含權限邏輯）
預計時間：1.5 天
```

#### 優先級 4（低）：數據看板
```
DashboardPage
├── 統計卡片群
├── 各種圖表
└── 數據概覽

遷移成本：低（主要用 StatsCard 和圖表）
預計時間：1 天
```

---

## 📐 具體遷移示例

### 例子：客戶管理頁面遷移

#### 遷移前（現狀）
```tsx
// ClientsPage.tsx（虛構）
export default function ClientsPage() {
  const [clients, setClients] = useState([])
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1>客戶管理</h1>
        <button onClick={() => setShowForm(true)}>新增客戶</button>
      </div>

      {/* 搜尋和篩選 */}
      <div className="flex gap-3">
        <input type="text" placeholder="搜尋客戶..." />
        <select>
          <option>全部</option>
        </select>
      </div>

      {/* 表格 */}
      <table>
        {/* ... */}
      </table>

      {/* 表單 */}
      {showForm && <ClientFormModal onClose={() => setShowForm(false)} />}
    </div>
  )
}
```

#### 遷移後（使用新組件庫）
```tsx
import { useState } from 'react'
import { Plus } from 'lucide-react'
import Button from '@/components/ui/buttons/Button'
import { Card, CardHeader, CardBody } from '@/components/ui/cards/Card'
import PageHeader from '@/components/ui/layout/PageHeader'
import Input from '@/components/ui/forms/Input'
import Select from '@/components/ui/forms/Select'
import ClientTable from '@/components/features/clients/ClientTable'
import ClientForm from '@/components/features/clients/ClientForm'

export default function ClientsPage() {
  const [clients, setClients] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 頁面頭部 */}
      <PageHeader
        title="客戶管理"
        subtitle="管理所有客戶和預約信息"
      />

      {/* 主內容 */}
      <div className="flex-1 overflow-hidden flex flex-col px-6 py-6">
        {/* 搜尋和篩選欄 */}
        <Card className="mb-6">
          <CardBody className="flex gap-3">
            <Input
              placeholder="搜尋客戶名字或電話..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              options={[
                { value: 'all', label: '全部狀態' },
                { value: 'active', label: '活躍' },
                { value: 'inactive', label: '非活躍' }
              ]}
            />
            <Button variant="primary" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              新增客戶
            </Button>
          </CardBody>
        </Card>

        {/* 客戶列表 */}
        <div className="flex-1 overflow-auto">
          <ClientTable
            searchTerm={searchTerm}
            filterStatus={filterStatus}
            onEdit={(id) => {/* 編輯邏輯 */}}
            onDelete={(id) => {/* 刪除邏輯 */}}
          />
        </div>
      </div>

      {/* 新增客戶表單 */}
      {showForm && (
        <ClientForm
          onSuccess={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
```

**改進點**：
- ✅ 使用 PageHeader 統一頁面頭部
- ✅ 使用 Card 包裝搜尋欄
- ✅ 使用新 Button、Input、Select 組件
- ✅ 使用新 ClientTable、ClientForm 功能組件
- ✅ 統一的樣式和間距

---

## 🎯 每日任務模板

### Day 1：Button 和 Card 組件
```
Morning:
  - 實現 Button 組件（primary/secondary/danger）
  - 編寫 Button 文檔和測試

Afternoon:
  - 實現 Card 組件（包含 Header、Body、Footer）
  - 測試組件組合用法

Evening:
  - 建立 ui/buttons 和 ui/cards 文件夾
  - 提交 PR 審核
```

### Day 2：Form 組件
```
Morning:
  - 實現 FormField、Input、Select、Checkbox

Afternoon:
  - 實現 ColorPicker（使用現有邏輯）
  - 進行整合測試

Evening:
  - 編寫組件文檔
  - 提交 PR
```

### Day 3-4：高級組件
```
- 實現 Modal、Alert、Badge、PageHeader
- 編寫測試和文檔
- 進行整合測試
```

### Day 5：開始遷移現有頁面
```
- 選擇 PractitionerManagement 作為測試案例
- 使用新組件庫重構表單和表格
- 測試功能完整性
```

---

## ✅ 驗證清單

### 每個新組件必須檢查：

- [ ] Props 接口完整且文檔清晰
- [ ] 支持所有需要的變體（variant、size 等）
- [ ] Disabled 和 Loading 狀態
- [ ] Hover、Focus、Active 狀態完整
- [ ] 單元測試通過
- [ ] 符合 DESIGN_GUIDELINES.md
- [ ] 邊框全使用 slate-200
- [ ] 間距遵循 8px grid
- [ ] Accessibility：
  - 按鈕有 aria-label
  - 表單有 label 元素
  - 顏色對比度足夠
  - 鍵盤可導航

### 每個遷移頁面必須檢查：

- [ ] 頁面視覺與原頁面一致
- [ ] 所有功能正常（CRUD、搜尋、篩選）
- [ ] 使用了新組件庫的組件
- [ ] 沒有硬編碼樣式（應使用組件 props）
- [ ] 本地測試通過
- [ ] 按照 commit guidelines 提交

---

## 📊 時間估算

| 階段 | 任務 | 預計時間 | 優先級 |
|------|------|---------|--------|
| P1 | 基礎組件庫 | 3-5 天 | 🔴 高 |
| P2 | 預約管理頁面 | 2-3 天 | 🟠 中 |
| P3 | 客戶管理頁面 | 1 天 | 🟠 中 |
| P3 | 課程管理頁面 | 1 天 | 🟠 中 |
| P3 | 成員管理頁面 | 1.5 天 | 🟡 低 |
| P3 | 數據看板頁面 | 1 天 | 🟡 低 |

**總計**：約 10-12 天（1.5-2 周）

---

## 🚀 開始行動

1. **立即**：閱讀 COMPONENT_ARCHITECTURE.md 和 COMPONENT_LIBRARY.md
2. **Day 1**：開始實現 P0 級別組件
3. **Day 3**：遷移現有頁面作為試點
4. **Week 2**：持續遷移其他頁面

---

## 📚 相關文檔

- [DESIGN_GUIDELINES.md](./DESIGN_GUIDELINES.md) - 設計規則
- [COMPONENT_ARCHITECTURE.md](./COMPONENT_ARCHITECTURE.md) - 組件架構
- [COMPONENT_LIBRARY.md](./COMPONENT_LIBRARY.md) - 組件使用指南
