-- ============================================================
-- 店休與老師臨時休假支援精確時段
--
-- 1. 舊店休安全回填為整日區間，不改變既有行為
-- 2. 新增指定時段店休與公開安全查詢
-- 3. 可用時段與預約最後防線改用精確區間判斷
-- 4. 老師休假沿用 practitioner_blocks 的 TIMESTAMPTZ 欄位，
--    新增日期＋時間版的預覽與儲存 RPC
-- ============================================================

BEGIN;

ALTER TABLE public.store_closures
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS all_day BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.store_closures AS closure
SET
  starts_at = closure.start_date::TIMESTAMP AT TIME ZONE COALESCE(
    NULLIF(store.timezone, ''),
    'Asia/Taipei'
  ),
  ends_at = (closure.end_date + 1)::TIMESTAMP AT TIME ZONE COALESCE(
    NULLIF(store.timezone, ''),
    'Asia/Taipei'
  ),
  all_day = TRUE
FROM public.stores AS store
WHERE store.id = closure.store_id
  AND (closure.starts_at IS NULL OR closure.ends_at IS NULL);

ALTER TABLE public.store_closures
  ALTER COLUMN starts_at SET NOT NULL,
  ALTER COLUMN ends_at SET NOT NULL;

ALTER TABLE public.store_closures
  DROP CONSTRAINT IF EXISTS store_closures_time_range_check;
ALTER TABLE public.store_closures
  ADD CONSTRAINT store_closures_time_range_check
  CHECK (ends_at > starts_at);

CREATE INDEX IF NOT EXISTS idx_store_closures_store_window_active
  ON public.store_closures (store_id, starts_at, ends_at)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.save_store_closure_window(
  p_closure_id UUID,
  p_start_date DATE,
  p_start_time TIME,
  p_end_date DATE,
  p_end_time TIME,
  p_all_day BOOLEAN,
  p_category TEXT,
  p_public_label TEXT DEFAULT '店休',
  p_internal_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_timezone TEXT;
  v_starts_at TIMESTAMPTZ;
  v_ends_at TIMESTAMPTZ;
  v_closure_id UUID;
  v_existing public.store_closures%ROWTYPE;
  v_public_label TEXT := NULLIF(BTRIM(COALESCE(p_public_label, '')), '');
  v_internal_note TEXT := NULLIF(BTRIM(COALESCE(p_internal_note, '')), '');
  v_conflict_count INTEGER;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR NOT (SELECT public.is_admin()) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF p_start_date IS NULL
    OR p_end_date IS NULL
    OR p_all_day IS NULL
    OR (NOT p_all_day AND (p_start_time IS NULL OR p_end_time IS NULL))
    OR p_end_date < p_start_date
    OR p_end_date > p_start_date + 366
    OR p_category IS NULL
    OR p_category NOT IN (
      'public_holiday', 'staff_trip', 'maintenance', 'emergency', 'other'
    )
    OR v_public_label IS NULL
    OR CHAR_LENGTH(v_public_label) > 100
    OR CHAR_LENGTH(COALESCE(v_internal_note, '')) > 1000 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_INPUT');
  END IF;

  SELECT COALESCE(NULLIF(store.timezone, ''), 'Asia/Taipei')
  INTO v_timezone
  FROM public.stores AS store
  WHERE store.id = v_store_id;

  IF v_timezone IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'STORE_NOT_FOUND');
  END IF;

  IF p_all_day THEN
    v_starts_at := p_start_date::TIMESTAMP AT TIME ZONE v_timezone;
    v_ends_at := (p_end_date + 1)::TIMESTAMP AT TIME ZONE v_timezone;
  ELSE
    v_starts_at := (p_start_date + p_start_time)::TIMESTAMP AT TIME ZONE v_timezone;
    v_ends_at := (p_end_date + p_end_time)::TIMESTAMP AT TIME ZONE v_timezone;
  END IF;

  IF v_ends_at <= v_starts_at THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_TIME_RANGE');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_store_id::TEXT || ':store-closures', 0)
  );

  IF p_closure_id IS NOT NULL THEN
    SELECT closure.*
    INTO v_existing
    FROM public.store_closures AS closure
    WHERE closure.id = p_closure_id
      AND closure.store_id = v_store_id
      AND closure.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'CLOSURE_NOT_FOUND');
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.store_closures AS closure
    WHERE closure.store_id = v_store_id
      AND closure.deleted_at IS NULL
      AND (p_closure_id IS NULL OR closure.id <> p_closure_id)
      AND closure.starts_at < v_ends_at
      AND closure.ends_at > v_starts_at
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'OVERLAPPING_CLOSURE');
  END IF;

  IF p_closure_id IS NULL THEN
    INSERT INTO public.store_closures (
      store_id,
      start_date,
      end_date,
      starts_at,
      ends_at,
      all_day,
      category,
      public_label,
      internal_note,
      created_by
    ) VALUES (
      v_store_id,
      p_start_date,
      p_end_date,
      v_starts_at,
      v_ends_at,
      p_all_day,
      p_category,
      v_public_label,
      v_internal_note,
      (SELECT auth.uid())
    )
    RETURNING id INTO v_closure_id;
  ELSE
    UPDATE public.store_closures
    SET
      start_date = p_start_date,
      end_date = p_end_date,
      starts_at = v_starts_at,
      ends_at = v_ends_at,
      all_day = p_all_day,
      category = p_category,
      public_label = v_public_label,
      internal_note = v_internal_note
    WHERE id = p_closure_id
      AND store_id = v_store_id
      AND deleted_at IS NULL
    RETURNING id INTO v_closure_id;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_conflict_count
  FROM public.bookings AS booking
  WHERE booking.store_id = v_store_id
    AND booking.deleted_at IS NULL
    AND booking.status <> 'cancelled'::public.booking_status
    AND booking.start_time < v_ends_at
    AND booking.end_time > v_starts_at;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values,
    store_id
  ) VALUES (
    (SELECT auth.uid()),
    CASE WHEN p_closure_id IS NULL
      THEN 'store_closure_created'
      ELSE 'store_closure_updated'
    END,
    'store_closures',
    v_closure_id,
    CASE WHEN p_closure_id IS NULL THEN NULL ELSE TO_JSONB(v_existing) END,
    JSONB_BUILD_OBJECT(
      'start_date', p_start_date,
      'end_date', p_end_date,
      'starts_at', v_starts_at,
      'ends_at', v_ends_at,
      'all_day', p_all_day,
      'category', p_category,
      'public_label', v_public_label,
      'internal_note', v_internal_note,
      'conflict_count', v_conflict_count
    ),
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'id', v_closure_id,
    'conflict_count', v_conflict_count
  );
