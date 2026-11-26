-- ============================================================
-- 老師休假衝突預覽
--
-- 管理員在建立休假前先取得受影響預約，前端確認後才呼叫
-- save_practitioner_leave，避免既有預約被無提示地標記為衝突。
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.preview_practitioner_leave_conflicts(
  p_practitioner_id UUID,
  p_start_date DATE,
  p_end_date DATE
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
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
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
    OR p_end_date IS NULL
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

  v_start_time := p_start_date::TIMESTAMP AT TIME ZONE v_timezone;
  v_end_time := (p_end_date + 1)::TIMESTAMP AT TIME ZONE v_timezone;

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
    AND booking.start_time < v_end_time
    AND booking.end_time > v_start_time;

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'conflict_count', v_conflict_count,
    'conflicts', v_conflicts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_practitioner_leave_conflicts(
  UUID, DATE, DATE
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_practitioner_leave_conflicts(
  UUID, DATE, DATE
) TO authenticated;

COMMENT ON FUNCTION public.preview_practitioner_leave_conflicts(UUID, DATE, DATE) IS
  '同店管理員在建立老師休假前預覽受影響且未取消的預約';

COMMIT;
