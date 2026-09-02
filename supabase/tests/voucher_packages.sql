BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(34);

INSERT INTO public.stores (
  id, name, booking_enabled, booking_confirmation_mode, timezone,
  line_login_channel_id
) VALUES (
  '90000000-0000-0000-0000-000000000001',
  '商品券測試店家',
  TRUE,
  'auto',
  'Asia/Taipei',
  '2999999001'
), (
  '90000000-0000-0000-0000-000000000002',
  '商品券隔離店家',
  TRUE,
  'auto',
  'Asia/Taipei',
  '2999999002'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    '91000000-0000-0000-0000-000000000001',
    'voucher-admin@example.test',
    '{"full_name":"商品券管理員"}'::JSONB
  ),
  (
    '91000000-0000-0000-0000-000000000002',
    'voucher-member@example.test',
    '{"full_name":"商品券一般成員"}'::JSONB
  ),
  (
    '91000000-0000-0000-0000-000000000003',
    'voucher-other-store@example.test',
    '{"full_name":"其他店家管理員"}'::JSONB
  );

UPDATE public.users
SET store_id = '90000000-0000-0000-0000-000000000001',
    role = 'admin'::public.user_role
WHERE id = '91000000-0000-0000-0000-000000000001';

UPDATE public.users
SET store_id = '90000000-0000-0000-0000-000000000001',
    role = 'member'::public.user_role
WHERE id = '91000000-0000-0000-0000-000000000002';

UPDATE public.users
SET store_id = '90000000-0000-0000-0000-000000000002',
    role = 'admin'::public.user_role
WHERE id = '91000000-0000-0000-0000-000000000003';

INSERT INTO public.clients (id, full_name, phone, store_id)
VALUES
  (
    '92000000-0000-0000-0000-000000000001',
    '商品券客戶',
    '0919000001',
    '90000000-0000-0000-0000-000000000001'
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    '隔離店家客戶',
    '0919000002',
    '90000000-0000-0000-0000-000000000002'
  );

INSERT INTO public.services (
  id, name, duration_minutes, price, active, store_id
) VALUES
  (
    '93000000-0000-0000-0000-000000000001',
    '商品券課程 A', 60, 1500, TRUE,
    '90000000-0000-0000-0000-000000000001'
  ),
  (
    '93000000-0000-0000-0000-000000000002',
    '商品券課程 B', 90, 2200, TRUE,
    '90000000-0000-0000-0000-000000000001'
  ),
  (
    '93000000-0000-0000-0000-000000000003',
    '隔離店家課程', 60, 1000, TRUE,
    '90000000-0000-0000-0000-000000000002'
  );

INSERT INTO public.practitioners (
  id, full_name, color, active, store_id
) VALUES (
  '94000000-0000-0000-0000-000000000001',
  '商品券測試老師', '#84CC16', TRUE,
  '90000000-0000-0000-0000-000000000001'
);

SELECT extensions.ok(
  (
    SELECT COUNT(*) = 6
    FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relname = ANY (ARRAY[
        'voucher_products',
        'voucher_product_items',
        'client_vouchers',
        'client_voucher_items',
        'voucher_redemptions',
        'voucher_ledger'
      ])
      AND class.relrowsecurity
  ),
  '六張商品券資料表皆啟用 RLS'
);

SELECT extensions.ok(
  NOT has_table_privilege('anon', 'public.client_vouchers', 'SELECT'),
  'anon 無法直接讀取客戶商品券'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.sell_voucher_product(uuid,uuid,date,integer,text,text)',
    'EXECUTE'
  ),
  'anon 無法登記銷售商品券'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-0000-0000-000000000002"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.save_voucher_product(
    NULL,
    '無權建立方案',
    NULL,
    1000,
    30,
    TRUE,
    '[{"service_id":"93000000-0000-0000-0000-000000000001","quantity":2}]'::JSONB
  ) ->> 'error',
  'FORBIDDEN',
  '一般成員不可建立商品券方案'
);

