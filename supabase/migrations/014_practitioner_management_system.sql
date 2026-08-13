-- Migration 014: 從業人員管理系統（Practitioner Management）
-- 建立時間：2026-06-05
-- 功能：
--   - practitioners 表：老師基本資訊（包含顏色標識）
--   - practitioner_leaves 表：老師休假時間
--   - practitioner_services 表：老師與課程的多對多關係
--   - RLS 政策：管理員與成員權限控制

-- ============================================================
-- 1. PRACTITIONERS 表：延伸既有老師基本資訊
-- ============================================================

-- practitioners 已由 001_initial_schema.sql 建立。CREATE TABLE IF NOT EXISTS
-- 不會補上缺少欄位，因此這裡必須明確延伸既有表，並沿用正式欄位名稱
-- full_name、color、active，避免建立第二套不相容的資料模型。
ALTER TABLE public.practitioners
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_practitioners_store_id
  ON public.practitioners(store_id);
CREATE INDEX IF NOT EXISTS idx_practitioners_active_store
  ON public.practitioners(store_id)
  WHERE active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_practitioners_deleted_at
  ON public.practitioners(deleted_at);

-- 建立全文搜尋索引（用於姓名搜尋）
CREATE INDEX IF NOT EXISTS idx_practitioners_name_search
  ON public.practitioners
  USING gin(to_tsvector('simple'::regconfig, full_name));

-- ============================================================
-- 2. PRACTITIONER_LEAVES 表：老師休假時間
-- ============================================================

CREATE TABLE IF NOT EXISTS practitioner_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL,

  -- 休假時間
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(255),  -- 可選：如「年假」、「生病」

  -- 軟刪除
  deleted_at TIMESTAMPTZ,

  -- 時間戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- 外鍵約束
  CONSTRAINT fk_practitioner_leaves_practitioner
    FOREIGN KEY (practitioner_id) REFERENCES practitioners(id) ON DELETE CASCADE,

  -- 日期驗證：結束日期 >= 開始日期
  CONSTRAINT ck_practitioner_leaves_date_range
    CHECK (end_date >= start_date)
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_practitioner_leaves_practitioner_id
  ON practitioner_leaves(practitioner_id);
CREATE INDEX IF NOT EXISTS idx_practitioner_leaves_start_date
  ON practitioner_leaves(start_date);
CREATE INDEX IF NOT EXISTS idx_practitioner_leaves_end_date
  ON practitioner_leaves(end_date);

-- ============================================================
-- 3. PRACTITIONER_SERVICES 表：老師與課程的多對多關係
-- ============================================================

CREATE TABLE IF NOT EXISTS practitioner_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL,
  service_id UUID NOT NULL,

  -- 軟刪除
  deleted_at TIMESTAMPTZ,

  -- 時間戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- 外鍵約束
  CONSTRAINT fk_practitioner_services_practitioner
    FOREIGN KEY (practitioner_id) REFERENCES practitioners(id) ON DELETE CASCADE,

  CONSTRAINT fk_practitioner_services_service
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,

  -- 唯一性約束：防止重複指派同一課程
  CONSTRAINT uk_practitioner_services_unique
    UNIQUE(practitioner_id, service_id)
);

-- 建立索引
CREATE INDEX IF NOT EXISTS idx_practitioner_services_practitioner_id
  ON practitioner_services(practitioner_id);
CREATE INDEX IF NOT EXISTS idx_practitioner_services_service_id
  ON practitioner_services(service_id);

-- ============================================================
-- 4. 輔助函數
-- ============================================================

-- 取得當前用戶的店家 ID（優化 RLS 性能）
CREATE OR REPLACE FUNCTION public.get_current_store_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.store_id
  FROM public.users AS u
  WHERE u.id = (SELECT auth.uid())
    AND u.deleted_at IS NULL
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_current_store_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_store_id() TO authenticated;

-- ============================================================
-- 5. RLS (Row Level Security) 政策
-- ============================================================

-- 啟用 RLS
ALTER TABLE practitioners ENABLE ROW LEVEL SECURITY;
ALTER TABLE practitioner_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE practitioner_services ENABLE ROW LEVEL SECURITY;

-- ---- PRACTITIONERS 表 RLS 政策 ----

-- 政策 1: admin_manage_practitioners
-- 管理員可以管理（CRUD）任何老師
CREATE POLICY admin_manage_practitioners ON practitioners
  FOR ALL
  TO authenticated
  USING (
    -- 檢查當前用戶是否為該店的管理員
    store_id = get_current_store_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = (SELECT auth.uid())
      AND role = 'admin'
      AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    store_id = get_current_store_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = (SELECT auth.uid())
      AND role = 'admin'
      AND deleted_at IS NULL
    )
  );

-- 政策 2: member_read_practitioners
-- 成員可以查看該店的所有老師
CREATE POLICY member_read_practitioners ON practitioners
  FOR SELECT
  TO authenticated
  USING (
    -- 店家隔離：只能看到自己店家的老師
    store_id = get_current_store_id()
    AND active = true
    AND deleted_at IS NULL  -- 不顯示軟刪除的老師
  );

-- ---- PRACTITIONER_LEAVES 表 RLS 政策 ----

-- 政策 1: admin_manage_practitioner_leaves
-- 管理員可以管理老師的休假
CREATE POLICY admin_manage_practitioner_leaves ON practitioner_leaves
  FOR ALL
  TO authenticated
  USING (
    -- 檢查當前用戶是否為該老師所屬店的管理員
    (SELECT store_id FROM practitioners WHERE id = practitioner_id) =
    get_current_store_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = (SELECT auth.uid())
      AND role = 'admin'
      AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    (SELECT store_id FROM practitioners WHERE id = practitioner_id) =
    get_current_store_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = (SELECT auth.uid())
      AND role = 'admin'
      AND deleted_at IS NULL
    )
  );

