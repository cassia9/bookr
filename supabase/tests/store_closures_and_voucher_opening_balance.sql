BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(38);

INSERT INTO public.stores (
  id, name, booking_enabled, booking_confirmation_mode, timezone,
  open_time, close_time
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '店休與期初匯入測試店家', TRUE, 'auto', 'Asia/Taipei', '09:00', '18:00'
), (
  'a0000000-0000-0000-0000-000000000002',
  '隔離測試店家', TRUE, 'auto', 'Asia/Taipei', '09:00', '18:00'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    'closure-admin@example.test',
    '{"full_name":"店休管理員"}'::JSONB
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    'closure-member@example.test',
    '{"full_name":"店休一般成員"}'::JSONB
  ),
  (
    'a1000000-0000-0000-0000-000000000003',
    'closure-other-admin@example.test',
    '{"full_name":"隔離店家管理員"}'::JSONB
  );

UPDATE public.users
SET store_id = 'a0000000-0000-0000-0000-000000000001',
    role = 'admin'::public.user_role
WHERE id = 'a1000000-0000-0000-0000-000000000001';

UPDATE public.users
SET store_id = 'a0000000-0000-0000-0000-000000000001',
    role = 'member'::public.user_role
WHERE id = 'a1000000-0000-0000-0000-000000000002';

UPDATE public.users
SET store_id = 'a0000000-0000-0000-0000-000000000002',
    role = 'admin'::public.user_role
WHERE id = 'a1000000-0000-0000-0000-000000000003';

INSERT INTO public.clients (id, full_name, phone, store_id)
VALUES
  (
    'a2000000-0000-0000-0000-000000000001',
    '既有商品券客戶', '0910000001',
    'a0000000-0000-0000-0000-000000000001'
  ),
  (
    'a2000000-0000-0000-0000-000000000002',
    '隔離店家客戶', '0910000002',
    'a0000000-0000-0000-0000-000000000002'
  );

INSERT INTO public.services (
  id, name, duration_minutes, price, active, store_id
) VALUES
  (
    'a3000000-0000-0000-0000-000000000001',
    '期初匯入課程', 60, 1200, TRUE,
    'a0000000-0000-0000-0000-000000000001'
  ),
  (
    'a3000000-0000-0000-0000-000000000002',
    '隔離店家課程', 60, 900, TRUE,
    'a0000000-0000-0000-0000-000000000002'
  );

INSERT INTO public.practitioners (
  id, full_name, color, active, store_id
) VALUES (
  'a4000000-0000-0000-0000-000000000001',
  '店休測試老師', '#84CC16', TRUE,
  'a0000000-0000-0000-0000-000000000001'
);

SELECT extensions.ok(
  (
    SELECT class.relrowsecurity
    FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relname = 'store_closures'
  ),
  'store_closures 已啟用 RLS'
);

SELECT extensions.ok(
  NOT has_table_privilege('anon', 'public.store_closures', 'SELECT'),
  '匿名使用者不能直接讀取店休資料表'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-0000-0000-000000000002"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.save_store_closure(
    NULL,
    CURRENT_DATE + 7,
    CURRENT_DATE + 7,
    'public_holiday',
    '國定假日店休',
    '僅供內部測試'
  ) ->> 'error',
  'FORBIDDEN',
  '一般成員不能建立店休'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.ok(
  (
    public.save_store_closure(
      NULL,
      CURRENT_DATE + 7,
      CURRENT_DATE + 7,
      'public_holiday',
      '國定假日店休',
      '僅供內部測試'
    ) ->> 'ok'
  )::BOOLEAN,
  '管理員可建立單日店休'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.store_closures
    WHERE store_id = 'a0000000-0000-0000-0000-000000000001'
      AND deleted_at IS NULL
  ),
  1::BIGINT,
  '店休資料保存於管理員所屬店家'
);

SELECT extensions.is(
  public.save_store_closure(
    NULL,
    CURRENT_DATE + 7,
    CURRENT_DATE + 8,
    'staff_trip',
    '員工旅遊',
    NULL
  ) ->> 'error',
  'OVERLAPPING_CLOSURE',
  '同店不可建立日期重疊的有效店休'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.get_public_store_closures(
      'a0000000-0000-0000-0000-000000000001',
      CURRENT_DATE,
      CURRENT_DATE + 30
    )
  ),
  1::BIGINT,
  '公開 RPC 可取得指定期間的店休日'
);

