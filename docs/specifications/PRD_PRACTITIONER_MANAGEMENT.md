# PRD：從業人員管理系統（Practitioner Management）

**版本**: 1.0  
**狀態**: Draft  
**建立日期**: 2026-06-05  
**最後更新**: 2026-06-05

---

## 📋 問題陳述

### 背景

目前預約管理系統中，從業人員（老師/按摩師/伸展師等）的管理功能分散且不完整：
- 從業人員列表僅在預約頁面側邊欄顯示，無法獨立管理
- 缺乏新增、編輯、刪除從業人員的操作介面
- 沒有機制設定從業人員的休假時間，導致休假期間仍可能被客人預約

### 為什麼現在

隨著預約管理頁面的統一（Calendar + Gantt 合併為 BookingManagement），從業人員管理已成為核心業務功能。完善的從業人員管理對以下場景至關重要：

- **人事變動**：新聘請從業人員、員工離職時需快速更新系統
- **休假管理**：員工請假、門診時段調整時需防止預約衝突
- **資訊維護**：從業人員聯絡方式、資格認證等資訊需定期更新

---

## 🎯 目標 & 成功指標

### 功能目標

1. **完整的 CRUD 操作**：從業人員的新增、查看、編輯、刪除
2. **休假時間管理**：支援設定休假日期範圍，自動防止重疊預約
3. **即時同步**：修改從業人員資訊後，預約頁面立即反映變化

### 成功指標

| 指標 | 基線 | 目標 | 驗證方式 |
|------|------|------|---------|
| 新增從業人員耗時 | N/A | < 30 秒 | 手動計時操作流程 |
| 休假日期衝突防止率 | 0% | 100% | 嘗試在休假期間預約，應被拒絕 |
| 編輯資訊同步延遲 | N/A | < 1 秒 | 修改後在預約頁查看更新 |
| UI 可用性評分 | N/A | ≥ 4/5 | 用戶測試反饋 |

---

## 💡 解決方案概述

### 高層設計

在預約管理頁面（BookingManagement）的左側欄建立「**從業人員管理**」模組，提供獨立的管理介面：

```
┌─────────────────────────────────────────────┐
│  預約管理頁面                                    │
├─────────────────────┬───────────────────────┤
│ 從業人員管理          │   日曆/甘特圖視圖      │
│  (新增模組)          │  (Calendar/Gantt)     │
│                      │                        │
│ ✨ 新增老師          │  選中老師時篩選       │
│ 📝 編輯老師          │  其預約資訊           │
│ 🗑️ 刪除老師          │                        │
│ 📅 設定休假時間      │                        │
│                      │                        │
└─────────────────────┴───────────────────────┘
```

### 功能模組

1. **從業人員列表視圖**
   - 顯示所有從業人員及其基本狀態
   - 快速操作按鈕（編輯、刪除、休假設定）

2. **從業人員表單**（新增/編輯）
   - 基本資訊：**姓名**（必填）
   - 可被預約的課程：多選課程清單（與課程管理聯動）
   - 可選欄位：聯絡電話、EMAIL、個人簡介、照片

3. **休假時間管理**
   - 日曆式介面選擇休假日期範圍
   - 視覺化顯示休假期間
   - 防止重疊預約的自動驗證

---

## 📌 功能需求

### US-1: 新增從業人員

**使用者故事**：
身為管理員，我想快速新增新聘請的從業人員，使其能在系統中接收預約。

**驗收準則**：
- [ ] 點擊「新增老師」按鈕打開表單
- [ ] 表單包含欄位：
  - 姓名（必填）
  - 可被預約的課程（必填，至少選一個）
  - 聯絡電話、EMAIL、個人簡介、照片（可選）
- [ ] 課程清單動態從課程管理模組載入
- [ ] 可多選課程，已選課程需視覺化標示
- [ ] 驗證：姓名非空、至少選一個課程
- [ ] 提交後立即在列表中顯示新增的從業人員
- [ ] 新增成功後顯示「新增成功」提示訊息

**技術需求**：
- 後端 API：
  - `POST /api/practitioners` - 建立記錄
  - `POST /api/practitioners/:id/services` - 關聯課程
