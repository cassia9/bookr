-- ============================================================
-- LINE 預約卡片加入商品券使用摘要
-- Worker 領取工作時才讀取最新兌換狀態，避免 outbox 建立順序影響資料。
-- ============================================================

DROP FUNCTION IF EXISTS public.claim_line_notification_jobs(INTEGER);

CREATE FUNCTION public.claim_line_notification_jobs(
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  job_id UUID,
  store_id UUID,
  booking_id UUID,
  event_type public.notification_type,
  idempotency_key TEXT,
  attempt_count INTEGER,
  channel_access_token TEXT,
  provider_user_id TEXT,
  friend_status TEXT,
  template_content TEXT,
  customer_name TEXT,
  service_name TEXT,
  practitioner_name TEXT,
  start_time TIMESTAMPTZ,
  booking_status public.booking_status,
  store_name TEXT,
  store_timezone TEXT,
  voucher_product_name TEXT,
  voucher_service_remaining INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH picked AS (
    SELECT candidate.id
    FROM public.line_notification_outbox AS candidate
    WHERE (
        candidate.status IN ('pending', 'retry')
        AND candidate.available_at <= NOW()
      )
      OR (
        candidate.status = 'processing'
        AND candidate.locked_at < NOW() - INTERVAL '10 minutes'
      )
    ORDER BY candidate.available_at, candidate.created_at
    LIMIT LEAST(GREATEST(p_limit, 1), 100)
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.line_notification_outbox AS job
    SET
      status = 'processing',
      locked_at = NOW(),
      attempt_count = job.attempt_count + 1,
      error_code = NULL,
      http_status = NULL,
      updated_at = NOW()
    FROM picked
    WHERE job.id = picked.id
    RETURNING job.*
  )
  SELECT
    claimed.id,
    claimed.store_id,
    claimed.booking_id,
    claimed.event_type,
    claimed.idempotency_key,
    claimed.attempt_count,
    access_secret.decrypted_secret,
    identity.provider_user_id,
    identity.friend_status,
    CASE
      WHEN claimed.event_type = 'test'::public.notification_type
        THEN claimed.payload_snapshot ->> 'message'
      ELSE template.content
    END,
    client.full_name,
    service.name,
    practitioner.full_name,
    booking.start_time,
    booking.status,
    store.name,
    store.timezone,
    voucher_usage.product_name,
    voucher_usage.available_quantity
  FROM claimed
  LEFT JOIN private.store_line_messaging_credentials AS credential
    ON credential.store_id = claimed.store_id
    AND credential.connection_id = claimed.connection_id
   AND credential.status = 'active'
   AND credential.disconnected_at IS NULL
  LEFT JOIN vault.decrypted_secrets AS access_secret
    ON access_secret.id = credential.access_token_secret_id
  LEFT JOIN public.customer_channel_identities AS identity
    ON identity.id = claimed.identity_id
    AND identity.store_id = claimed.store_id
   AND identity.deleted_at IS NULL
  LEFT JOIN public.clients AS client
    ON client.id = claimed.client_id
    AND client.store_id = claimed.store_id
   AND client.deleted_at IS NULL
  LEFT JOIN public.bookings AS booking
    ON booking.id = claimed.booking_id
    AND booking.store_id = claimed.store_id
   AND booking.deleted_at IS NULL
  LEFT JOIN public.services AS service
    ON service.id = booking.service_id
   AND service.store_id = claimed.store_id
  LEFT JOIN public.practitioners AS practitioner
    ON practitioner.id = booking.practitioner_id
   AND practitioner.store_id = claimed.store_id
  LEFT JOIN LATERAL (
    SELECT
      voucher.product_name_snapshot AS product_name,
      voucher_item.total_quantity + voucher_item.adjustment_quantity
        - voucher_item.reserved_quantity - voucher_item.used_quantity
        AS available_quantity
    FROM public.voucher_redemptions AS redemption
    JOIN public.client_voucher_items AS voucher_item
      ON voucher_item.id = redemption.client_voucher_item_id
     AND voucher_item.store_id = redemption.store_id
    JOIN public.client_vouchers AS voucher
      ON voucher.id = voucher_item.client_voucher_id
     AND voucher.store_id = voucher_item.store_id
    WHERE redemption.booking_id = claimed.booking_id
      AND redemption.status IN ('reserved', 'redeemed')
    ORDER BY redemption.created_at DESC
    LIMIT 1
  ) AS voucher_usage ON TRUE
  JOIN public.stores AS store
    ON store.id = claimed.store_id
  LEFT JOIN public.notification_templates AS template
    ON template.store_id = claimed.store_id
    AND template.type = claimed.event_type;
$$;

REVOKE ALL ON FUNCTION public.claim_line_notification_jobs(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_line_notification_jobs(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.claim_line_notification_jobs(INTEGER) IS
  'service_role 專用：原子領取通知，並回傳目前的商品券使用與該課程餘額。';
