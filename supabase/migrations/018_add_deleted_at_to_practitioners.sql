-- Migration 018: 為 practitioners 表添加 deleted_at 列，創建 practitioner_leaves 表
-- 建立時間：2026-06-09
-- 目的：支持軟刪除功能和休假管理

-- ============================================================
-- 1. 為 practitioners 表添加 deleted_at 列
-- ============================================================
ALTER TABLE practitioners
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ============================================================
-- 2. 創建 practitioner_leaves 表（如果不存在）
-- ============================================================
CREATE TABLE IF NOT EXISTS practitioner_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL,

  -- 休假時間
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason VARCHAR(255),

  -- 軟刪除
  deleted_at TIMESTAMPTZ,

  -- 時間戳
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 外鍵約束
  CONSTRAINT fk_practitioner_leaves_practitioner
    FOREIGN KEY (practitioner_id) REFERENCES practitioners(id) ON DELETE CASCADE,

  -- 日期驗證
  CONSTRAINT ck_practitioner_leaves_date_range
    CHECK (end_date >= start_date)
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_practitioner_leaves_practitioner_id
  ON practitioner_leaves(practitioner_id);

CREATE INDEX IF NOT EXISTS idx_practitioner_leaves_date_range
  ON practitioner_leaves(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_practitioner_leaves_deleted_at
  ON practitioner_leaves(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ============================================================
-- 3. 創建 practitioner_services 表（如果不存在）
-- ============================================================
CREATE TABLE IF NOT EXISTS practitioner_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL,
  service_id UUID NOT NULL,

  -- 軟刪除
  deleted_at TIMESTAMPTZ,

  -- 時間戳
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- 外鍵約束
  CONSTRAINT fk_practitioner_services_practitioner
    FOREIGN KEY (practitioner_id) REFERENCES practitioners(id) ON DELETE CASCADE,
  CONSTRAINT fk_practitioner_services_service
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,

  -- 唯一約束：每個從業人員只能指派一次同一課程
  CONSTRAINT uk_practitioner_services
    UNIQUE(practitioner_id, service_id)
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_practitioner_services_practitioner
  ON practitioner_services(practitioner_id);

CREATE INDEX IF NOT EXISTS idx_practitioner_services_service
  ON practitioner_services(service_id);

CREATE INDEX IF NOT EXISTS idx_practitioner_services_deleted_at
  ON practitioner_services(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ============================================================
-- 4. 更新 RLS 政策
-- ============================================================

-- 為 practitioner_leaves 創建 RLS 政策
ALTER TABLE practitioner_leaves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_manage_practitioner_leaves ON practitioner_leaves;
CREATE POLICY admin_manage_practitioner_leaves ON practitioner_leaves
  FOR ALL
  USING (
    (SELECT store_id FROM practitioners WHERE id = practitioner_id) = get_current_store_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  )
  WITH CHECK (
    (SELECT store_id FROM practitioners WHERE id = practitioner_id) = get_current_store_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS member_read_practitioner_leaves ON practitioner_leaves;
CREATE POLICY member_read_practitioner_leaves ON practitioner_leaves
  FOR SELECT
  USING (
    (SELECT store_id FROM practitioners WHERE id = practitioner_id) = get_current_store_id()
  );

-- 為 practitioner_services 創建 RLS 政策
ALTER TABLE practitioner_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_manage_practitioner_services ON practitioner_services;
CREATE POLICY admin_manage_practitioner_services ON practitioner_services
  FOR ALL
  USING (
    (SELECT store_id FROM practitioners WHERE id = practitioner_id) = get_current_store_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  )
  WITH CHECK (
    (SELECT store_id FROM practitioners WHERE id = practitioner_id) = get_current_store_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS member_read_practitioner_services ON practitioner_services;
CREATE POLICY member_read_practitioner_services ON practitioner_services
  FOR SELECT
  USING (
    (SELECT store_id FROM practitioners WHERE id = practitioner_id) = get_current_store_id()
  );

-- ============================================================
-- 5. 更新 practitioners 表的 RLS 政策
-- ============================================================

DROP POLICY IF EXISTS member_read_practitioners ON practitioners;
CREATE POLICY member_read_practitioners ON practitioners
  FOR SELECT
  USING (
    store_id = get_current_store_id()
    AND active = true
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS admin_manage_practitioners ON practitioners;
CREATE POLICY admin_manage_practitioners ON practitioners
  FOR ALL
  USING (
    store_id = get_current_store_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  )
  WITH CHECK (
    store_id = get_current_store_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );
