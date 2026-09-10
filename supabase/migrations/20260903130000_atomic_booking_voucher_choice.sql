BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_booking_with_voucher(
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
  p_client_voucher_item_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_booking_result JSONB;
  v_voucher_result JSONB;
  v_booking_id UUID;
BEGIN
  IF p_voucher_mode NOT IN ('auto', 'specific', 'none')
    OR (p_voucher_mode = 'specific' AND p_client_voucher_item_id IS NULL)
    OR (p_voucher_mode <> 'specific' AND p_client_voucher_item_id IS NOT NULL) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_VOUCHER_SELECTION');
  END IF;

  v_booking_result := public.upsert_booking(
    p_booking_id,
    p_client_id,
    p_practitioner_id,
    p_service_id,
    p_start_time,
    p_end_time,
    p_buffer_minutes,
    p_notes,
    p_store_id,
    p_price
  )::JSONB;

  IF NOT COALESCE((v_booking_result ->> 'ok')::BOOLEAN, FALSE) THEN
    RETURN v_booking_result;
  END IF;

  v_booking_id := (v_booking_result ->> 'id')::UUID;

  IF p_voucher_mode = 'none' THEN
    v_voucher_result := public.set_booking_voucher(v_booking_id, FALSE, NULL);
  ELSIF p_voucher_mode = 'specific' THEN
    v_voucher_result := public.set_booking_voucher(
      v_booking_id,
      TRUE,
      p_client_voucher_item_id
    );
  ELSE
    BEGIN
      v_voucher_result := public.set_booking_voucher(v_booking_id, TRUE, NULL);
    EXCEPTION
      WHEN SQLSTATE 'P0001' THEN
        -- 自動模式沒有適用餘額時，預約仍應成立且不使用商品券。
        v_voucher_result := public.set_booking_voucher(v_booking_id, FALSE, NULL);
    END;
  END IF;

  IF NOT COALESCE((v_voucher_result ->> 'ok')::BOOLEAN, FALSE) THEN
    RAISE EXCEPTION '%', COALESCE(v_voucher_result ->> 'error', 'VOUCHER_SELECTION_FAILED')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_booking_result || JSONB_BUILD_OBJECT(
    'voucher_mode', p_voucher_mode,
    'voucher_redemption_id', v_voucher_result ->> 'redemption_id'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_booking_with_voucher(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, TEXT, UUID, INTEGER, TEXT, UUID
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.upsert_booking_with_voucher(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, TEXT, UUID, INTEGER, TEXT, UUID
) TO authenticated;

COMMENT ON FUNCTION public.upsert_booking_with_voucher(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, TEXT, UUID, INTEGER, TEXT, UUID
) IS '原子建立或更新後台預約，並套用自動、指定或停用商品券選擇';

COMMIT;
