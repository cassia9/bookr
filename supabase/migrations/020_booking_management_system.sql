-- 遷移：預約管理系統 Phase 1
-- 建立 clients 表、擴展 bookings 表、添加衝突檢測函數
-- 2026-06-10

-- ============================================================
-- 1. 延伸既有 clients 表
-- ============================================================
-- clients 已由 001_initial_schema.sql 建立；沿用 full_name 等正式欄位，
-- 明確補上管理功能需要的欄位，避免 CREATE TABLE IF NOT EXISTS 跳過它們。
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 姓名搜尋使用 ILIKE，pg_trgm 的 GIN 索引可支援非前綴搜尋。
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- 索引：用於搜尋和查詢
CREATE INDEX IF NOT EXISTS idx_clients_store_id ON public.clients(store_id);
CREATE INDEX IF NOT EXISTS idx_clients_store_id_deleted_at
  ON public.clients(store_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_clients_phone
  ON public.clients(phone)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm
  ON public.clients USING GIN (full_name extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 2. 擴展 bookings 表（檢查並添加缺失欄位）
-- ============================================================

-- 檢查並添加 store_id（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='bookings' AND column_name='store_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN store_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
    -- 然後更新為正確的 store_id（通過 practitioners 表）
    UPDATE bookings
    SET store_id = p.store_id
    FROM practitioners p
    WHERE bookings.practitioner_id = p.id;

    -- 添加 FK 約束
    ALTER TABLE bookings
    ADD CONSTRAINT fk_bookings_store_id FOREIGN KEY (store_id) REFERENCES stores(id);
  END IF;
END $$;

-- 檢查並添加 client_id（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='bookings' AND column_name='client_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN client_id UUID REFERENCES clients(id);
  END IF;
END $$;

-- 檢查並添加 deleted_at（軟刪除）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='bookings' AND column_name='deleted_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN deleted_at TIMESTAMP;
  END IF;
END $$;

-- 确保 status 列有默認值
ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'pending';

-- 索引：衝突檢測用
CREATE INDEX IF NOT EXISTS idx_bookings_practitioner_time ON bookings(
  practitioner_id,
  start_time,
  end_time,
  status
) WHERE deleted_at IS NULL AND status IN ('pending', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_bookings_store_id ON bookings(store_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_bookings_client_id ON bookings(client_id);

-- ============================================================
-- 3. 衝突檢測函數
-- ============================================================

CREATE OR REPLACE FUNCTION check_booking_conflict(
  p_practitioner_id UUID,
  p_store_id UUID,
  p_start_time TIMESTAMP,
  p_end_time TIMESTAMP,
  p_exclude_booking_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_conflict_count
  FROM bookings
  WHERE practitioner_id = p_practitioner_id
    AND store_id = p_store_id
    AND status IN ('pending', 'confirmed')
    AND start_time < p_end_time
    AND end_time > p_start_time
    AND deleted_at IS NULL
    AND (p_exclude_booking_id IS NULL OR id != p_exclude_booking_id);

  RETURN v_conflict_count > 0;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 4. RLS 政策 - clients 表
-- ============================================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- 移除 001 與本遷移可能已建立的舊政策，確保可安全重跑，且不讓
-- permissive policy 以 OR 組合後繞過 deleted_at 條件。
DROP POLICY IF EXISTS "clients_store_isolation" ON clients;
DROP POLICY IF EXISTS "admin_view_all_clients" ON clients;
DROP POLICY IF EXISTS "member_view_store_clients" ON clients;
DROP POLICY IF EXISTS "admin_insert_clients" ON clients;
DROP POLICY IF EXISTS "admin_update_clients" ON clients;

-- 管理員可查看所有客戶
CREATE POLICY "admin_view_all_clients" ON clients
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT current_store_id())
    AND (SELECT is_admin())
    AND deleted_at IS NULL
  );

-- 普通成員只能查看該店的客戶
CREATE POLICY "member_view_store_clients" ON clients
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT current_store_id())
    AND deleted_at IS NULL
  );

-- 管理員可新增客戶
CREATE POLICY "admin_insert_clients" ON clients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id = (SELECT current_store_id())
    AND (SELECT is_admin())
    AND deleted_at IS NULL
  );

-- 管理員可更新客戶
CREATE POLICY "admin_update_clients" ON clients
  FOR UPDATE
  TO authenticated
  USING (
    store_id = (SELECT current_store_id())
    AND (SELECT is_admin())
    AND deleted_at IS NULL
  )
  WITH CHECK (
    store_id = (SELECT current_store_id())
    AND (SELECT is_admin())
  );

-- ============================================================
-- 5. RLS 政策 - bookings 表（更新）
-- ============================================================

-- 移除舊政策（如果存在）
DROP POLICY IF EXISTS "admin_view_all_bookings" ON bookings;
DROP POLICY IF EXISTS "member_view_own_bookings" ON bookings;
DROP POLICY IF EXISTS "member_view_bookings" ON bookings;
DROP POLICY IF EXISTS "admin_insert_bookings" ON bookings;
DROP POLICY IF EXISTS "admin_update_bookings" ON bookings;

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- 管理員可查看所有預約
CREATE POLICY "admin_view_all_bookings" ON bookings
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT current_store_id())
    AND (SELECT is_admin())
    AND deleted_at IS NULL
  );

-- 普通成員只能查看自己的預約或該店的預約
CREATE POLICY "member_view_bookings" ON bookings
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT current_store_id())
    AND deleted_at IS NULL
  );

-- 管理員可新增預約
CREATE POLICY "admin_insert_bookings" ON bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id = (SELECT current_store_id())
    AND (SELECT is_admin())
    AND deleted_at IS NULL
  );

-- 管理員可更新預約
CREATE POLICY "admin_update_bookings" ON bookings
  FOR UPDATE
  TO authenticated
  USING (
    store_id = (SELECT current_store_id())
    AND (SELECT is_admin())
    AND deleted_at IS NULL
  )
  WITH CHECK (
    store_id = (SELECT current_store_id())
    AND (SELECT is_admin())
  );

-- ============================================================
-- 6. 觸發器：自動更新 updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clients_updated_at ON clients;
CREATE TRIGGER trigger_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_clients_updated_at();

-- ============================================================
-- 7. 註解（文檔）
-- ============================================================

COMMENT ON TABLE clients IS '客戶資料表 - 存儲預約系統的客戶信息';
COMMENT ON TABLE bookings IS '預約表 - 存儲預約信息，包括客戶、老師、課程、時間等';
COMMENT ON FUNCTION check_booking_conflict IS '檢查時段衝突 - 檢查給定時段內是否有其他預約';
