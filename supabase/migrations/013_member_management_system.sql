-- =============================================
-- 成員管理系統（邀請、註冊、權限）
-- Phase 1: 基礎設施
-- =============================================

-- ── Step 1: 建立 pending_invitations 表 ──

CREATE TABLE IF NOT EXISTS pending_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'member',
  token UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT unique_pending_invitation UNIQUE(store_id, email),
  CONSTRAINT email_valid CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- 索引：用於快速查詢待定邀請
CREATE INDEX idx_pending_invitations_token ON pending_invitations(token);
CREATE INDEX idx_pending_invitations_store_id ON pending_invitations(store_id);
CREATE INDEX idx_pending_invitations_email ON pending_invitations(email);
CREATE INDEX idx_pending_invitations_expires_at ON pending_invitations(expires_at);

-- ── Step 2: 修改 users 表 ──

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

-- ── Step 3: 啟用 pending_invitations 的 RLS ──

ALTER TABLE pending_invitations ENABLE ROW LEVEL SECURITY;

-- ── Step 4: 建立 RLS 政策 ──

-- 管理員可查看和管理所有邀請
DROP POLICY IF EXISTS "admin_manage_invitations" ON pending_invitations;
CREATE POLICY "admin_manage_invitations"
  ON pending_invitations
  FOR ALL
  TO authenticated
  USING (store_id = current_store_id() AND is_admin())
  WITH CHECK (store_id = current_store_id() AND is_admin());

-- 任何人（未登入或已登入）都可以用 token 查詢邀請（用於註冊流程）
DROP POLICY IF EXISTS "public_read_invitation_by_token" ON pending_invitations;
CREATE POLICY "public_read_invitation_by_token"
  ON pending_invitations
  FOR SELECT
  TO public
  USING (true);
  -- 注意：這個政策允許查詢，但應用層需驗證 token 有效性和過期時間

-- 已接受的邀請對應成員可查看自己的邀請記錄（選填）
DROP POLICY IF EXISTS "user_read_own_invitation" ON pending_invitations;
CREATE POLICY "user_read_own_invitation"
  ON pending_invitations
  FOR SELECT
  TO authenticated
  USING (accepted_user_id = auth.uid());

-- ── Step 5: 更新 users 表的 RLS 政策 ──

-- 一般成員只能修改自己的密碼和基本資料
DROP POLICY IF EXISTS "member_update_self" ON users;
CREATE POLICY "member_update_self"
  ON users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM users WHERE id = auth.uid())  -- 成員無法改自己的角色
    AND store_id = current_store_id()
  );

-- 管理員可修改其他成員的角色
DROP POLICY IF EXISTS "admin_update_member_role" ON users;
CREATE POLICY "admin_update_member_role"
  ON users
  FOR UPDATE
  TO authenticated
  USING (
    store_id = current_store_id()
    AND is_admin()
    AND id != auth.uid()  -- 管理員不能改自己的角色
  )
  WITH CHECK (
    store_id = current_store_id()
    AND is_admin()
    AND id != auth.uid()
  );

-- 管理員可刪除成員（軟刪除）
-- 注意：刪除是軟刪除，使用觸發器設定 deleted_at 而不是真正刪除
-- 這裡不實現刪除政策，改用應用層邏輯和觸發器

-- ── Step 6: 新增 deleted_at 欄位到 users 表 ──

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ── Step 7: 更新 users 的 SELECT 政策排除已刪除成員 ──

-- 已有的 users_store_isolation 政策需要更新
DROP POLICY IF EXISTS "users_store_isolation" ON users;
CREATE POLICY "users_store_isolation"
  ON users
  FOR ALL
  USING (store_id = current_store_id() AND deleted_at IS NULL);

-- ── Step 8: 建立觸發器自動更新 updated_at ──

CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_update_updated_at ON users;
CREATE TRIGGER users_update_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();

-- ── Step 9: 驗證邀請 token 有效性的 SQL 函數 ──

