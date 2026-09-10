BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(8);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.get_line_customer_center(uuid,text,text)',
    'EXECUTE'
  ),
  'anon 無法直接查詢 LINE 客戶中心'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'authenticated',
    'public.get_line_customer_center(uuid,text,text)',
    'EXECUTE'
  ),
  '店家登入帳號無法冒用 LINE 客戶中心 RPC'
);

SELECT extensions.ok(
  has_function_privilege(
    'service_role',
    'public.get_line_customer_center(uuid,text,text)',
    'EXECUTE'
  ),
  'service_role 可在 Edge Function 驗證後查詢'
);

INSERT INTO public.stores (
  id, name, booking_enabled, booking_confirmation_mode, timezone,
  line_login_channel_id
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '客戶中心測試店家', TRUE, 'auto', 'Asia/Taipei', '3888888001'
), (
  'a0000000-0000-0000-0000-000000000002',
  '客戶中心隔離店家', TRUE, 'auto', 'Asia/Taipei', '3888888002'
);

INSERT INTO public.clients (id, full_name, phone, store_id)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'LINE 客戶中心測試者', '0918111001',
  'a0000000-0000-0000-0000-000000000001'
), (
  'a1000000-0000-0000-0000-000000000002',
  '隔離店家測試者', '0918111002',
  'a0000000-0000-0000-0000-000000000002'
);

INSERT INTO public.customer_channel_identities (
  store_id, client_id, channel, provider_account_id, provider_user_id, display_name
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'line', '3888888001', 'U11111111111111111111111111111111', 'LINE 測試者'
), (
  'a0000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000002',
  'line', '3888888002', 'U22222222222222222222222222222222', '隔離測試者'
);

INSERT INTO public.services (id, name, duration_minutes, price, active, store_id)
VALUES (
  'a2000000-0000-0000-0000-000000000001',
  '客戶中心課程', 60, 1200, TRUE,
  'a0000000-0000-0000-0000-000000000001'
);

INSERT INTO public.practitioners (id, full_name, color, active, store_id)
VALUES (
  'a3000000-0000-0000-0000-000000000001',
  '客戶中心老師', '#84CC16', TRUE,
  'a0000000-0000-0000-0000-000000000001'
);

INSERT INTO public.bookings (
  id, client_id, practitioner_id, service_id, start_time, end_time,
  status, price, source, store_id
) VALUES (
  'a4000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  '2026-09-10 10:00:00+08', '2026-09-10 11:00:00+08',
  'confirmed', 1200, 'line',
  'a0000000-0000-0000-0000-000000000001'
);

INSERT INTO public.voucher_products (
  id, store_id, name, selling_price, validity_days, active
) VALUES (
  'a5000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '客戶中心五堂券', 5000, 180, TRUE
);

INSERT INTO public.client_vouchers (
  id, store_id, client_id, voucher_product_id, sale_number,
  product_name_snapshot, paid_amount, payment_method, purchased_on, expires_on
) VALUES (
  'a6000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'VC-CENTER-0001', '客戶中心五堂券', 5000, 'cash',
  '2026-09-01', '2027-02-28'
);

INSERT INTO public.client_voucher_items (
  id, store_id, client_voucher_id, service_id, service_name_snapshot,
  total_quantity, reserved_quantity, used_quantity
) VALUES (
  'a7000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  '客戶中心課程', 5, 1, 1
);

SELECT extensions.is(
  public.get_line_customer_center(
    'a0000000-0000-0000-0000-000000000001',
    '3888888001',
    'U11111111111111111111111111111111'
  ) ->> 'ok',
  'true',
  '正確 LINE 身分可取得客戶中心資料'
);

SELECT extensions.is(
  public.get_line_customer_center(
    'a0000000-0000-0000-0000-000000000001',
    '3888888001',
    'U11111111111111111111111111111111'
  ) #>> '{client,name}',
  'LINE 客戶中心測試者',
  '只回傳身分綁定的客戶姓名'
);

SELECT extensions.is(
  JSONB_ARRAY_LENGTH(public.get_line_customer_center(
    'a0000000-0000-0000-0000-000000000001',
    '3888888001',
    'U11111111111111111111111111111111'
  ) -> 'bookings'),
  1,
  '回傳該客戶自己的預約'
);

SELECT extensions.is(
  public.get_line_customer_center(
    'a0000000-0000-0000-0000-000000000001',
    '3888888001',
    'U11111111111111111111111111111111'
  ) #>> '{vouchers,0,items,0,availableQuantity}',
  '3',
  '商品券正確扣除已保留與已使用堂數'
);

SELECT extensions.is(
  public.get_line_customer_center(
    'a0000000-0000-0000-0000-000000000002',
    '3888888002',
    'U11111111111111111111111111111111'
  ) ->> 'error',
  'IDENTITY_NOT_FOUND',
  '不同店家無法交叉查詢客戶資料'
);

SELECT * FROM extensions.finish();

ROLLBACK;