SELECT extensions.ok(
  NOT (
    TO_JSONB(public_closure) ? 'internal_note'
  ),
  '公開店休資料不含內部備註'
)
FROM public.get_public_store_closures(
  'a0000000-0000-0000-0000-000000000001',
  CURRENT_DATE,
  CURRENT_DATE + 30
) AS public_closure;

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.get_available_slots(
      CURRENT_DATE + 7,
      'a3000000-0000-0000-0000-000000000001',
      'a4000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001'
    )
  ),
  0::BIGINT,
  '公開可用時段會排除店休日'
);

RESET ROLE;
SELECT SET_CONFIG('request.jwt.claims', '{"role":"anon"}', TRUE);
SET LOCAL ROLE anon;

SELECT extensions.throws_ok(
  FORMAT(
    $sql$SELECT public.create_booking_public(
      '公開預約客戶',
      '0910111222',
      'a3000000-0000-0000-0000-000000000001',
      'a4000000-0000-0000-0000-000000000001',
      %L::TIMESTAMPTZ,
      NULL,
      'a0000000-0000-0000-0000-000000000001'
    )$sql$,
    ((CURRENT_DATE + 7)::TEXT || ' 10:00 Asia/Taipei')
  ),
  'P0001',
  'STORE_CLOSED',
  '匿名公開預約無法繞過店休'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-0000-0000-000000000002"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.upsert_booking(
    NULL,
    'a2000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000001',
    ((CURRENT_DATE + 7)::TEXT || ' 10:00 Asia/Taipei')::TIMESTAMPTZ,
    ((CURRENT_DATE + 7)::TEXT || ' 11:00 Asia/Taipei')::TIMESTAMPTZ,
    0,
    NULL,
    'a0000000-0000-0000-0000-000000000001',
    1200
  ) ->> 'error',
  'CLIENT_NOT_FOUND',
  '一般成員沿用既有後台權限限制，不能覆寫店休建立預約'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.ok(
  (
    public.upsert_booking(
      NULL,
      'a2000000-0000-0000-0000-000000000001',
      'a4000000-0000-0000-0000-000000000001',
      'a3000000-0000-0000-0000-000000000001',
      ((CURRENT_DATE + 7)::TEXT || ' 10:00 Asia/Taipei')::TIMESTAMPTZ,
      ((CURRENT_DATE + 7)::TEXT || ' 11:00 Asia/Taipei')::TIMESTAMPTZ,
      0,
      NULL,
      'a0000000-0000-0000-0000-000000000001',
      1200
    ) ->> 'ok'
  )::BOOLEAN,
  '管理員可覆寫店休建立特殊預約'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE store_id = 'a0000000-0000-0000-0000-000000000001'
      AND action = 'booking_store_closure_overridden'
  ),
  1::BIGINT,
  '管理員覆寫店休會留下稽核紀錄'
);

SELECT extensions.is(
  (
    public.save_store_closure(
      (
        SELECT id FROM public.store_closures
        WHERE store_id = 'a0000000-0000-0000-0000-000000000001'
          AND deleted_at IS NULL
      ),
      CURRENT_DATE + 7,
      CURRENT_DATE + 7,
      'public_holiday',
      '國定假日店休',
      '更新衝突測試'
    ) ->> 'conflict_count'
  )::INTEGER,
  1,
  '更新店休會回傳期間內既有預約數量'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-0000-0000-000000000003"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.store_closures),
  0::BIGINT,
  '其他店家管理員無法透過 RLS 讀取店休內部資料'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.ok(
  (
    public.archive_store_closure(
      (
        SELECT id FROM public.store_closures
        WHERE store_id = 'a0000000-0000-0000-0000-000000000001'
          AND deleted_at IS NULL
      )
    ) ->> 'ok'
  )::BOOLEAN,
  '管理員可取消店休'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.get_public_store_closures(
      'a0000000-0000-0000-0000-000000000001',
      CURRENT_DATE,
      CURRENT_DATE + 30
    )
  ),
  0::BIGINT,
  '取消後公開店休日立即消失'
);

SELECT extensions.ok(
  (
    SELECT COUNT(*) > 0
    FROM public.get_available_slots(
      CURRENT_DATE + 7,
      'a3000000-0000-0000-0000-000000000001',
      'a4000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001'
    )
  ),
  '取消店休後符合其他規則的時段重新開放'
);

