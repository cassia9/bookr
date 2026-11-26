-- ============================================================
-- 老師每週固定班表（Phase 1：資料模型與管理 API）
--
-- 1. 每位老師保存完整七天規則；完全沒有資料時沿用舊行為
-- 2. 同店成員可讀、僅同店管理員可透過 RPC 寫入
-- 3. 儲存前可預覽會落在新班表外的既有預約
-- 4. 每次儲存留下前後值與操作者稽核紀錄
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.practitioner_weekly_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  practitioner_id UUID NOT NULL REFERENCES public.practitioners(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL,
  is_working BOOLEAN NOT NULL DEFAULT FALSE,
  start_time TIME,
  end_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT practitioner_weekly_schedules_weekday_check
    CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT practitioner_weekly_schedules_working_time_check
    CHECK (
      (is_working = FALSE AND start_time IS NULL AND end_time IS NULL)
      OR
      (is_working = TRUE AND start_time IS NOT NULL AND end_time IS NOT NULL
        AND end_time > start_time)
    ),
  CONSTRAINT practitioner_weekly_schedules_practitioner_weekday_key
    UNIQUE (practitioner_id, weekday)
);

CREATE INDEX IF NOT EXISTS idx_practitioner_weekly_schedules_store_practitioner_weekday
  ON public.practitioner_weekly_schedules (store_id, practitioner_id, weekday);

ALTER TABLE public.practitioner_weekly_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_store_practitioner_weekly_schedules
  ON public.practitioner_weekly_schedules;
CREATE POLICY select_store_practitioner_weekly_schedules
  ON public.practitioner_weekly_schedules
  FOR SELECT
  TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

REVOKE ALL ON TABLE public.practitioner_weekly_schedules
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.practitioner_weekly_schedules TO authenticated;

CREATE OR REPLACE FUNCTION private.prepare_practitioner_weekly_schedule_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID;
BEGIN
  SELECT practitioner.store_id
  INTO v_store_id
  FROM public.practitioners AS practitioner
  WHERE practitioner.id = NEW.practitioner_id
    AND practitioner.deleted_at IS NULL;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'PRACTITIONER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  NEW.store_id := v_store_id;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prepare_practitioner_weekly_schedule_row()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS prepare_practitioner_weekly_schedule_row
  ON public.practitioner_weekly_schedules;
CREATE TRIGGER prepare_practitioner_weekly_schedule_row
  BEFORE INSERT OR UPDATE
  ON public.practitioner_weekly_schedules
  FOR EACH ROW
  EXECUTE FUNCTION private.prepare_practitioner_weekly_schedule_row();

