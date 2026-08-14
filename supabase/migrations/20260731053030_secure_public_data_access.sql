-- 緊急安全修復：
-- 1. 禁止公開直接讀取邀請資料
-- 2. 禁止匿名直接讀取預約資料
-- 3. 保護審計日誌並移除已記錄的邀請 token
-- 4. 收斂公開函數的執行權限

BEGIN;

-- ============================================================
-- 1. pending_invitations：只允許經 RLS 驗證的認證使用者存取
-- ============================================================

ALTER TABLE public.pending_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_invitation_by_token"
  ON public.pending_invitations;

REVOKE ALL PRIVILEGES
  ON TABLE public.pending_invitations
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.pending_invitations
  TO authenticated;

-- 公開邀請驗證只能透過受限 RPC，不能直接讀取資料表。
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
      WHEN pi.accepted_at IS NOT NULL THEN false
      WHEN pi.expires_at < NOW() THEN false
      ELSE true
    END,
    pi.store_id,
    pi.email,
    pi.role,
    CASE
      WHEN pi.accepted_at IS NOT NULL THEN 'Invitation already accepted'
      WHEN pi.expires_at < NOW() THEN 'Invitation expired'
      ELSE 'Valid'
    END
  FROM public.pending_invitations AS pi
  WHERE pi.token = p_token
  LIMIT 1;
END;
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.validate_invitation_token(UUID)
  FROM PUBLIC;

GRANT EXECUTE
  ON FUNCTION public.validate_invitation_token(UUID)
  TO anon, authenticated;

-- 舊 SQL 輔助函數會依 invitation id 回傳收件者，不再開放給前端角色。
REVOKE ALL PRIVILEGES
  ON FUNCTION public.send_invitation_email(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 2. bookings：公開流程只使用明確授權的 RPC
-- ============================================================

DROP POLICY IF EXISTS "anon read own booking by id"
  ON public.bookings;

REVOKE ALL PRIVILEGES
  ON TABLE public.bookings
  FROM anon;

-- 此舊確認 RPC 只靠 booking id 即回傳客戶電話，目前前端未使用，先停用。
REVOKE ALL PRIVILEGES
  ON FUNCTION public.get_booking_confirmation(UUID)
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3. audit_logs：僅允許受信任的伺服器端角色存取
-- ============================================================

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
  ON TABLE public.audit_logs
  FROM PUBLIC, anon, authenticated;

-- 移除舊審計資料中的邀請 token；保留其餘操作證據。
UPDATE public.audit_logs
SET new_values = new_values - 'token'
WHERE new_values ? 'token';

COMMENT ON TABLE public.audit_logs IS
  '安全審計日誌；禁止透過 anon/authenticated Data API 直接存取';

COMMIT;
