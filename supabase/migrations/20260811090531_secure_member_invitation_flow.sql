-- 成員邀請流程強化：
-- 1. 保留邀請、重寄、撤銷與接受邀請功能
-- 2. 將待處理邀請限制為店家管理員可存取
-- 3. 收斂 SECURITY DEFINER 與內部 RPC 權限
-- 4. 以原子 claim 避免同一邀請同時被接受或重複寄送
-- 5. 保存寄信狀態，避免介面誤判寄送結果

BEGIN;

-- ============================================================
-- 1. 邀請資料與索引
-- ============================================================

ALTER TABLE public.pending_invitations
  ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_sending_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_send_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_last_error TEXT;

ALTER TABLE public.pending_invitations
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '72 hours');

-- Email 比對統一大小寫；現有待處理資料可原地保留。
UPDATE public.pending_invitations
SET email = LOWER(BTRIM(email))
WHERE email IS DISTINCT FROM LOWER(BTRIM(email));

ALTER TABLE public.pending_invitations
  DROP CONSTRAINT IF EXISTS email_valid,
  ADD CONSTRAINT email_valid
    CHECK (
      LENGTH(email) <= 320
      AND POSITION('@' IN email) > 1
      AND POSITION('.' IN SPLIT_PART(email, '@', 2)) > 0
    );

-- 已接受的歷史邀請不應阻擋日後重新邀請；只限制未接受邀請。
ALTER TABLE public.pending_invitations
  DROP CONSTRAINT IF EXISTS unique_pending_invitation;

DROP INDEX IF EXISTS public.unique_pending_invitation;

CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_invitation_active
  ON public.pending_invitations (store_id, LOWER(email))
  WHERE accepted_at IS NULL;

-- token 的 UNIQUE constraint 已自帶索引，移除重複索引。
DROP INDEX IF EXISTS public.idx_pending_invitations_token;

CREATE INDEX IF NOT EXISTS idx_pending_invitations_store_pending
  ON public.pending_invitations (store_id, created_at DESC)
  WHERE accepted_at IS NULL;

-- ============================================================
-- 2. RLS：保留管理員邀請與刪除功能，移除匿名整表讀取
-- ============================================================

ALTER TABLE public.pending_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_invitation_by_token"
  ON public.pending_invitations;

DROP POLICY IF EXISTS "admin_manage_invitations"
  ON public.pending_invitations;

CREATE POLICY "admin_manage_invitations"
  ON public.pending_invitations
  FOR ALL
  TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  )
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS "user_read_own_invitation"
  ON public.pending_invitations;

CREATE POLICY "user_read_own_invitation"
  ON public.pending_invitations
  FOR SELECT
  TO authenticated
  USING (accepted_user_id = (SELECT auth.uid()));

REVOKE ALL PRIVILEGES
  ON TABLE public.pending_invitations
  FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.pending_invitations
  TO authenticated;

