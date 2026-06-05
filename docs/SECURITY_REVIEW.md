# 🔒 Security Code Review — 預約管理系統

**Date:** 2026-06-03  
**Status:** 發現 7 個高/中度風險項目，需立即改善

---

## Executive Summary

系統整體架構使用了 Supabase + RLS + SECURITY DEFINER 正確的多層防禦，但在以下三個領域存在風險：

| 風險等級 | 數量 | 主要項目 |
|---------|------|---------|
| 🔴 **CRITICAL** | 2 | API 金鑰外洩，儲存bucket無路徑隔離 |
| 🟠 **HIGH** | 2 | SECURITY DEFINER 權限提升，缺少輸入驗證 |
| 🟡 **MEDIUM** | 3 | RLS 策略覆蓋不完整，缺少日誌審計，無速率限制 |

---

## 詳細風險分析

### 🔴 CRITICAL Issues

#### 1. **API 金鑰洩露在版本控制中**

**位置:** `.env.local`  
**風險:** 實際的 Supabase 匿名金鑰和項目 URL 被提交到代碼庫

```plaintext
VITE_SUPABASE_URL=https://xfdpcjpjpczqyuqzdqmr.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**為什麼危險：**
- 如果代碼推送到 GitHub/GitLab，即使後來刪除也會在歷史記錄中
- 任何人都可以用這組金鑰直接操作數據庫（受 RLS 保護，但仍可蒐集信息）
- Supabase 金鑰應視為密碼一樣保密

**立即改善方案：**
```bash
# 1️⃣ 立即更換 Supabase 金鑰（在 Project Settings > API 重新生成）
# 2️⃣ 檢查 .gitignore（已正確配置，但金鑰已外洩）
# 3️⃣ 使用環境變數注入，不提交實際值
```

**長期修復:**
```javascript
// ✅ src/lib/supabase.ts 已正確實現
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 但 .env.local 本身不該提交版本控制
```

**Action Required:**
- [ ] 在 Supabase Dashboard 重新生成 API 金鑰
- [ ] 檢查 Git 歷史並清除洩露的金鑰（使用 `git-filter-repo` 或 `BFG`）
- [ ] 更新 `.env.local` 為新金鑰
- [ ] 設置 CI/CD 密鑰管理（GitHub Secrets / Cloudflare Pages Environment）

---

#### 2. **Storage Bucket 無路徑隔離 — 任意上傳風險**

**位置:** `supabase/migrations/009_store_logo.sql`  
**風險:** 認證用戶可以上傳任意文件到 `store-assets` 儲存桶，並覆蓋他人的文件

```sql
-- ❌ 當前不安全的 RLS 政策
CREATE POLICY "auth upload store assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'store-assets');
  -- 只檢查 bucket_id，不檢查路徑或所有權！
```

**攻擊場景：**
1. 登入用戶 A 上傳 `logos/00000000-0000-0000-0000-000000000001.png`
2. 登入用戶 B（不同店家）可以上傳相同路徑，覆蓋 A 的 LOGO
3. 用戶可以枚舉其他店家的路徑並刪除/修改文件

**立即改善方案:**

```sql
-- ✅ 修正後的 RLS 政策：限制用戶只能上傳自己店的資源
DROP POLICY IF EXISTS "auth upload store assets" ON storage.objects;
DROP POLICY IF EXISTS "auth update store assets" ON storage.objects;
DROP POLICY IF EXISTS "auth delete store assets" ON storage.objects;

CREATE POLICY "auth upload store assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store-assets'
    AND (
      -- 路徑格式: logos/{store_id}.{ext}
      name LIKE (
        'logos/' || 
        (SELECT store_id FROM users WHERE id = auth.uid()) || 
        '.%'
      )
    )
  );

CREATE POLICY "auth update store assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'store-assets'
    AND name LIKE (
      'logos/' || 
      (SELECT store_id FROM users WHERE id = auth.uid()) || 
      '.%'
    )
  );

CREATE POLICY "auth delete store assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'store-assets'
    AND name LIKE (
      'logos/' || 
      (SELECT store_id FROM users WHERE id = auth.uid()) || 
      '.%'
    )
  );
