-- ============================================================
-- 後台特殊預約：班表／休假／店休二次確認與原因
--
-- 1. 一般後台寫入遇到不可用時段先回傳可辨識錯誤
-- 2. 僅同店管理員可透過專用 RPC 帶入覆寫原因
-- 3. DB trigger 仍為最終防線，避免只靠前端確認
-- 4. 單次與循環預約沿用既有商品券交易流程
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_practitioner_availability_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_override_reason TEXT := NULLIF(
    BTRIM(COALESCE(CURRENT_SETTING('app.booking_override_reason', TRUE), '')),
    ''
  );
BEGIN
  IF private.is_practitioner_available_for_booking(
    NEW.store_id,
    NEW.practitioner_id,
    NEW.start_time,
    NEW.end_time
  ) THEN
    RETURN NEW;
  END IF;

  IF (SELECT auth.uid()) IS NULL
    OR NOT (SELECT public.is_admin())
    OR public.current_store_id() IS DISTINCT FROM NEW.store_id
    OR v_override_reason IS NULL
    OR CHAR_LENGTH(v_override_reason) > 500 THEN
    RAISE EXCEPTION 'PRACTITIONER_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, new_values, store_id
  ) VALUES (
    (SELECT auth.uid()),
    'booking_practitioner_availability_overridden',
    'bookings',
    NEW.id,
    JSONB_BUILD_OBJECT(
      'practitioner_id', NEW.practitioner_id,
      'start_time', NEW.start_time,
      'end_time', NEW.end_time,
      'override_reason', v_override_reason
    ),
    NEW.store_id
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_store_closure_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_timezone TEXT;
  v_closure public.store_closures%ROWTYPE;
  v_override_reason TEXT := NULLIF(
    BTRIM(COALESCE(CURRENT_SETTING('app.booking_override_reason', TRUE), '')),
    ''
  );
BEGIN
  SELECT store.timezone
  INTO v_store_timezone
  FROM public.stores AS store
  WHERE store.id = NEW.store_id;

  IF v_store_timezone IS NULL THEN
    RAISE EXCEPTION 'STORE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT closure.*
  INTO v_closure
  FROM public.store_closures AS closure
  WHERE closure.store_id = NEW.store_id
    AND closure.deleted_at IS NULL
    AND NEW.start_time < (
      (closure.end_date + 1)::TIMESTAMP AT TIME ZONE v_store_timezone
    )
    AND NEW.end_time > (
      closure.start_date::TIMESTAMP AT TIME ZONE v_store_timezone
    )
  ORDER BY closure.start_date, closure.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF (SELECT auth.uid()) IS NULL
    OR NOT (SELECT public.is_admin())
    OR public.current_store_id() IS DISTINCT FROM NEW.store_id
    OR v_override_reason IS NULL
    OR CHAR_LENGTH(v_override_reason) > 500 THEN
    RAISE EXCEPTION 'STORE_CLOSED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, new_values, store_id
  ) VALUES (
    (SELECT auth.uid()),
    'booking_store_closure_overridden',
    'bookings',
    NEW.id,
    JSONB_BUILD_OBJECT(
      'closure_id', v_closure.id,
      'start_time', NEW.start_time,
      'end_time', NEW.end_time,
      'public_label', v_closure.public_label,
      'override_reason', v_override_reason
    ),
    NEW.store_id
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_booking(
  p_booking_id UUID,
  p_client_id UUID,
  p_practitioner_id UUID,
  p_service_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_buffer_minutes INT DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_store_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_price INT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_store_id UUID := public.current_store_id();
  v_new_buffered_end TIMESTAMPTZ;
  v_conflict RECORD;
  v_result_id UUID;
  v_price INT;
  v_override_reason TEXT := NULLIF(
    BTRIM(COALESCE(CURRENT_SETTING('app.booking_override_reason', TRUE), '')),
    ''
  );
BEGIN
  IF v_caller_store_id IS NULL
    OR p_store_id IS DISTINCT FROM v_caller_store_id THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients AS client
    WHERE client.id = p_client_id
      AND client.store_id = p_store_id
      AND client.deleted_at IS NULL
  ) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'CLIENT_NOT_FOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.practitioners AS practitioner
    WHERE practitioner.id = p_practitioner_id
      AND practitioner.store_id = p_store_id
      AND practitioner.deleted_at IS NULL
  ) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'PRACTITIONER_NOT_FOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.services AS service
    WHERE service.id = p_service_id
      AND service.store_id = p_store_id
      AND service.deleted_at IS NULL
  ) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'SERVICE_NOT_FOUND');
  END IF;

  IF p_booking_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bookings AS booking
    WHERE booking.id = p_booking_id
      AND booking.store_id = p_store_id
      AND booking.deleted_at IS NULL
  ) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'BOOKING_NOT_FOUND');
  END IF;

  IF NOT private.is_practitioner_available_for_booking(
    p_store_id,
    p_practitioner_id,
    p_start_time,
    p_end_time
  ) AND v_override_reason IS NULL THEN
    RETURN JSON_BUILD_OBJECT(
      'ok', FALSE,
      'error', 'PRACTITIONER_UNAVAILABLE_REQUIRES_OVERRIDE'
    );
  END IF;

  v_new_buffered_end := p_end_time
    + (p_buffer_minutes || ' minutes')::INTERVAL;

  SELECT
    booking.id,
    booking.start_time,
    booking.end_time,
    booking.buffer_minutes,
    client.full_name AS client_name,
    service.name AS service_name
  INTO v_conflict
  FROM public.bookings AS booking
  JOIN public.clients AS client ON client.id = booking.client_id
  JOIN public.services AS service ON service.id = booking.service_id
  WHERE booking.practitioner_id = p_practitioner_id
    AND booking.store_id = p_store_id
    AND booking.deleted_at IS NULL
    AND booking.status <> 'cancelled'::public.booking_status
    AND (p_booking_id IS NULL OR booking.id <> p_booking_id)
    AND booking.start_time < v_new_buffered_end
    AND (
      booking.end_time
      + (COALESCE(booking.buffer_minutes, 0) || ' minutes')::INTERVAL
    ) > p_start_time
  ORDER BY booking.start_time
  LIMIT 1;

  IF FOUND THEN
    RETURN JSON_BUILD_OBJECT(
      'ok', FALSE,
      'error', 'TIME_CONFLICT',
      'conflict', JSON_BUILD_OBJECT(
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
    SELECT service.price
    INTO v_price
    FROM public.services AS service
    WHERE service.id = p_service_id
      AND service.store_id = p_store_id;
    v_price := COALESCE(v_price, 0);
  ELSE
    v_price := p_price;
  END IF;

  IF p_booking_id IS NULL THEN
    INSERT INTO public.bookings (
      client_id, practitioner_id, service_id, start_time, end_time,
      buffer_minutes, price, status, notes, store_id
    ) VALUES (
      p_client_id, p_practitioner_id, p_service_id, p_start_time, p_end_time,
      p_buffer_minutes, v_price, 'confirmed', p_notes, p_store_id
    ) RETURNING id INTO v_result_id;
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

  RETURN JSON_BUILD_OBJECT(
    'ok', TRUE,
    'id', v_result_id,
    'error', NULL,
    'conflict', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_booking_with_voucher_admin_override(
  p_booking_id UUID,
  p_client_id UUID,
  p_practitioner_id UUID,
  p_service_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_buffer_minutes INTEGER DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_store_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_price INTEGER DEFAULT NULL,
  p_voucher_mode TEXT DEFAULT 'auto',
  p_client_voucher_item_id UUID DEFAULT NULL,
  p_override_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_reason TEXT := NULLIF(BTRIM(COALESCE(p_override_reason, '')), '');
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT (SELECT public.is_admin())
    OR public.current_store_id() IS DISTINCT FROM p_store_id THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;
  IF v_reason IS NULL OR CHAR_LENGTH(v_reason) > 500 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_OVERRIDE_REASON');
  END IF;

  PERFORM SET_CONFIG('app.booking_override_reason', v_reason, TRUE);
  RETURN public.upsert_booking_with_voucher(
    p_booking_id,
    p_client_id,
    p_practitioner_id,
    p_service_id,
    p_start_time,
    p_end_time,
    p_buffer_minutes,
    p_notes,
    p_store_id,
    p_price,
    p_voucher_mode,
    p_client_voucher_item_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_recurring_bookings_with_voucher_admin_override(
  p_client_id UUID,
  p_practitioner_id UUID,
  p_service_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_interval_weeks INTEGER,
  p_occurrence_count INTEGER,
  p_idempotency_key UUID,
  p_buffer_minutes INTEGER DEFAULT 0,
  p_notes TEXT DEFAULT NULL,
  p_store_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  p_price INTEGER DEFAULT NULL,
  p_voucher_mode TEXT DEFAULT 'auto',
  p_client_voucher_item_id UUID DEFAULT NULL,
  p_override_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_reason TEXT := NULLIF(BTRIM(COALESCE(p_override_reason, '')), '');
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR NOT (SELECT public.is_admin())
    OR public.current_store_id() IS DISTINCT FROM p_store_id THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;
  IF v_reason IS NULL OR CHAR_LENGTH(v_reason) > 500 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_OVERRIDE_REASON');
  END IF;

  PERFORM SET_CONFIG('app.booking_override_reason', v_reason, TRUE);
  RETURN public.create_recurring_bookings_with_voucher(
    p_client_id,
    p_practitioner_id,
    p_service_id,
    p_start_time,
    p_end_time,
    p_interval_weeks,
    p_occurrence_count,
    p_idempotency_key,
    p_buffer_minutes,
    p_notes,
    p_store_id,
    p_price,
    p_voucher_mode,
    p_client_voucher_item_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_booking_with_voucher_admin_override(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, TEXT, UUID, INTEGER, TEXT, UUID, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_booking_with_voucher_admin_override(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, TEXT, UUID, INTEGER, TEXT, UUID, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.create_recurring_bookings_with_voucher_admin_override(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER, UUID, INTEGER, TEXT, UUID, INTEGER, TEXT, UUID, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_recurring_bookings_with_voucher_admin_override(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER, UUID, INTEGER, TEXT, UUID, INTEGER, TEXT, UUID, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.upsert_booking_with_voucher_admin_override(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, TEXT, UUID, INTEGER, TEXT, UUID, TEXT
) IS '同店管理員帶原因覆寫老師班表、休假或店休，並沿用原子商品券流程';

COMMENT ON FUNCTION public.create_recurring_bookings_with_voucher_admin_override(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER, UUID, INTEGER, TEXT, UUID, INTEGER, TEXT, UUID, TEXT
) IS '同店管理員帶原因建立不可用時段的循環預約，整組維持單一交易';

COMMIT;
