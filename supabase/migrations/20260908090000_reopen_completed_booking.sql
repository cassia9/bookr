-- 允許操作人員修正誤標為已完課的預約，並原子回復商品券堂數。

ALTER TABLE public.voucher_ledger
  DROP CONSTRAINT IF EXISTS voucher_ledger_action_check;

ALTER TABLE public.voucher_ledger
  ADD CONSTRAINT voucher_ledger_action_check CHECK (
    action IN (
      'issued',
      'reserved',
      'released',
      'redeemed',
      'restored',
      'adjusted',
      'voided'
    )
  );

CREATE OR REPLACE FUNCTION private.restore_redeemed_booking_voucher(
  p_booking_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_redemption public.voucher_redemptions%ROWTYPE;
  v_item public.client_voucher_items%ROWTYPE;
  v_available INTEGER;
BEGIN
  SELECT redemption.*
  INTO v_redemption
  FROM public.voucher_redemptions AS redemption
  WHERE redemption.booking_id = p_booking_id
    AND redemption.status = 'redeemed'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.client_voucher_items AS item
  SET
    reserved_quantity = item.reserved_quantity + 1,
    used_quantity = item.used_quantity - 1
  WHERE item.id = v_redemption.client_voucher_item_id
    AND item.used_quantity > 0
  RETURNING item.* INTO v_item;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VOUCHER_REDEEMED_BALANCE_INCONSISTENT';
  END IF;

  UPDATE public.voucher_redemptions
  SET
    status = 'reserved',
    reserved_at = NOW(),
    redeemed_at = NULL,
    released_at = NULL
  WHERE id = v_redemption.id;

  v_available := v_item.total_quantity + v_item.adjustment_quantity
    - v_item.reserved_quantity - v_item.used_quantity;

  INSERT INTO public.voucher_ledger (
    store_id,
    client_voucher_item_id,
    redemption_id,
    booking_id,
    action,
    quantity,
    available_after,
    reserved_after,
    used_after,
    reason,
    actor_user_id
  ) VALUES (
    v_redemption.store_id,
    v_item.id,
    v_redemption.id,
    p_booking_id,
    'restored',
    1,
    v_available,
    v_item.reserved_quantity,
    v_item.used_quantity,
    '撤銷誤標完課，堂數恢復為預約保留',
    (SELECT auth.uid())
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_completed_booking(
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_booking public.bookings%ROWTYPE;
  v_voucher_restored BOOLEAN;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR NOT (SELECT public.is_admin()) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
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

  IF v_booking.status <> 'completed'::public.booking_status THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'BOOKING_NOT_COMPLETED');
  END IF;

  v_voucher_restored := private.restore_redeemed_booking_voucher(p_booking_id);

  UPDATE public.bookings
  SET status = 'confirmed'::public.booking_status
  WHERE id = p_booking_id;

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
    'booking_completion_reopened',
    'bookings',
    p_booking_id,
    JSONB_BUILD_OBJECT('status', v_booking.status),
    JSONB_BUILD_OBJECT(
      'status', 'confirmed',
      'voucher_restored', v_voucher_restored
    ),
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'booking_id', p_booking_id,
    'status', 'confirmed',
    'voucher_restored', v_voucher_restored
  );
END;
$$;

REVOKE ALL ON FUNCTION private.restore_redeemed_booking_voucher(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reopen_completed_booking(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_completed_booking(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.reopen_completed_booking(UUID) IS
  '將同店家的已完課預約恢復為已確認；若商品券已扣堂則原子恢復為保留狀態。';
