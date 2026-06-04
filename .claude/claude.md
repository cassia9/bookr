# 預約系統開發指南

## 專案概述

**專案名稱**: 預約管理系統（Booking CSA）  
**技術棧**: React + Vite + Tailwind CSS + Supabase PostgreSQL  
**部署**: Cloudflare Pages + Supabase  

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

## 📝 貢獻指南

1. **命名規範** - 遵循 RLS 政策和 API 端點命名規範
2. **代碼風格** - TypeScript 嚴格模式，Tailwind 實用類
3. **測試** - 新功能應有對應的測試
4. **文檔** - 更新本文件和對應的 PRD
5. **安全** - 遵循安全檢查清單

---

**最後更新**: 2026-06-03  
**維護者**: Development Team
