-- =============================================
-- 修正 stores 表 RLS：
-- 1. authenticated 用戶可讀取自己關聯的店家
-- 2. 管理員可更新店家設定
-- 3. 順便修正 default_buffer_minutes 初始值
-- =============================================

-- 清除舊的（如有）
DROP POLICY IF EXISTS "authenticated read stores"  ON stores;
DROP POLICY IF EXISTS "admin update stores"        ON stores;

-- authenticated 用戶可 SELECT 自己店的資料
CREATE POLICY "authenticated read stores"
  ON stores FOR SELECT
  TO authenticated
  USING (id = current_store_id());

-- 管理員可 UPDATE 店家設定
CREATE POLICY "admin update stores"
  ON stores FOR UPDATE
  TO authenticated
  USING    (id = current_store_id() AND is_admin())
  WITH CHECK (id = current_store_id() AND is_admin());

-- 修正現有店家的 default_buffer_minutes（如果仍是 0）
UPDATE stores
SET default_buffer_minutes = 30
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND default_buffer_minutes = 0;