END;
$$;

-- 部署交接期間保留舊前端相容性：舊 RPC 一律視為整日店休，
-- 實際寫入仍統一走新版函式，避免遺漏精確區間欄位。
CREATE OR REPLACE FUNCTION public.save_store_closure(
  p_closure_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_category TEXT,
  p_public_label TEXT DEFAULT '店休',
  p_internal_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.save_store_closure_window(
    p_closure_id,
    p_start_date,
    '00:00'::TIME,
    p_end_date,
    '00:00'::TIME,
    TRUE,
    p_category,
    p_public_label,
    p_internal_note
  );
$$;

CREATE OR REPLACE FUNCTION public.get_public_store_closure_windows(
  p_store_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  id UUID,
  start_date DATE,
  end_date DATE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  all_day BOOLEAN,
  public_label TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    closure.id,
    closure.start_date,
    closure.end_date,
    closure.starts_at,
    closure.ends_at,
    closure.all_day,
    closure.public_label
  FROM public.store_closures AS closure
  JOIN public.stores AS store
    ON store.id = closure.store_id
   AND store.booking_enabled = TRUE
  WHERE closure.store_id = p_store_id
    AND p_start_date IS NOT NULL
    AND p_end_date IS NOT NULL
    AND p_end_date >= p_start_date
    AND p_end_date <= p_start_date + 366
    AND closure.deleted_at IS NULL
    AND closure.starts_at < (
      (p_end_date + 1)::TIMESTAMP AT TIME ZONE COALESCE(
        NULLIF(store.timezone, ''),
        'Asia/Taipei'
      )
    )
    AND closure.ends_at > (
      p_start_date::TIMESTAMP AT TIME ZONE COALESCE(
        NULLIF(store.timezone, ''),
        'Asia/Taipei'
      )
    )
  ORDER BY closure.starts_at, closure.ends_at, closure.id;
$$;

CREATE OR REPLACE FUNCTION private.enforce_store_closure_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_closure public.store_closures%ROWTYPE;
  v_override_reason TEXT := NULLIF(
    BTRIM(COALESCE(CURRENT_SETTING('app.booking_override_reason', TRUE), '')),
    ''
  );
BEGIN
  SELECT closure.*
  INTO v_closure
  FROM public.store_closures AS closure
  WHERE closure.store_id = NEW.store_id
    AND closure.deleted_at IS NULL
    AND NEW.start_time < closure.ends_at
    AND NEW.end_time > closure.starts_at
  ORDER BY closure.starts_at, closure.id
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

CREATE OR REPLACE FUNCTION public.preview_practitioner_leave_window_conflicts(
  p_practitioner_id UUID,
  p_start_date DATE,
  p_start_time TIME,
  p_end_date DATE,
  p_end_time TIME
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_timezone TEXT;
  v_starts_at TIMESTAMPTZ;
  v_ends_at TIMESTAMPTZ;
  v_conflicts JSONB;
  v_conflict_count INTEGER;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR NOT (SELECT public.is_admin()) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF p_practitioner_id IS NULL
    OR p_start_date IS NULL
    OR p_start_time IS NULL
    OR p_end_date IS NULL
    OR p_end_time IS NULL
    OR p_end_date < p_start_date
    OR p_end_date > p_start_date + 366 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_INPUT');
  END IF;

  SELECT COALESCE(NULLIF(store.timezone, ''), 'Asia/Taipei')
  INTO v_timezone
  FROM public.practitioners AS practitioner
  JOIN public.stores AS store ON store.id = practitioner.store_id
  WHERE practitioner.id = p_practitioner_id
    AND practitioner.store_id = v_store_id
    AND practitioner.deleted_at IS NULL;

  IF v_timezone IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'PRACTITIONER_NOT_FOUND');
  END IF;

  v_starts_at := (p_start_date + p_start_time)::TIMESTAMP AT TIME ZONE v_timezone;
  v_ends_at := (p_end_date + p_end_time)::TIMESTAMP AT TIME ZONE v_timezone;

  IF v_ends_at <= v_starts_at THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_TIME_RANGE');
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', booking.id,
          'start_time', booking.start_time,
          'end_time', booking.end_time,
          'client_name', client.full_name,
          'service_name', service.name
        ) ORDER BY booking.start_time, booking.id
      ),
      '[]'::JSONB
    )
  INTO v_conflict_count, v_conflicts
  FROM public.bookings AS booking
  JOIN public.clients AS client ON client.id = booking.client_id
  JOIN public.services AS service ON service.id = booking.service_id
  WHERE booking.store_id = v_store_id
    AND booking.practitioner_id = p_practitioner_id
    AND booking.deleted_at IS NULL
    AND booking.status <> 'cancelled'::public.booking_status
    AND booking.start_time < v_ends_at
    AND booking.end_time > v_starts_at;

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'conflict_count', v_conflict_count,
    'conflicts', v_conflicts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_practitioner_leave_window(
  p_practitioner_id UUID,
  p_start_date DATE,
  p_start_time TIME,
  p_end_date DATE,
  p_end_time TIME,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_timezone TEXT;
  v_starts_at TIMESTAMPTZ;
  v_ends_at TIMESTAMPTZ;
  v_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  v_block_id UUID;
  v_conflicts JSONB;
  v_conflict_count INTEGER;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR NOT (SELECT public.is_admin()) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF p_practitioner_id IS NULL
    OR p_start_date IS NULL
    OR p_start_time IS NULL
    OR p_end_date IS NULL
    OR p_end_time IS NULL
    OR p_end_date < p_start_date
    OR p_end_date > p_start_date + 366
    OR CHAR_LENGTH(COALESCE(v_reason, '')) > 500 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_INPUT');
  END IF;

  SELECT COALESCE(NULLIF(store.timezone, ''), 'Asia/Taipei')
  INTO v_timezone
  FROM public.practitioners AS practitioner
  JOIN public.stores AS store ON store.id = practitioner.store_id
  WHERE practitioner.id = p_practitioner_id
    AND practitioner.store_id = v_store_id
    AND practitioner.deleted_at IS NULL
  FOR UPDATE OF practitioner;

  IF v_timezone IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'PRACTITIONER_NOT_FOUND');
  END IF;

  v_starts_at := (p_start_date + p_start_time)::TIMESTAMP AT TIME ZONE v_timezone;
  v_ends_at := (p_end_date + p_end_time)::TIMESTAMP AT TIME ZONE v_timezone;

  IF v_ends_at <= v_starts_at THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_TIME_RANGE');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_store_id::TEXT || ':' || p_practitioner_id::TEXT || ':leave',
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.practitioner_blocks AS block
    WHERE block.store_id = v_store_id
      AND block.practitioner_id = p_practitioner_id
      AND block.start_time < v_ends_at
      AND block.end_time > v_starts_at
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'OVERLAPPING_LEAVE');
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', booking.id,
          'start_time', booking.start_time,
          'end_time', booking.end_time,
          'client_name', client.full_name,
          'service_name', service.name
        ) ORDER BY booking.start_time, booking.id
      ),
      '[]'::JSONB
    )
  INTO v_conflict_count, v_conflicts
  FROM public.bookings AS booking
  JOIN public.clients AS client ON client.id = booking.client_id
  JOIN public.services AS service ON service.id = booking.service_id
  WHERE booking.store_id = v_store_id
    AND booking.practitioner_id = p_practitioner_id
    AND booking.deleted_at IS NULL
    AND booking.status <> 'cancelled'::public.booking_status
    AND booking.start_time < v_ends_at
    AND booking.end_time > v_starts_at;

  INSERT INTO public.practitioner_blocks (
    practitioner_id,
    store_id,
    start_time,
    end_time,
    reason
  ) VALUES (
    p_practitioner_id,
    v_store_id,
    v_starts_at,
    v_ends_at,
    v_reason
  )
  RETURNING id INTO v_block_id;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    new_values,
    store_id
  ) VALUES (
    (SELECT auth.uid()),
    'practitioner_leave_created',
    'practitioner_blocks',
    v_block_id,
    JSONB_BUILD_OBJECT(
      'practitioner_id', p_practitioner_id,
      'starts_at', v_starts_at,
      'ends_at', v_ends_at,
      'reason', v_reason,
      'conflict_count', v_conflict_count
    ),
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'id', v_block_id,
    'conflict_count', v_conflict_count,
    'conflicts', v_conflicts
  );
