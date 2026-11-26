-- ============================================================
-- 老師固定班表與休假的預約防線
--
-- 1. 公開可用時段套用老師每週班表
-- 2. 所有預約寫入在資料庫再次驗證班表與封鎖時段
-- 3. 公開與一般成員不可覆寫；同店管理員覆寫時留下稽核
-- 4. 未設定任何班表列的既有老師維持原本店家營業時間行為
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION private.is_practitioner_available_for_booking(
  p_store_id UUID,
  p_practitioner_id UUID,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_timezone TEXT;
  v_local_start TIMESTAMP;
  v_local_end TIMESTAMP;
  v_weekday SMALLINT;
BEGIN
  IF p_store_id IS NULL
    OR p_practitioner_id IS NULL
    OR p_start_time IS NULL
    OR p_end_time IS NULL
    OR p_end_time <= p_start_time THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(NULLIF(store.timezone, ''), 'Asia/Taipei')
  INTO v_timezone
  FROM public.practitioners AS practitioner
  JOIN public.stores AS store ON store.id = practitioner.store_id
  WHERE practitioner.id = p_practitioner_id
    AND practitioner.store_id = p_store_id
    AND practitioner.active = TRUE
    AND practitioner.deleted_at IS NULL;

  IF v_timezone IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.practitioner_blocks AS block
    WHERE block.store_id = p_store_id
      AND block.practitioner_id = p_practitioner_id
      AND block.start_time < p_end_time
      AND block.end_time > p_start_time
  ) THEN
    RETURN FALSE;
  END IF;

  -- 完全沒有班表資料代表既有老師尚未設定，維持舊行為。
  IF NOT EXISTS (
    SELECT 1
    FROM public.practitioner_weekly_schedules AS schedule
    WHERE schedule.store_id = p_store_id
      AND schedule.practitioner_id = p_practitioner_id
  ) THEN
    RETURN TRUE;
  END IF;

  v_local_start := p_start_time AT TIME ZONE v_timezone;
  v_local_end := p_end_time AT TIME ZONE v_timezone;
  v_weekday := EXTRACT(ISODOW FROM v_local_start)::SMALLINT;

  -- Phase 1 不支援跨日班；預約也必須完整落在同一個班別內。
  IF v_local_start::DATE <> v_local_end::DATE THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.practitioner_weekly_schedules AS schedule
    WHERE schedule.store_id = p_store_id
      AND schedule.practitioner_id = p_practitioner_id
      AND schedule.weekday = v_weekday
      AND schedule.is_working = TRUE
      AND v_local_start::TIME >= schedule.start_time
      AND v_local_end::TIME <= schedule.end_time
  );
END;
$$;

REVOKE ALL ON FUNCTION private.is_practitioner_available_for_booking(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.enforce_practitioner_availability_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
    OR public.current_store_id() IS DISTINCT FROM NEW.store_id THEN
    RAISE EXCEPTION 'PRACTITIONER_UNAVAILABLE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    new_values,
    store_id
  ) VALUES (
    (SELECT auth.uid()),
    'booking_practitioner_availability_overridden',
    'bookings',
    NEW.id,
    JSONB_BUILD_OBJECT(
      'practitioner_id', NEW.practitioner_id,
      'start_time', NEW.start_time,
      'end_time', NEW.end_time
    ),
    NEW.store_id
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_practitioner_availability_on_booking()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS enforce_practitioner_availability_on_booking
  ON public.bookings;
CREATE TRIGGER enforce_practitioner_availability_on_booking
  BEFORE INSERT OR UPDATE OF store_id, practitioner_id, start_time, end_time
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_practitioner_availability_on_booking();

-- 公開網頁預約：維持既有當日門檻，將最終防線錯誤轉成前端可辨識代碼。
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
BEGIN
  IF NOT private.is_public_booking_start_allowed(p_store_id, p_start_time) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'BOOKING_TOO_SOON');
  END IF;

  RETURN public.create_booking_public_unchecked(
    p_full_name,
    p_phone,
    p_service_id,
    p_practitioner_id,
    p_start_time,
    p_notes,
    p_store_id,
    p_source,
    p_client_line_id,
    p_client_picture_url
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM = 'PRACTITIONER_UNAVAILABLE' THEN
      RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'PRACTITIONER_UNAVAILABLE');
    END IF;
    RAISE;