-- ============================================================
-- 3. 公開 Token 驗證：只回傳單一 Token 對應的最小資料
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_invitation_token(p_token UUID)
RETURNS TABLE (
  valid BOOLEAN,
  store_id UUID,
  email TEXT,
  role public.user_role,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN pi.accepted_at IS NOT NULL THEN FALSE
      WHEN pi.expires_at <= NOW() THEN FALSE
      WHEN pi.processing_at IS NOT NULL
        AND pi.processing_at >= NOW() - INTERVAL '15 minutes' THEN FALSE
      ELSE TRUE
    END,
    pi.store_id,
    pi.email,
    pi.role,
    CASE
      WHEN pi.accepted_at IS NOT NULL THEN 'Invitation already accepted'
      WHEN pi.expires_at <= NOW() THEN 'Invitation expired'
      WHEN pi.processing_at IS NOT NULL
        AND pi.processing_at >= NOW() - INTERVAL '15 minutes'
        THEN 'Invitation is being processed'
      ELSE 'Valid'
    END
  FROM public.pending_invitations AS pi
  WHERE pi.token = p_token
  LIMIT 1;
END;
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.validate_invitation_token(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
  ON FUNCTION public.validate_invitation_token(UUID)
  TO anon, authenticated, service_role;

-- 舊 SQL 輔助函式會依 invitation id 回傳 Email，已無使用者，直接移除。
DROP FUNCTION IF EXISTS public.send_invitation_email(UUID, TEXT, TEXT);

-- ============================================================
-- 4. 內部原子 RPC：只允許 service_role 使用
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_member_invitation(p_token UUID)
RETURNS TABLE (
  invitation_id UUID,
  email TEXT,
  store_id UUID,
  role public.user_role,
  created_by UUID
)
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.pending_invitations AS pi
  SET processing_at = statement_timestamp()
  WHERE pi.token = p_token
    AND pi.accepted_at IS NULL
    AND pi.expires_at > statement_timestamp()
    AND (
      pi.processing_at IS NULL
      OR pi.processing_at < statement_timestamp() - INTERVAL '15 minutes'
    )
  RETURNING pi.id, pi.email, pi.store_id, pi.role, pi.created_by;
$$;

CREATE OR REPLACE FUNCTION public.release_member_invitation_claim(p_invitation_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH released AS (
    UPDATE public.pending_invitations
    SET processing_at = NULL
    WHERE id = p_invitation_id
      AND accepted_at IS NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM released);
$$;

CREATE OR REPLACE FUNCTION public.complete_member_invitation(
  p_invitation_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH completed AS (
    UPDATE public.pending_invitations
    SET
      accepted_at = statement_timestamp(),
      accepted_user_id = p_user_id,
      processing_at = NULL
    WHERE id = p_invitation_id
      AND accepted_at IS NULL
      AND processing_at IS NOT NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM completed);
$$;

CREATE OR REPLACE FUNCTION public.claim_invitation_email_send(
  p_invitation_id UUID,
  p_store_id UUID
)
RETURNS TABLE (
  invitation_id UUID,
  email TEXT,
  token UUID,
  expires_at TIMESTAMPTZ,
  created_by UUID
)
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.pending_invitations AS pi
  SET
    email_sending_at = statement_timestamp(),
    email_send_attempts = pi.email_send_attempts + 1,
    email_last_error = NULL
  WHERE pi.id = p_invitation_id
    AND pi.store_id = p_store_id
    AND pi.accepted_at IS NULL
    AND pi.expires_at > statement_timestamp()
    AND (
      pi.email_sending_at IS NULL
      OR pi.email_sending_at < statement_timestamp() - INTERVAL '5 minutes'
    )
    AND (
      pi.email_sent_at IS NULL
      OR pi.email_sent_at < statement_timestamp() - INTERVAL '60 seconds'
    )
  RETURNING pi.id, pi.email, pi.token, pi.expires_at, pi.created_by;
$$;

CREATE OR REPLACE FUNCTION public.finish_invitation_email_send(
  p_invitation_id UUID,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH finished AS (
    UPDATE public.pending_invitations
    SET
      email_sending_at = NULL,
      email_sent_at = CASE
        WHEN p_success THEN statement_timestamp()
        ELSE email_sent_at
      END,
      email_last_error = CASE
        WHEN p_success THEN NULL
        ELSE LEFT(COALESCE(p_error, 'UNKNOWN_ERROR'), 500)
      END
    WHERE id = p_invitation_id
      AND email_sending_at IS NOT NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM finished);
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.claim_member_invitation(UUID),
              public.release_member_invitation_claim(UUID),
              public.complete_member_invitation(UUID, UUID),
              public.claim_invitation_email_send(UUID, UUID),
              public.finish_invitation_email_send(UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
  ON FUNCTION public.claim_member_invitation(UUID),
              public.release_member_invitation_claim(UUID),
              public.complete_member_invitation(UUID, UUID),
              public.claim_invitation_email_send(UUID, UUID),
              public.finish_invitation_email_send(UUID, BOOLEAN, TEXT)
  TO service_role;

-- ============================================================
-- 5. 審計：保留操作記錄，但不保存 Token 或其他憑證
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_member_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sensitive_keys CONSTANT TEXT[] := ARRAY[
    'token',
    'password',
    'authorization',
    'access_token',
    'refresh_token',
    'api_key',
    'secret'
  ];
  v_actor UUID;
  v_old JSONB;
  v_new JSONB;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old := TO_JSONB(OLD) - sensitive_keys;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_new := TO_JSONB(NEW) - sensitive_keys;
  END IF;

  v_actor := (SELECT auth.uid());

  IF v_actor IS NULL THEN
    v_actor := NULLIF(
      COALESCE(
        v_new ->> 'created_by',
        v_old ->> 'created_by',
        v_new ->> 'accepted_user_id',
        v_old ->> 'accepted_user_id',
        v_new ->> 'id',
        v_old ->> 'id'
      ),
      ''
    )::UUID;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id, new_values, store_id
    ) VALUES (
      v_actor, 'MEMBER_ADDED', TG_TABLE_NAME, NEW.id, v_new, NEW.store_id
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id, old_values, new_values, store_id
    ) VALUES (
      v_actor, 'MEMBER_UPDATED', TG_TABLE_NAME, NEW.id, v_old, v_new, NEW.store_id
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (
      user_id, action, table_name, record_id, old_values, store_id
    ) VALUES (
      v_actor, 'MEMBER_DELETED', TG_TABLE_NAME, OLD.id, v_old, OLD.store_id
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.audit_member_events()
  FROM PUBLIC, anon, authenticated, service_role;

-- 管理員仍可在自己的店家範圍內讀取審計記錄。
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_store_audit_logs"
  ON public.audit_logs;

CREATE POLICY "admin_read_store_audit_logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

REVOKE ALL PRIVILEGES
  ON TABLE public.audit_logs
  FROM PUBLIC, anon, authenticated;

GRANT SELECT
  ON TABLE public.audit_logs
  TO authenticated;

COMMENT ON TABLE public.pending_invitations IS
  '店家成員邀請；匿名使用者不可直接讀取，公開驗證僅能使用受限 RPC';

COMMIT;
