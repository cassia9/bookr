-- 重新邀請已刪除成員時，原子恢復成員資料並完成邀請。
-- 僅允許 service_role（accept-invitation Edge Function）執行。

BEGIN;

CREATE OR REPLACE FUNCTION public.reactivate_member_invitation(
  p_invitation_id UUID,
  p_user_id UUID,
  p_full_name TEXT
)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role public.user_role,
  store_id UUID
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_invitation public.pending_invitations%ROWTYPE;
  v_user public.users%ROWTYPE;
BEGIN
  IF BTRIM(COALESCE(p_full_name, '')) = ''
    OR LENGTH(BTRIM(p_full_name)) > 100 THEN
    RAISE EXCEPTION 'Invalid member name' USING ERRCODE = '22023';
  END IF;

  SELECT invitation.*
  INTO v_invitation
  FROM public.pending_invitations AS invitation
  WHERE invitation.id = p_invitation_id
    AND invitation.accepted_at IS NULL
    AND invitation.processing_at IS NOT NULL
    AND invitation.expires_at > statement_timestamp()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.users AS member
  SET
    email = v_invitation.email,
    full_name = BTRIM(p_full_name),
    role = v_invitation.role,
    invited_by = v_invitation.created_by,
    invited_at = statement_timestamp(),
    deleted_at = NULL,
    updated_at = statement_timestamp()
  WHERE member.id = p_user_id
    AND LOWER(member.email) = LOWER(v_invitation.email)
    AND member.store_id = v_invitation.store_id
    AND member.deleted_at IS NOT NULL
  RETURNING member.* INTO v_user;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.pending_invitations AS invitation
  SET
    accepted_at = statement_timestamp(),
    accepted_user_id = p_user_id,
    processing_at = NULL
  WHERE invitation.id = v_invitation.id
    AND invitation.accepted_at IS NULL
    AND invitation.processing_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation completion failed' USING ERRCODE = '40001';
  END IF;

  RETURN QUERY
  SELECT
    v_user.id,
    v_user.email,
    v_user.full_name,
    v_user.role,
    v_user.store_id;
END;
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.reactivate_member_invitation(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
  ON FUNCTION public.reactivate_member_invitation(UUID, UUID, TEXT)
  TO service_role;

COMMIT;
