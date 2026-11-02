-- ============================================================
-- C 端當日最早可預約時間
-- 1. 店家可選 15 / 30 / 60 / 120 分鐘，預設沿用現行 120 分鐘
-- 2. 可用時段依店家時區預先排除過早時段
-- 3. 網頁與 LINE 公開建立入口再次驗證，防止舊頁面繞過
-- 4. 後台人工 upsert_booking 不套用此限制
-- ============================================================

BEGIN;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS same_day_booking_lead_minutes INTEGER NOT NULL DEFAULT 120;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'stores_same_day_booking_lead_minutes_check'
      AND conrelid = 'public.stores'::REGCLASS
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_same_day_booking_lead_minutes_check
      CHECK (same_day_booking_lead_minutes IN (15, 30, 60, 120));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.audit_same_day_booking_lead_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.same_day_booking_lead_minutes IS DISTINCT FROM NEW.same_day_booking_lead_minutes THEN
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
      'same_day_booking_lead_updated',
      'stores',
      NEW.id,
      JSONB_BUILD_OBJECT(
        'same_day_booking_lead_minutes', OLD.same_day_booking_lead_minutes
      ),
      JSONB_BUILD_OBJECT(
        'same_day_booking_lead_minutes', NEW.same_day_booking_lead_minutes
      ),
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.audit_same_day_booking_lead_change()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS audit_same_day_booking_lead_change
  ON public.stores;
CREATE TRIGGER audit_same_day_booking_lead_change
  AFTER UPDATE OF same_day_booking_lead_minutes
  ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION private.audit_same_day_booking_lead_change();

CREATE OR REPLACE FUNCTION private.is_public_booking_start_allowed(
  p_store_id UUID,
  p_start_time TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_timezone TEXT;
  v_lead_minutes INTEGER;
  v_today DATE;
  v_start_date DATE;
BEGIN
  IF p_store_id IS NULL OR p_start_time IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT
    COALESCE(NULLIF(store.timezone, ''), 'Asia/Taipei'),
    COALESCE(store.same_day_booking_lead_minutes, 120)
  INTO v_timezone, v_lead_minutes
  FROM public.stores AS store
  WHERE store.id = p_store_id
    AND store.booking_enabled = TRUE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_today := (NOW() AT TIME ZONE v_timezone)::DATE;
  v_start_date := (p_start_time AT TIME ZONE v_timezone)::DATE;

  IF v_start_date < v_today THEN
    RETURN FALSE;
  END IF;

  IF v_start_date > v_today THEN
    RETURN TRUE;
  END IF;

  RETURN p_start_time >= NOW() + pg_catalog.make_interval(mins => v_lead_minutes);
END;
$$;

REVOKE ALL ON FUNCTION private.is_public_booking_start_allowed(UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated, service_role;

-- 保留既有公開預約複雜邏輯，改名為不可直接呼叫的內部實作。
DO $$
BEGIN
  IF TO_REGPROCEDURE(
    'public.create_booking_public_unchecked(text,text,uuid,uuid,timestamptz,text,uuid,text,text,text)'
  ) IS NULL THEN
    ALTER FUNCTION public.create_booking_public(
      TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT
    ) RENAME TO create_booking_public_unchecked;
  END IF;

  IF TO_REGPROCEDURE(
    'public.create_line_booking_unchecked(text,text,uuid,uuid,timestamptz,uuid,text,text,text,text,text)'
  ) IS NULL THEN
    ALTER FUNCTION public.create_line_booking(
      TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
    ) RENAME TO create_line_booking_unchecked;
  END IF;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.create_booking_public_unchecked(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL PRIVILEGES ON FUNCTION public.create_line_booking_unchecked(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;

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

REVOKE ALL PRIVILEGES ON FUNCTION public.get_available_slots(
  DATE, UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_available_slots(
  DATE, UUID, UUID, UUID
) TO anon, authenticated;

COMMENT ON COLUMN public.stores.same_day_booking_lead_minutes IS
  'C 端當日預約最早開始時間距現在的分鐘數；僅允許 15、30、60、120';
COMMENT ON FUNCTION private.is_public_booking_start_allowed(UUID, TIMESTAMPTZ) IS
  '公開預約送出層共用門檻；未來日期允許，今天依店家時區與最新設定判斷';
COMMENT ON FUNCTION public.create_booking_public(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT
) IS '一般公開網頁預約；建立前強制驗證店家最新的當日最早可預約時間';
COMMENT ON FUNCTION public.create_line_booking(
  TEXT, TEXT, UUID, UUID, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) IS 'LINE Edge Function 專用；建立前強制驗證店家最新的當日最早可預約時間';
COMMENT ON FUNCTION public.get_available_slots(DATE, UUID, UUID, UUID) IS
  '公開可用時段；依店家時區、當日預約門檻、店休、封鎖與預約衝突篩選';

COMMIT;
