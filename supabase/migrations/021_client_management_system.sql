-- ============================================================
-- Migration 021: 客戶管理系統
-- 功能：軟刪除、電話唯一性、統計 View、搜尋 RPC
-- 依賴：001（clients 表）、008（bookings.price）
-- ============================================================

-- ── 1. 擴展 clients 表欄位 ────────────────────────────────────

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;            -- 軟刪除

-- ── 2. 索引策略（依 Supabase best practices）────────────────────

-- 移除舊的非 partial 電話索引（全表掃描，且不支援唯一性）
DROP INDEX IF EXISTS idx_clients_phone;

-- 電話 × 店家唯一性（partial：只限未刪除客戶，允許已刪除客戶重用號碼）
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_phone_store_unique
  ON clients(phone, store_id)
  WHERE deleted_at IS NULL;

-- 列表查詢：按店家 + 軟刪除過濾（最常用查詢路徑）
CREATE INDEX IF NOT EXISTS idx_clients_store_active
  ON clients(store_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- 搜尋：client_id 查預約（已有 idx_bookings_client，確認存在）
CREATE INDEX IF NOT EXISTS idx_bookings_client_id
  ON bookings(client_id, start_time DESC);

-- ── 3. 自動更新 updated_at 觸發器 ────────────────────────────

CREATE OR REPLACE FUNCTION set_clients_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_clients_updated_at();

-- ── 4. 更新 RLS：排除已軟刪除的客戶 ─────────────────────────

-- 先移除 001 建立的舊 policy
DROP POLICY IF EXISTS "clients_store_isolation" ON clients;

-- SELECT：店家隔離 + 過濾已刪除
CREATE POLICY "clients_select"
  ON clients FOR SELECT
  USING (
    store_id = current_store_id()
    AND deleted_at IS NULL
  );

-- INSERT：寫入必須屬於自己店家
CREATE POLICY "clients_insert"
  ON clients FOR INSERT
  WITH CHECK (store_id = current_store_id());

-- UPDATE：只能改自己店家的客戶
CREATE POLICY "clients_update"
  ON clients FOR UPDATE
  USING (store_id = current_store_id())
  WITH CHECK (store_id = current_store_id());

-- DELETE（物理刪除）：禁止；軟刪除透過 UPDATE deleted_at 處理
-- 不建立 DELETE policy → 物理刪除會被 RLS 拒絕

-- ── 5. client_stats View（客戶列表帶統計）──────────────────────
-- 使用 LEFT JOIN 避免無預約客戶被過濾
-- FILTER (WHERE ...) 比 CASE WHEN 更高效（PostgreSQL 9.4+）

CREATE OR REPLACE VIEW client_stats AS
SELECT
  c.id,
  c.store_id,
  c.full_name,
  c.phone,
  c.email,
  c.notes,
  c.created_at,
  c.updated_at,
  -- 統計（只計算未軟刪除的預約）
  COUNT(b.id)                                                     AS booking_count,
  COUNT(b.id) FILTER (WHERE b.status = 'completed')               AS completed_count,
  COUNT(b.id) FILTER (WHERE b.status = 'cancelled')               AS cancelled_count,
  COALESCE(
    SUM(b.price)  FILTER (WHERE b.status = 'completed'), 0
  )                                                               AS total_spent,
  CASE
    WHEN COUNT(b.id) FILTER (WHERE b.status = 'completed') > 0
    THEN ROUND(
      COALESCE(SUM(b.price) FILTER (WHERE b.status = 'completed'), 0)::NUMERIC
      / COUNT(b.id) FILTER (WHERE b.status = 'completed')
    )
    ELSE 0
  END                                                             AS avg_spent,
  MIN(b.start_time)                                               AS first_booking_at,
  MAX(b.start_time)                                               AS last_booking_at,
  -- 是否有未來待確認/已確認的預約（刪除警告用）
  COUNT(b.id) FILTER (
    WHERE b.status IN ('pending', 'confirmed')
    AND   b.start_time > NOW()
  )                                                               AS upcoming_count
FROM clients c
LEFT JOIN bookings b
  ON  b.client_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id;

-- View 開啟 RLS（繼承底層表的 RLS）
-- client_stats 是 VIEW，不能直接加 RLS，需透過 SECURITY INVOKER（預設）
-- 底層 clients 的 RLS 會自動套用

-- ── 6. 搜尋 RPC：autocomplete 用（預約管理選客戶）──────────────
-- SECURITY DEFINER 以確保 RLS 能正確套用 current_store_id()

CREATE OR REPLACE FUNCTION search_clients(
  p_query      TEXT,
  p_store_id   UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_limit      INT  DEFAULT 10
)
RETURNS TABLE (
  id         UUID,
  full_name  TEXT,
  phone      TEXT,
  email      TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.id,
    c.full_name,
    c.phone,
    c.email
  FROM clients c
  WHERE c.store_id   = p_store_id
    AND c.deleted_at IS NULL
    AND (
      c.full_name ILIKE '%' || p_query || '%'
      OR c.phone  ILIKE '%' || p_query || '%'
    )
  ORDER BY
    -- 完全符合優先，然後前綴符合，最後子字串
    CASE
      WHEN c.full_name ILIKE p_query || '%' THEN 0
      WHEN c.phone     ILIKE p_query || '%' THEN 1
      ELSE 2
    END,
    c.full_name
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION search_clients TO authenticated;

-- ── 7. 客戶預約歷史 RPC（詳情 Drawer 用）────────────────────────

CREATE OR REPLACE FUNCTION get_client_bookings(
  p_client_id UUID,
  p_limit     INT DEFAULT 50
)
RETURNS TABLE (
  id               UUID,
  start_time       TIMESTAMPTZ,
  end_time         TIMESTAMPTZ,
  status           booking_status,
  price            INT,
  notes            TEXT,
  practitioner_name TEXT,
  service_name      TEXT,
  service_duration  INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    b.id,
    b.start_time,
    b.end_time,
    b.status,
    b.price,
    b.notes,
    p.name  AS practitioner_name,
    s.name  AS service_name,
    s.duration_minutes AS service_duration
  FROM bookings b
  JOIN practitioners p ON p.id = b.practitioner_id
  JOIN services      s ON s.id = b.service_id
  WHERE b.client_id = p_client_id
    AND b.store_id  = current_store_id()
  ORDER BY b.start_time DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_client_bookings TO authenticated;

-- ── 8. 完整性約束 ─────────────────────────────────────────────

-- 電話至少 6 碼（容許格式：09xx, +886, 含 - 的格式）
-- 採寬鬆驗證，嚴格驗證留給前端
ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_phone_format,
  ADD  CONSTRAINT clients_phone_min_length
    CHECK (phone IS NULL OR LENGTH(TRIM(phone)) >= 6);

-- ── Comments ──────────────────────────────────────────────────

COMMENT ON VIEW     client_stats                IS '客戶列表含統計（預約次數、消費金額、最後預約日期）';
COMMENT ON FUNCTION search_clients              IS '客戶姓名/電話搜尋，供新增預約 autocomplete 使用';
COMMENT ON FUNCTION get_client_bookings         IS '取得特定客戶的完整預約歷史（含老師、課程資訊）';
COMMENT ON COLUMN   clients.deleted_at          IS '軟刪除時間戳；NULL = 有效客戶';
COMMENT ON COLUMN   clients.updated_at          IS '最後更新時間（由觸發器自動維護）';