-- 政策 2: member_read_practitioner_leaves
-- 成員可以查看該店老師的休假（不包含已刪除老師）
CREATE POLICY member_read_practitioner_leaves ON practitioner_leaves
  FOR SELECT
  TO authenticated
  USING (
    -- 店家隔離 + 軟刪除檢查
    (SELECT store_id FROM practitioners WHERE id = practitioner_id) = get_current_store_id()
    AND (SELECT deleted_at FROM practitioners WHERE id = practitioner_id) IS NULL
  );

-- ---- PRACTITIONER_SERVICES 表 RLS 政策 ----

-- 政策 1: admin_manage_practitioner_services
-- 管理員可以管理老師的課程指派
CREATE POLICY admin_manage_practitioner_services ON practitioner_services
  FOR ALL
  TO authenticated
  USING (
    -- 檢查當前用戶是否為該老師所屬店的管理員
    (SELECT store_id FROM practitioners WHERE id = practitioner_id) =
    get_current_store_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = (SELECT auth.uid())
      AND role = 'admin'
      AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    (SELECT store_id FROM practitioners WHERE id = practitioner_id) =
    get_current_store_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = (SELECT auth.uid())
      AND role = 'admin'
      AND deleted_at IS NULL
    )
  );

-- 政策 2: member_read_practitioner_services
-- 成員可以查看該店老師的課程指派（不包含已刪除老師）
CREATE POLICY member_read_practitioner_services ON practitioner_services
  FOR SELECT
  TO authenticated
  USING (
    -- 店家隔離 + 軟刪除檢查
    (SELECT store_id FROM practitioners WHERE id = practitioner_id) = get_current_store_id()
    AND (SELECT deleted_at FROM practitioners WHERE id = practitioner_id) IS NULL
  );

-- ============================================================
-- 6. 觸發器函數：確保老師至少有一個課程指派
-- ============================================================

CREATE OR REPLACE FUNCTION ensure_min_one_service()
RETURNS TRIGGER AS $$
BEGIN
  -- 檢查刪除後該老師是否仍有課程指派
  IF (SELECT COUNT(*) FROM practitioner_services
      WHERE practitioner_id = OLD.practitioner_id) = 0 THEN
    RAISE EXCEPTION 'Practitioner must have at least one service assigned';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 為 practitioner_services 刪除操作建立觸發器
DROP TRIGGER IF EXISTS trigger_ensure_min_service ON practitioner_services;
CREATE TRIGGER trigger_ensure_min_service
BEFORE DELETE ON practitioner_services
FOR EACH ROW
EXECUTE FUNCTION ensure_min_one_service();

-- ============================================================
-- 7. 觸發器：自動更新 updated_at 時間戳
-- ============================================================

CREATE OR REPLACE FUNCTION update_practitioners_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_practitioners_updated_at ON practitioners;
CREATE TRIGGER trigger_practitioners_updated_at
BEFORE UPDATE ON practitioners
FOR EACH ROW
EXECUTE FUNCTION update_practitioners_timestamp();

DROP TRIGGER IF EXISTS trigger_practitioner_leaves_updated_at ON practitioner_leaves;
CREATE TRIGGER trigger_practitioner_leaves_updated_at
BEFORE UPDATE ON practitioner_leaves
FOR EACH ROW
EXECUTE FUNCTION update_practitioners_timestamp();

-- ============================================================
-- 8. 審計日誌（可選，用於追蹤變更）
-- ============================================================

-- 建立審計表（如果尚未存在）
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,  -- 'INSERT', 'UPDATE', 'DELETE'
  table_name TEXT NOT NULL,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_created
  ON audit_logs(store_id, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE audit_logs FROM PUBLIC, anon, authenticated;

-- 審計觸發器（可選）
CREATE OR REPLACE FUNCTION audit_practitioners()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      table_name, record_id, action, user_id, new_values, store_id
    ) VALUES (
      'practitioners', NEW.id, 'INSERT', auth.uid(), to_jsonb(NEW), NEW.store_id
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (
      table_name, record_id, action, user_id, old_values, new_values, store_id
    ) VALUES (
      'practitioners', NEW.id, 'UPDATE', auth.uid(),
      to_jsonb(OLD), to_jsonb(NEW), NEW.store_id
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (
      table_name, record_id, action, user_id, old_values, store_id
    ) VALUES (
      'practitioners', OLD.id, 'DELETE', auth.uid(), to_jsonb(OLD), OLD.store_id
    );
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';

REVOKE ALL ON FUNCTION public.audit_practitioners() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trigger_audit_practitioners ON practitioners;
CREATE TRIGGER trigger_audit_practitioners
AFTER INSERT OR UPDATE OR DELETE ON practitioners
FOR EACH ROW
EXECUTE FUNCTION audit_practitioners();

-- ============================================================
-- 備註：API 端點將在後續實施
-- ============================================================
-- 後續需要實施的 API 端點：
--   - POST   /api/practitioners              - 新增老師
--   - GET    /api/practitioners              - 列出所有老師
--   - GET    /api/practitioners/:id          - 查看老師詳情
--   - PUT    /api/practitioners/:id          - 編輯老師
--   - DELETE /api/practitioners/:id          - 刪除老師（軟刪除）
--   - GET    /api/practitioners/:id/services - 取得老師課程
--   - PUT    /api/practitioners/:id/services - 更新老師課程
--   - GET    /api/practitioners/:id/leaves   - 查詢老師休假
--   - POST   /api/practitioners/:id/leaves   - 新增老師休假
--   - PUT    /api/practitioners/:id/leaves/:leaveId - 編輯休假
--   - DELETE /api/practitioners/:id/leaves/:leaveId - 刪除休假