RESET ROLE;

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.ok(
  (
    public.save_voucher_product(
      NULL,
      '身體保養五堂組合',
      '課程 A 三堂加課程 B 兩堂',
      6800,
      120,
      TRUE,
      '[
        {"service_id":"93000000-0000-0000-0000-000000000001","quantity":3},
        {"service_id":"93000000-0000-0000-0000-000000000002","quantity":2}
      ]'::JSONB
    ) ->> 'ok'
  )::BOOLEAN,
  '管理員可建立多課程固定組合'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.voucher_product_items AS item
    JOIN public.voucher_products AS product
      ON product.id = item.voucher_product_id
    WHERE product.name = '身體保養五堂組合'
  ),
  2::BIGINT,
  '組合方案保存兩個不同課程項目'
);

SELECT extensions.is(
  public.save_voucher_product(
    NULL,
    '跨店錯誤方案',
    NULL,
    1000,
    30,
    TRUE,
    '[{"service_id":"93000000-0000-0000-0000-000000000003","quantity":2}]'::JSONB
  ) ->> 'error',
  'INVALID_SERVICE_OR_QUANTITY',
  '不可把其他店家的課程加入方案'
);

SELECT extensions.ok(
  (
    public.sell_voucher_product(
      (
        SELECT id FROM public.voucher_products
        WHERE name = '身體保養五堂組合'
      ),
      '92000000-0000-0000-0000-000000000001',
      CURRENT_DATE,
      6500,
      'transfer',
      '測試銷售'
    ) ->> 'ok'
  )::BOOLEAN,
  '管理員可替同店客戶登記購買'
);

SELECT extensions.is(
  (
    SELECT paid_amount
    FROM public.client_vouchers
    WHERE client_id = '92000000-0000-0000-0000-000000000001'
  ),
  6500,
  '銷售保存實收金額快照'
);

SELECT extensions.is(
  (
    SELECT expires_on
    FROM public.client_vouchers
    WHERE client_id = '92000000-0000-0000-0000-000000000001'
  ),
  CURRENT_DATE + 120,
  '效期依購買日與方案天數計算'
);

SELECT extensions.is(
  (
    SELECT SUM(total_quantity)
    FROM public.client_voucher_items
    WHERE client_voucher_id = (
      SELECT id FROM public.client_vouchers
      WHERE client_id = '92000000-0000-0000-0000-000000000001'
    )
  ),
  5::BIGINT,
  '銷售快照建立正確的總堂數'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.voucher_ledger
    WHERE action = 'issued'
      AND client_voucher_item_id IN (
        SELECT id FROM public.client_voucher_items
        WHERE client_voucher_id = (
          SELECT id FROM public.client_vouchers
          WHERE client_id = '92000000-0000-0000-0000-000000000001'
        )
      )
  ),
  2::BIGINT,
  '每個商品券項目都有發行帳本紀錄'
);

SELECT extensions.ok(
  (
    public.upsert_booking(
      NULL,
      '92000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000001',
      '93000000-0000-0000-0000-000000000001',
      DATE_TRUNC('day', NOW()) + INTERVAL '10 days 9 hours',
      DATE_TRUNC('day', NOW()) + INTERVAL '10 days 10 hours',
      0,
      '商品券保留測試',
      '90000000-0000-0000-0000-000000000001',
      NULL
    ) ->> 'ok'
  )::BOOLEAN,
  '登入後台建立預約成功'
);

SELECT extensions.is(
  (
    SELECT reserved_quantity
    FROM public.client_voucher_items
    WHERE service_id = '93000000-0000-0000-0000-000000000001'
      AND client_voucher_id = (
        SELECT id FROM public.client_vouchers
        WHERE client_id = '92000000-0000-0000-0000-000000000001'
      )
  ),
  1,
  '建立符合資格的預約會保留一堂'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.voucher_redemptions
    WHERE booking_id = (
      SELECT id FROM public.bookings
      WHERE notes = '商品券保留測試'
    )
      AND status = 'reserved'
  ),
  1::BIGINT,
  '預約只有一筆有效保留關聯'
);

UPDATE public.bookings
SET status = 'completed'::public.booking_status
WHERE notes = '商品券保留測試';

SELECT extensions.is(
  (
    SELECT used_quantity
    FROM public.client_voucher_items
    WHERE service_id = '93000000-0000-0000-0000-000000000001'
      AND client_voucher_id = (
        SELECT id FROM public.client_vouchers
        WHERE client_id = '92000000-0000-0000-0000-000000000001'
      )
  ),
  1,
  '完課會把保留轉為已使用'
);

