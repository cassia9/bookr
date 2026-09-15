-- ============================================================
-- 後台循環預約
--
-- 1. 每次預約仍保留為獨立 bookings 資料，維持既有衝突與商品券流程。
-- 2. 建立循環系列採單一交易；任一堂失敗即全部回滾。
-- 3. 取消支援單次，或本次起尚未開始的未來預約。
-- 4. 批次建立／取消只留下單一 LINE outbox 工作，避免通知洗版。
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_recurrence_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  practitioner_id UUID NOT NULL REFERENCES public.practitioners(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  interval_weeks SMALLINT NOT NULL,
  occurrence_count SMALLINT NOT NULL,
  first_start_time TIMESTAMPTZ NOT NULL,
  last_start_time TIMESTAMPTZ NOT NULL,
  idempotency_key UUID NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booking_recurrence_series_interval_check
    CHECK (interval_weeks BETWEEN 1 AND 4),
  CONSTRAINT booking_recurrence_series_occurrence_count_check
    CHECK (occurrence_count BETWEEN 2 AND 52),
  CONSTRAINT booking_recurrence_series_range_check
    CHECK (
      last_start_time >= first_start_time
      AND last_start_time <= first_start_time + INTERVAL '1 year'
    ),
  CONSTRAINT booking_recurrence_series_idempotency_unique
    UNIQUE (store_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_booking_recurrence_series_store_created
  ON public.booking_recurrence_series (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_recurrence_series_client
  ON public.booking_recurrence_series (store_id, client_id, first_start_time DESC);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS recurrence_series_id UUID
    REFERENCES public.booking_recurrence_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrence_occurrence_index SMALLINT;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'bookings_recurrence_index_check'
      AND conrelid = 'public.bookings'::REGCLASS
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_recurrence_index_check
      CHECK (
        (recurrence_series_id IS NULL AND recurrence_occurrence_index IS NULL)
        OR
        (recurrence_series_id IS NOT NULL AND recurrence_occurrence_index > 0)
      );
  END IF;
END
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_recurrence_occurrence_unique
  ON public.bookings (recurrence_series_id, recurrence_occurrence_index)
  WHERE recurrence_series_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_recurrence_future
  ON public.bookings (recurrence_series_id, start_time, status)
  WHERE recurrence_series_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.booking_recurrence_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_store_booking_recurrence_series
  ON public.booking_recurrence_series;

CREATE POLICY select_store_booking_recurrence_series
  ON public.booking_recurrence_series
  FOR SELECT
  TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

REVOKE ALL ON TABLE public.booking_recurrence_series
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.booking_recurrence_series TO authenticated;

CREATE OR REPLACE FUNCTION private.enqueue_booking_series_notification(
  p_series_id UUID,
  p_booking_id UUID,
  p_event_type public.notification_type,
  p_occurrence_count INTEGER,
  p_idempotency_suffix TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_identity_id UUID;
  v_connection_id UUID;
BEGIN
  SELECT booking.*
  INTO v_booking
  FROM public.bookings AS booking
  WHERE booking.id = p_booking_id;

  IF NOT FOUND
    OR p_occurrence_count < 1
    OR NOT COALESCE(
      private.line_notification_enabled(v_booking.store_id, p_event_type),
      FALSE
    ) THEN
    RETURN;
  END IF;

  SELECT identity.id, connection.id
  INTO v_identity_id, v_connection_id
  FROM public.customer_channel_identities AS identity
  JOIN public.store_channel_connections AS connection
    ON connection.store_id = identity.store_id
   AND connection.channel = 'line'
   AND connection.login_channel_id = identity.provider_account_id
   AND connection.status = 'active'
   AND connection.disconnected_at IS NULL
  JOIN private.store_line_messaging_credentials AS credential
    ON credential.connection_id = connection.id
   AND credential.store_id = connection.store_id
   AND credential.status = 'active'
   AND credential.disconnected_at IS NULL
  WHERE identity.store_id = v_booking.store_id
    AND identity.client_id = v_booking.client_id
    AND identity.channel = 'line'
    AND identity.deleted_at IS NULL
    AND identity.friend_status <> 'not_friend'
  ORDER BY identity.last_seen_at DESC, identity.created_at DESC
  LIMIT 1;

  IF v_identity_id IS NULL OR v_connection_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.line_notification_outbox (
    store_id,
    connection_id,
    booking_id,
    client_id,
    identity_id,
    event_type,
    idempotency_key,
    payload_snapshot
  ) VALUES (
    v_booking.store_id,
    v_connection_id,
    v_booking.id,
    v_booking.client_id,
    v_identity_id,
    p_event_type,
    CONCAT_WS(':', 'booking-series', p_series_id::TEXT, p_idempotency_suffix),
    JSONB_BUILD_OBJECT(
      'booking_id', v_booking.id,
      'recurrence_series_id', p_series_id,
      'recurrence_count', p_occurrence_count,
      'start_time', v_booking.start_time,
      'end_time', v_booking.end_time,
      'service_id', v_booking.service_id,
      'practitioner_id', v_booking.practitioner_id,
      'status', v_booking.status
    )
  )
  ON CONFLICT (store_id, idempotency_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_recurring_bookings_with_voucher(
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
  p_client_voucher_item_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_series_id UUID;
  v_existing BOOLEAN := FALSE;
  v_index INTEGER;
  v_occurrence_start TIMESTAMPTZ;
  v_occurrence_end TIMESTAMPTZ;
  v_booking_result JSONB;
  v_booking_id UUID;
  v_booking_ids UUID[] := ARRAY[]::UUID[];
  v_failure JSONB;
  v_first_booking_id UUID;
  v_event_type public.notification_type;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR p_store_id IS DISTINCT FROM v_store_id THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF p_start_time IS NULL
    OR p_end_time IS NULL
    OR p_end_time <= p_start_time
    OR p_interval_weeks NOT BETWEEN 1 AND 4
    OR p_occurrence_count NOT BETWEEN 2 AND 52
    OR p_idempotency_key IS NULL
    OR p_start_time + MAKE_INTERVAL(weeks => p_interval_weeks * (p_occurrence_count - 1))
      > p_start_time + INTERVAL '1 year'
    OR p_voucher_mode NOT IN ('auto', 'specific', 'none')
    OR (p_voucher_mode = 'specific' AND p_client_voucher_item_id IS NULL)
    OR (p_voucher_mode <> 'specific' AND p_client_voucher_item_id IS NOT NULL) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_INPUT');
  END IF;

  INSERT INTO public.booking_recurrence_series (
    store_id,
    client_id,
    practitioner_id,
    service_id,
    interval_weeks,
    occurrence_count,
    first_start_time,
    last_start_time,
    idempotency_key,
    created_by
  ) VALUES (
    p_store_id,
    p_client_id,
    p_practitioner_id,
    p_service_id,
    p_interval_weeks,
    p_occurrence_count,
    p_start_time,
    p_start_time + MAKE_INTERVAL(weeks => p_interval_weeks * (p_occurrence_count - 1)),
    p_idempotency_key,
    (SELECT auth.uid())
  )
  ON CONFLICT (store_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_series_id;

  IF v_series_id IS NULL THEN
    SELECT series.id
    INTO v_series_id
    FROM public.booking_recurrence_series AS series
    WHERE series.store_id = p_store_id
      AND series.idempotency_key = p_idempotency_key;
    v_existing := TRUE;
  END IF;

  IF v_existing THEN
    RETURN JSONB_BUILD_OBJECT(
      'ok', TRUE,
      'idempotent', TRUE,
      'series_id', v_series_id,
      'booking_ids', COALESCE((
        SELECT JSONB_AGG(booking.id ORDER BY booking.recurrence_occurrence_index)
        FROM public.bookings AS booking
        WHERE booking.recurrence_series_id = v_series_id
      ), '[]'::JSONB)
    );
  END IF;

  BEGIN
    FOR v_index IN 1..p_occurrence_count LOOP
      v_occurrence_start := p_start_time
        + MAKE_INTERVAL(weeks => p_interval_weeks * (v_index - 1));
      v_occurrence_end := p_end_time
        + MAKE_INTERVAL(weeks => p_interval_weeks * (v_index - 1));

      BEGIN
        v_booking_result := public.upsert_booking_with_voucher(
          NULL,
          p_client_id,
          p_practitioner_id,
          p_service_id,
          v_occurrence_start,
          v_occurrence_end,
          p_buffer_minutes,
          p_notes,
          p_store_id,
          p_price,
          p_voucher_mode,
          p_client_voucher_item_id
        );
      EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
          v_failure := JSONB_BUILD_OBJECT(
            'ok', FALSE,
            'error', 'VOUCHER_NOT_ELIGIBLE_OR_NO_BALANCE',
            'occurrence_index', v_index,
            'occurrence_start', v_occurrence_start
          );
          RAISE EXCEPTION 'RECURRING_BOOKING_ABORT'
            USING ERRCODE = 'P0001';
      END;

      IF NOT COALESCE((v_booking_result ->> 'ok')::BOOLEAN, FALSE) THEN
        v_failure := v_booking_result || JSONB_BUILD_OBJECT(
          'occurrence_index', v_index,
          'occurrence_start', v_occurrence_start
        );
        RAISE EXCEPTION 'RECURRING_BOOKING_ABORT'
          USING ERRCODE = 'P0001';
      END IF;

      v_booking_id := (v_booking_result ->> 'id')::UUID;

      UPDATE public.bookings
      SET
        recurrence_series_id = v_series_id,
        recurrence_occurrence_index = v_index
      WHERE id = v_booking_id
        AND store_id = p_store_id;

      v_booking_ids := ARRAY_APPEND(v_booking_ids, v_booking_id);
      IF v_first_booking_id IS NULL THEN
        v_first_booking_id := v_booking_id;
      END IF;
    END LOOP;
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      DELETE FROM public.booking_recurrence_series
      WHERE id = v_series_id;
      RETURN COALESCE(
        v_failure,
        JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'RECURRING_BOOKING_FAILED')
      );
  END;

  -- 每堂建立時的個別通知仍在同一交易內，改成單一系列通知。
  DELETE FROM public.line_notification_outbox AS job
  WHERE job.booking_id = ANY(v_booking_ids)
    AND job.event_type IN (
      'booking_received'::public.notification_type,
      'booking_confirmed'::public.notification_type
    )
    AND job.status = 'pending';

  SELECT CASE booking.status
    WHEN 'pending'::public.booking_status
      THEN 'booking_received'::public.notification_type
    ELSE 'booking_confirmed'::public.notification_type
  END
  INTO v_event_type
  FROM public.bookings AS booking
  WHERE booking.id = v_first_booking_id;

  PERFORM private.enqueue_booking_series_notification(
    v_series_id,
    v_first_booking_id,
    v_event_type,
    p_occurrence_count,
    'created'
  );

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, new_values, store_id
  ) VALUES (
    (SELECT auth.uid()),
    'booking_series_created',
    'booking_recurrence_series',
    v_series_id,
    JSONB_BUILD_OBJECT(
      'occurrence_count', p_occurrence_count,
      'interval_weeks', p_interval_weeks,
      'booking_ids', TO_JSONB(v_booking_ids)
    ),
    p_store_id
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'idempotent', FALSE,
    'series_id', v_series_id,
    'booking_ids', TO_JSONB(v_booking_ids)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_booking_scope(
  p_booking_id UUID,
  p_scope TEXT DEFAULT 'single'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_booking public.bookings%ROWTYPE;
  v_booking_ids UUID[];
  v_affected_count INTEGER;
  v_first_booking_id UUID;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR v_store_id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF p_scope NOT IN ('single', 'future') THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_SCOPE');
  END IF;

  SELECT booking.*
  INTO v_booking
  FROM public.bookings AS booking
  WHERE booking.id = p_booking_id
    AND booking.store_id = v_store_id
    AND booking.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'BOOKING_NOT_FOUND');
  END IF;

  IF v_booking.status NOT IN (
    'pending'::public.booking_status,
    'confirmed'::public.booking_status
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'BOOKING_NOT_CANCELLABLE');
  END IF;

  IF p_scope = 'single' THEN
    UPDATE public.bookings
    SET status = 'cancelled'::public.booking_status, updated_at = NOW()
    WHERE id = v_booking.id;

    RETURN JSONB_BUILD_OBJECT(
      'ok', TRUE,
      'scope', 'single',
      'affected_count', 1
    );
  END IF;

  IF v_booking.recurrence_series_id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'BOOKING_NOT_RECURRING');
  END IF;

  IF v_booking.start_time <= NOW() THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'BOOKING_ALREADY_STARTED');
  END IF;

  SELECT ARRAY_AGG(candidate.id ORDER BY candidate.start_time)
  INTO v_booking_ids
  FROM (
    SELECT future_booking.id, future_booking.start_time
    FROM public.bookings AS future_booking
    WHERE future_booking.recurrence_series_id = v_booking.recurrence_series_id
      AND future_booking.store_id = v_store_id
      AND future_booking.deleted_at IS NULL
      AND future_booking.start_time >= v_booking.start_time
      AND future_booking.start_time > NOW()
      AND future_booking.status IN (
        'pending'::public.booking_status,
        'confirmed'::public.booking_status
      )
    ORDER BY future_booking.id
    FOR UPDATE
  ) AS candidate;

  IF COALESCE(ARRAY_LENGTH(v_booking_ids, 1), 0) = 0 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'NO_FUTURE_BOOKINGS');
  END IF;

  v_first_booking_id := v_booking_ids[1];

  UPDATE public.bookings
  SET status = 'cancelled'::public.booking_status, updated_at = NOW()
  WHERE id = ANY(v_booking_ids);

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;

  DELETE FROM public.line_notification_outbox AS job
  WHERE job.booking_id = ANY(v_booking_ids)
    AND job.event_type = 'booking_cancelled'::public.notification_type
    AND job.status = 'pending';

  PERFORM private.enqueue_booking_series_notification(
    v_booking.recurrence_series_id,
    v_first_booking_id,
    'booking_cancelled'::public.notification_type,
    v_affected_count,
    CONCAT('cancelled-from-', v_booking.id::TEXT)
  );

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, old_values, new_values, store_id
  ) VALUES (
    (SELECT auth.uid()),
    'booking_series_future_cancelled',
    'booking_recurrence_series',
    v_booking.recurrence_series_id,
    JSONB_BUILD_OBJECT('from_booking_id', v_booking.id),
    JSONB_BUILD_OBJECT(
      'affected_count', v_affected_count,
      'booking_ids', TO_JSONB(v_booking_ids)
    ),
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'scope', 'future',
    'affected_count', v_affected_count,
    'series_id', v_booking.recurrence_series_id
  );
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_booking_series_notification(
  UUID, UUID, public.notification_type, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_recurring_bookings_with_voucher(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER, UUID,
  INTEGER, TEXT, UUID, INTEGER, TEXT, UUID
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_recurring_bookings_with_voucher(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER, UUID,
  INTEGER, TEXT, UUID, INTEGER, TEXT, UUID
) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_booking_scope(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking_scope(UUID, TEXT)
  TO authenticated;

COMMENT ON TABLE public.booking_recurrence_series IS
  '後台建立的循環預約系列；實際每堂仍保存在 bookings。';
COMMENT ON FUNCTION public.create_recurring_bookings_with_voucher(
  UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER, UUID,
  INTEGER, TEXT, UUID, INTEGER, TEXT, UUID
) IS '原子建立 2 至 52 堂、每 1 至 4 週重複的後台預約，並沿用商品券選擇。';
COMMENT ON FUNCTION public.cancel_booking_scope(UUID, TEXT) IS
  '取消單次預約，或取消同系列自選定堂起尚未開始的有效預約。';

COMMIT;
