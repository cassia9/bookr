# 產品需求文件（PRD）：課程管理系統與三角聯動

**版本**：1.0  
**日期**：2026-06-08  
**負責人**：開發團隊  
**狀態**：待批准  

---

## 📋 目錄

1. [問題陳述](#問題陳述)
2. [目標與成功指標](#目標與成功指標)
3. [解決方案概述](#解決方案概述)
4. [功能需求](#功能需求)
5. [系統聯動設計](#系統聯動設計)
6. [範圍邊界](#範圍邊界)
7. [技術考量](#技術考量)
8. [依賴與風險](#依賴與風險)
9. [時間表與里程碑](#時間表與里程碑)

---

## 🎯 問題陳述

### 當前痛點

預約管理系統已建立，但課程管理模塊缺失，造成以下問題：

| 問題 | 影響 | 優先級 |
|------|------|--------|
| 無法建立課程 | 從業人員無法被指派課程，「新增老師」功能被阻擋 | 🔴 Critical |
| 無課程數據 | 無法進行預約（預約表的 service_id 無值可選） | 🔴 Critical |
| 管理員無課程定價工具 | 無法統一管理課程定價和時長 | 🟠 High |
| 課程生命週期無管理 | 無法上架/下架課程，廢棄課程無法處理 | 🟠 High |

### 為什麼現在做

當前系統架構已為課程管理預留了資料庫表 (`services`) 和關聯關係：
- `bookings.service_id` → `services.id`
- `practitioners` ↔ `services` (through `practitioner_services` junction)

只差前端 UI 層面的實現，無需進行資料庫遷移。

---

## 📊 目標與成功指標

### 主要目標

| 目標 | 成功指標 | 基準 | 目標值 |
|------|---------|------|--------|
| **解除新增從業人員阻礙** | 管理員能成功新增至少 2 個課程並指派給從業人員 | 0 個課程 | ≥ 2 個課程 |
| **啟用預約功能** | 客戶能從至少 3 個課程選項中預約 | 0 個課程 | ≥ 3 個課程 |
| **課程定價透明化** | 每個課程都有明確的時長和定價 | N/A | 100% 課程有定價 |
| **課程生命週期管理** | 管理員能上架/下架課程，廢棄課程能軟刪除 | 無管理機制 | 有完整的狀態管理 |

### 用戶滿意度指標

- 【新增課程】時間 < 3 分鐘
- 【編輯課程】時間 < 2 分鐘
- 課程相關功能的 UI/UX 評分 ≥ 4/5

---

## 💡 解決方案概述

### 核心概念：「課程」的三角聯動

```
┌──────────────────────────────────────┐
│   課程管理 (ServicesPage)             │
│  ├─ 課程 CRUD                        │
│  ├─ 課程-從業人員對應                 │
│  └─ 課程上架/下架                    │
└──────────┬─────────────────┬─────────┘
           │                 │
           ↓                 ↓
    ┌─────────────┐    ┌──────────────┐
    │ 從業人員管理  │    │ 預約管理      │
    │             │    │              │
    │ - 指派課程   │    │ - 選擇課程    │
    │ - 課程時段   │    │ - 顯示定價    │
    │ - 業績統計   │    │ - 時段檢查    │
    └─────────────┘    └──────────────┘
```

### 設計原則

1. **單一責任**：課程管理專責課程 CRUD，聯動由資料庫關聯保證
2. **實時一致性**：課程修改立即反映到預約表單和從業人員清單
3. **隱性約束**：前端驗證 + 資料庫 RLS 雙重保障
4. **漸進增強**：基礎版先做 CRUD，後續增加高級功能

---

## 🔧 功能需求

### Phase 1：基礎課程 CRUD（MVP）

#### F1.1 課程列表頁面

**場景**：管理員進入「課程管理」頁面

**功能**：
- [ ] 表格顯示所有課程（包含已下架）
  - 課程名稱
  - 時長（分鐘）
  - 定價（元）
  - 狀態（上架/下架）
  - 建立日期
  - 操作欄（編輯、刪除）

- [ ] 搜尋功能：按課程名稱搜尋
- [ ] 篩選功能：顯示「全部」/ 「上架中」/ 「已下架」
- [ ] 排序功能：按名稱、定價、日期排序
- [ ] 分頁：每頁 10-20 筆

**驗收標準**：
- ✅ 列表能正確載入全部課程
- ✅ 搜尋和篩選功能正確
- ✅ 操作按鈕可點擊且有確認提示

---

#### F1.2 新增課程

**場景**：管理員點擊「+ 新增課程」按鈕

**表單欄位**：
| 欄位 | 類型 | 必填 | 限制 | 說明 |
|------|------|------|------|------|
| 課程名稱 | Text | ✅ | 1-100 字 | 如：「60 分鐘深層肌肉按摩」 |
| 描述 | Textarea | ❌ | 0-500 字 | 課程內容說明 |
| 時長 | Number | ✅ | 15-480 分鐘 | 15 分鐘 - 8 小時 |
| 定價 | Number | ✅ | 0-999,999 元 | 預設 0（待定） |
| 上架狀態 | Toggle | ❌ | - | 預設：已上架 |

**驗收標準**：
- ✅ 所有欄位都能驗證
- ✅ 名稱不能重複（警告提示）
- ✅ 時長預設 60 分鐘
- ✅ 表單提交成功後顯示成功提示，列表自動刷新

---

#### F1.3 編輯課程

**場景**：管理員點擊課程列表中的「編輯」

**差異**：
- 表單預填現有資料
- 新增「已被指派給 X 名從業人員」提示
- 新增「已有 X 筆預約」警告（若要修改時長）

**驗收標準**：
- ✅ 表單正確預填
- ✅ 修改後資料正確保存
- ✅ 其他相關頁面（從業人員、預約）實時更新

---

#### F1.4 刪除課程（軟刪除）

**場景**：管理員點擊「刪除」按鈕

**行為**：
1. 顯示確認對話框：「此課程已被指派給 X 名從業人員，確認刪除？」
2. 若有進行中的預約，顯示警告：「此課程仍有 X 筆未完成的預約」
3. 執行軟刪除（設定 `deleted_at` 時間戳）

**驗收標準**：
- ✅ 軟刪除不影響既有預約數據
- ✅ 刪除後的課程在列表中「已下架」標記
- ✅ 從業人員清單移除該課程指派

---

### Phase 2：課程-從業人員聯動

#### F2.1 從業人員指派課程

**場景**：在「新增/編輯老師」彈窗中選擇可預約課程

**改動**：
```tsx
// 原：顯示 <Alert type="info" message="暫無可用課程，請先建立課程" />
// 新：
<div className="space-y-2">
  {services.map((service) => (
    <Checkbox
      key={service.id}
      label={`${service.name} (${service.duration_minutes}分鐘 / ¥${service.price})`}
      checked={formData.service_ids.includes(service.id)}
      onChange={() => handleServiceToggle(service.id)}
      disabled={loading || !service.active}
    />
  ))}
</div>
```

**邏輯**：
- [ ] 只顯示 `active = true` 的課程
- [ ] 已刪除的課程用灰色標記，無法選擇
- [ ] 支援多選
- [ ] 修改後自動儲存到 `practitioner_services` 表

**驗收標準**：
- ✅ 課程清單動態更新
- ✅ 新增課程後立即出現在選擇清單中
- ✅ 從業人員的課程指派正確儲存

---

#### F2.2 從業人員的課程時段管理

**場景**：編輯從業人員時，設定各課程的可預約時段

**新增頁籤**：「課程時段」
- 按課程分組顯示時段
- 支援：全天開放 / 自訂時段（開始-結束時間）

**驗收標準**：
- ✅ 時段設定儲存正確
- ✅ 時段衝突檢測（同一課程不能有重疊時段）

---

### Phase 3：預約管理聯動

#### F3.1 預約表單課程選擇

**場景**：客戶在「客戶預約頁」或「手動新增預約」中選擇課程

**改動**：
- 課程選擇清單顯示所有 `active = true` 的課程
- 每個課程顯示：名稱 + 時長 + 定價
- 選擇課程後，自動更新時段列表（基於可用從業人員和時段）

**驗收標準**：
- ✅ 課程清單正確載入和更新
- ✅ 選擇課程後，時段清單篩選正確
- ✅ 定價自動帶入預約記錄

---

#### F3.2 預約確認頁面展示課程資訊

**場景**：預約完成前，顯示確認頁面

**展示內容**：
```
課程名稱：深層肌肉按摩
時長：60 分鐘
定價：¥1,500
從業人員：林老師
日期時間：2026-06-15 14:00-15:00
```

**驗收標準**：
- ✅ 課程資訊完整顯示
- ✅ 定價一致性驗證（與預約時的課程定價相同）

---

## 🔗 系統聯動設計

### 資料流圖

```
┌─────────────────────────────────────────────────────────────┐
│                   ServicesPage (課程管理)                    │
│  [新增課程] → services 表                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ↓               ↓               ↓
┌─────────────┐  ┌─────────────┐  ┌──────────────┐
│Practitioner │  │  Bookings   │  │  RLS Policy  │
│Management   │  │  Management │  │  Check       │
│             │  │             │  │              │
│(檢查課程    │  │(課程選擇)   │  │(誰能看到?)  │
│ 是否可用)  │  │             │  │              │
└─────────────┘  └─────────────┘  └──────────────┘
```

### 關鍵聯動點

| 聯動點 | 觸發條件 | 動作 | 驗證 |
|--------|---------|------|------|
| **課程新增** | `services` 表插入新記錄 | 從業人員清單更新，預約表單更新 | DB 觸發器確保一致性 |
| **課程編輯** | `services` 表更新定價/時長 | 即時反映到預約確認頁面 | 計算時差（應 < 100ms） |
| **課程刪除** | `services.deleted_at` 設定值 | 自動從從業人員指派移除，預約對該課程變為唯讀 | 軟刪除不破壞歷史數據 |
| **從業人員指派** | `practitioner_services` 表變動 | 甘特圖/預約清單可用時段更新 | RLS 篩選已指派課程 |
| **預約建立** | `bookings` 表插入新記錄 | 課程的「已預約」統計更新，從業人員時段狀態變為「已滿」 | 時段衝突檢測 (DB level) |

---

## 📦 範圍邊界

### ✅ 在範圍內

**MVP 第一版（Phase 1-2）**：
- [ ] 課程基本 CRUD
- [ ] 課程-從業人員對應
- [ ] 課程在預約表單中的顯示
- [ ] 課程定價 in 預約確認
- [ ] 軟刪除（廢棄課程）

**Phase 3**：
- [ ] 預約與課程的聯動驗證

### ❌ 暫不包含（Future）

- **課程分類**（如：按身體部位分類）→ Phase 4
- **課程套餐**（如：「3 次按摩 + 1 次拉伸」）→ Phase 5
- **課程預售**（限時優惠、購票）→ Phase 6
- **課程評價系統**（客戶課後評分）→ Phase 7
- **課程推薦引擎**（基於歷史預約推薦課程）→ Future

---

## ⚙️ 技術考量

### 資料庫

#### 既存表：`services`

```sql
CREATE TABLE services (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  description      TEXT,
  duration_minutes INT NOT NULL DEFAULT 60,
  price            NUMERIC(10, 0) NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at       TIMESTAMPTZ,                    -- ⚠️ 待新增（軟刪除）
  store_id         UUID NOT NULL REFERENCES stores(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

#### 既存表：`practitioner_services`（多對多）

```sql
CREATE TABLE practitioner_services (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  practitioner_id  UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  service_id       UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  store_id         UUID NOT NULL REFERENCES stores(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(practitioner_id, service_id)
);
```

#### 需新增表：`service_practitioner_schedule`（optional）

若要進階實現課程時段管理：

```sql
CREATE TABLE service_practitioner_schedule (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  practitioner_id  UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  service_id       UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  day_of_week      INT NOT NULL,                     -- 0-6（Sun-Sat）
  start_time       TIME NOT NULL,                    -- 08:00
  end_time         TIME NOT NULL,                    -- 18:00
  is_available     BOOLEAN NOT NULL DEFAULT TRUE,    -- 是否開放預約
  store_id         UUID NOT NULL REFERENCES stores(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### 遷移計劃

| 遷移 | 說明 | 優先級 |
|------|------|--------|
| 015_service_soft_delete | 為 `services` 新增 `deleted_at` 欄位 | 🔴 MVP |
| 016_service_practitioner_schedule | 新增課程時段表（支援高級時段管理） | 🟠 Phase 3+ |

### API / Edge Functions

#### 既存 API（需確保相容）

- `GET /api/services` → 列出所有活躍課程
- `POST /api/services` → 建立課程（需管理員權限）

#### 需新增 API

- `PUT /api/services/:id` → 編輯課程
- `DELETE /api/services/:id` → 軟刪除課程
- `GET /api/practitioners/:id/services` → 取得從業人員的課程清單

### RLS（Row Level Security）

#### 既存政策：`select_services_by_store`

確保用戶只能看到自己店家的課程。

#### 需新增政策：

```sql
-- 只有店家管理員能編輯課程
CREATE POLICY "admin_edit_services"
  ON services
  FOR UPDATE
  USING (is_admin());

-- 只有店家管理員能刪除課程
CREATE POLICY "admin_delete_services"
  ON services
  FOR DELETE
  USING (is_admin());
```

### 前端技術棧

**既用組件**：
- `Modal`（對話框）✅
- `Button`（按鈕）✅
- `Input`（輸入框）✅
- `Checkbox`（複選框）✅

**需新增/改進組件**：
- `Table`（資料表）- 課程列表展示
- `Select` / `Dropdown`（下拉選擇）- 課程篩選
- `Badge` / `Tag`（標籤）- 課程狀態標記

### 狀態管理

使用既有的 React `useState` + Supabase 實時訂閱：

```typescript
const [services, setServices] = useState<Service[]>([])

useEffect(() => {
  // 初始載入
  loadServices()
  
  // 實時訂閱
  const subscription = supabase
    .from('services')
    .on('*', (payload) => {
      // 課程變更時自動更新 UI
      handleServiceChange(payload)
    })
    .subscribe()

  return () => subscription.unsubscribe()
}, [])
```

---

## ⚠️ 依賴與風險

### 依賴

| 依賴 | 說明 | 責任人 | 狀態 |
|------|------|--------|------|
| Supabase RLS 已啟用 | 課程管理權限依賴 RLS | 後端 | ✅ 已完成 |
| 從業人員表已建立 | `practitioners` 表必須存在 | 後端 | ✅ 已完成 |
| 預約表已建立 | `bookings` 表必須存在 | 後端 | ✅ 已完成 |
| Auth 系統正常 | 識別管理員身份 | 後端 | ✅ 已完成 |

### 風險

| 風險 | 可能性 | 衝擊 | 風險等級 | 因應方案 |
|------|--------|------|----------|---------|
| **課程時段衝突** | 中 | 高 | 🟠 Medium | 資料庫 CHECK 約束 + 前端驗證 |
| **課程被刪除但有預約** | 低 | 高 | 🟠 Medium | 軟刪除 + 歷史預約讀取 |
| **定價變動影響已成預約** | 低 | 中 | 🟡 Low | 預約表儲存定價快照（不參考原課程） |
| **從業人員課程突然減少** | 低 | 中 | 🟡 Low | 日誌記錄 + 通知機制（Future） |
| **大量課程導入導致性能下降** | 低 | 中 | 🟡 Low | 分頁 + 索引優化 |

### 假設

- ✅ 管理員理解課程管理的重要性
- ✅ 課程數量 < 1000（MVP 階段）
- ✅ 從業人員能熟悉課程指派流程
- ⚠️ 客戶可接受課程變更（需通知機制）

---

## 📅 時間表與里程碑

### Phase 1：基礎課程 CRUD（2-3 天）

**里程碑**：
1. **Day 1**：資料庫遷移（新增 `deleted_at` 欄位）+ ServicesPage 列表實現
   - [ ] 遷移: 015_service_soft_delete
   - [ ] 組件: ServicesPage（列表 + 搜尋 + 篩選）
   - [ ] API: GET /api/services

2. **Day 2**：新增和編輯功能
   - [ ] 組件: ServiceForm（Modal）
   - [ ] API: POST/PUT /api/services
   - [ ] 驗證邏輯（名稱唯一性、時長範圍等）

3. **Day 3**：刪除和聯動測試
   - [ ] API: DELETE /api/services
   - [ ] 整合測試（課程修改 → 從業人員清單更新）
   - [ ] /qc 品質檢查

**完成標準**：
- ✅ 管理員能完整執行課程 CRUD
- ✅ 課程清單能正確篩選和搜尋
- ✅ 軟刪除功能正常
- ✅ /qc 通過（VERIFY + CODE-REVIEW）

---

### Phase 2：課程-從業人員聯動（1-2 天）

**里程碑**：
1. **Day 1**：PractitionerForm 整合課程選擇
   - [ ] 修改: PractitionerForm.tsx（新增課程複選框）
   - [ ] API: GET /api/practitioners/:id/services
   - [ ] 驗證：至少選擇一個課程

2. **Day 2**：時段管理（optional 進階）
   - [ ] 遷移: 016_service_practitioner_schedule（若需要）
   - [ ] 組件: ServiceScheduleForm
   - [ ] 時段衝突檢測

**完成標準**：
- ✅ 「新增老師」彈窗能正常選擇課程
- ✅ 課程清單動態更新（新增課程立即出現）
- ✅ 從業人員的課程指派正確儲存
- ✅ /qc 通過

---

### Phase 3：預約聯動（1-2 天）

**里程碑**：
1. **Day 1**：預約表單課程選擇
   - [ ] 修改: BookingPage（課程下拉選擇）
   - [ ] 邏輯：課程選擇 → 時段篩選
   - [ ] 定價帶入預約確認

2. **Day 2**：預約驗證和測試
   - [ ] 驗證：課程必須是活躍狀態
   - [ ] 驗證：課程不能被刪除
   - [ ] 驗證：定價一致性
   - [ ] 端到端測試

**完成標準**：
- ✅ 客戶能從課程清單中選擇預約課程
- ✅ 課程定價正確顯示
- ✅ 預約確認頁面清晰顯示課程信息
- ✅ /qc 通過

---

### 總時間估算

| Phase | 工作量 | 依賴 | 關鍵路徑 |
|-------|--------|------|----------|
| Phase 1 | 2-3 天 | 無 | 🔴 |
| Phase 2 | 1-2 天 | Phase 1 完成 | 🟠 |
| Phase 3 | 1-2 天 | Phase 1 完成 | 🟠 |
| **總計** | **4-7 天** | - | - |

**加速策略**：
- 三個 Phase 可部分並行（Phase 1 完成 60% 後開始 Phase 2）
- 預期加速至 **3-4 工作天**

---

## ✨ 後續迭代（Phase 4+）

### Phase 4：課程分類與標籤

- 課程分類管理（如：按摩、伸展、美容）
- 課程標籤系統（如：「推薦」、「新課程」）
- 課程首頁推薦展示

### Phase 5：課程套餐與優惠

- 課程組合販售（如：「3 次按摩套餐」）
- 套餐定價和時間限制
- 套餐進度跟蹤

### Phase 6：課程評價與分析

- 客戶課後評價
- 課程滿意度統計
- 課程熱度排行榜

---

## 📝 附錄

### A. 詞彙定義

| 詞彙 | 定義 |
|------|------|
| **課程** | 可預約的服務項目，有名稱、時長、定價 |
| **從業人員** | 按摩師、伸展師、美容師等，可提供特定課程 |
| **課程時段** | 從業人員在特定曜日提供該課程的時間範圍 |
| **預約** | 客戶預定從業人員在指定時間提供的課程 |
| **軟刪除** | 設定刪除標記但保留資料，保護歷史記錄 |
| **聯動** | 一個模塊的改變自動觸發其他模塊的更新 |

### B. 相關 PRD 與文件

- [成員管理系統 PRD](./PRD_MEMBER_MANAGEMENT.md)
- [安全審查報告](./SECURITY_REVIEW.md)
- [CLAUDE.md 開發指南](./CLAUDE.md)

### C. 成功案例

**預期結果**：完成此 PRD 後
```
管理員工作流：
1. 進入「課程管理」頁面
2. 點擊「+ 新增課程」
3. 填寫課程信息（如：「60分鐘深層肌肉按摩 ¥1,500」）
4. 保存 → 系統返回列表
5. 進入「從業人員管理」
6. 新增老師時，課程清單可見，直接勾選該課程
7. 保存 → 系統確認成功
8. 進入「預約管理」
9. 手動新增預約時，課程清單能選擇並自動帶入定價

結果：完整的課程 → 從業人員 → 預約 三角聯動✅
```

---

**文件生成時間**：2026-06-08  
**下一步行動**：
1. [ ] 團隊審核此 PRD
2. [ ] 獲得產品經理批准
3. [ ] 分配開發資源
4. [ ] 開始 Phase 1 開發（Day 1：資料庫遷移）