UPDATE public.bookings
SET status = 'completed'::public.booking_status
WHERE notes = '商品券保留測試';

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.voucher_ledger
    WHERE booking_id = (
      SELECT id FROM public.bookings
      WHERE notes = '商品券保留測試'
    )
      AND action = 'redeemed'
  ),
  1::BIGINT,
  '重複完課不會重複扣堂'
);

SELECT extensions.ok(
  (
    public.save_voucher_product(
      NULL,
      '短效伸展單堂券',
      '驗證最早到期優先',
      1800,
      30,
      TRUE,
      '[{"service_id":"93000000-0000-0000-0000-000000000002","quantity":1}]'::JSONB
    ) ->> 'ok'
  )::BOOLEAN,
  '可建立相同課程的另一個短效方案'
);

SELECT extensions.ok(
  (
    public.sell_voucher_product(
      (
        SELECT id FROM public.voucher_products
        WHERE name = '短效伸展單堂券'
      ),
      '92000000-0000-0000-0000-000000000001',
      CURRENT_DATE,
      NULL,
      'cash',
      '最早到期排序測試'
    ) ->> 'ok'
  )::BOOLEAN,
  '客戶可同時持有另一張適用商品券'
);

SELECT extensions.ok(
  (
    public.upsert_booking(
      NULL,
      '92000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000001',
      '93000000-0000-0000-0000-000000000002',
      DATE_TRUNC('day', NOW()) + INTERVAL '11 days 9 hours',
      DATE_TRUNC('day', NOW()) + INTERVAL '11 days 10 hours 30 minutes',
      0,
      '商品券取消測試',
      '90000000-0000-0000-0000-000000000001',
      NULL
    ) ->> 'ok'
  )::BOOLEAN,
  '第二筆商品券預約建立成功'
);

SELECT extensions.is(
  (
    SELECT voucher.product_name_snapshot
    FROM public.voucher_redemptions AS redemption
    JOIN public.client_voucher_items AS item
      ON item.id = redemption.client_voucher_item_id
    JOIN public.client_vouchers AS voucher
      ON voucher.id = item.client_voucher_id
    JOIN public.bookings AS booking ON booking.id = redemption.booking_id
    WHERE booking.notes = '商品券取消測試'
      AND redemption.status = 'reserved'
  ),
  '短效伸展單堂券',
  '多張適用券會優先保留最早到期者'
);

UPDATE public.bookings
SET status = 'cancelled'::public.booking_status
WHERE notes = '商品券取消測試';

SELECT extensions.is(
  (
    SELECT item.reserved_quantity
    FROM public.client_voucher_items AS item
    JOIN public.client_vouchers AS voucher
      ON voucher.id = item.client_voucher_id
    WHERE item.service_id = '93000000-0000-0000-0000-000000000002'
      AND voucher.product_name_snapshot = '短效伸展單堂券'
  ),
  0,
  '取消預約會釋放保留堂數'
);

SELECT extensions.ok(
  (
    public.upsert_booking(
      NULL,
      '92000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000001',
      '93000000-0000-0000-0000-000000000002',
      DATE_TRUNC('day', NOW()) + INTERVAL '14 days 9 hours',
      DATE_TRUNC('day', NOW()) + INTERVAL '14 days 10 hours 30 minutes',
      0,
      '商品券未到場測試',
      '90000000-0000-0000-0000-000000000001',
      NULL
    ) ->> 'ok'
  )::BOOLEAN,
  '可建立未到場扣堂測試預約'
);

UPDATE public.bookings
SET status = 'no_show'::public.booking_status
WHERE notes = '商品券未到場測試';

SELECT extensions.is(
  (
    SELECT item.used_quantity
    FROM public.client_voucher_items AS item
    JOIN public.client_vouchers AS voucher
      ON voucher.id = item.client_voucher_id
    WHERE item.service_id = '93000000-0000-0000-0000-000000000002'
      AND voucher.product_name_snapshot = '短效伸展單堂券'
  ),
  1,
  '未到場依已確認規則正式扣一堂'
);

