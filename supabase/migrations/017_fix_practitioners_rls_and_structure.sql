-- Migration 017: 修復從業人員表的 RLS 政策和結構問題
-- 建立時間：2026-06-09
-- 問題：
--   1. 遷移 014 中的 RLS 政策引用不存在的 members 表和 is_admin 欄位
--   2. 欄位名稱不匹配導致 INSERT 失敗
--   3. get_current_store_id() 函數查詢錯誤的表

-- ============================================================
-- 1. 修復 get_current_store_id() 函數
-- ============================================================

CREATE OR REPLACE FUNCTION get_current_store_id()
RETURNS UUID AS $$
  SELECT store_id FROM users WHERE id = auth.uid() LIMIT 1
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- 2. 刪除舊的 RLS 政策（使用 DROP IF EXISTS）
-- ============================================================

DROP POLICY IF EXISTS admin_manage_practitioners ON practitioners;
DROP POLICY IF EXISTS member_read_practitioners ON practitioners;

-- ============================================================
-- 3. 重新建立正確的 RLS 政策
-- ============================================================

-- 政策 1: admin_manage_practitioners
-- 管理員可以管理（CRUD）任何老師
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

-- 政策 2: member_read_practitioners
-- 成員可以查看該店的所有老師（已激活的）
CREATE POLICY member_read_practitioners ON practitioners
  FOR SELECT
  USING (
    store_id = get_current_store_id()
    AND active = true
  );

-- ============================================================
-- 4. 修復 practitioner_services 表的 RLS 政策
-- ============================================================

DROP POLICY IF EXISTS admin_manage_practitioner_services ON practitioner_services;
DROP POLICY IF EXISTS member_read_practitioner_services ON practitioner_services;

-- 政策 1: admin_manage_practitioner_services
-- 管理員可以管理老師的課程指派
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

-- 政策 2: member_read_practitioner_services
-- 成員可以查看該店老師的課程指派
CREATE POLICY member_read_practitioner_services ON practitioner_services
  FOR SELECT
  USING (
    (SELECT store_id FROM practitioners WHERE id = practitioner_id) = get_current_store_id()
  );

-- ============================================================
-- 備註
-- ============================================================
-- 此遷移修復了以下問題：
-- 1. get_current_store_id() 現在查詢 users 表而不是 members 表
-- 2. RLS 政策現在檢查 users.role='admin' 而不是 members.is_admin=true
-- 3. 刪除了引用 practitioner_leaves 的相關 RLS 政策（014 中有誤）
-- 4. Edge Function (practitioners-crud) 現在可以正確執行 INSERT 操作
