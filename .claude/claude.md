# 預約系統開發指南

## 專案概述

**專案名稱**: 預約管理系統（Booking CSA）  
**技術棧**: React + Vite + Tailwind CSS + Supabase PostgreSQL  
**部署**: Cloudflare Pages + Supabase  

---

## 🔒 代碼保護規則 (2026-06-04 更新 - 極其重要)

### ⚠️ 背景：2026-06-04 代碼丟失事件

**事件**: 系統 90% 的功能代碼被意外覆蓋成骨架  
**原因**: 缺乏文件隔離和版本控制檢查點  
**損失**: CalendarPage、GanttPage、ClientsPage 等完整實現代碼  
**教訓**: 建立以下防護機制防止再次發生  

### 規則 0️⃣：工作目錄隔離 (最高優先級)

**Claude 必須在隔離環境工作，不直接修改主目錄**

```
隔離環境：
/Users/CL/Documents/booking-system-ai-workspace/  ✅ 允許修改

生產目錄：
/Users/CL/Documents/預約系統/  ❌ 受保護，不直接修改
```

**直接修改生產目錄會被 pre-commit hook 攔截**

### 規則 1️⃣：提交檢查點 (防止代碼丟失)

**規則**：
- ❌ 禁止：同時修改 5 個以上文件而不提交
- ✅ 允許：修改 1-3 個相關文件，立即提交

**提交頻率**：
```
完成 1 個 User Story        → 提交 1 次
修復 1 個 bug              → 提交 1 次  
完成 1 個單元測試          → 提交 1 次
預期：2-4 小時提交一次
```

### 規則 2️⃣：敏感文件保護清單

**🔴 CRITICAL (業務關鍵，修改前必須確認)**：
- src/pages/admin/CalendarPage.tsx
- src/pages/admin/GanttPage.tsx
- src/pages/admin/BookingsPage.tsx
- src/pages/admin/PractitionersPage.tsx
- src/pages/booking/BookingPage.tsx
- supabase/migrations/*

**修改流程**:
1. Read (確認現有代碼)
2. 告訴用戶改動計劃 (等待確認)
3. Edit 或 Write (執行改動)
4. 立即提交 (git add & commit)

### 規則 3️⃣：禁止操作

```
❌ 絕對禁止:
  - 不經 Read 直接 Write 覆蓋敏感文件（>100 行）
  - 批量刪除文件而不確認
  - 同時修改 6 個或以上文件
  - 生成骨架代碼到生產頁面
```

### 規則 4️⃣：故障恢復

**如果代碼丟失，立即執行**:
```bash
# 查看歷史
git log --oneline | head -20

# 恢復單個文件
git checkout HEAD~1 -- src/pages/admin/CalendarPage.tsx

# 恢復整個目錄
git checkout HEAD -- src/

# 確認恢復
git status
```

---

## 💡 重要工作流程規則

### 規則 1️⃣：Supabase SQL 執行流程

**當需要在 Supabase 執行 SQL 時：**

✅ **DO:**
- Claude 直接列出完整的 SQL 代碼，讓用戶可以直接複製粘貼到 Supabase SQL Editor
- SQL 代碼應該是**完整可執行的**（不需要打開遷移文件）
- 在代碼塊前明確標註「複製貼到 Supabase SQL Editor 執行」

❌ **DON'T:**
- 說「去打開 migrations 文件看內容」
- 要求用戶去查找或拼接 SQL 代碼
- 分散在多個文件中的 SQL 指令

**範例：**
```markdown
## 🔄 複製貼到 Supabase SQL Editor 執行

\`\`\`sql
-- 完整 SQL 代碼在這裡
CREATE TABLE ...
ALTER TABLE ...
\`\`\`
```

---

### 規則 2️⃣：遷移文件 vs 執行代碼

**遷移文件** (在 `supabase/migrations/` 中):
- 用於版本控制和文檔
- 應該是完整的、可重複執行的
- 包含說明和註釋

**執行代碼** (給用戶):
- 在 claude.md 規則下，直接提供可複製的代碼
- 應該簡潔且完全獨立
- 無需打開任何文件

---

### 規則 3️⃣：API 端點命名規範

```
POST   /api/invitations              - 邀請成員
GET    /api/invitations/:id          - 查看邀請詳情
POST   /api/auth/accept-invitation   - 接受邀請並註冊
GET    /api/members                  - 列出所有成員
PUT    /api/members/:id              - 編輯成員資訊
DELETE /api/members/:id              - 刪除成員（軟刪除）
```

---

### 規則 4️⃣：RLS 政策命名規範

```
{action}_{role}_{resource}

範例:
- admin_manage_invitations
- member_update_self
- public_read_invitation_by_token
- users_store_isolation
```

---

### 規則 5️⃣：開發環節流程

當執行大型功能時，按以下順序進行：

1. **Phase 1 - 基礎設施**
   - 資料庫表和索引
   - RLS 政策
   - SQL 函數和觸發器

2. **Phase 2 - 後端 API**
   - Edge Functions（郵件、複雜邏輯）
   - API 端點
   - 驗證和授權

3. **Phase 3 - 前端 UI**
   - 頁面和組件
   - 表單和驗證
   - 狀態管理

4. **Phase 4 - 測試**
   - 單元測試（RLS、API）
   - 集成測試（流程端到端）
   - 安全測試

5. **Phase 5 - 部署和文檔**
   - 遷移到生產
   - 用戶文檔
   - 培訓資料

---

### 規則 6️⃣：密鑰和敏感信息

**環境變數**：
- `.env.local` - 本地開發（已在 .gitignore）
- Supabase Environment Variables - 生產環境
- 絕不提交到 Git

**API 密鑰**：
- Supabase anon key - 客戶端（公開但受 RLS 保護）
- Supabase service role key - 僅服務器端
- SendGrid API Key - Edge Function 環境變數
- 每個密鑰只應用在特定環境

---

### 規則 7️⃣：版本控制和審計

**遷移文件**:
- 位置: `supabase/migrations/00N_description.sql`
- 編號: 從 001 開始順序遞增
- 應該是冪等的（可重複執行）

**審計日誌**:
- 所有成員操作都應記錄（新增、修改、刪除）
- 敏感操作（角色變更、刪除）必須記錄
- 包含操作人、時間、前後值

---

### 規則 8️⃣：權限隔離原則

**店家隔離**:
- 一般成員只能看到自己店家的數據（via RLS `current_store_id()`）
- 跨店查詢應被 RLS 拒絕

**角色隔離**:
- 管理員 (`is_admin()`) - 全部訪問
- 一般成員 - 限制的訪問（查看自己的預約等）

**測試方式**:
```sql
-- 驗證 RLS 隔離
SELECT COUNT(*) FROM bookings;  -- 應該只返回該店的數據
```

---

### 規則 9️⃣：頁面組件 Props 設計規範

**容器組件與子組件的 props 通信**:

當實現具有多個視圖模式的頁面時（如行事曆/甘特圖），應遵循以下規範：

```typescript
// 示例：容器組件 (BookingManagement.tsx)
<CalendarPage
  selectedPractitionerId={selectedPractitionerId}
  defaultView={calendarView}
  defaultDate={currentDate}
/>

<GanttPage
  selectedPractitionerId={selectedPractitionerId}
  defaultDate={currentDate}
/>
```

**Props 命名規範**:
- `selectedXxxId` - 用於選中狀態（如 `selectedPractitionerId`）
- `defaultXxx` - 用於初始化狀態（如 `defaultView`, `defaultDate`）
- `onXxxChange` - 用於回調事件（需要時）

**子組件實現規範**:
1. 定義 Props 接口，所有篩選相關 props 應為 `optional` (`?`)
2. 在 `useState` 初始化時使用 props 提供的值，無則使用預設值
3. 將相關 props 添加到 `useEffect` 依賴數組，確保資料重新載入
4. 在 Supabase 查詢中根據 props 值動態構建 `.eq()` 篩選條件

**篩選實現示例**:
```typescript
// 子組件中的篩選邏輯
let query = supabase.from('bookings').select('*')

// 如果選擇了特定篩選條件，則添加篩選
if (selectedPractitionerId) {
  query = query.eq('practitioner_id', selectedPractitionerId)
}

const { data, error } = await query.order('start_time', { ascending: true })
```

**目的**:
- 使容器組件能夠動態控制子組件的顯示內容
- 避免重複開發相同功能的多個版本
- 便於在切換視圖模式時保持篩選狀態

---

### 規則 🔟：功能完成驗證流程 (Quality Check)

**每次完成功能、頁面或組件開發後，必須執行 `/qc` 流程**

這是**強制性的品質檢查**，用來防止白屏或代碼損壞問題。

**完整流程**：

```
功能開發完成
  ↓
執行 /qc
  ↓
Phase 1: VERIFY (應用是否能跑?)
├─ 運行應用檢查
├─ 檢測白屏/模組錯誤
└─ 驗證基本功能
  ↓
✅ 通過 → 進行 Phase 2
❌ 失敗 → 停止，修復代碼，重新 /qc
  ↓
Phase 2: CODE-REVIEW (代碼品質)
├─ 語法檢查
├─ 架構評估
└─ 給出改進建議
  ↓
報告 + Git 提示
  ↓
git add & git commit
```

**何時執行 /qc**：

✅ **必須執行**:
- 完成一個功能模塊
- 完成一個前端頁面
- 完成一個新組件
- 修復一個 bug
- 在提交代碼之前

❌ **不需執行**:
- 正在進行中的代碼（還未完成）
- 單純看應用效果（直接用 `/verify`）

**檢查清單**：

- [ ] 運行 `/qc`
- [ ] Phase 1 VERIFY 通過（無白屏/模組錯誤）
- [ ] Phase 2 CODE-REVIEW 完成
- [ ] 查看報告和建議
- [ ] 執行 `git commit`

**範例流程**：

```bash
# 1. 完成功能開發
# （修改 1-3 個文件）

# 2. 執行品質檢查
/qc

# 3. 檢查結果
✅ VERIFY: Pass
✅ CODE-REVIEW: Pass (2 suggestions)
📝 Ready to commit

# 4. 提交代碼
git add src/components/MyComponent.tsx
git commit -m "新增 MyComponent 組件"
```

**失敗時的處理**：

```bash
# 如果 /qc 失敗

# 1. 查看失敗信息
❌ VERIFY: Fail
   Error: White screen detected
   Module: Card.tsx not exported

# 2. 修復問題
# - 查看錯誤信息
# - 修改相應代碼

# 3. 重新執行 /qc
/qc

# 4. 通過後再提交
git commit ...
```

**重要事項**：

- 🚫 **禁止在 /qc 失敗後提交代碼**
- 🔄 **一直 /qc 直到通過**
- 📝 **記錄每次檢查結果**（可選，用於回顧）
- ⚠️ **如果 /qc 失敗，先修復再提交**

---

## 📋 現有資源清單

### 安全相關
- `SECURITY_REVIEW.md` - 完整的安全審查報告
- `SECURITY_IMPROVEMENT_PLAN.md` - 安全改善計劃

### 文檔
- `PRD_MEMBER_MANAGEMENT.md` - 成員管理系統需求文檔
- `SENDGRID_SETUP.md` - SendGrid 郵件服務配置指南

### 代碼
- `supabase/migrations/013_member_management_system.sql` - Phase 1 遷移
- `supabase/functions/send-invitation-email/index.ts` - 郵件 Edge Function

---

## 🔒 安全檢查清單

在提交任何代碼前：

- [ ] 沒有硬編碼的密鑰或密碼
- [ ] 所有涉及數據的操作都有 RLS 保護
- [ ] 輸入都經過驗證和清理
- [ ] SECURITY DEFINER 函數受信任（不信任用戶輸入）
- [ ] 敏感操作被記錄在審計日誌
- [ ] 沒有 SQL 注入漏洞
- [ ] 沒有跨店家數據洩露風險

---

## 📊 任務追蹤

使用 TaskCreate/TaskUpdate 追蹤進度：

```bash
# 查看所有任務
# 使用 TaskList 查看

# 標記任務為進行中
# 使用 TaskUpdate taskId status:in_progress

# 標記任務完成
# 使用 TaskUpdate taskId status:completed
```

---

## 🚀 快速參考

### 常用命令

```bash
# 啟動開發伺服器
npm run dev

# 部署 Edge Function
npx supabase functions deploy send-invitation-email

# 檢查 RLS 政策
SELECT * FROM pg_policies WHERE tablename = 'bookings';

# 查看審計日誌
SELECT * FROM audit_logs WHERE user_id = '<user-id>' ORDER BY timestamp DESC;
```

### 常用函數

```sql
-- 驗證邀請 token
SELECT * FROM validate_invitation_token('uuid-here');

-- 當前用戶的店家 ID
SELECT current_store_id();

-- 檢查是否為管理員
SELECT is_admin();
```

---

## 🌐 通訊規則

### 語言設定

**Claude 與用戶的通訊語言由用戶指定**

✅ **DO:**
- 默認使用**繁體中文**進行所有溝通和代碼註釋
- 如果用戶明確要求用其他語言（如英文），立即切換語言
- 將該語言規則更新到本文件中
- 代碼提交信息（commit messages）使用繁體中文
- 在代碼中的註釋和文檔使用繁體中文

❌ **DON'T:**
- 混合使用中文和英文
- 在繁體中文環境中使用英文回覆
- 在代碼中使用英文註釋（除非特別說明）

**當前設定**: 🇹🇼 繁體中文（自 2026-06-08 起）

---

## 📝 貢獻指南

1. **命名規範** - 遵循 RLS 政策和 API 端點命名規範
2. **代碼風格** - TypeScript 嚴格模式，Tailwind 實用類
3. **測試** - 新功能應有對應的測試
4. **文檔** - 更新本文件和對應的 PRD
5. **安全** - 遵循安全檢查清單

---

**最後更新**: 2026-06-08  
**維護者**: Development Team  
**新增**: 規則 🔟 - 功能完成驗證流程 (/qc)  
**新增**: 🌐 通訊規則 - 繁體中文為默認語言
