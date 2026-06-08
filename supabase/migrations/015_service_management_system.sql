-- =============================================
-- 課程管理系統 - 資料庫遷移
-- =============================================
-- 2026-06-08
-- 目的：為課程表新增軟刪除機制，並加強 RLS 政策

-- 1. 為 services 表新增軟刪除欄位
ALTER TABLE services ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. 為 services 表新增索引（提升軟刪除查詢效率）
CREATE INDEX IF NOT EXISTS idx_services_deleted_at ON services(deleted_at);
CREATE INDEX IF NOT EXISTS idx_services_active_store ON services(active, store_id) WHERE deleted_at IS NULL;

-- 3. 為 practitioner_services 表新增索引
CREATE INDEX IF NOT EXISTS idx_practitioner_services_deleted_at ON practitioner_services(service_id) WHERE deleted_at IS NULL;

-- 4. 更新 services 的 RLS 政策 - 管理員編輯課程
DROP POLICY IF EXISTS "admin_edit_services" ON services;
CREATE POLICY "admin_edit_services"
  ON services
  FOR UPDATE
  USING (store_id = current_store_id() AND is_admin())
  WITH CHECK (store_id = current_store_id() AND is_admin());

-- 5. 更新 services 的 RLS 政策 - 管理員刪除課程（軟刪除）
DROP POLICY IF EXISTS "admin_delete_services" ON services;
CREATE POLICY "admin_delete_services"
  ON services
  FOR UPDATE
  USING (store_id = current_store_id() AND is_admin())
  WITH CHECK (store_id = current_store_id() AND is_admin());

-- 6. 一般成員只能讀取活躍課程
DROP POLICY IF EXISTS "member_read_active_services" ON services;
CREATE POLICY "member_read_active_services"
  ON services
  FOR SELECT
  USING (
    store_id = current_store_id()
    AND active = TRUE
    AND deleted_at IS NULL
  );

-- 7. 管理員能讀取所有課程（含已刪除）
DROP POLICY IF EXISTS "admin_read_all_services" ON services;
CREATE POLICY "admin_read_all_services"
  ON services
  FOR SELECT
  USING (store_id = current_store_id() AND is_admin());

-- 8. 公開 API：讀取活躍課程（無須登入）
DROP POLICY IF EXISTS "anon_read_active_services" ON services;
CREATE POLICY "anon_read_active_services"
  ON services
  FOR SELECT
  USING (active = TRUE AND deleted_at IS NULL);

-- 9. 確保 practitioner_services 不關聯已刪除課程
CREATE OR REPLACE FUNCTION check_service_not_deleted()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT deleted_at FROM services WHERE id = NEW.service_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot assign a deleted service to a practitioner';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_service_not_deleted ON practitioner_services;
CREATE TRIGGER trg_check_service_not_deleted
BEFORE INSERT ON practitioner_services
FOR EACH ROW
EXECUTE FUNCTION check_service_not_deleted();

-- 10. 當課程被軟刪除時，自動移除從業人員指派
CREATE OR REPLACE FUNCTION cleanup_practitioner_services_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    DELETE FROM practitioner_services
    WHERE service_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cleanup_practitioner_services ON services;
CREATE TRIGGER trg_cleanup_practitioner_services
AFTER UPDATE ON services
FOR EACH ROW
EXECUTE FUNCTION cleanup_practitioner_services_on_delete();