- Supabase：
  - 新增至 `practitioners` 表
  - 新增至 `practitioner_services` 多對多表
- RLS：管理員可新增任何記錄
- 課程聯動：載入課程列表需調用課程管理 API

---

### US-2: 編輯從業人員資訊

**使用者故事**：
身為管理員，我想編輯從業人員的基本資訊及其可被預約的課程，以保持資料最新和課程指派。

**驗收準則**：
- [ ] 點擊列表中從業人員的「編輯」按鈕打開編輯表單
- [ ] 表單預填現有資訊：
  - 姓名、聯絡方式、簡介、照片
  - **已指派的課程需被勾選顯示**
- [ ] 可修改所有欄位（除 ID 外）
- [ ] 課程清單動態載入，可新增或移除課程指派
- [ ] 至少保持一個課程被指派
- [ ] 提交後立即更新列表和預約頁面
- [ ] 預約頁面同步顯示更新後的名稱和可被預約的課程
- [ ] 編輯成功後顯示「更新成功」提示訊息

**技術需求**：
- 後端 API：
  - `PUT /api/practitioners/:id` - 更新基本資訊
  - `GET /api/practitioners/:id/services` - 取得已指派課程
  - `PUT /api/practitioners/:id/services` - 更新課程指派
- Supabase：
  - 更新 `practitioners` 表
  - 更新 `practitioner_services` 多對多表（刪除舊關聯、新增新關聯）
- RLS：管理員可編輯任何記錄
- 實時更新：CalendarPage 和 GanttPage 應反映名稱和課程變更

---

### US-3: 刪除從業人員

**使用者故事**：
身為管理員，我想刪除已離職的從業人員，防止其在系統中繼續接收預約。

**驗收準則**：
- [ ] 點擊列表中從業人員的「刪除」按鈕
- [ ] 彈出確認對話框：「確定要刪除 [姓名] 嗎？此操作無法復原。」
- [ ] 如果該從業人員有未完成的預約，顯示警告提示
- [ ] 確認刪除後，從列表中移除該記錄
- [ ] 預約頁面不再顯示該從業人員
- [ ] 刪除成功後顯示「已刪除」提示訊息

**技術需求**：
- 後端 API：`DELETE /api/practitioners/:id`
- Supabase：軟刪除至 `practitioners` 表（`deleted_at` 欄位標記）
- RLS：管理員可刪除任何記錄
- 查詢過濾：所有查詢應排除已刪除的從業人員

---

### US-4: 設定休假時間

**使用者故事**：
身為管理員，我想為從業人員設定休假期間，使客人在此期間無法預約該從業人員。

**驗收準則**：
- [ ] 點擊從業人員列表中的「休假設定」或「日曆」圖示，打開休假管理介面
- [ ] 介面顯示日曆，可選擇開始和結束日期
- [ ] 支援多個休假時段設定（例：1/10-1/15 和 2/20-2/25）
- [ ] 已設定的休假期間在日曆上視覺化標示（背景色、標籤）
- [ ] 保存後，該期間的預約表單應禁用該從業人員選項
- [ ] 可編輯或刪除現有休假記錄

**技術需求**：
- 後端 API：
  - `GET /api/practitioners/:id/leaves` - 查詢休假列表
  - `POST /api/practitioners/:id/leaves` - 新增休假
  - `PUT /api/practitioners/:id/leaves/:leaveId` - 編輯休假
  - `DELETE /api/practitioners/:id/leaves/:leaveId` - 刪除休假
- Supabase：新表 `practitioner_leaves`（`id`, `practitioner_id`, `start_date`, `end_date`, `reason`）
- 預約驗證：預約建立時檢查 `practitioner_leaves` 表，如在休假期間則拒絕

---

### US-5: 從業人員列表展示

**使用者故事**：
身為管理員，我想在一個列表中看到所有從業人員及其狀態，方便快速管理。

**驗收準則**：
- [ ] 列表顯示：姓名、電話、今日預約數、狀態（忙碌/空閒/無預約）
- [ ] 列表可按姓名搜尋
- [ ] 列表項可展開/收起，顯示詳細資訊
- [ ] 每個列表項提供快速操作按鈕：編輯、刪除、休假設定
- [ ] 列表支援滾動且效能良好（50+ 從業人員）

**技術需求**：
- Supabase 查詢優化：使用聚合函數計算 bookingCount
- UI：虛擬滾動或分頁（若 > 50 人）

---

### US-6: 管理老師可被預約的課程

**使用者故事**：
身為管理員，我想為每位老師指派其可以提供的課程，確保客人只能預約該老師提供的課程。

**驗收準則**：
- [ ] 在編輯老師資訊時，可看到「可被預約的課程」選項
- [ ] 課程清單從課程管理模組自動載入（已上架的課程）
- [ ] 支援多選課程，用勾選框表示
- [ ] 已指派的課程需視覺化標示（勾選）
- [ ] 可新增或移除課程指派（無需跳轉）
- [ ] 至少需指派一個課程
- [ ] 修改課程指派後，預約頁面的課程選單自動更新
- [ ] 客人預約時，只能選擇該老師被指派的課程
- [ ] 儲存成功後顯示「課程指派已更新」提示訊息

**使用者流程**：
```
管理員點擊老師「編輯」
  ↓
編輯表單打開，顯示「可被預約的課程」區塊
  ↓
課程列表動態載入（只顯示已上架課程）
  ↓
管理員勾選/取消勾選課程
  ↓
點擊「保存」
  ↓
後端更新 practitioner_services 表
  ↓
預約頁面實時反映（課程選單變更）
  ↓
顯示「課程指派已更新」提示
```

**技術需求**：
- 後端 API：
  - `GET /api/services?status=active` - 取得已上架課程
  - `GET /api/practitioners/:id/services` - 取得老師已指派課程
  - `PUT /api/practitioners/:id/services` - 更新課程指派
- Supabase：
  - `practitioner_services` 多對多表（`id`, `practitioner_id`, `service_id`, `created_at`）
  - 外鍵約束：刪除課程時自動刪除關聯
- RLS：管理員可管理任何老師的課程指派
- 課程聯動：課程管理模組新增/下架課程時，自動更新可選課程清單
- 預約驗證：預約建立時驗證該老師是否有提供該課程

---

## 🎬 使用者流程

### 流程 1：新增從業人員

```
管理員點擊「新增老師」
  ↓
表單打開，載入課程清單
  ↓
填寫基本資訊（姓名、電話、EMAIL、簡介、照片）
  ↓
在「可被預約的課程」區塊選擇課程（至少一個）
  ↓
點擊「保存」
  ↓
系統驗證（姓名非空、至少一個課程被選）
  ↓
後端建立記錄到 practitioners 和 practitioner_services 表
  ↓
表單關閉，列表自動刷新並顯示新記錄
  ↓
顯示「新增成功」提示（3 秒後自動消失）
```

### 流程 2：設定休假時間

```
管理員在從業人員列表點擊「休假設定」
  ↓
日曆介面打開，顯示現有休假（已標示）
  ↓
選擇「新增休假」，選擇開始/結束日期
  ↓
（可選）輸入休假原因（如「年假」、「生病」）
  ↓
點擊「保存」
  ↓
後端建立 practitioner_leaves 記錄
  ↓
日曆立即更新，新休假期間視覺化顯示
```

---

## 📊 資料模型

### 擴充現有表

**practitioners**
```sql
CREATE TABLE practitioners (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  bio TEXT,
  photo_url VARCHAR(500),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,  -- 軟刪除
  FOREIGN KEY (store_id) REFERENCES stores(id)
);
```

### 新增表

**practitioner_leaves**（休假時間）
```sql
CREATE TABLE practitioner_leaves (
  id UUID PRIMARY KEY,
  practitioner_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(255),  -- 可選，如「年假」、「生病」
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (practitioner_id) REFERENCES practitioners(id) ON DELETE CASCADE,
  CHECK (end_date >= start_date)
);
```