END;
$$;

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
    WHERE (p_date > v_today OR generated_slot >= v_min_start)
      AND NOT EXISTS (
        SELECT 1
        FROM public.store_closures AS closure
        WHERE closure.store_id = p_store_id
          AND closure.deleted_at IS NULL
          AND closure.starts_at < generated_slot
            + pg_catalog.make_interval(mins => v_duration)
          AND closure.ends_at > generated_slot
      )
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

REVOKE ALL ON FUNCTION public.save_store_closure_window(
  UUID, DATE, TIME, DATE, TIME, BOOLEAN, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_store_closure_window(
  UUID, DATE, TIME, DATE, TIME, BOOLEAN, TEXT, TEXT, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.save_store_closure(
  UUID, DATE, DATE, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_store_closure(
  UUID, DATE, DATE, TEXT, TEXT, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_public_store_closure_windows(UUID, DATE, DATE)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_store_closure_windows(UUID, DATE, DATE)
  TO anon, authenticated;

REVOKE ALL ON FUNCTION public.preview_practitioner_leave_window_conflicts(
  UUID, DATE, TIME, DATE, TIME
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_practitioner_leave_window_conflicts(
  UUID, DATE, TIME, DATE, TIME
) TO authenticated;

REVOKE ALL ON FUNCTION public.save_practitioner_leave_window(
  UUID, DATE, TIME, DATE, TIME, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_practitioner_leave_window(
  UUID, DATE, TIME, DATE, TIME, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_available_slots(DATE, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_available_slots(DATE, UUID, UUID, UUID)
  TO anon, authenticated;

COMMENT ON COLUMN public.store_closures.starts_at IS
  '店休精確開始時間；舊整日資料依店家時區回填為開始日 00:00';
COMMENT ON COLUMN public.store_closures.ends_at IS
  '店休精確結束時間，採不含結束點的半開區間';
COMMENT ON COLUMN public.store_closures.all_day IS
  '是否為整日店休；整日區間從開始日 00:00 至結束日翌日 00:00';
COMMENT ON FUNCTION public.save_store_closure_window(
  UUID, DATE, TIME, DATE, TIME, BOOLEAN, TEXT, TEXT, TEXT
) IS '同店管理員建立或更新整日或指定時段店休，並回傳真正重疊的預約數';
COMMENT ON FUNCTION public.get_public_store_closure_windows(UUID, DATE, DATE) IS
  '公開查詢店休精確區間，只回傳客戶端所需的安全欄位';
COMMENT ON FUNCTION public.preview_practitioner_leave_window_conflicts(
  UUID, DATE, TIME, DATE, TIME
) IS '同店管理員預覽老師指定休假時段內受影響的預約';
COMMENT ON FUNCTION public.save_practitioner_leave_window(
  UUID, DATE, TIME, DATE, TIME, TEXT
) IS '同店管理員新增老師指定時段休假，阻擋重疊並留下稽核紀錄';
COMMENT ON FUNCTION public.get_available_slots(DATE, UUID, UUID, UUID) IS
  '公開可用時段；依精確店休、老師班表、老師休假、當日門檻與預約衝突篩選';

COMMIT;
