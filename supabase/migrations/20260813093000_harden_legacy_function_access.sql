-- 舊資料庫函式與從業人員封鎖時段安全收尾：
-- 1. 固定函式 search_path，避免執行期間解析到非預期物件
-- 2. 將內部客戶／預約 RPC 限制為 authenticated
-- 3. SECURITY DEFINER RPC 強制套用目前使用者的店家邊界
-- 4. 將 practitioner_blocks 政策由全域放行改為店家隔離

BEGIN;

-- ============================================================
-- 1. users：補上舊觸發器依賴但歷史遷移漏建的欄位
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- 2. API 資料表權限：RLS 決定列範圍，GRANT 決定可用操作
-- ============================================================

GRANT SELECT
  ON TABLE public.stores, public.services, public.practitioners
  TO anon;

GRANT SELECT, UPDATE
  ON TABLE public.stores, public.users
  TO authenticated;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.clients, public.bookings
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE
    public.practitioners,
    public.practitioner_services,
    public.practitioner_leaves,
    public.services,
    public.notification_settings,
    public.notification_templates
  TO authenticated;

GRANT SELECT
  ON TABLE public.client_stats
  TO authenticated;

ALTER VIEW public.client_stats
  SET (security_invoker = true);

-- Edge Functions 僅取得目前實際使用到的資料表操作權限。
GRANT SELECT
  ON TABLE public.stores, public.bookings
  TO service_role;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.users, public.pending_invitations
  TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE
    public.services,
    public.practitioners,
    public.practitioner_services,
    public.practitioner_leaves
  TO service_role;

-- ============================================================
-- 3. practitioner_blocks：保留成員管理功能，但限制在自己的店家
-- ============================================================

ALTER TABLE public.practitioner_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can manage blocks"
  ON public.practitioner_blocks;

DROP POLICY IF EXISTS "member_manage_practitioner_blocks"
  ON public.practitioner_blocks;

CREATE POLICY "member_manage_practitioner_blocks"
  ON public.practitioner_blocks
  FOR ALL
  TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
  )
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND EXISTS (
      SELECT 1
      FROM public.practitioners AS p
      WHERE p.id = practitioner_id
        AND p.store_id = (SELECT public.current_store_id())
        AND p.deleted_at IS NULL
    )
  );

REVOKE ALL PRIVILEGES
  ON TABLE public.practitioner_blocks
  FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.practitioner_blocks
  TO authenticated;

-- ============================================================
-- 4. 內部預約 RPC：維持原介面，補上呼叫者與關聯資料店家驗證
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_booking(
  p_booking_id       UUID,
  p_client_id        UUID,
  p_practitioner_id  UUID,
  p_service_id       UUID,
  p_start_time       TIMESTAMPTZ,
  p_end_time         TIMESTAMPTZ,
  p_buffer_minutes   INT  DEFAULT 0,
  p_notes            TEXT DEFAULT NULL,
  p_store_id         UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_price            INT  DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_store_id  UUID;
  v_new_buffered_end TIMESTAMPTZ;
  v_conflict         RECORD;
  v_result_id        UUID;
  v_price            INT;
BEGIN
  v_caller_store_id := public.current_store_id();

  IF v_caller_store_id IS NULL
    OR p_store_id IS DISTINCT FROM v_caller_store_id THEN
    RETURN json_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients AS c
    WHERE c.id = p_client_id
      AND c.store_id = p_store_id
      AND c.deleted_at IS NULL
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'CLIENT_NOT_FOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.practitioners AS p
    WHERE p.id = p_practitioner_id
      AND p.store_id = p_store_id
      AND p.deleted_at IS NULL
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'PRACTITIONER_NOT_FOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.services AS s
    WHERE s.id = p_service_id
      AND s.store_id = p_store_id
      AND s.deleted_at IS NULL
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'SERVICE_NOT_FOUND');
  END IF;

  IF p_booking_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.bookings AS b
      WHERE b.id = p_booking_id
        AND b.store_id = p_store_id
        AND b.deleted_at IS NULL
    ) THEN
    RETURN json_build_object('ok', false, 'error', 'BOOKING_NOT_FOUND');
  END IF;

  v_new_buffered_end := p_end_time
    + (p_buffer_minutes || ' minutes')::INTERVAL;

  IF EXISTS (
    SELECT 1
    FROM public.practitioner_blocks AS pb
    WHERE pb.practitioner_id = p_practitioner_id
      AND pb.store_id = p_store_id
      AND pb.start_time < v_new_buffered_end
      AND pb.end_time > p_start_time
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'PRACTITIONER_BLOCKED');
  END IF;

  SELECT
    b.id,
    b.start_time,
    b.end_time,
    b.buffer_minutes,
    c.full_name AS client_name,
    s.name AS service_name
  INTO v_conflict
  FROM public.bookings AS b
  JOIN public.clients AS c ON c.id = b.client_id
  JOIN public.services AS s ON s.id = b.service_id
  WHERE b.practitioner_id = p_practitioner_id
    AND b.store_id = p_store_id
    AND b.deleted_at IS NULL
    AND b.status NOT IN ('cancelled')
    AND (p_booking_id IS NULL OR b.id <> p_booking_id)
    AND b.start_time < v_new_buffered_end
    AND (
      b.end_time
      + (COALESCE(b.buffer_minutes, 0) || ' minutes')::INTERVAL
    ) > p_start_time
  ORDER BY b.start_time
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'TIME_CONFLICT',
      'conflict', json_build_object(
        'id', v_conflict.id,
        'start_time', v_conflict.start_time,
        'end_time', v_conflict.end_time,
        'buffer_minutes', v_conflict.buffer_minutes,
        'client_name', v_conflict.client_name,
        'service_name', v_conflict.service_name
      )
    );
  END IF;

  IF p_price IS NULL THEN
    SELECT s.price
    INTO v_price
    FROM public.services AS s
    WHERE s.id = p_service_id
      AND s.store_id = p_store_id;

    v_price := COALESCE(v_price, 0);
  ELSE
    v_price := p_price;
  END IF;

  IF p_booking_id IS NULL THEN
    INSERT INTO public.bookings (
      client_id,
      practitioner_id,
      service_id,
      start_time,
      end_time,
      buffer_minutes,
      price,
      status,
      notes,
      store_id
    ) VALUES (
      p_client_id,
      p_practitioner_id,
      p_service_id,
      p_start_time,
      p_end_time,
      p_buffer_minutes,
      v_price,
      'confirmed',
      p_notes,
      p_store_id
    )
    RETURNING id INTO v_result_id;
  ELSE
    UPDATE public.bookings
    SET
      practitioner_id = p_practitioner_id,
      service_id = p_service_id,
      start_time = p_start_time,
      end_time = p_end_time,
      buffer_minutes = p_buffer_minutes,
      price = v_price,
      notes = p_notes,
      updated_at = NOW()
    WHERE id = p_booking_id
      AND store_id = p_store_id
    RETURNING id INTO v_result_id;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'id', v_result_id,
    'error', NULL,
    'conflict', NULL
  );