CREATE OR REPLACE FUNCTION private.is_valid_weekly_schedule_payload(
  p_schedule JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_row_count INTEGER;
  v_distinct_weekdays INTEGER;
  v_working_count INTEGER;
  v_invalid_count INTEGER;
BEGIN
  IF p_schedule IS NULL
    OR JSONB_TYPEOF(p_schedule) <> 'array'
    OR JSONB_ARRAY_LENGTH(p_schedule) <> 7 THEN
    RETURN FALSE;
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(DISTINCT item.weekday)::INTEGER,
    COUNT(*) FILTER (WHERE item.is_working = TRUE)::INTEGER,
    COUNT(*) FILTER (
      WHERE item.weekday IS NULL
        OR item.weekday NOT BETWEEN 1 AND 7
        OR item.is_working IS NULL
        OR (
          item.is_working = TRUE
          AND (
            item.start_time IS NULL
            OR item.end_time IS NULL
            OR item.end_time <= item.start_time
          )
        )
        OR (
          item.is_working = FALSE
          AND (item.start_time IS NOT NULL OR item.end_time IS NOT NULL)
        )
    )::INTEGER
  INTO v_row_count, v_distinct_weekdays, v_working_count, v_invalid_count
  FROM JSONB_TO_RECORDSET(p_schedule) AS item(
    weekday SMALLINT,
    is_working BOOLEAN,
    start_time TIME,
    end_time TIME
  );

  RETURN v_row_count = 7
    AND v_distinct_weekdays = 7
    AND v_working_count >= 1
    AND v_invalid_count = 0;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION private.is_valid_weekly_schedule_payload(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.preview_practitioner_schedule_conflicts(
  p_practitioner_id UUID,
  p_schedule JSONB
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
  v_conflicts JSONB;
  v_conflict_count INTEGER;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR NOT (SELECT public.is_admin()) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF p_practitioner_id IS NULL
    OR NOT private.is_valid_weekly_schedule_payload(p_schedule) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_SCHEDULE');
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

  WITH schedule AS (
    SELECT *
    FROM JSONB_TO_RECORDSET(p_schedule) AS item(
      weekday SMALLINT,
      is_working BOOLEAN,
      start_time TIME,
      end_time TIME
    )
  ), conflicts AS (
    SELECT
      booking.id,
      booking.start_time,
      booking.end_time,
      client.full_name AS client_name,
      service.name AS service_name
    FROM public.bookings AS booking
    JOIN public.clients AS client ON client.id = booking.client_id
    JOIN public.services AS service ON service.id = booking.service_id
    JOIN schedule
      ON schedule.weekday = EXTRACT(
        ISODOW FROM booking.start_time AT TIME ZONE v_timezone
      )::SMALLINT
    WHERE booking.store_id = v_store_id
      AND booking.practitioner_id = p_practitioner_id
      AND booking.deleted_at IS NULL
      AND booking.status <> 'cancelled'::public.booking_status
      AND booking.end_time > NOW()
      AND (
        schedule.is_working = FALSE
        OR (booking.start_time AT TIME ZONE v_timezone)::TIME < schedule.start_time
        OR (booking.end_time AT TIME ZONE v_timezone)::TIME > schedule.end_time
        OR (booking.start_time AT TIME ZONE v_timezone)::DATE
          <> (booking.end_time AT TIME ZONE v_timezone)::DATE
      )
    ORDER BY booking.start_time, booking.id
  )
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', conflict.id,
          'start_time', conflict.start_time,
          'end_time', conflict.end_time,
          'client_name', conflict.client_name,
          'service_name', conflict.service_name
        ) ORDER BY conflict.start_time, conflict.id
      ),
      '[]'::JSONB
    )
  INTO v_conflict_count, v_conflicts
  FROM conflicts AS conflict;

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'conflict_count', v_conflict_count,
    'conflicts', v_conflicts
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_practitioner_weekly_schedule(
  p_practitioner_id UUID,
  p_schedule JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_old_values JSONB;
  v_new_values JSONB;
  v_preview JSONB;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR NOT (SELECT public.is_admin()) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF p_practitioner_id IS NULL
    OR NOT private.is_valid_weekly_schedule_payload(p_schedule) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_SCHEDULE');
  END IF;

  PERFORM 1
  FROM public.practitioners AS practitioner
  WHERE practitioner.id = p_practitioner_id
    AND practitioner.store_id = v_store_id
    AND practitioner.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'PRACTITIONER_NOT_FOUND');
  END IF;

  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'weekday', schedule.weekday,
        'is_working', schedule.is_working,
        'start_time', schedule.start_time,
        'end_time', schedule.end_time
      ) ORDER BY schedule.weekday
    ),
    '[]'::JSONB
  )
  INTO v_old_values
  FROM public.practitioner_weekly_schedules AS schedule
  WHERE schedule.practitioner_id = p_practitioner_id
    AND schedule.store_id = v_store_id;

  v_preview := public.preview_practitioner_schedule_conflicts(
    p_practitioner_id,
    p_schedule
  );

  INSERT INTO public.practitioner_weekly_schedules (
    store_id,
    practitioner_id,
    weekday,
    is_working,
    start_time,
    end_time,
    updated_by
  )
  SELECT
    v_store_id,
    p_practitioner_id,
    item.weekday,
    item.is_working,
    CASE WHEN item.is_working THEN item.start_time ELSE NULL END,
    CASE WHEN item.is_working THEN item.end_time ELSE NULL END,
    (SELECT auth.uid())
  FROM JSONB_TO_RECORDSET(p_schedule) AS item(
    weekday SMALLINT,
    is_working BOOLEAN,
    start_time TIME,
    end_time TIME
  )
  ON CONFLICT (practitioner_id, weekday)
  DO UPDATE SET
    is_working = EXCLUDED.is_working,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW();

  SELECT JSONB_AGG(
    JSONB_BUILD_OBJECT(
      'weekday', schedule.weekday,
      'is_working', schedule.is_working,
      'start_time', schedule.start_time,
      'end_time', schedule.end_time
    ) ORDER BY schedule.weekday
  )
  INTO v_new_values
  FROM public.practitioner_weekly_schedules AS schedule
  WHERE schedule.practitioner_id = p_practitioner_id
    AND schedule.store_id = v_store_id;

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
    'practitioner_weekly_schedule_saved',
    'practitioner_weekly_schedules',
    p_practitioner_id,
    JSONB_BUILD_OBJECT('schedule', v_old_values),
    JSONB_BUILD_OBJECT('schedule', v_new_values),
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'schedule', v_new_values,
    'conflict_count', COALESCE((v_preview ->> 'conflict_count')::INTEGER, 0),
    'conflicts', COALESCE(v_preview -> 'conflicts', '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_practitioner_schedule_conflicts(UUID, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_practitioner_schedule_conflicts(UUID, JSONB)
  TO authenticated;

REVOKE ALL ON FUNCTION public.save_practitioner_weekly_schedule(UUID, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_practitioner_weekly_schedule(UUID, JSONB)
  TO authenticated;

COMMENT ON TABLE public.practitioner_weekly_schedules IS
  '老師固定每週班表；完全沒有資料代表沿用店家營業時間，已有資料時固定保存七天';
COMMENT ON FUNCTION public.preview_practitioner_schedule_conflicts(UUID, JSONB) IS
  '管理員儲存班表前，預覽會落在新班表外但不會自動取消的未來預約';
COMMENT ON FUNCTION public.save_practitioner_weekly_schedule(UUID, JSONB) IS
  '同店管理員以完整七天內容儲存老師班表，並記錄稽核與回傳衝突預約';

COMMIT;
