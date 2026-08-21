-- ============================================================
-- LINE 第一階段：可信渠道身分與安全預約入口
--
-- 原則：
-- 1. 一般公開 RPC 永遠建立 web 預約，不信任前端 LINE 欄位。
-- 2. LINE 預約只允許 Edge Function 以 service_role 呼叫。
-- 3. 已驗證渠道身分獨立於 bookings，保留既有欄位作相容快照。
-- 4. 新資料表明確啟用 RLS，anon 不得直接存取。
-- ============================================================

BEGIN;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS line_login_channel_id TEXT;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'stores_line_login_channel_id_format'
      AND conrelid = 'public.stores'::REGCLASS
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_line_login_channel_id_format
      CHECK (
        line_login_channel_id IS NULL
        OR line_login_channel_id ~ '^[0-9]{5,32}$'
      );
  END IF;
END
$migration$;

CREATE TABLE IF NOT EXISTS public.customer_channel_identities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT customer_channel_identities_channel_check
    CHECK (channel IN ('line', 'messenger', 'instagram')),
  CONSTRAINT customer_channel_identities_provider_account_check
    CHECK (CHAR_LENGTH(provider_account_id) BETWEEN 1 AND 100),
  CONSTRAINT customer_channel_identities_provider_user_check
    CHECK (CHAR_LENGTH(provider_user_id) BETWEEN 1 AND 255),
  CONSTRAINT customer_channel_identities_display_name_check
    CHECK (display_name IS NULL OR CHAR_LENGTH(display_name) <= 100),
  CONSTRAINT customer_channel_identities_avatar_url_check
    CHECK (
      avatar_url IS NULL
      OR (
        CHAR_LENGTH(avatar_url) <= 2048
        AND avatar_url ~ '^https://'
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_channel_identity_unique
  ON public.customer_channel_identities (
    store_id,
    channel,
    provider_account_id,
    provider_user_id
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_channel_identity_client
  ON public.customer_channel_identities (store_id, client_id, channel)
  WHERE deleted_at IS NULL;

ALTER TABLE public.customer_channel_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_member_customer_channel_identities"
  ON public.customer_channel_identities;

CREATE POLICY "select_member_customer_channel_identities"
  ON public.customer_channel_identities
  FOR SELECT
  TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

REVOKE ALL PRIVILEGES ON TABLE public.customer_channel_identities
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT
  ON TABLE public.customer_channel_identities
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.customer_channel_identities
  TO service_role;

-- ============================================================
-- 一般網頁預約：保留既有簽名，但一律忽略來源與 LINE 欄位。
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_booking_public(
  p_full_name TEXT,
  p_phone TEXT,
  p_service_id UUID,
  p_practitioner_id UUID,
  p_start_time TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL,
  p_store_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_source TEXT DEFAULT 'web',
  p_client_line_id TEXT DEFAULT NULL,
  p_client_picture_url TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client_id UUID;
  v_duration INT;
  v_buffer INT;
  v_end_time TIMESTAMPTZ;
  v_booking_id UUID;
  v_confirmation_mode TEXT;
  v_initial_status public.booking_status;
  v_phone TEXT := BTRIM(p_phone);
BEGIN
  IF NULLIF(BTRIM(p_full_name), '') IS NULL
    OR NULLIF(v_phone, '') IS NULL
    OR CHAR_LENGTH(BTRIM(p_full_name)) > 100
    OR CHAR_LENGTH(v_phone) > 50
    OR p_service_id IS NULL
    OR p_practitioner_id IS NULL
    OR p_start_time IS NULL
    OR p_store_id IS NULL THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'MISSING_INFO');
  END IF;

  SELECT s.duration_minutes
  INTO v_duration
  FROM public.services AS s
  WHERE s.id = p_service_id
    AND s.store_id = p_store_id
    AND s.active = TRUE
    AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'SERVICE_NOT_FOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.practitioners AS p
    WHERE p.id = p_practitioner_id
      AND p.store_id = p_store_id
      AND p.active = TRUE
      AND p.deleted_at IS NULL
  ) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'PRACTITIONER_NOT_FOUND');
  END IF;

  SELECT
    COALESCE(s.default_buffer_minutes, 0),
    s.booking_confirmation_mode
  INTO v_buffer, v_confirmation_mode
  FROM public.stores AS s
  WHERE s.id = p_store_id
    AND s.booking_enabled = TRUE;

  IF NOT FOUND THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'STORE_NOT_FOUND');
  END IF;

  v_initial_status := CASE v_confirmation_mode
    WHEN 'auto' THEN 'confirmed'::public.booking_status
    ELSE 'pending'::public.booking_status
  END;
  v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_practitioner_id::TEXT, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.practitioner_blocks AS pb
    WHERE pb.store_id = p_store_id
      AND pb.practitioner_id = p_practitioner_id
      AND pb.start_time < v_end_time
      AND pb.end_time > p_start_time
  ) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'PRACTITIONER_BLOCKED');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings AS b
    WHERE b.store_id = p_store_id
      AND b.practitioner_id = p_practitioner_id
      AND b.deleted_at IS NULL
      AND b.status <> 'cancelled'::public.booking_status
      AND b.start_time < v_end_time + (v_buffer || ' minutes')::INTERVAL
      AND b.end_time
        + (COALESCE(b.buffer_minutes, 0) || ' minutes')::INTERVAL
        > p_start_time
  ) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'CONFLICT');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_store_id::TEXT || ':' || v_phone, 1)
  );

  SELECT c.id
  INTO v_client_id
  FROM public.clients AS c
  WHERE c.store_id = p_store_id
    AND c.phone = v_phone
    AND c.deleted_at IS NULL
  LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (full_name, phone, store_id)
    VALUES (BTRIM(p_full_name), v_phone, p_store_id)
    ON CONFLICT (phone, store_id) WHERE deleted_at IS NULL
    DO NOTHING
    RETURNING id INTO v_client_id;

    IF v_client_id IS NULL THEN
      SELECT c.id
      INTO v_client_id
      FROM public.clients AS c
      WHERE c.store_id = p_store_id
        AND c.phone = v_phone
        AND c.deleted_at IS NULL
      LIMIT 1;
    END IF;
  END IF;

  IF v_client_id IS NULL THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'CLIENT_CONFLICT');
  END IF;

  INSERT INTO public.bookings (
    client_id,
    practitioner_id,
    service_id,
    start_time,
    end_time,
    buffer_minutes,
    notes,
    store_id,
    status,
    source,
    client_line_id,
    client_picture_url
  ) VALUES (
    v_client_id,
    p_practitioner_id,
    p_service_id,
    p_start_time,
    v_end_time,
    v_buffer,
    p_notes,
    p_store_id,
    v_initial_status,
    'web',
    NULL,
    NULL
  )
  RETURNING id INTO v_booking_id;

  RETURN JSON_BUILD_OBJECT(
    'ok', TRUE,
    'id', v_booking_id,
    'status', v_initial_status
  );
