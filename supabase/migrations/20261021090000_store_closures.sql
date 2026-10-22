-- ============================================================
-- 店家臨時店休
--
-- 1. 單日／多日全天店休與店家隔離
-- 2. 公開查詢只回傳安全文字，不暴露內部備註
-- 3. 可用時段排除店休
-- 4. 所有預約寫入前再次阻擋；僅同店管理員可覆寫並留下稽核
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.store_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  public_label TEXT NOT NULL DEFAULT '店休',
  internal_note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT store_closures_date_range_check CHECK (end_date >= start_date),
  CONSTRAINT store_closures_category_check CHECK (
    category IN ('public_holiday', 'staff_trip', 'maintenance', 'emergency', 'other')
  ),
  CONSTRAINT store_closures_public_label_check CHECK (
    CHAR_LENGTH(BTRIM(public_label)) BETWEEN 1 AND 100
  ),
  CONSTRAINT store_closures_internal_note_check CHECK (
    internal_note IS NULL OR CHAR_LENGTH(internal_note) <= 1000
  )
);

CREATE INDEX IF NOT EXISTS idx_store_closures_store_dates_active
  ON public.store_closures (store_id, start_date, end_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_store_closures_created_by
  ON public.store_closures (created_by)
  WHERE created_by IS NOT NULL;

ALTER TABLE public.store_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_store_store_closures
  ON public.store_closures;

CREATE POLICY select_store_store_closures
  ON public.store_closures
  FOR SELECT
  TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

REVOKE ALL ON TABLE public.store_closures
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.store_closures TO authenticated;

CREATE OR REPLACE FUNCTION private.set_store_closure_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_store_closures_updated_at
  ON public.store_closures;
CREATE TRIGGER set_store_closures_updated_at
  BEFORE UPDATE ON public.store_closures
  FOR EACH ROW
  EXECUTE FUNCTION private.set_store_closure_updated_at();

CREATE OR REPLACE FUNCTION public.save_store_closure(
  p_closure_id UUID,
  p_start_date DATE,
  p_end_date DATE,
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
    OR p_end_date < p_start_date
    OR p_category IS NULL
    OR p_category NOT IN (
      'public_holiday', 'staff_trip', 'maintenance', 'emergency', 'other'
    )
    OR v_public_label IS NULL
    OR CHAR_LENGTH(v_public_label) > 100
    OR CHAR_LENGTH(COALESCE(v_internal_note, '')) > 1000 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_INPUT');
  END IF;

  -- 所有同店店休以固定順序鎖定，避免兩個並行請求建立重疊日期。
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
      AND closure.start_date <= p_end_date
      AND closure.end_date >= p_start_date
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'OVERLAPPING_CLOSURE');
  END IF;

  IF p_closure_id IS NULL THEN
    INSERT INTO public.store_closures (
      store_id,
      start_date,
      end_date,
      category,
      public_label,
      internal_note,
      created_by
    ) VALUES (
      v_store_id,
      p_start_date,
      p_end_date,
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
  JOIN public.stores AS store
    ON store.id = booking.store_id
  WHERE booking.store_id = v_store_id
    AND booking.deleted_at IS NULL
    AND booking.status <> 'cancelled'::public.booking_status
    AND booking.start_time < (
      (p_end_date + 1)::TIMESTAMP AT TIME ZONE store.timezone
    )
    AND booking.end_time > (
      p_start_date::TIMESTAMP AT TIME ZONE store.timezone
    );

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

CREATE OR REPLACE FUNCTION public.archive_store_closure(
  p_closure_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_closure public.store_closures%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR NOT (SELECT public.is_admin()) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  UPDATE public.store_closures AS closure
  SET deleted_at = NOW()
  WHERE closure.id = p_closure_id
    AND closure.store_id = v_store_id
    AND closure.deleted_at IS NULL
  RETURNING closure.* INTO v_closure;

  IF NOT FOUND THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'CLOSURE_NOT_FOUND');
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, old_values, new_values, store_id
  ) VALUES (
    (SELECT auth.uid()),
    'store_closure_archived',
    'store_closures',
    v_closure.id,
    TO_JSONB(v_closure) - 'deleted_at' - 'updated_at',
    JSONB_BUILD_OBJECT('deleted_at', v_closure.deleted_at),
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT('ok', TRUE, 'id', v_closure.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_store_closures(
  p_store_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  id UUID,
  start_date DATE,
  end_date DATE,
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
    AND closure.start_date <= p_end_date
    AND closure.end_date >= p_start_date
  ORDER BY closure.start_date, closure.end_date, closure.id;
$$;

-- 所有預約入口共用的最後防線。公開與一般成員不可繞過；
-- 管理員可建立特殊預約，但每次覆寫都會留下稽核紀錄。
CREATE OR REPLACE FUNCTION private.enforce_store_closure_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_timezone TEXT;
  v_closure public.store_closures%ROWTYPE;
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
    OR public.current_store_id() IS DISTINCT FROM NEW.store_id THEN
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
      'public_label', v_closure.public_label
    ),
    NEW.store_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_store_closure_on_booking
  ON public.bookings;
CREATE TRIGGER enforce_store_closure_on_booking
  BEFORE INSERT OR UPDATE OF store_id, start_time, end_time
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_store_closure_on_booking();

-- 可用時段在產生昂貴的時段序列前，先用索引判斷整日店休。
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
  v_duration INT;
  v_buffer INT;
  v_tz CONSTANT TEXT := 'Asia/Taipei';
  v_min_ts TIMESTAMPTZ := NOW() + INTERVAL '2 hours';
  v_max_date DATE := (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 62;
BEGIN
  IF p_date IS NULL
    OR p_service_id IS NULL
    OR p_store_id IS NULL
    OR p_date < (NOW() AT TIME ZONE v_tz)::DATE
    OR p_date > v_max_date THEN
    RETURN;
  END IF;

  SELECT
    s.open_time,
    s.close_time,
    COALESCE(s.default_buffer_minutes, 0)
  INTO v_open_time, v_close_time, v_buffer
  FROM public.stores AS s
  WHERE s.id = p_store_id
    AND s.booking_enabled = TRUE;

  IF NOT FOUND THEN
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

  SELECT s.duration_minutes
  INTO v_duration
  FROM public.services AS s
  WHERE s.id = p_service_id
    AND s.store_id = p_store_id
    AND s.active = TRUE
    AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_practitioner_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.practitioners AS p
      WHERE p.id = p_practitioner_id
        AND p.store_id = p_store_id
        AND p.active = TRUE
        AND p.deleted_at IS NULL
    ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH raw_slots AS (
    SELECT
      gs AS slot_ts,
      TO_CHAR(gs AT TIME ZONE v_tz, 'HH24:MI') AS slot_str
    FROM GENERATE_SERIES(
      (p_date::TEXT || ' ' || v_open_time::TEXT)::TIMESTAMP AT TIME ZONE v_tz,
      (p_date::TEXT || ' ' || v_close_time::TEXT)::TIMESTAMP AT TIME ZONE v_tz
        - (v_duration || ' minutes')::INTERVAL,
      INTERVAL '15 minutes'
    ) AS gs
    WHERE gs > v_min_ts
  ),
  active_practitioners AS (
    SELECT p.id, p.full_name, p.color
    FROM public.practitioners AS p
    WHERE p.store_id = p_store_id
      AND p.active = TRUE
      AND p.deleted_at IS NULL
      AND (p_practitioner_id IS NULL OR p.id = p_practitioner_id)
  ),
  candidates AS (
    SELECT
      r.slot_ts,
      r.slot_str,
      p.id AS practitioner_id,
      p.full_name,
      p.color
    FROM raw_slots AS r
    CROSS JOIN active_practitioners AS p
  ),
  unblocked AS (
    SELECT c.*
    FROM candidates AS c
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.practitioner_blocks AS pb
      WHERE pb.store_id = p_store_id
        AND pb.practitioner_id = c.practitioner_id
        AND pb.start_time < c.slot_ts + (v_duration || ' minutes')::INTERVAL
        AND pb.end_time > c.slot_ts
    )
  ),
  available AS (
    SELECT u.*
    FROM unblocked AS u
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.bookings AS b
      WHERE b.store_id = p_store_id
        AND b.practitioner_id = u.practitioner_id
        AND b.deleted_at IS NULL
        AND b.status <> 'cancelled'::public.booking_status
        AND b.start_time < u.slot_ts
          + ((v_duration + v_buffer) || ' minutes')::INTERVAL
        AND b.end_time
          + (COALESCE(b.buffer_minutes, 0) || ' minutes')::INTERVAL
          > u.slot_ts
    )
  ),
  today_counts AS (
    SELECT b.practitioner_id, COUNT(*) AS booking_count
    FROM public.bookings AS b
    WHERE b.store_id = p_store_id
      AND b.deleted_at IS NULL
      AND b.status <> 'cancelled'::public.booking_status
      AND (b.start_time AT TIME ZONE v_tz)::DATE = p_date
    GROUP BY b.practitioner_id
  ),
  week_counts AS (
    SELECT b.practitioner_id, COUNT(*) AS booking_count
    FROM public.bookings AS b
    WHERE b.store_id = p_store_id
      AND b.deleted_at IS NULL
      AND b.status <> 'cancelled'::public.booking_status
      AND b.start_time >= DATE_TRUNC(
        'week',
        (p_date::TEXT || ' 00:00')::TIMESTAMP AT TIME ZONE v_tz
      )
      AND b.start_time < DATE_TRUNC(
        'week',
        (p_date::TEXT || ' 00:00')::TIMESTAMP AT TIME ZONE v_tz
      ) + INTERVAL '7 days'
    GROUP BY b.practitioner_id
  ),
  best AS (
    SELECT DISTINCT ON (a.slot_ts)
      a.slot_ts,
      a.slot_str,
      a.practitioner_id,
      a.full_name,
      a.color
    FROM available AS a
    LEFT JOIN today_counts AS tc
      ON tc.practitioner_id = a.practitioner_id
    LEFT JOIN week_counts AS wc
      ON wc.practitioner_id = a.practitioner_id
    ORDER BY
      a.slot_ts,
      COALESCE(tc.booking_count, 0),
      COALESCE(wc.booking_count, 0),
      a.practitioner_id
  )
  SELECT
    b.slot_str,
    b.practitioner_id,
    b.full_name,
    b.color
  FROM best AS b
  ORDER BY b.slot_ts;
END;
$$;

REVOKE ALL ON FUNCTION private.set_store_closure_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.enforce_store_closure_on_booking()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.save_store_closure(
  UUID, DATE, DATE, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_store_closure(
  UUID, DATE, DATE, TEXT, TEXT, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.archive_store_closure(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_store_closure(UUID)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_public_store_closures(UUID, DATE, DATE)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_store_closures(UUID, DATE, DATE)
  TO anon, authenticated;

COMMENT ON TABLE public.store_closures IS
  '店家單日或連續多日的全天臨時店休；內部備註不透過公開 RPC 暴露';
COMMENT ON FUNCTION public.save_store_closure(UUID, DATE, DATE, TEXT, TEXT, TEXT) IS
  '管理員建立或更新同店家臨時店休，並回傳期間內既有預約數量';
COMMENT ON FUNCTION public.archive_store_closure(UUID) IS
  '管理員軟刪除同店家臨時店休，使符合其他規則的時段重新開放';
COMMENT ON FUNCTION public.get_public_store_closures(UUID, DATE, DATE) IS
  '公開查詢指定期間店休日，只回傳日期與安全的對外文字';

COMMIT;
