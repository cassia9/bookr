BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(13);

INSERT INTO public.stores (
  id, name, booking_enabled, booking_confirmation_mode, timezone,
  line_login_channel_id
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '預約商品券選擇測試店家',
  TRUE,
  'auto',
  'Asia/Taipei',
  '3999999001'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'booking-voucher-admin@example.test',
  '{"full_name":"預約商品券測試管理員"}'::JSONB
);

UPDATE public.users
SET
  store_id = 'a0000000-0000-0000-0000-000000000001',
  role = 'admin'::public.user_role
WHERE id = 'a1000000-0000-0000-0000-000000000001';

INSERT INTO public.clients (id, full_name, phone, store_id)
VALUES (
  'a2000000-0000-0000-0000-000000000001',
  '指定商品券客戶',
  '0918000001',
  'a0000000-0000-0000-0000-000000000001'
);

INSERT INTO public.services (
  id, name, duration_minutes, price, active, store_id
) VALUES
  (
    'a3000000-0000-0000-0000-000000000001',
    '可使用商品券課程', 60, 1500, TRUE,
    'a0000000-0000-0000-0000-000000000001'
  ),
  (
    'a3000000-0000-0000-0000-000000000002',
    '無商品券課程', 60, 1200, TRUE,
    'a0000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.practitioners (
  id, full_name, color, active, store_id
) VALUES (
  'a4000000-0000-0000-0000-000000000001',
  '預約商品券測試老師', '#84CC16', TRUE,
  'a0000000-0000-0000-0000-000000000001'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.upsert_booking_with_voucher(uuid,uuid,uuid,uuid,timestamptz,timestamptz,integer,text,uuid,integer,text,uuid)',
    'EXECUTE'
  ),
  '匿名角色不能使用後台商品券預約 RPC'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.upsert_booking_with_voucher(
    NULL,
    'a2000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000001',
    DATE_TRUNC('day', NOW()) + INTERVAL '4 days 9 hours',
    DATE_TRUNC('day', NOW()) + INTERVAL '4 days 10 hours',
    0,
    '無效選擇不應建立',
    'a0000000-0000-0000-0000-000000000001',
    NULL,
    'invalid',
    NULL
  ) ->> 'error',
  'INVALID_VOUCHER_SELECTION',
  '拒絕不支援的商品券選擇模式'
);

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.bookings WHERE notes = '無效選擇不應建立'),
  0::BIGINT,
  '無效選擇不會留下預約'
);

SELECT extensions.ok(
  (
    public.save_voucher_product(
      NULL,
      '短效自動優先券',
      NULL,
      2400,
      30,
      TRUE,
      '[{"service_id":"a3000000-0000-0000-0000-000000000001","quantity":2}]'::JSONB
    ) ->> 'ok'
  )::BOOLEAN,
  '建立短效商品券方案'
);

SELECT extensions.ok(
  (
    public.save_voucher_product(
      NULL,
      '指定較晚到期券',
      NULL,
      4200,
      365,
      TRUE,
      '[{"service_id":"a3000000-0000-0000-0000-000000000001","quantity":4}]'::JSONB
    ) ->> 'ok'
  )::BOOLEAN,
  '建立可供人工指定的商品券方案'
);

DO $test_fixture$
BEGIN
  PERFORM public.sell_voucher_product(
    (SELECT id FROM public.voucher_products WHERE name = '短效自動優先券'),
    'a2000000-0000-0000-0000-000000000001',
    CURRENT_DATE,
    NULL,
    'cash',
    NULL
  );

  PERFORM public.sell_voucher_product(
    (SELECT id FROM public.voucher_products WHERE name = '指定較晚到期券'),
    'a2000000-0000-0000-0000-000000000001',
    CURRENT_DATE,
    NULL,
    'cash',
    NULL
  );
END;
$test_fixture$;