-- ============================================================
-- 既有商品券期初餘額
-- ============================================================

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-0000-0000-000000000002"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.import_client_voucher_opening_balance(
    '00000000-0000-0000-0000-000000000000',
    'a2000000-0000-0000-0000-000000000001',
    CURRENT_DATE - 30,
    CURRENT_DATE + 90,
    10000,
    '舊系統移轉',
    '[{"service_id":"a3000000-0000-0000-0000-000000000001","total_quantity":10,"used_quantity":4}]'::JSONB
  ) ->> 'error',
  'FORBIDDEN',
  '一般成員不能匯入商品券期初餘額'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.ok(
  (
    public.save_voucher_product(
      NULL,
      '舊制十堂商品券',
      '上線前既有方案',
      10000,
      365,
      TRUE,
      '[{"service_id":"a3000000-0000-0000-0000-000000000001","quantity":10}]'::JSONB
    ) ->> 'ok'
  )::BOOLEAN,
  '管理員可先建立對應的商品券方案'
);

SELECT extensions.ok(
  (
    public.import_client_voucher_opening_balance(
      (
        SELECT id FROM public.voucher_products
        WHERE store_id = 'a0000000-0000-0000-0000-000000000001'
          AND name = '舊制十堂商品券'
      ),
      'a2000000-0000-0000-0000-000000000001',
      CURRENT_DATE - 30,
      CURRENT_DATE + 90,
      10000,
      '舊系統期初移轉',
      '[{"service_id":"a3000000-0000-0000-0000-000000000001","total_quantity":10,"used_quantity":4}]'::JSONB
    ) ->> 'ok'
  )::BOOLEAN,
  '管理員可匯入原始十堂、歷史已用四堂的商品券'
);

SELECT extensions.is(
  (
    SELECT source
    FROM public.client_vouchers
    WHERE client_id = 'a2000000-0000-0000-0000-000000000001'
      AND source = 'opening_balance'
  ),
  'opening_balance',
  '期初資料有獨立來源標記'
);

SELECT extensions.is(
  (
    SELECT paid_amount
    FROM public.client_vouchers
    WHERE client_id = 'a2000000-0000-0000-0000-000000000001'
      AND source = 'opening_balance'
  ),
  10000,
  '期初資料保存歷史實收金額'
);

SELECT extensions.is(
  (
    SELECT SUM(total_quantity)
    FROM public.client_voucher_items AS item
    JOIN public.client_vouchers AS voucher
      ON voucher.id = item.client_voucher_id
    WHERE voucher.client_id = 'a2000000-0000-0000-0000-000000000001'
      AND voucher.source = 'opening_balance'
  ),
  10::BIGINT,
  '期初資料保存原始總堂數'
);

SELECT extensions.is(
  (
    SELECT SUM(used_quantity)
    FROM public.client_voucher_items AS item
    JOIN public.client_vouchers AS voucher
      ON voucher.id = item.client_voucher_id
    WHERE voucher.client_id = 'a2000000-0000-0000-0000-000000000001'
      AND voucher.source = 'opening_balance'
  ),
  4::BIGINT,
  '期初資料保存歷史已使用堂數'
);

SELECT extensions.is(
  (
    SELECT SUM(
      item.total_quantity + item.adjustment_quantity
        - item.reserved_quantity - item.used_quantity
    )
    FROM public.client_voucher_items AS item
    JOIN public.client_vouchers AS voucher
      ON voucher.id = item.client_voucher_id
    WHERE voucher.client_id = 'a2000000-0000-0000-0000-000000000001'
      AND voucher.source = 'opening_balance'
  ),
  6::BIGINT,
  '十堂已使用四堂後目前可用六堂'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.voucher_ledger AS ledger
    JOIN public.client_voucher_items AS item
      ON item.id = ledger.client_voucher_item_id
    JOIN public.client_vouchers AS voucher
      ON voucher.id = item.client_voucher_id
    WHERE voucher.source = 'opening_balance'
      AND ledger.action IN ('issued', 'opening_usage')
  ),
  2::BIGINT,
  '期初發行與歷史使用分別寫入不可覆寫帳本'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.voucher_redemptions AS redemption
    JOIN public.client_voucher_items AS item
      ON item.id = redemption.client_voucher_item_id
    JOIN public.client_vouchers AS voucher
      ON voucher.id = item.client_voucher_id
    WHERE voucher.source = 'opening_balance'
  ),
  0::BIGINT,
  '歷史已使用堂數不建立假的預約兌換紀錄'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE store_id = 'a0000000-0000-0000-0000-000000000001'
      AND action = 'voucher_opening_balance_imported'
  ),
  1::BIGINT,
  '期初匯入留下管理員稽核紀錄'
);

SELECT extensions.ok(
  (
    SELECT sale_number LIKE 'VI-%'
    FROM public.client_vouchers
    WHERE source = 'opening_balance'
      AND client_id = 'a2000000-0000-0000-0000-000000000001'
  ),
  '期初匯入使用可辨識的 VI 單號'
);

