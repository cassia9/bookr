BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(13);

INSERT INTO public.stores (
  id, name, booking_enabled, booking_confirmation_mode, timezone
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '撤銷完課測試店家',
  TRUE,
  'auto',
  'Asia/Taipei'
), (
  'a0000000-0000-0000-0000-000000000002',
  '撤銷完課隔離店家',
  TRUE,
  'auto',
  'Asia/Taipei'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    'reopen-member@example.test',
    '{"full_name":"撤銷完課操作人員"}'::JSONB
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    'reopen-other@example.test',
    '{"full_name":"其他店家操作人員"}'::JSONB
  );

UPDATE public.users
SET
  store_id = 'a0000000-0000-0000-0000-000000000001',
  role = 'admin'::public.user_role
WHERE id = 'a1000000-0000-0000-0000-000000000001';

UPDATE public.users
SET
  store_id = 'a0000000-0000-0000-0000-000000000002',
  role = 'admin'::public.user_role
WHERE id = 'a1000000-0000-0000-0000-000000000002';

INSERT INTO public.clients (id, full_name, phone, store_id)
VALUES (
  'a2000000-0000-0000-0000-000000000001',
  '撤銷完課測試客戶',
  '0918000001',
  'a0000000-0000-0000-0000-000000000001'
);

INSERT INTO public.services (
  id, name, duration_minutes, price, active, store_id
) VALUES (
  'a3000000-0000-0000-0000-000000000001',
  '撤銷完課測試課程',
  60,
  1200,
  TRUE,
  'a0000000-0000-0000-0000-000000000001'
);

INSERT INTO public.practitioners (
  id, full_name, color, active, store_id
) VALUES (
  'a4000000-0000-0000-0000-000000000001',
  '撤銷完課測試老師',
  '#84CC16',
  TRUE,
  'a0000000-0000-0000-0000-000000000001'
);

INSERT INTO public.voucher_products (
  id, store_id, name, selling_price, validity_days, active
) VALUES (
  'a5000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '撤銷完課測試券',
  3000,
  180,
  TRUE
);

INSERT INTO public.voucher_product_items (
  id, store_id, voucher_product_id, service_id, quantity
) VALUES (
  'a6000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  3
);

INSERT INTO public.client_vouchers (
  id, store_id, client_id, voucher_product_id, sale_number,
  product_name_snapshot, paid_amount, payment_method,
  purchased_on, expires_on, status
) VALUES (
  'a7000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'REOPEN-0001',
  '撤銷完課測試券',
  3000,
  'cash',
  CURRENT_DATE,
  CURRENT_DATE + 180,
  'active'
);

INSERT INTO public.client_voucher_items (
  id, store_id, client_voucher_id, service_id,
  service_name_snapshot, total_quantity
) VALUES (
  'a8000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a7000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  '撤銷完課測試課程',
  3
);

INSERT INTO public.bookings (
  id, store_id, client_id, practitioner_id, service_id,
  start_time, end_time, status, price, source
) VALUES (
  'a9000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  NOW() + INTERVAL '1 day',
  NOW() + INTERVAL '1 day 1 hour',
  'confirmed',
  1200,
  'web'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.ok(
  (
    public.set_booking_voucher(
      'a9000000-0000-0000-0000-000000000001',
      TRUE,
      'a8000000-0000-0000-0000-000000000001'
    ) ->> 'ok'
  )::BOOLEAN,
  '操作人員可先替預約保留商品券'
);

UPDATE public.bookings
SET status = 'completed'::public.booking_status
WHERE id = 'a9000000-0000-0000-0000-000000000001';

SELECT extensions.is(
  (
    public.reopen_completed_booking(
      'a9000000-0000-0000-0000-000000000001'
    ) ->> 'status'
  ),
  'confirmed',
  '管理後台操作人員可將已完課預約恢復為已確認'
);

SELECT extensions.is(
  (
    SELECT status::TEXT
    FROM public.bookings
    WHERE id = 'a9000000-0000-0000-0000-000000000001'
  ),
  'confirmed',
  '預約狀態確實恢復為已確認'
);

SELECT extensions.is(
  (
    SELECT reserved_quantity
    FROM public.client_voucher_items
    WHERE id = 'a8000000-0000-0000-0000-000000000001'
  ),
  1,
  '商品券恢復為保留一堂'
);

SELECT extensions.is(
  (
    SELECT used_quantity
    FROM public.client_voucher_items
    WHERE id = 'a8000000-0000-0000-0000-000000000001'
  ),
  0,
  '已使用堂數退回一堂'
);

SELECT extensions.is(
  (
    SELECT status::TEXT
    FROM public.voucher_redemptions
    WHERE booking_id = 'a9000000-0000-0000-0000-000000000001'
  ),
  'reserved',
  '預約商品券關聯恢復為保留狀態'
);

SELECT extensions.is(
  (
    SELECT redeemed_at
    FROM public.voucher_redemptions
    WHERE booking_id = 'a9000000-0000-0000-0000-000000000001'
  ),
  NULL::TIMESTAMPTZ,
  '恢復後清除原本的核銷時間'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.voucher_ledger
    WHERE booking_id = 'a9000000-0000-0000-0000-000000000001'
      AND action = 'restored'
  ),
  1::BIGINT,
  '商品券流水記錄撤銷完課'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE record_id = 'a9000000-0000-0000-0000-000000000001'
      AND action = 'booking_completion_reopened'
  ),
  1::BIGINT,
  '審計日誌記錄狀態修正'
);

SELECT extensions.is(
  public.reopen_completed_booking(
    'a9000000-0000-0000-0000-000000000001'
  ) ->> 'error',
  'BOOKING_NOT_COMPLETED',
  '已恢復的預約不可重複撤銷完課'
);

RESET ROLE;

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-0000-0000-000000000002"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.reopen_completed_booking(
    'a9000000-0000-0000-0000-000000000001'
  ) ->> 'error',
  'BOOKING_NOT_FOUND',
  '其他店家不可修正此預約'
);

RESET ROLE;

UPDATE public.users
SET role = 'member'::public.user_role
WHERE id = 'a1000000-0000-0000-0000-000000000001';

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.reopen_completed_booking(
    'a9000000-0000-0000-0000-000000000001'
  ) ->> 'error',
  'FORBIDDEN',
  '一般成員不可透過 RPC 繞過後台管理權限'
);

RESET ROLE;

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.reopen_completed_booking(uuid)',
    'EXECUTE'
  ),
  '匿名角色不可執行撤銷完課'
);

SELECT * FROM extensions.finish();

ROLLBACK;