SELECT extensions.is(
  public.upsert_booking_with_voucher(
    NULL,
    'a2000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000001',
    DATE_TRUNC('day', NOW()) + INTERVAL '5 days 9 hours',
    DATE_TRUNC('day', NOW()) + INTERVAL '5 days 10 hours',
    0,
    '此次不使用商品券',
    'a0000000-0000-0000-0000-000000000001',
    NULL,
    'none',
    NULL
  ) ->> 'voucher_mode',
  'none',
  '後台可明確建立不使用商品券的預約'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.voucher_redemptions AS redemption
    JOIN public.bookings AS booking ON booking.id = redemption.booking_id
    WHERE booking.notes = '此次不使用商品券'
      AND redemption.status = 'reserved'
  ),
  0::BIGINT,
  '不使用模式會釋放觸發器自動建立的保留'
);

SELECT extensions.is(
  public.upsert_booking_with_voucher(
    NULL,
    'a2000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000001',
    DATE_TRUNC('day', NOW()) + INTERVAL '6 days 9 hours',
    DATE_TRUNC('day', NOW()) + INTERVAL '6 days 10 hours',
    0,
    '人工指定較晚到期券',
    'a0000000-0000-0000-0000-000000000001',
    NULL,
    'specific',
    (
      SELECT item.id
      FROM public.client_voucher_items AS item
      JOIN public.client_vouchers AS voucher ON voucher.id = item.client_voucher_id
      WHERE voucher.product_name_snapshot = '指定較晚到期券'
    )
  ) ->> 'voucher_mode',
  'specific',
  '後台可指定符合資格的商品券項目'
);

SELECT extensions.is(
  (
    SELECT voucher.product_name_snapshot
    FROM public.voucher_redemptions AS redemption
    JOIN public.bookings AS booking ON booking.id = redemption.booking_id
    JOIN public.client_voucher_items AS item ON item.id = redemption.client_voucher_item_id
    JOIN public.client_vouchers AS voucher ON voucher.id = item.client_voucher_id
    WHERE booking.notes = '人工指定較晚到期券'
      AND redemption.status = 'reserved'
  ),
  '指定較晚到期券',
  '人工指定會覆蓋原本最早到期的自動選擇'
);

SELECT extensions.is(
  public.upsert_booking_with_voucher(
    NULL,
    'a2000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000002',
    DATE_TRUNC('day', NOW()) + INTERVAL '7 days 9 hours',
    DATE_TRUNC('day', NOW()) + INTERVAL '7 days 10 hours',
    0,
    '沒有適用商品券仍自動建立',
    'a0000000-0000-0000-0000-000000000001',
    NULL,
    'auto',
    NULL
  ) ->> 'voucher_mode',
  'auto',
  '自動模式沒有適用商品券時仍可建立預約'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.voucher_redemptions AS redemption
    JOIN public.bookings AS booking ON booking.id = redemption.booking_id
    WHERE booking.notes = '沒有適用商品券仍自動建立'
      AND redemption.status = 'reserved'
  ),
  0::BIGINT,
  '自動模式沒有餘額時不建立兌換關聯'
);

SELECT extensions.throws_ok(
  $$
    SELECT public.upsert_booking_with_voucher(
      NULL,
      'a2000000-0000-0000-0000-000000000001',
      'a4000000-0000-0000-0000-000000000001',
      'a3000000-0000-0000-0000-000000000002',
      DATE_TRUNC('day', NOW()) + INTERVAL '8 days 9 hours',
      DATE_TRUNC('day', NOW()) + INTERVAL '8 days 10 hours',
      0,
      '指定不適用商品券應回滾',
      'a0000000-0000-0000-0000-000000000001',
      NULL,
      'specific',
      (
        SELECT item.id
        FROM public.client_voucher_items AS item
        JOIN public.client_vouchers AS voucher ON voucher.id = item.client_voucher_id
        WHERE voucher.product_name_snapshot = '指定較晚到期券'
      )
    )
  $$,
  'P0001',
  'VOUCHER_NOT_ELIGIBLE_OR_NO_BALANCE',
  '指定不適用的商品券時整筆操作失敗'
);

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.bookings WHERE notes = '指定不適用商品券應回滾'),
  0::BIGINT,
  '商品券指定失敗時不留下半完成預約'
);

RESET ROLE;

SELECT * FROM extensions.finish();

ROLLBACK;
