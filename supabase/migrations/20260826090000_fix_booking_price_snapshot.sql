-- ============================================================
-- 修復公開預約與 LINE 預約的價格快照
--
-- 每筆新預約在建立時保存服務定價，之後服務調價不影響歷史預約。
-- 不回填既有 0 元紀錄，避免誤改當時免費或人工折扣的預約。
-- ============================================================

BEGIN;

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
  v_price INT;
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

  SELECT s.duration_minutes, s.price
  INTO v_duration, v_price
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
    price,
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
    v_price,
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
  v_price INT;
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

  SELECT s.duration_minutes, s.price
  INTO v_duration, v_price
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
    price,
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
    v_price,
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

COMMENT ON FUNCTION public.create_booking_public(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT
) IS '一般公開網頁預約；來源固定為 web，保存服務價格快照，並忽略所有前端 LINE 身分欄位';

COMMENT ON FUNCTION public.create_line_booking(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) IS 'Edge Function 專用；只接受已向 LINE 驗證的身分建立預約，並保存服務價格快照';

COMMIT;