CREATE OR REPLACE FUNCTION validate_invitation_token(p_token UUID)
RETURNS TABLE (
  valid BOOLEAN,
  store_id UUID,
  email TEXT,
  role user_role,
  message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN pi.id IS NULL THEN false
      WHEN pi.accepted_at IS NOT NULL THEN false
      WHEN pi.expires_at < NOW() THEN false
      ELSE true
    END as valid,
    pi.store_id,
    pi.email,
    pi.role,
    CASE
      WHEN pi.id IS NULL THEN 'Invitation not found'
      WHEN pi.accepted_at IS NOT NULL THEN 'Invitation already accepted'
      WHEN pi.expires_at < NOW() THEN 'Invitation expired'
      ELSE 'Valid'
    END as message
  FROM pending_invitations pi
  WHERE pi.token = p_token
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION validate_invitation_token TO anon, authenticated;

-- ── Step 10: 建立發送邀請郵件的 Edge Function 準備 ──
-- 注意：實際郵件發送邏輯在 Supabase Edge Function 中實現
-- 這裡只是建立資料，實際郵件由應用層或 Edge Function 發送

CREATE OR REPLACE FUNCTION send_invitation_email(
  p_invitation_id UUID,
  p_store_name TEXT,
  p_invitation_link TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT;
  v_store_id UUID;
  v_created_by UUID;
BEGIN
  -- 取得邀請資訊
  SELECT email, store_id, created_by INTO v_email, v_store_id, v_created_by
  FROM pending_invitations
  WHERE id = p_invitation_id;

  IF v_email IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'INVITATION_NOT_FOUND');
  END IF;

  -- 注意：實際郵件發送由應用層或 Edge Function 處理
  -- 此函數僅驗證邀請存在
  RETURN json_build_object(
    'ok', true,
    'email', v_email,
    'message', 'Invitation email ready to send'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION send_invitation_email TO authenticated;

-- ── Step 11: 建立審計日誌事件 ──

CREATE OR REPLACE FUNCTION audit_member_events()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values, store_id)
    VALUES (auth.uid(), 'MEMBER_ADDED', TG_TABLE_NAME, NEW.id, row_to_json(NEW), NEW.store_id);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, store_id)
    VALUES (auth.uid(), 'MEMBER_UPDATED', TG_TABLE_NAME, NEW.id, row_to_json(OLD), row_to_json(NEW), NEW.store_id);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, store_id)
    VALUES (auth.uid(), 'MEMBER_DELETED', TG_TABLE_NAME, OLD.id, row_to_json(OLD), OLD.store_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 為 pending_invitations 建立審計觸發器
DROP TRIGGER IF EXISTS audit_pending_invitations ON pending_invitations;
CREATE TRIGGER audit_pending_invitations
  AFTER INSERT OR UPDATE OR DELETE ON pending_invitations
  FOR EACH ROW
  EXECUTE FUNCTION audit_member_events();

-- 為 users 表的成員操作建立審計觸發器
DROP TRIGGER IF EXISTS audit_users_members ON users;
CREATE TRIGGER audit_users_members
  AFTER UPDATE ON users
  FOR EACH ROW
  WHEN (OLD.role != NEW.role OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION audit_member_events();

-- ── Step 12: 驗證部署 ──

-- 檢查表是否建立
SELECT 'pending_invitations table created' as status
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pending_invitations');

-- 檢查 RLS 是否啟用
SELECT 'RLS enabled on pending_invitations' as status
WHERE EXISTS (
  SELECT 1 FROM pg_tables
  WHERE tablename = 'pending_invitations' AND rowsecurity = true
);

-- =============================================
-- 部署完成
-- =============================================
-- 下一步：
-- 1. 配置郵件服務（SendGrid / Mailgun API 金鑰）
-- 2. 建立 Supabase Edge Function 發送郵件
-- 3. 實現後端 API 端點
-- 4. 實現前端 UI