SELECT extensions.is(
  public.import_client_voucher_opening_balance(
    (
      SELECT id FROM public.voucher_products
      WHERE store_id = 'a0000000-0000-0000-0000-000000000001'
        AND name = '舊制十堂商品券'
    ),
    'a2000000-0000-0000-0000-000000000001',
    CURRENT_DATE - 30,
    CURRENT_DATE + 90,
    0,
    '重複課程測試',
    '[
      {"service_id":"a3000000-0000-0000-0000-000000000001","total_quantity":5,"used_quantity":1},
      {"service_id":"a3000000-0000-0000-0000-000000000001","total_quantity":5,"used_quantity":1}
    ]'::JSONB
  ) ->> 'error',
  'DUPLICATE_SERVICE',
  '期初匯入拒絕重複課程項目'
);

SELECT extensions.is(
  public.import_client_voucher_opening_balance(
    (
      SELECT id FROM public.voucher_products
      WHERE store_id = 'a0000000-0000-0000-0000-000000000001'
        AND name = '舊制十堂商品券'
    ),
    'a2000000-0000-0000-0000-000000000001',
    CURRENT_DATE - 30,
    CURRENT_DATE + 90,
    0,
    '錯誤課程測試',
    '[{"service_id":"a3000000-0000-0000-0000-000000000002","total_quantity":10,"used_quantity":0}]'::JSONB
  ) ->> 'error',
  'PRODUCT_ITEM_MISMATCH',
  '期初匯入拒絕不屬於方案或其他店家的課程'
);

SELECT extensions.is(
  public.import_client_voucher_opening_balance(
    (
      SELECT id FROM public.voucher_products
      WHERE store_id = 'a0000000-0000-0000-0000-000000000001'
        AND name = '舊制十堂商品券'
    ),
    'a2000000-0000-0000-0000-000000000002',
    CURRENT_DATE - 30,
    CURRENT_DATE + 90,
    0,
    '跨店客戶測試',
    '[{"service_id":"a3000000-0000-0000-0000-000000000001","total_quantity":10,"used_quantity":0}]'::JSONB
  ) ->> 'error',
  'CLIENT_NOT_FOUND',
  '期初匯入拒絕其他店家的客戶'
);

SELECT extensions.is(
  public.adjust_client_voucher_item(
    (
      SELECT item.id
      FROM public.client_voucher_items AS item
      JOIN public.client_vouchers AS voucher
        ON voucher.id = item.client_voucher_id
      WHERE voucher.source = 'opening_balance'
        AND voucher.client_id = 'a2000000-0000-0000-0000-000000000001'
    ),
    -7,
    '不可扣成低於歷史已用堂數'
  ) ->> 'error',
  'INSUFFICIENT_OR_INVALID_BALANCE',
  '期初商品券仍受既有防超扣規則保護'
);

SELECT extensions.ok(
  (
    public.adjust_client_voucher_item(
      (
        SELECT item.id
        FROM public.client_voucher_items AS item
        JOIN public.client_vouchers AS voucher
          ON voucher.id = item.client_voucher_id
        WHERE voucher.source = 'opening_balance'
          AND voucher.client_id = 'a2000000-0000-0000-0000-000000000001'
      ),
      2,
      '補登舊系統遺漏堂數'
    ) ->> 'ok'
  )::BOOLEAN,
  '期初商品券可沿用既有人工加減堂數功能'
);

SELECT extensions.is(
  (
    SELECT item.total_quantity + item.adjustment_quantity
      - item.reserved_quantity - item.used_quantity
    FROM public.client_voucher_items AS item
    JOIN public.client_vouchers AS voucher
      ON voucher.id = item.client_voucher_id
    WHERE voucher.source = 'opening_balance'
      AND voucher.client_id = 'a2000000-0000-0000-0000-000000000001'
  ),
  8,
  '人工增加兩堂後可用堂數更新為八堂'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.voucher_ledger AS ledger
    JOIN public.client_voucher_items AS item
      ON item.id = ledger.client_voucher_item_id
    JOIN public.client_vouchers AS voucher
      ON voucher.id = item.client_voucher_id
    WHERE voucher.source = 'opening_balance'
      AND ledger.action = 'adjusted'
  ),
  1::BIGINT,
  '期初商品券後續調整同樣寫入帳本'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.client_vouchers
    WHERE source = 'opening_balance'
  ),
  1::BIGINT,
  '失敗的匯入不會留下半套商品券資料'
);

SELECT * FROM extensions.finish();

ROLLBACK;