```

**Action Required:**
- [ ] 立即部署上述 RLS 修復 SQL
- [ ] 驗證現有 `store-assets/logos/` 中沒有未授權的文件
- [ ] 添加計劃：將來其他 Store 資源也應遵循 `{resource_type}/{store_id}/*` 路徑結構

---

### 🟠 HIGH Issues

#### 3. **SECURITY DEFINER 函數的權限提升風險**

**位置:** 多個函數
- `upsert_booking()` (migration 004, 008)
- `create_booking_public()` (migration 006)
- `get_available_slots()` (migration 006)
- `current_store_id()`, `is_admin()` (migration 001)

**風險:** SECURITY DEFINER 函數以數據庫所有者身份執行，繞過 RLS 檢查。若函數內部驗證不夠，可能導致數據洩露或權限提升。

**案例 — 當前代碼審查:**

```plpgsql
-- ❌ 潛在風險：create_booking_public() 接受 p_store_id 參數
CREATE OR REPLACE FUNCTION create_booking_public(
  ...
  p_store_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 若客戶端傳入不同的 p_store_id，函數會為其他店家建立預約！
  SELECT duration_minutes INTO v_duration
  FROM services 
  WHERE id = p_service_id 
    AND store_id = p_store_id;  -- ← 可被操縱
  ...
END;
$$;

GRANT EXECUTE ON FUNCTION create_booking_public TO anon, authenticated;
```

**為什麼危險:**
1. `anon` 用戶（未登入的客戶）可以傳遞任意 `p_store_id`，為其他店家建立預約
2. 客戶端 JavaScript 可以修改請求，傳入不同的店家 ID
3. 沒有檢查調用者身份或權限

**修復方案:**

```plpgsql
-- ✅ 安全版本：去除 p_store_id 參數，固定為單一店家
CREATE OR REPLACE FUNCTION create_booking_public(
  p_full_name       TEXT,
  p_phone           TEXT,
  p_service_id      UUID,
  p_practitioner_id UUID,
  p_start_time      TIMESTAMPTZ,
  p_notes           TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id       UUID;
  v_duration        INT;
  v_buffer          INT;
  v_end_time        TIMESTAMPTZ;
  v_result          JSON;
  v_store_id        UUID := '00000000-0000-0000-0000-000000000001';  -- 硬編碼
BEGIN
  -- 基本驗證
  IF trim(p_full_name) = '' OR trim(p_phone) = '' THEN
    RETURN json_build_object('ok', false, 'error', 'MISSING_INFO');
  END IF;

  -- 驗證服務存在且隸屬於正確的店家
  SELECT duration_minutes INTO v_duration
  FROM services 
  WHERE id = p_service_id 
    AND active = TRUE
    AND store_id = v_store_id;  -- ← 一定是這家店
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'SERVICE_NOT_FOUND');
  END IF;

  -- ... 其餘邏輯
END;
$$;
```

**進階防禦：**

```plpgsql
-- 添加函數註解說明安全邊界
COMMENT ON FUNCTION create_booking_public IS 
'安全邊界：此函數以 SECURITY DEFINER 執行，僅服務單一店家（ID: 00000000-0000-0000-0000-000000000001）。
客戶端無法修改店家 ID。所有輸入都受到驗證和類型檢查。';
```

**Action Required:**
- [ ] 移除所有公開函數中的 `p_store_id` 參數
- [ ] 硬編碼單一店家 ID（當前已是 `'00000000-0000-0000-0000-000000000001'`）
- [ ] 在多店架構前進行完整的權限審計

---

#### 4. **缺少輸入驗證和長度限制**

**位置:** 多個表和函數

```plpgsql
-- ❌ 潛在風險：無長度限制
CREATE TABLE clients (
  full_name TEXT NOT NULL,        -- 可以輸入 10MB 的文本
  phone     TEXT NOT NULL,        -- 格式沒有驗證
  email     TEXT,                 -- 沒有 email 格式檢查
  notes     TEXT,
  ...
);

-- ❌ 函數參數沒有長度檢查
CREATE OR REPLACE FUNCTION create_booking_public(
  p_full_name TEXT,              -- 無最大長度
  p_phone     TEXT,              -- 無格式驗證
  p_notes     TEXT DEFAULT NULL, -- 無長度限制
)
```

**為什麼危險:**
1. 存儲型 DoS：攻擊者可以填充巨大文本導致數據庫膨脹
2. 顯示型 XSS：雖然有 RLS 保護，但如果前端渲染不當仍可能洩露
3. 業務邏輯錯誤：電話號碼格式錯誤導致通知失敗

**修復方案:**

```plpgsql
-- ✅ 添加檢查約束
ALTER TABLE clients
  ADD CONSTRAINT clients_full_name_length CHECK (char_length(full_name) BETWEEN 1 AND 100),
  ADD CONSTRAINT clients_phone_length CHECK (char_length(phone) BETWEEN 7 AND 20),
  ADD CONSTRAINT clients_email_valid CHECK (email IS NULL OR email ~ '^[^@]+@[^@]+\.[^@]+$'),
  ADD CONSTRAINT clients_notes_length CHECK (char_length(notes) <= 500);

-- ✅ 函數參數驗證
CREATE OR REPLACE FUNCTION create_booking_public(
  p_full_name       TEXT,
  p_phone           TEXT,
  p_service_id      UUID,
  p_practitioner_id UUID,
  p_start_time      TIMESTAMPTZ,
  p_notes           TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_client_id UUID;
  v_duration  INT;
  v_buffer    INT;
  v_end_time  TIMESTAMPTZ;
  v_result    JSON;
  v_store_id  UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- 輸入驗證
  p_full_name := trim(p_full_name);
  p_phone := trim(p_phone);
  
  IF char_length(p_full_name) < 1 OR char_length(p_full_name) > 100 THEN
    RETURN json_build_object('ok', false, 'error', 'INVALID_NAME_LENGTH');
  END IF;
  
  IF NOT (p_phone ~ '^\d{7,20}$') THEN  -- 只允許 7-20 位數字
    RETURN json_build_object('ok', false, 'error', 'INVALID_PHONE_FORMAT');
  END IF;
  
  IF p_notes IS NOT NULL AND char_length(p_notes) > 500 THEN
    RETURN json_build_object('ok', false, 'error', 'NOTES_TOO_LONG');
  END IF;

  -- ... 其餘邏輯
END;
$$;
```

**Action Required:**
- [ ] 為所有文本欄位添加長度約束（CHECK 或 DOMAIN 類型）
- [ ] 為電話、郵件等特定格式的字段添加正則表達式驗證
- [ ] 更新 UpsertBooking 函數的驗證邏輯
- [ ] 在客戶端也實施相同驗證（JavaScript）

---

### 🟡 MEDIUM Issues

#### 5. **RLS 策略覆蓋不完整**

**發現:** `practitioner_blocks` 表沒有顯式的 RLS 策略

```plpgsql
-- ❌ 缺少 RLS 檢查
CREATE TABLE practitioner_blocks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  practitioner_id   UUID NOT NULL REFERENCES practitioners(id),
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ NOT NULL,
  store_id          UUID NOT NULL REFERENCES stores(id),
  ...
);

-- 沒有看到任何 POLICY 定義
```

**為什麼危險:**
- 一般成員可能能夠查看或修改其他從業人員的封鎖時段
- 沒有明確的 RLS 策略意味著預設行為不明確

**修復方案:**

```plpgsql
-- ✅ 添加缺失的 RLS 策略
ALTER TABLE practitioner_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocks_admin_all" ON practitioner_blocks
  FOR ALL USING (store_id = current_store_id() AND is_admin());

CREATE POLICY "blocks_member_read_own_practitioner" ON practitioner_blocks
  FOR SELECT USING (
    store_id = current_store_id()
    AND practitioner_id = current_practitioner_id()
  );

-- 只有管理員可以建立/修改/刪除封鎖時段
CREATE POLICY "blocks_admin_write" ON practitioner_blocks
  FOR INSERT, UPDATE, DELETE
  TO authenticated
  WITH CHECK (store_id = current_store_id() AND is_admin());
```

**Action Required:**
- [ ] 檢查所有表是否已 `ENABLE ROW LEVEL SECURITY`
- [ ] 為 `practitioner_blocks` 添加上述 RLS 策略
- [ ] 為 `notification_settings` 和 `notification_templates` 確認 RLS 正確
- [ ] 編寫測試驗證 RLS 隔離

---

#### 6. **缺少操作日誌和審計追蹤**

**風險:** 無法追蹤誰修改了什麼、何時修改、為什麼修改。無法檢測或調查安全事件。

**為什麼危險:**
1. **合規性：** 無法滿足審計要求
2. **事件調查：** 發生數據洩露時無法追蹤
3. **內部濫用：** 無法檢測員工洩露客戶信息

**修復方案:**

```plpgsql
-- ✅ 創建審計表
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID REFERENCES auth.users(id),
  action        TEXT NOT NULL,  -- 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', etc.
  table_name    TEXT NOT NULL,
  record_id     UUID,
  old_values    JSONB,          -- 修改前的值
  new_values    JSONB,          -- 修改後的值
  ip_address    TEXT,           -- 遠端 IP（來自應用層）
  user_agent    TEXT,           -- 瀏覽器信息
  timestamp     TIMESTAMPTZ DEFAULT NOW(),
  store_id      UUID NOT NULL REFERENCES stores(id)
);

-- ✅ 為關鍵表創建審計觸發器
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, store_id)
    VALUES (auth.uid(), 'UPDATE', TG_TABLE_NAME, NEW.id, row_to_json(OLD), row_to_json(NEW), NEW.store_id);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, store_id)
    VALUES (auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id, row_to_json(OLD), OLD.store_id);
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values, store_id)
    VALUES (auth.uid(), 'INSERT', TG_TABLE_NAME, NEW.id, row_to_json(NEW), NEW.store_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 為關鍵表啟用審計
CREATE TRIGGER audit_bookings AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER audit_clients AFTER UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER audit_services AFTER UPDATE OR DELETE ON services
  FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- RLS 策略：只有管理員可以查看審計日誌
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_admin_only" ON audit_logs
  FOR SELECT USING (store_id = current_store_id() AND is_admin());
```

**前端應用層增強:**

```typescript
// src/lib/supabase.ts 可以包裝日誌記錄
const supabase = createClient(url, key)

// 在關鍵操作後記錄
async function deleteBooking(bookingId: string) {
  const result = await supabase
    .from('bookings')
    .delete()
    .eq('id', bookingId)
  
  // 應用層日誌（用於額外的監控）
  console.log('[AUDIT] Booking deleted', { bookingId, timestamp: new Date() })
  return result
}
```

**Action Required:**
- [ ] 創建 `audit_logs` 表和觸發器
- [ ] 為 `bookings`, `clients`, `services`, `users`, `practitioners` 啟用審計
- [ ] 在後台界面添加審計日誌查詢頁面（管理員專用）
- [ ] 設置每月審計日誌備份

---

#### 7. **缺少 API 速率限制和 DoS 防護**

**風險:** 無限制的 RPC 調用可被濫用進行 DoS 攻擊

```javascript
// ❌ 無限制呼叫，可被自動化腳本濫用
for (let i = 0; i < 10000; i++) {
  supabase.rpc('get_available_slots', {
    p_date: new Date(),
    p_service_id: serviceId,
  })
}
```

**為什麼危險:**
1. 數據庫過載，影響合法用戶
2. 計算資源浪費，增加成本
3. 可被用於恶意信息蒐集（槽位枚舉）

**修復方案:**

```typescript
// ✅ 前端實施：請求去重和背壓
import { throttle } from 'lodash-es'

class AvailableSlotsCache {
  private cache = new Map<string, { slots: Slot[], timestamp: number }>()
  private ttl = 5 * 60 * 1000  // 5 分鐘快取

  async getSlots(date: Date, serviceId: string): Promise<Slot[]> {
    const key = `${date.toISOString()}_${serviceId}`
    const cached = this.cache.get(key)
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.slots
    }

    const { data } = await supabase.rpc('get_available_slots', {
      p_date: date,
      p_service_id: serviceId,
    })
    
    this.cache.set(key, { slots: data, timestamp: Date.now() })
    return data
  }
}

export const slotsCache = new AvailableSlotsCache()

// ✅ 後端實施：Supabase Edge Functions 速率限制
// supabase/functions/get-slots/index.ts
import { serve } from "https://deno.land/std@0.131.0/http/server.ts"

const kv = await Deno.openKv() // Deno KV for rate limiting

serve(async (req) => {
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')
  const key = ['rate-limit', ip]
  
  const count = (await kv.get(key)).value || 0
  if (count > 10) {  // 每分鐘 10 次請求限制
    return new Response('Rate limited', { status: 429 })
  }
  
  await kv.set(key, count + 1, { expireIn: 60000 })
  
  // ... 處理請求
})
```

**Cloudflare WAF 規則:**

```
# .wrangler/wrangler.toml 或 Cloudflare Dashboard
[[env.production.routes]]
pattern = "example.com/api/*"
zone_name = "example.com"

# 配置 Cloudflare Rate Limiting 規則
# - 限制每 IP 每分鐘 60 個請求
# - 限制每會話每分鐘 100 個請求
```

**Action Required:**
- [ ] 實施前端請求快取和去重
- [ ] 在 Cloudflare Workers 或 Supabase Edge Functions 添加速率限制
- [ ] 配置 WAF 規則
- [ ] 監控異常流量並設置告警

---

## Security Checklist — 優先級修復計畫

### Phase 1: Critical (立即 — 24 小時內)

- [ ] **立即重新生成 Supabase API 金鑰**
  - 時間: 5 分鐘
  - 位置: Supabase Dashboard > Project Settings > API
  - 步驟: 重新生成 anon key，更新 `.env.local`
  
- [ ] **修復 Storage Bucket RLS**
  - 時間: 30 分鐘
  - 執行上述 SQL 修復方案
  - 驗證現有文件安全性

- [ ] **硬編碼店家 ID，移除 p_store_id 參數**
  - 時間: 45 分鐘
  - 修改 `create_booking_public()`, `get_available_slots()`
  - 測試公開預約流程

### Phase 2: High (本周內)

- [ ] **添加輸入驗證和長度約束**
  - 時間: 2-3 小時
  - 為所有表添加 CHECK 約束
  - 更新函數驗證邏輯
  
- [ ] **修復 RLS 策略**
  - 時間: 1-2 小時
  - 添加缺失的 `practitioner_blocks` RLS
  - 驗證所有表都啟用了 RLS

### Phase 3: Medium (本月內)

- [ ] **實施審計日誌系統**
  - 時間: 4-6 小時
  - 創建 `audit_logs` 表和觸發器
  - 在後台界面添加查詢功能

- [ ] **實施速率限制**
  - 時間: 3-4 小時
  - 前端快取實施
  - Cloudflare WAF 配置

### Phase 4: Ongoing

- [ ] **定期安全審計**（每季度）
- [ ] **依賴包更新檢查**（@supabase/supabase-js, React 等）
- [ ] **監控異常活動**（審計日誌分析）

---

## 安全最佳實踐建議

### 1. **環境變數管理**

```bash
# ✅ 開發環境
.env.local → gitignore（本地機器）

# ✅ 生產環境
Cloudflare Pages > Settings > Environment Variables
- 不提交 .env 文件到版本控制
- 使用 CI/CD 密鑰管理（GitHub Secrets）

# ✅ 工作流程
git clone → 手動複製 .env.local.example 並填入值
```

### 2. **程式碼審查 Checklist**

在提交任何涉及數據訪問的 PR 時：

```markdown
- [ ] 新增/修改的 RLS 策略經過測試
- [ ] SECURITY DEFINER 函數沒有信任用戶輸入
- [ ] 所有文本輸入都有長度驗證
- [ ] 沒有硬編碼的密鑰或密碼
- [ ] 刪除操作有確認對話框
- [ ] 敏感操作被記錄在審計日誌
```

### 3. **部署前檢查清單**

```bash
# 執行以下命令確認沒有密鑰洩露
git log -p | grep -i "key\|secret\|password" 2>/dev/null

# 檢查 .env 文件
cat .env.local | grep -v "^#" | grep -v "^$"

# 掃描依賴漏洞
npm audit
bunx audit
```

### 4. **監控和告警**

```sql
-- 監控異常登入（多次失敗嘗試）
SELECT COUNT(*), user_id
FROM audit_logs
WHERE action = 'LOGIN' AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY user_id
HAVING COUNT(*) > 5;

-- 監控大量刪除操作
SELECT COUNT(*), user_id
FROM audit_logs
WHERE action = 'DELETE' AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY user_id;
```

---

## 參考資源

1. **Supabase 安全最佳實踐**  
   https://supabase.com/docs/guides/security/overview

2. **OWASP Top 10 Web Application Security Risks**  
   https://owasp.org/www-project-top-ten/

3. **PostgreSQL Row Level Security**  
   https://www.postgresql.org/docs/current/ddl-rowsecurity.html

4. **Supabase RLS Policies**  
   https://supabase.com/docs/guides/database/postgres/row-level-security

---

## 簽署

**審查人:** Claude Security Analysis  
**日期:** 2026-06-03  
**等級:** 中度風險（需改善）  
**建議狀態:** 在部署到生產前必須修復 Critical 和 High 項目

---

*本報告機密。僅供開發團隊和管理人員查閱。*
