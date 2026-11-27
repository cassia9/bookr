-- ============================================================
-- 指定時段店休的預約衝突預覽
--
-- 由資料庫依店家時區換算精確區間，避免管理員裝置時區影響結果。
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.preview_store_closure_window_conflicts(
  p_start_date DATE,
  p_start_time TIME,
  p_end_date DATE,
  p_end_time TIME,
  p_all_day BOOLEAN
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

  IF p_start_date IS NULL
    OR p_end_date IS NULL
    OR p_all_day IS NULL
    OR (NOT p_all_day AND (p_start_time IS NULL OR p_end_time IS NULL))
    OR p_end_date < p_start_date
    OR p_end_date > p_start_date + 366 THEN
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

  SELECT
    COUNT(*)::INTEGER,
    COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', booking.id,
          'start_time', booking.start_time,
          'client_name', client.full_name,
          'practitioner_name', practitioner.full_name,
          'service_name', service.name
        ) ORDER BY booking.start_time, booking.id
      ),
      '[]'::JSONB
    )
  INTO v_conflict_count, v_conflicts
  FROM public.bookings AS booking
  JOIN public.clients AS client ON client.id = booking.client_id
  JOIN public.practitioners AS practitioner ON practitioner.id = booking.practitioner_id
  JOIN public.services AS service ON service.id = booking.service_id
  WHERE booking.store_id = v_store_id
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

REVOKE ALL ON FUNCTION public.preview_store_closure_window_conflicts(
  DATE, TIME, DATE, TIME, BOOLEAN
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_store_closure_window_conflicts(
  DATE, TIME, DATE, TIME, BOOLEAN
) TO authenticated;

COMMENT ON FUNCTION public.preview_store_closure_window_conflicts(
  DATE, TIME, DATE, TIME, BOOLEAN
) IS '同店管理員依店家時區預覽指定店休區間內受影響的預約';

COMMIT;