END;
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.upsert_booking(
    UUID, UUID, UUID, UUID, TIMESTAMPTZ,
    TIMESTAMPTZ, INT, TEXT, UUID, INT
  )
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE
  ON FUNCTION public.upsert_booking(
    UUID, UUID, UUID, UUID, TIMESTAMPTZ,
    TIMESTAMPTZ, INT, TEXT, UUID, INT
  )
  TO authenticated;

-- ============================================================
-- 5. 客戶 RPC：限制匿名執行並強制店家隔離
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_clients(
  p_query TEXT,
  p_store_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  phone TEXT,
  email TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.id,
    c.full_name,
    c.phone,
    c.email
  FROM public.clients AS c
  WHERE c.store_id = p_store_id
    AND p_store_id = public.current_store_id()
    AND c.deleted_at IS NULL
    AND (
      c.full_name ILIKE '%' || p_query || '%'
      OR c.phone ILIKE '%' || p_query || '%'
    )
  ORDER BY
    CASE
      WHEN c.full_name ILIKE p_query || '%' THEN 0
      WHEN c.phone ILIKE p_query || '%' THEN 1
      ELSE 2
    END,
    c.full_name
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.search_clients(TEXT, UUID, INT)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE
  ON FUNCTION public.search_clients(TEXT, UUID, INT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_client_bookings(
  p_client_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  status public.booking_status,
  price INT,
  notes TEXT,
  practitioner_name TEXT,
  service_name TEXT,
  service_duration INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    b.id,
    b.start_time,
    b.end_time,
    b.status,
    b.price,
    b.notes,
    p.full_name AS practitioner_name,
    s.name AS service_name,
    s.duration_minutes AS service_duration
  FROM public.bookings AS b
  JOIN public.practitioners AS p ON p.id = b.practitioner_id
  JOIN public.services AS s ON s.id = b.service_id
  WHERE b.client_id = p_client_id
    AND b.store_id = public.current_store_id()
    AND b.deleted_at IS NULL
  ORDER BY b.start_time DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.get_client_bookings(UUID, INT)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE
  ON FUNCTION public.get_client_bookings(UUID, INT)
  TO authenticated;

-- ============================================================
-- 6. 固定其餘舊函式 search_path
-- public schema 已不允許 anon/authenticated/service_role 建立物件。
-- ============================================================

ALTER FUNCTION public.get_current_store_id()
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.cleanup_practitioner_services_on_delete()
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.ensure_min_one_service()
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.update_practitioners_timestamp()
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.check_service_not_deleted()
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.set_updated_at()
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.current_store_id()
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.is_admin()
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.current_practitioner_id()
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.handle_new_auth_user()
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.check_booking_conflict(
  UUID, UUID, TIMESTAMP, TIMESTAMP, UUID
)
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.update_clients_updated_at()
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.set_clients_updated_at()
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.get_available_slots(DATE, UUID, UUID, UUID)
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.update_users_updated_at()
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.generate_store_code()
  SET search_path TO public, pg_temp;
ALTER FUNCTION public.get_store_by_code(TEXT)
  SET search_path TO public, pg_temp;

-- 觸發器函式不應被 API 角色直接呼叫。
REVOKE ALL PRIVILEGES
  ON FUNCTION public.handle_new_auth_user()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