END;
$$;

-- ============================================================
-- 已驗證 LINE 預約：只能由 Edge Function 的後端角色呼叫。
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_line_booking(
  p_full_name TEXT,
  p_phone TEXT,
  p_service_id UUID,
  p_practitioner_id UUID,
  p_start_time TIMESTAMPTZ,
  p_store_id UUID,
  p_line_provider_account_id TEXT,
  p_line_user_id TEXT,
  p_line_display_name TEXT,
  p_line_picture_url TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client_id UUID;
  v_existing_phone TEXT;
  v_duration INT;
  v_buffer INT;
  v_end_time TIMESTAMPTZ;
  v_booking_id UUID;
  v_confirmation_mode TEXT;
  v_initial_status public.booking_status;
  v_phone TEXT := BTRIM(p_phone);
  v_line_display_name TEXT := NULLIF(BTRIM(p_line_display_name), '');
  v_line_picture_url TEXT := NULLIF(BTRIM(p_line_picture_url), '');
BEGIN
  IF NULLIF(BTRIM(p_full_name), '') IS NULL
    OR NULLIF(v_phone, '') IS NULL
    OR CHAR_LENGTH(BTRIM(p_full_name)) > 100
    OR CHAR_LENGTH(v_phone) > 50
    OR p_service_id IS NULL
    OR p_practitioner_id IS NULL
    OR p_start_time IS NULL
    OR p_store_id IS NULL
    OR NULLIF(BTRIM(p_line_provider_account_id), '') IS NULL
    OR p_line_provider_account_id !~ '^[0-9]{5,32}$'
    OR p_line_user_id !~ '^U[0-9a-fA-F]{32}$'
    OR v_line_display_name IS NULL
    OR CHAR_LENGTH(v_line_display_name) > 100
    OR (
      v_line_picture_url IS NOT NULL
      AND (
        CHAR_LENGTH(v_line_picture_url) > 2048
        OR v_line_picture_url !~ '^https://'
      )
    ) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_LINE_IDENTITY');
  END IF;

  SELECT s.duration_minutes
  INTO v_duration
  FROM public.services AS s
  WHERE s.id = p_service_id
    AND s.store_id = p_store_id
    AND s.active = TRUE
    AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'SERVICE_NOT_FOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.practitioners AS p
    WHERE p.id = p_practitioner_id
      AND p.store_id = p_store_id
      AND p.active = TRUE
      AND p.deleted_at IS NULL
  ) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'PRACTITIONER_NOT_FOUND');
  END IF;

  SELECT
    COALESCE(s.default_buffer_minutes, 0),
    s.booking_confirmation_mode
  INTO v_buffer, v_confirmation_mode
  FROM public.stores AS s
  WHERE s.id = p_store_id
    AND s.booking_enabled = TRUE
    AND s.line_login_channel_id = BTRIM(p_line_provider_account_id);

  IF NOT FOUND THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'LINE_CHANNEL_NOT_CONFIGURED');
  END IF;

  v_initial_status := CASE v_confirmation_mode
    WHEN 'auto' THEN 'confirmed'::public.booking_status
    ELSE 'pending'::public.booking_status
  END;
  v_end_time := p_start_time + (v_duration || ' minutes')::INTERVAL;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_practitioner_id::TEXT, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.practitioner_blocks AS pb
    WHERE pb.store_id = p_store_id
      AND pb.practitioner_id = p_practitioner_id
      AND pb.start_time < v_end_time
      AND pb.end_time > p_start_time
  ) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'PRACTITIONER_BLOCKED');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings AS b
    WHERE b.store_id = p_store_id
      AND b.practitioner_id = p_practitioner_id
      AND b.deleted_at IS NULL
      AND b.status <> 'cancelled'::public.booking_status
      AND b.start_time < v_end_time + (v_buffer || ' minutes')::INTERVAL
      AND b.end_time
        + (COALESCE(b.buffer_minutes, 0) || ' minutes')::INTERVAL
        > p_start_time
  ) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'CONFLICT');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_store_id::TEXT || ':line:'
        || BTRIM(p_line_provider_account_id) || ':' || p_line_user_id,
      2
    )
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_store_id::TEXT || ':' || v_phone, 1)
  );

  SELECT identity.client_id, client.phone
  INTO v_client_id, v_existing_phone
  FROM public.customer_channel_identities AS identity
  JOIN public.clients AS client
    ON client.id = identity.client_id
   AND client.store_id = identity.store_id
   AND client.deleted_at IS NULL
  WHERE identity.store_id = p_store_id
    AND identity.channel = 'line'
    AND identity.provider_account_id = BTRIM(p_line_provider_account_id)
    AND identity.provider_user_id = p_line_user_id
    AND identity.deleted_at IS NULL
  LIMIT 1
  FOR UPDATE OF identity, client;

  IF v_client_id IS NOT NULL THEN
    IF v_existing_phone <> v_phone THEN
      IF EXISTS (
        SELECT 1
        FROM public.clients AS conflicting_client
        WHERE conflicting_client.store_id = p_store_id
          AND conflicting_client.phone = v_phone
          AND conflicting_client.deleted_at IS NULL
          AND conflicting_client.id <> v_client_id
      ) THEN
        RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'PHONE_ALREADY_REGISTERED');
      END IF;

      UPDATE public.clients
      SET phone = v_phone
      WHERE id = v_client_id;
    END IF;

    UPDATE public.customer_channel_identities
    SET
      display_name = v_line_display_name,
      avatar_url = COALESCE(v_line_picture_url, avatar_url),
      verified_at = NOW(),
      last_seen_at = NOW(),
      updated_at = NOW()
    WHERE store_id = p_store_id
      AND channel = 'line'
      AND provider_account_id = BTRIM(p_line_provider_account_id)
      AND provider_user_id = p_line_user_id
      AND deleted_at IS NULL;
  ELSE
    SELECT client.id
    INTO v_client_id
    FROM public.clients AS client
    WHERE client.store_id = p_store_id
      AND client.phone = v_phone
      AND client.deleted_at IS NULL
    LIMIT 1
    FOR UPDATE;

    IF v_client_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.customer_channel_identities AS existing_identity
      WHERE existing_identity.store_id = p_store_id
        AND existing_identity.client_id = v_client_id
        AND existing_identity.channel = 'line'
        AND existing_identity.deleted_at IS NULL
    ) THEN
      RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'PHONE_LINK_CONFLICT');
    END IF;

    IF v_client_id IS NULL THEN
      INSERT INTO public.clients (full_name, phone, store_id)
      VALUES (BTRIM(p_full_name), v_phone, p_store_id)
      ON CONFLICT (phone, store_id) WHERE deleted_at IS NULL
      DO NOTHING
      RETURNING id INTO v_client_id;

      IF v_client_id IS NULL THEN
        SELECT client.id
        INTO v_client_id
        FROM public.clients AS client
        WHERE client.store_id = p_store_id
          AND client.phone = v_phone
          AND client.deleted_at IS NULL
        LIMIT 1;
      END IF;
    END IF;

    IF v_client_id IS NULL THEN
      RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'CLIENT_CONFLICT');
    END IF;

    INSERT INTO public.customer_channel_identities (
      store_id,
      client_id,
      channel,
      provider_account_id,
      provider_user_id,
      display_name,
      avatar_url,
      verified_at,
      last_seen_at
    ) VALUES (
      p_store_id,
      v_client_id,
      'line',
      BTRIM(p_line_provider_account_id),
      p_line_user_id,
      v_line_display_name,
      v_line_picture_url,
      NOW(),
      NOW()
    );
  END IF;

  INSERT INTO public.bookings (
    client_id,
    practitioner_id,
    service_id,
    start_time,
    end_time,
    buffer_minutes,
    notes,
    store_id,
    status,
    source,
    client_line_id,
    client_picture_url
  ) VALUES (
    v_client_id,
    p_practitioner_id,
    p_service_id,
    p_start_time,
    v_end_time,
    v_buffer,
    p_notes,
    p_store_id,
    v_initial_status,
    'line',
    p_line_user_id,
    v_line_picture_url
  )
  RETURNING id INTO v_booking_id;

  RETURN JSON_BUILD_OBJECT(
    'ok', TRUE,
    'id', v_booking_id,
    'status', v_initial_status
  );
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.create_booking_public(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_booking_public(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT
) TO anon, authenticated;

REVOKE ALL PRIVILEGES ON FUNCTION public.create_line_booking(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_line_booking(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

COMMENT ON TABLE public.customer_channel_identities
  IS '經服務端驗證的客戶渠道身分；禁止匿名直接存取';

COMMENT ON COLUMN public.stores.line_login_channel_id
  IS 'LINE Login Channel ID；公開識別值，用於驗證 LIFF ID token 的 aud';

COMMENT ON FUNCTION public.create_booking_public(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT
) IS '一般公開網頁預約；來源固定為 web，忽略所有前端 LINE 身分欄位';

COMMENT ON FUNCTION public.create_line_booking(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) IS 'Edge Function 專用；只接受已向 LINE 驗證的身分建立預約';

COMMIT;
