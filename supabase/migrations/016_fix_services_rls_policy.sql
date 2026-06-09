-- =============================================
-- 修復 services 表 RLS 策略
-- =============================================
-- 日期：2026-06-08
-- 目的：解決從業人員表單無法加載課程的問題

-- 查看現有策略（診斷）
-- SELECT policyname, qual FROM pg_policies WHERE tablename = 'services';

-- 說明：當前 member_read_active_services 策略要求 store_id 匹配
-- 導致某些用戶無法看到課程列表

-- 步驟 1：保持所有現有策略不變（不刪除）
-- 步驟 2：添加新的策略讓成員能讀取活躍課程

-- 新增：允許所有認證用戶讀取活躍課程
-- 這不會刪除 member_read_active_services，而是補充它
CREATE POLICY IF NOT EXISTS "auth_read_active_services" ON services
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND active = TRUE
    AND deleted_at IS NULL
  );

-- 驗證：確保所有關鍵策略仍存在
-- ✓ admin_edit_services - 管理員編輯
-- ✓ admin_delete_services - 管理員刪除
-- ✓ member_read_active_services - 成員讀取活躍課程
-- ✓ admin_read_all_services - 管理員讀取全部
-- ✓ anon_read_active_services - 未登入用戶讀取活躍課程
-- ✓ auth_read_active_services - 認證用戶讀取活躍課程（新增）

-- 診斷查詢（運行後查看結果）
-- 此查詢會顯示所有 services 表的 RLS 策略
-- SELECT
--   policyname,
--   permissive,
--   roles,
--   qual,
--   with_check
-- FROM pg_policies
-- WHERE tablename = 'services'
-- ORDER BY policyname;