**practitioner_services**（老師與課程多對多關係）
```sql
CREATE TABLE practitioner_services (
  id UUID PRIMARY KEY,
  practitioner_id UUID NOT NULL,
  service_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(practitioner_id, service_id),  -- 防止重複指派
  FOREIGN KEY (practitioner_id) REFERENCES practitioners(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

-- 建立索引以加快查詢效能
CREATE INDEX idx_practitioner_services_practitioner_id ON practitioner_services(practitioner_id);
CREATE INDEX idx_practitioner_services_service_id ON practitioner_services(service_id);
```

### RLS 政策

```sql
-- admin_manage_practitioners
CREATE POLICY admin_manage_practitioners ON practitioners
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin' OR auth.uid() IN (
    SELECT user_id FROM members WHERE store_id = practitioners.store_id AND is_admin = true
  ))
  WITH CHECK (auth.jwt() ->> 'role' = 'admin' OR auth.uid() IN (
    SELECT user_id FROM members WHERE store_id = practitioners.store_id AND is_admin = true
  ));

-- member_read_practitioners
CREATE POLICY member_read_practitioners ON practitioners
  FOR SELECT
  USING (store_id = current_store_id());
```

---

## 📱 UI/UX 設計規範

### 設計風格

遵循現有設計系統：
- **色系**：Indigo 主色、Slate 輔助色
- **字體**：系統字體堆疊
- **間距**：4px/8px 基數系統
- **陰影**：Tailwind `shadow-sm` / `shadow-md`

### 從業人員列表區域

```
┌─ 從業人員 ─────────────────────────┐
│ 🔍 [搜尋...]                        │
│ [+ 新增老師]                        │
│                                    │
│ ┌─ 王美麻 ──────────────────────┐ │
│ │ 📞 0912-345-678              │ │
│ │ 今日預約：3 場 | 狀態：忙碌   │ │
│ │ [編輯] [休假] [刪除]          │ │
│ └──────────────────────────────┘ │
│                                    │
│ ┌─ 李伸展 ──────────────────────┐ │
│ │ 📞 0923-456-789              │ │
│ │ 今日預約：0 場 | 狀態：空閒   │ │
│ │ [編輯] [休假] [刪除]          │ │
│ └──────────────────────────────┘ │
└────────────────────────────────────┘
```

### 新增/編輯表單

```
新增老師
┌──────────────────────────────────────┐
│ 姓名 *                              │
│ [_____________________]              │
│                                      │
│ 可被預約的課程 *                      │
│ ☑ 瑞典按摩 (60 分)                   │
│ ☐ 深層組織按摩 (90 分)               │
│ ☑ 伸展課程 (45 分)                   │
│ ☐ 美容護理 (30 分)                   │
│ (加載中... 如課程列表為空)            │
│                                      │
│ 電話                                │
│ [_____________________]              │
│                                      │
│ EMAIL                               │
│ [_____________________]              │
│                                      │
│ 個人簡介                             │
│ [________________]                   │
│ (100 字以內)                         │
│                                      │
│ 照片                                │
│ [上傳照片]                           │
│                                      │
│ [取消]  [保存]                      │
└──────────────────────────────────────┘
```

**課程選擇區塊說明**：
- 課程清單動態從課程管理模組載入
- 僅顯示狀態為「上架」的課程
- 使用勾選框（checkbox）表示選擇
- 課程旁顯示時長，方便參考
- 必須至少選一個課程
- 若課程清單載入失敗，顯示「無法載入課程清單」提示

---

## 🔄 與其他模組的整合

### 與課程管理的整合 ⭐

**場景 1**：新增/編輯老師時，課程列表動態載入

```typescript
// 在 PractitionerForm 中
useEffect(() => {
  loadAvailableServices()  // 調用課程管理 API 獲取所有上架課程
}, [])

const loadAvailableServices = async () => {
  const { data } = await supabase
    .from('services')
    .select('id, name, duration_minutes')
    .eq('is_active', true)  // 只顯示上架課程
    .order('name', { ascending: true })
  
  setAvailableServices(data)
}
```

**場景 2**：課程被下架時，自動從老師的指派課程中移除

```typescript
// 在課程管理模組中，更新課程狀態為非上架時執行
DELETE FROM practitioner_services 
WHERE service_id = [被下架的課程ID]
```