END;
$$;

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
BEGIN
  IF NOT private.is_public_booking_start_allowed(p_store_id, p_start_time) THEN
    RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'BOOKING_TOO_SOON');
  END IF;

  RETURN public.create_line_booking_unchecked(
    p_full_name,
    p_phone,
    p_service_id,
    p_practitioner_id,
    p_start_time,
    p_store_id,
    p_line_provider_account_id,
    p_line_user_id,
    p_line_display_name,
    p_line_picture_url,
    p_notes
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM = 'PRACTITIONER_UNAVAILABLE' THEN
      RETURN JSON_BUILD_OBJECT('ok', FALSE, 'error', 'PRACTITIONER_UNAVAILABLE');
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking_public(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_booking_public(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT
) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.create_line_booking(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_line_booking(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_available_slots(
  p_date DATE,
  p_service_id UUID,
  p_practitioner_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'
)
RETURNS TABLE (
  slot_time TEXT,
  practitioner_id UUID,
  practitioner_name TEXT,
  practitioner_color TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_open_time TIME;
  v_close_time TIME;
  v_duration INTEGER;
  v_buffer INTEGER;
  v_timezone TEXT;
  v_lead_minutes INTEGER;
  v_min_start TIMESTAMPTZ;
  v_today DATE;
  v_max_date DATE;
  v_weekday SMALLINT;
BEGIN
  IF p_date IS NULL OR p_service_id IS NULL OR p_store_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    store.open_time,
    store.close_time,
    COALESCE(store.default_buffer_minutes, 0),
    COALESCE(NULLIF(store.timezone, ''), 'Asia/Taipei'),
    COALESCE(store.same_day_booking_lead_minutes, 120)
  INTO
    v_open_time,
    v_close_time,
    v_buffer,
    v_timezone,
    v_lead_minutes
  FROM public.stores AS store
  WHERE store.id = p_store_id
    AND store.booking_enabled = TRUE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_today := (NOW() AT TIME ZONE v_timezone)::DATE;
  v_max_date := v_today + 62;
  v_min_start := NOW() + pg_catalog.make_interval(mins => v_lead_minutes);
  v_weekday := EXTRACT(ISODOW FROM p_date)::SMALLINT;

  IF p_date < v_today OR p_date > v_max_date THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.store_closures AS closure
    WHERE closure.store_id = p_store_id
      AND closure.deleted_at IS NULL
      AND closure.start_date <= p_date
      AND closure.end_date >= p_date
  ) THEN
    RETURN;
  END IF;

  SELECT service.duration_minutes
  INTO v_duration
  FROM public.services AS service
  WHERE service.id = p_service_id
    AND service.store_id = p_store_id
    AND service.active = TRUE
    AND service.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_practitioner_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.practitioners AS practitioner
      WHERE practitioner.id = p_practitioner_id
        AND practitioner.store_id = p_store_id
        AND practitioner.active = TRUE
        AND practitioner.deleted_at IS NULL
    ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH raw_slots AS (
    SELECT
      generated_slot AS slot_ts,
      TO_CHAR(generated_slot AT TIME ZONE v_timezone, 'HH24:MI') AS slot_str
    FROM GENERATE_SERIES(
      (p_date::TEXT || ' ' || v_open_time::TEXT)::TIMESTAMP AT TIME ZONE v_timezone,
      (p_date::TEXT || ' ' || v_close_time::TEXT)::TIMESTAMP AT TIME ZONE v_timezone
        - pg_catalog.make_interval(mins => v_duration),
      INTERVAL '15 minutes'
    ) AS generated_slot
    WHERE p_date > v_today OR generated_slot >= v_min_start
  ),
  active_practitioners AS (
    SELECT
      practitioner.id,
      practitioner.full_name,
      practitioner.color
    FROM public.practitioners AS practitioner
    WHERE practitioner.store_id = p_store_id
      AND practitioner.active = TRUE
      AND practitioner.deleted_at IS NULL
      AND (p_practitioner_id IS NULL OR practitioner.id = p_practitioner_id)
  ),
  candidates AS (
    SELECT
      raw.slot_ts,
      raw.slot_str,
      practitioner.id AS practitioner_id,
      practitioner.full_name,
      practitioner.color
    FROM raw_slots AS raw
    CROSS JOIN active_practitioners AS practitioner
    WHERE
      NOT EXISTS (
        SELECT 1
        FROM public.practitioner_weekly_schedules AS any_schedule
        WHERE any_schedule.store_id = p_store_id
          AND any_schedule.practitioner_id = practitioner.id
      )
      OR EXISTS (
        SELECT 1
        FROM public.practitioner_weekly_schedules AS schedule
        WHERE schedule.store_id = p_store_id
          AND schedule.practitioner_id = practitioner.id
          AND schedule.weekday = v_weekday
          AND schedule.is_working = TRUE
          AND (raw.slot_ts AT TIME ZONE v_timezone)::TIME >= schedule.start_time
          AND (
            raw.slot_ts + pg_catalog.make_interval(mins => v_duration)
          ) AT TIME ZONE v_timezone <= p_date + schedule.end_time
      )
  ),
  unblocked AS (
    SELECT candidate.*
    FROM candidates AS candidate
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.practitioner_blocks AS block
      WHERE block.store_id = p_store_id
        AND block.practitioner_id = candidate.practitioner_id
        AND block.start_time < candidate.slot_ts
          + pg_catalog.make_interval(mins => v_duration)
        AND block.end_time > candidate.slot_ts
    )
  ),
  available AS (
    SELECT candidate.*
    FROM unblocked AS candidate
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.bookings AS booking
      WHERE booking.store_id = p_store_id
        AND booking.practitioner_id = candidate.practitioner_id
        AND booking.deleted_at IS NULL
        AND booking.status <> 'cancelled'::public.booking_status
        AND booking.start_time < candidate.slot_ts
          + pg_catalog.make_interval(mins => v_duration + v_buffer)
        AND booking.end_time
          + pg_catalog.make_interval(mins => COALESCE(booking.buffer_minutes, 0))
          > candidate.slot_ts
    )
  ),
  today_counts AS (
    SELECT booking.practitioner_id, COUNT(*) AS booking_count
    FROM public.bookings AS booking
    WHERE booking.store_id = p_store_id
      AND booking.deleted_at IS NULL
      AND booking.status <> 'cancelled'::public.booking_status
      AND (booking.start_time AT TIME ZONE v_timezone)::DATE = p_date
    GROUP BY booking.practitioner_id
  ),
  week_counts AS (
    SELECT booking.practitioner_id, COUNT(*) AS booking_count
    FROM public.bookings AS booking
    WHERE booking.store_id = p_store_id
      AND booking.deleted_at IS NULL
      AND booking.status <> 'cancelled'::public.booking_status
      AND booking.start_time >= DATE_TRUNC(
        'week',
        (p_date::TEXT || ' 00:00')::TIMESTAMP AT TIME ZONE v_timezone
      )
      AND booking.start_time < DATE_TRUNC(
        'week',
        (p_date::TEXT || ' 00:00')::TIMESTAMP AT TIME ZONE v_timezone
      ) + INTERVAL '7 days'
    GROUP BY booking.practitioner_id
  ),
  best AS (
    SELECT DISTINCT ON (candidate.slot_ts)
      candidate.slot_ts,
      candidate.slot_str,
      candidate.practitioner_id,
      candidate.full_name,
      candidate.color
    FROM available AS candidate
    LEFT JOIN today_counts AS today
      ON today.practitioner_id = candidate.practitioner_id
    LEFT JOIN week_counts AS week
      ON week.practitioner_id = candidate.practitioner_id
    ORDER BY
      candidate.slot_ts,
      COALESCE(today.booking_count, 0),
      COALESCE(week.booking_count, 0),
      candidate.practitioner_id
  )
  SELECT
    best.slot_str,
    best.practitioner_id,
    best.full_name,
    best.color
  FROM best
  ORDER BY best.slot_ts;
END;
$$;

REVOKE ALL ON FUNCTION public.get_available_slots(
  DATE, UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_available_slots(
  DATE, UUID, UUID, UUID
) TO anon, authenticated;

COMMENT ON FUNCTION private.is_practitioner_available_for_booking(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) IS '共用老師可用性規則：固定班表、休假封鎖、同日且完整落在班別內';
COMMENT ON FUNCTION private.enforce_practitioner_availability_on_booking() IS
  '所有預約寫入的最後防線；公開與一般成員阻擋，同店管理員覆寫並留下稽核';
COMMENT ON FUNCTION public.get_available_slots(DATE, UUID, UUID, UUID) IS
  '公開可用時段；依店家時區、當日門檻、店休、老師班表、封鎖與預約衝突篩選';

COMMIT;