SELECT extensions.is(
  public.adjust_client_voucher_item(
    (
      SELECT item.id
      FROM public.client_voucher_items AS item
      JOIN public.client_vouchers AS voucher
        ON voucher.id = item.client_voucher_id
      WHERE item.service_id = '93000000-0000-0000-0000-000000000001'
        AND voucher.product_name_snapshot = '身體保養五堂組合'
    ),
    1,
    '客訴補回一堂'
  ) ->> 'available_quantity',
  '3',
  '管理員可填寫原因後增加堂數'
);

SELECT extensions.is(
  public.adjust_client_voucher_item(
    (
      SELECT item.id
      FROM public.client_voucher_items AS item
      JOIN public.client_vouchers AS voucher
        ON voucher.id = item.client_voucher_id
      WHERE item.service_id = '93000000-0000-0000-0000-000000000001'
        AND voucher.product_name_snapshot = '身體保養五堂組合'
    ),
    -99,
    '錯誤扣除測試'
  ) ->> 'error',
  'INSUFFICIENT_OR_INVALID_BALANCE',
  '人工調整不可造成負餘額'
);

RESET ROLE;

SELECT SET_CONFIG('request.jwt.claims', '{"role":"anon"}', TRUE);
SET LOCAL ROLE anon;

SELECT extensions.ok(
  (
    public.create_booking_public(
      '商品券客戶',
      '0919000001',
      '93000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000001',
      DATE_TRUNC('day', NOW()) + INTERVAL '12 days 9 hours',
      '匿名網頁不扣券測試',
      '90000000-0000-0000-0000-000000000001'
    ) ->> 'ok'
  )::BOOLEAN,
  '匿名網頁仍可建立預約'
);

RESET ROLE;

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.voucher_redemptions AS redemption
    JOIN public.bookings AS booking ON booking.id = redemption.booking_id
    WHERE booking.notes = '匿名網頁不扣券測試'
  ),
  0::BIGINT,
  '匿名網頁不會只憑電話自動動用商品券'
);

INSERT INTO public.bookings (
  client_id,
  practitioner_id,
  service_id,
  start_time,
  end_time,
  price,
  status,
  notes,
  store_id,
  source,
  client_line_id
) VALUES (
  '92000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  DATE_TRUNC('day', NOW()) + INTERVAL '13 days 9 hours',
  DATE_TRUNC('day', NOW()) + INTERVAL '13 days 10 hours',
  1500,
  'confirmed',
  '已驗證 LINE 自動扣券測試',
  '90000000-0000-0000-0000-000000000001',
  'line',
  'U99999999999999999999999999999901'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.voucher_redemptions AS redemption
    JOIN public.bookings AS booking ON booking.id = redemption.booking_id
    WHERE booking.notes = '已驗證 LINE 自動扣券測試'
      AND redemption.status = 'reserved'
  ),
  1::BIGINT,
  '已驗證 LINE 預約會自動保留商品券'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-0000-0000-000000000003"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.client_vouchers),
  0::BIGINT,
  '其他店家管理員看不到商品券購買資料'
);

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.voucher_ledger),
  0::BIGINT,
  '其他店家管理員看不到商品券帳本'
);

RESET ROLE;

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.void_client_voucher(
    (
      SELECT id FROM public.client_vouchers
      WHERE client_id = '92000000-0000-0000-0000-000000000001'
        AND product_name_snapshot = '身體保養五堂組合'
    ),
    '已有使用紀錄不可作廢'
  ) ->> 'error',
  'VOUCHER_HAS_ACTIVITY',
  '已有保留或使用紀錄的商品券不可直接作廢'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE store_id = '90000000-0000-0000-0000-000000000001'
      AND action = 'voucher_sold'
  ),
  2::BIGINT,
  '每筆商品券銷售都會留下稽核紀錄'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.voucher_ledger
    WHERE booking_id IS NOT NULL
      AND action IN ('reserved', 'released', 'redeemed')
  ),
  7::BIGINT,
  '預約保留、釋放與兌換皆留下帳本紀錄'
);

RESET ROLE;

SELECT * FROM extensions.finish();

ROLLBACK;