**場景 3**：課程被刪除時，自動清理關聯記錄

```typescript
-- 資料庫層面的級聯刪除已在外鍵設定中實現
FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
```

### 與預約建立的整合

**場景 1**：客人預約時，課程選單只顯示該老師被指派的課程

```typescript
// 在預約表單中
const handlePractitionerSelect = async (practitionerId: string) => {
  const { data: assignedServices } = await supabase
    .from('practitioner_services')
    .select('service_id, service:services(id, name)')
    .eq('practitioner_id', practitionerId)
  
  setAvailableServices(assignedServices)  // 動態篩選課程選單
}
```

**場景 2**：客人預約時，系統應檢查該從業人員是否在休假

```typescript
// 預約驗證邏輯
if (selectedPractitionerId && selectedDate) {
  const leaves = await checkPractitionerLeaves(selectedPractitionerId, selectedDate)
  if (leaves.length > 0) {
    showError("該從業人員於此期間休假，無法預約")
    disablePractitionerOption()
  }
}
```

**場景 3**：預約建立時驗證老師是否有提供該課程

```typescript
// 預約驗證
const hasServiceAccess = await supabase
  .from('practitioner_services')
  .select('id')
  .eq('practitioner_id', selectedPractitionerId)
  .eq('service_id', selectedServiceId)
  .single()

if (!hasServiceAccess) {
  throw new Error("該老師不提供此課程")
}
```

### 與預約頁面的整合

**場景**：編輯從業人員名稱或課程指派後，Calendar 和 Gantt 視圖應自動更新

```typescript
// 實時同步
useEffect(() => {
  if (practitionerUpdated) {
    reloadPractitionerData()  // 在 CalendarPage 和 GanttPage 中
  }
}, [practitionerUpdated])
```

---

## 🏗️ 技術考慮

### 後端架構

| 層 | 元件 | 技術 |
|----|------|------|
| **API 層** | `/api/practitioners/*` 端點 | Supabase Edge Functions 或 REST API |
| **業務邏輯** | 驗證、授權、休假檢查 | PostgreSQL 函數 + RLS |
| **資料層** | `practitioners` / `practitioner_leaves` 表 | Supabase PostgreSQL |

### 前端架構

| 元件 | 位置 | 職責 |
|------|------|------|
| `PractitionerManagement` | `src/components/admin/PractitionerManagement.tsx` | 容器組件，管理列表狀態 |
| `PractitionerList` | `src/components/admin/PractitionerList.tsx` | 顯示列表，提供快速操作 |
| `PractitionerForm` | `src/components/admin/PractitionerForm.tsx` | 新增/編輯表單 |
| `PractitionerLeaveManager` | `src/components/admin/PractitionerLeaveManager.tsx` | 日曆式休假管理 |

### 實時性

- 使用 Supabase Realtime 訂閱 `practitioners` 表變更
- 修改後立即更新 UI（無需手動重新整理）
- 跨分頁實時同步（多開時窗口自動更新）

---

## 📋 範圍定義

### ✅ In Scope

- 從業人員 CRUD 操作（新增、編輯、刪除）
- **課程指派管理**：多選課程、課程聯動載入、關聯維護
- **課程驗證**：預約時驗證老師是否有提供該課程
- 休假時間管理（新增、編輯、刪除休假）
- 休假衝突驗證（防止重疊預約）
- 從業人員列表搜尋和篩選
- RLS 權限管理（管理員限定）
- 與課程管理模組的整合（動態課程載入、級聯刪除）

### ❌ Out of Scope（第一版）

- 從業人員評分系統
- 老師課程專長標籤系統
- 績效統計（如人均營收）
- 從業人員行動 APP 推送通知
- 老師排班表自動生成

### 📅 Future Considerations

- 從業人員證書上傳和驗證流程
- 工作時間表管理（每週固定時段）
- 從業人員分成/薪資計算系統

---

## 🚀 實施計劃

### Phase 1：基礎設施與後端（3-4 天）

**資料層**：
- [ ] 建立 `practitioners` 表
- [ ] 建立 `practitioner_leaves` 表（休假時間）
- [ ] 建立 `practitioner_services` 表（多對多課程關聯）
- [ ] 設計和實施 RLS 政策

