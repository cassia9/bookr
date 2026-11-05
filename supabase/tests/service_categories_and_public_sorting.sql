BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(14);

INSERT INTO public.stores (id, name, booking_enabled, timezone)
VALUES
  ('b0000000-0000-0000-0000-000000000001', '分類測試店家', TRUE, 'Asia/Taipei'),
  ('b0000000-0000-0000-0000-000000000002', '分類隔離店家', TRUE, 'Asia/Taipei');

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('b1000000-0000-0000-0000-000000000001', 'category-admin@example.test', '{"full_name":"分類管理員"}'::JSONB),
  ('b1000000-0000-0000-0000-000000000002', 'category-member@example.test', '{"full_name":"分類一般成員"}'::JSONB),
  ('b1000000-0000-0000-0000-000000000003', 'category-other@example.test', '{"full_name":"隔離管理員"}'::JSONB);

UPDATE public.users
SET store_id = 'b0000000-0000-0000-0000-000000000001', role = 'admin'::public.user_role
WHERE id = 'b1000000-0000-0000-0000-000000000001';

UPDATE public.users
SET store_id = 'b0000000-0000-0000-0000-000000000001', role = 'member'::public.user_role
WHERE id = 'b1000000-0000-0000-0000-000000000002';

UPDATE public.users
SET store_id = 'b0000000-0000-0000-0000-000000000002', role = 'admin'::public.user_role
WHERE id = 'b1000000-0000-0000-0000-000000000003';

SELECT extensions.ok(
  (
    SELECT class.relrowsecurity
    FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relname = 'service_categories'
  ),
  'service_categories 已啟用 RLS'
);

SELECT extensions.ok(
  NOT has_table_privilege('anon', 'public.service_categories', 'SELECT'),
  '匿名角色不能直接讀取課程類別表'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b1000000-0000-0000-0000-000000000002"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.throws_ok(
  $$INSERT INTO public.service_categories (store_id, name, sort_order)
    VALUES ('b0000000-0000-0000-0000-000000000001', '一般成員不可新增', 0)$$,
  '42501',
  NULL,
  '一般成員不能新增課程類別'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

INSERT INTO public.service_categories (id, store_id, name, sort_order)
VALUES
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '進階修復', 20),
  ('b2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', '基礎修復', 10);

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.service_categories),
  2::BIGINT,
  '管理員可建立同店課程類別'
);

SELECT extensions.throws_ok(
  $$INSERT INTO public.service_categories (store_id, name, sort_order)
    VALUES ('b0000000-0000-0000-0000-000000000001', ' 基礎修復 ', 30)$$,
  '23505',
  NULL,
  '同店有效類別名稱不分前後空白且不可重複'
);

RESET ROLE;

INSERT INTO public.service_categories (id, store_id, name, sort_order)
VALUES (
  'b2000000-0000-0000-0000-000000000003',
  'b0000000-0000-0000-0000-000000000002',
  '隔離類別',
  1
);

INSERT INTO public.services (
  id, name, duration_minutes, price, active, store_id, category_id
) VALUES
  (
    'b3000000-0000-0000-0000-000000000001', '基礎 90 分鐘', 90, 3000, TRUE,
    'b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002'
  ),
  (
    'b3000000-0000-0000-0000-000000000002', '基礎 60 分鐘', 60, 2000, TRUE,
    'b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002'
  ),
  (
    'b3000000-0000-0000-0000-000000000003', '未分類服務', 30, 1200, TRUE,
    'b0000000-0000-0000-0000-000000000001', NULL
  );

SELECT extensions.throws_ok(
  $$UPDATE public.services
    SET category_id = 'b2000000-0000-0000-0000-000000000003'
    WHERE id = 'b3000000-0000-0000-0000-000000000001'$$,
  '23503',
  NULL,
  '複合外鍵阻擋課程指派到其他店家類別'
);

SELECT extensions.is(
  (public.get_public_booking_catalog('b0000000-0000-0000-0000-000000000001') -> 'categories' -> 0 ->> 'name'),
  '基礎修復',
  '公開目錄依類別 sort_order 排序'
);

SELECT extensions.is(
  (public.get_public_booking_catalog('b0000000-0000-0000-0000-000000000001') -> 'services' -> 0 ->> 'name'),
  '基礎 60 分鐘',
  '同類別課程預設依時長升冪排序'
);

SELECT extensions.is(
  (public.get_public_booking_catalog('b0000000-0000-0000-0000-000000000001') -> 'services' -> 2 ->> 'name'),
  '未分類服務',
  '未分類課程固定排在具有效類別的課程之後'
);

SELECT extensions.is(
  (public.get_public_booking_catalog('b0000000-0000-0000-0000-000000000001') -> 'services' -> 2 -> 'category_id'),
  'null'::JSONB,
  '未分類課程公開 category_id 為 null'
);

UPDATE public.service_categories
SET active = FALSE
WHERE id = 'b2000000-0000-0000-0000-000000000002';

SELECT extensions.is(
  JSONB_ARRAY_LENGTH(
    public.get_public_booking_catalog('b0000000-0000-0000-0000-000000000001') -> 'categories'
  ),
  1,
  '公開目錄不回傳停用類別'
);

SELECT extensions.is(
  (
    SELECT service -> 'category_id'
    FROM JSONB_ARRAY_ELEMENTS(
      public.get_public_booking_catalog('b0000000-0000-0000-0000-000000000001') -> 'services'
    ) AS service
    WHERE service ->> 'id' = 'b3000000-0000-0000-0000-000000000001'
  ),
  'null'::JSONB,
  '停用類別的課程在公開目錄安全回到未分類'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE store_id = 'b0000000-0000-0000-0000-000000000001'
      AND table_name = 'service_categories'
  ),
  3::BIGINT,
  '類別新增與更新留下稽核紀錄'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"b1000000-0000-0000-0000-000000000003"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.service_categories),
  1::BIGINT,
  '另一店家只能讀取自己的類別'
);

RESET ROLE;

SELECT * FROM extensions.finish();
ROLLBACK;
