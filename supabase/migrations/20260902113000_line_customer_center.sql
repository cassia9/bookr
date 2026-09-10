-- ============================================================
-- LINE 客戶中心安全查詢
-- 已由 Edge Function 驗證的 LINE 身分，才能以 provider account + user
-- 對應到同店家的既有客戶；瀏覽器不直接取得資料表權限。
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_line_customer_center(
  p_store_id UUID,
  p_provider_account_id TEXT,
  p_provider_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store RECORD;
  v_client RECORD;
  v_bookings JSONB;
  v_vouchers JSONB;
BEGIN
  IF p_store_id IS NULL
    OR p_provider_account_id IS NULL
    OR p_provider_user_id IS NULL
    OR BTRIM(p_provider_account_id) !~ '^[0-9]{5,32}$'
    OR BTRIM(p_provider_user_id) !~ '^U[0-9a-fA-F]{32}$'
  THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_INPUT');
  END IF;

  SELECT
    store.id,
    store.name,
    store.logo_url,
    store.address,
    store.phone,
    store.timezone,
    identity.client_id,
    client.full_name
  INTO v_store
  FROM public.stores AS store
  JOIN public.customer_channel_identities AS identity
    ON identity.store_id = store.id
   AND identity.channel = 'line'
   AND identity.provider_account_id = BTRIM(p_provider_account_id)
   AND identity.provider_user_id = BTRIM(p_provider_user_id)
   AND identity.deleted_at IS NULL
  JOIN public.clients AS client
    ON client.id = identity.client_id
   AND client.store_id = identity.store_id
   AND client.deleted_at IS NULL
  WHERE store.id = p_store_id
    AND store.line_login_channel_id = BTRIM(p_provider_account_id)
    AND store.booking_enabled
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'IDENTITY_NOT_FOUND');
  END IF;

  SELECT COALESCE(JSONB_AGG(entry.payload ORDER BY entry.start_time DESC), '[]'::JSONB)
  INTO v_bookings
  FROM (
    SELECT
      booking.start_time,
      JSONB_BUILD_OBJECT(
        'id', booking.id,
        'startTime', booking.start_time,
        'endTime', booking.end_time,
        'status', booking.status,
        'price', booking.price,
        'service', JSONB_BUILD_OBJECT(
          'id', service.id,
          'name', service.name,
          'durationMinutes', service.duration_minutes
        ),
        'practitioner', JSONB_BUILD_OBJECT(
          'id', practitioner.id,
          'name', practitioner.full_name
        ),
        'voucher', redemption.payload
      ) AS payload
    FROM public.bookings AS booking
    JOIN public.services AS service
      ON service.id = booking.service_id
     AND service.store_id = booking.store_id
    JOIN public.practitioners AS practitioner
      ON practitioner.id = booking.practitioner_id
     AND practitioner.store_id = booking.store_id
    LEFT JOIN LATERAL (
      SELECT JSONB_BUILD_OBJECT(
        'status', voucher_redemption.status,
        'productName', voucher.product_name_snapshot,
        'serviceName', voucher_item.service_name_snapshot
      ) AS payload
      FROM public.voucher_redemptions AS voucher_redemption
      JOIN public.client_voucher_items AS voucher_item
        ON voucher_item.id = voucher_redemption.client_voucher_item_id
       AND voucher_item.store_id = voucher_redemption.store_id
      JOIN public.client_vouchers AS voucher
        ON voucher.id = voucher_item.client_voucher_id
       AND voucher.store_id = voucher_item.store_id
      WHERE voucher_redemption.booking_id = booking.id
        AND voucher_redemption.status IN ('reserved', 'redeemed')
      ORDER BY voucher_redemption.created_at DESC
      LIMIT 1
    ) AS redemption ON TRUE
    WHERE booking.store_id = p_store_id
      AND booking.client_id = v_store.client_id
      AND booking.deleted_at IS NULL
    ORDER BY booking.start_time DESC
    LIMIT 200
  ) AS entry;

  SELECT COALESCE(JSONB_AGG(entry.payload ORDER BY entry.purchased_on DESC), '[]'::JSONB)
  INTO v_vouchers
  FROM (
    SELECT
      voucher.purchased_on,
      JSONB_BUILD_OBJECT(
        'id', voucher.id,
        'saleNumber', voucher.sale_number,
        'productName', voucher.product_name_snapshot,
        'description', voucher.product_description_snapshot,
        'purchasedOn', voucher.purchased_on,
        'expiresOn', voucher.expires_on,
        'status', voucher.status,
        'items', COALESCE((
          SELECT JSONB_AGG(
            JSONB_BUILD_OBJECT(
              'id', item.id,
              'serviceId', item.service_id,
              'serviceName', item.service_name_snapshot,
              'totalQuantity', item.total_quantity + item.adjustment_quantity,
              'availableQuantity', item.total_quantity + item.adjustment_quantity
                - item.reserved_quantity - item.used_quantity,
              'reservedQuantity', item.reserved_quantity,
              'usedQuantity', item.used_quantity
            )
            ORDER BY item.created_at, item.id
          )
          FROM public.client_voucher_items AS item
          WHERE item.client_voucher_id = voucher.id
            AND item.store_id = voucher.store_id
        ), '[]'::JSONB)
      ) AS payload
    FROM public.client_vouchers AS voucher
    WHERE voucher.store_id = p_store_id
      AND voucher.client_id = v_store.client_id
    ORDER BY voucher.purchased_on DESC, voucher.created_at DESC
    LIMIT 100
  ) AS entry;

  SELECT client.id, client.full_name
  INTO v_client
  FROM public.clients AS client
  WHERE client.id = v_store.client_id;

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'store', JSONB_BUILD_OBJECT(
      'id', v_store.id,
      'name', v_store.name,
      'logoUrl', v_store.logo_url,
      'address', v_store.address,
      'phone', v_store.phone,
      'timezone', v_store.timezone
    ),
    'client', JSONB_BUILD_OBJECT(
      'id', v_client.id,
      'name', v_client.full_name
    ),
    'bookings', v_bookings,
    'vouchers', v_vouchers
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_line_customer_center(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_line_customer_center(UUID, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.get_line_customer_center(UUID, TEXT, TEXT)
  IS '僅供 Edge Function 在驗證 LINE ID token 後讀取該客戶自己的預約與商品券';