**API 層**：
- [ ] 開發 `/api/practitioners` 端點（CRUD）
- [ ] 開發 `/api/practitioners/:id/services` 端點（課程管理）
- [ ] 開發 `/api/practitioners/:id/leaves/*` 端點（休假 CRUD）
- [ ] 開發課程聯動：`GET /api/services?status=active`（載入課程清單）

**驗證邏輯**：
- [ ] 實作預約驗證：檢查老師是否在休假
- [ ] 實作課程驗證：檢查老師是否有提供該課程
- [ ] 課程被下架時，自動移除老師指派
- [ ] 課程被刪除時，級聯清理老師關聯（於 RLS 層實施）

### Phase 2：前端 UI（3-4 天）

**主組件**：
- [ ] 創建 `PractitionerManagement` 容器組件
- [ ] 構建 `PractitionerList` 列表視圖（含快速操作）

**表單與服務選擇**：
- [ ] 構建 `PractitionerForm` 新增/編輯表單
- [ ] 實現課程清單動態載入（從課程管理 API）
- [ ] 構建課程多選 UI（勾選框、已選視覺化）
- [ ] 課程驗證：確保至少選一個課程

**其他功能**：
- [ ] 構建 `PractitionerLeaveManager` 日曆管理
- [ ] 集成 Realtime 訂閱，實現實時更新
- [ ] 實現課程清單載入失敗時的降級方案

### Phase 3：整合與測試（2-3 天）

**整合**：
- [ ] 整合到 BookingManagement 主頁面
- [ ] 整合課程管理模組（動態課程載入）
- [ ] 整合預約表單（課程篩選、課程驗證）

**功能測試**：
- [ ] 測試課程選擇和指派
- [ ] 測試課程清單動態更新（新增/下架課程）
- [ ] 測試級聯刪除（課程被刪除時）
- [ ] 測試預約課程驗證

**端到端測試**：
- [ ] 測試休假衝突驗證
- [ ] 測試課程衝突驗證（預約不存在的課程）
- [ ] 測試跨視圖實時同步
- [ ] 使用者驗收測試（UAT）

### Phase 4：優化與部署（0.5-1 天）

- [ ] 效能優化（列表虛擬滾動、查詢優化）
- [ ] 文檔完善
- [ ] 生產環境部署

**總耗時**：約 8-13 工作天（包含課程管理整合）

---

## 🔍 成功驗收

### 功能驗收

**基本 CRUD**：
- [ ] 可新增從業人員，立即出現在列表
- [ ] 可編輯從業人員，預約頁面同步更新
- [ ] 可刪除從業人員，預約頁面不再顯示
- [ ] 可搜尋從業人員by姓名

**課程管理**：
- [ ] 新增老師時，課程清單正確載入
- [ ] 必須至少選一個課程，否則禁止保存
- [ ] 已選課程在表單中視覺化標示
- [ ] 編輯老師時，已指派課程被正確預填
- [ ] 修改課程指派後，預約頁面課程選單實時更新
- [ ] 課程被下架時，自動從老師指派中移除
- [ ] 課程被刪除時，級聯清理老師關聯

**休假管理**：
- [ ] 可設定休假時間，休假期間無法預約
- [ ] 可編輯和刪除休假記錄

### 效能驗收

- [ ] 列表加載時間 < 2 秒（50 人規模）
- [ ] 新增/編輯/刪除 < 1 秒
- [ ] 實時更新延遲 < 500ms

### 質量驗收

- [ ] 零安全漏洞（通過 RLS 驗證）
- [ ] 100% 功能覆蓋測試
- [ ] 無未驗證的使用者輸入

---

## 📚 參考資源

- 相關 PRD：`PRD_BOOKING_MANAGEMENT_UNIFIED.md`
- 設計規範：`docs/design-guidelines/README.md`
- 開發指南：`.claude/claude.md`（規則 9️⃣ Props 設計規範）

---

**建立者**: Claude Haiku 4.5  
**維護者**: Development Team  
**最後更新**: 2026-06-05
