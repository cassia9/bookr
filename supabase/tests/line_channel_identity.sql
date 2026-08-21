BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(15);

SELECT extensions.ok(
  (
    SELECT c.relrowsecurity
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'customer_channel_identities'
  ),
  '客戶渠道身分資料表已啟用 RLS'
);

SELECT extensions.ok(
  NOT has_table_privilege('anon', 'public.customer_channel_identities', 'SELECT'),
  'anon 無法直接讀取客戶渠道身分'
);

SELECT extensions.ok(
  has_table_privilege('authenticated', 'public.customer_channel_identities', 'SELECT'),
  'authenticated 具備渠道身分 SELECT 權限'
);

SELECT extensions.ok(
  NOT has_table_privilege('authenticated', 'public.customer_channel_identities', 'INSERT'),
  'authenticated 無法直接新增渠道身分'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.create_line_booking(text,text,uuid,uuid,timestamptz,uuid,text,text,text,text,text)',
    'EXECUTE'
  ),
  'anon 無法呼叫 LINE 預約 RPC'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'authenticated',
    'public.create_line_booking(text,text,uuid,uuid,timestamptz,uuid,text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated 無法直接呼叫 LINE 預約 RPC'
);

SELECT extensions.ok(
  has_function_privilege(
    'service_role',
    'public.create_line_booking(text,text,uuid,uuid,timestamptz,uuid,text,text,text,text,text)',
    'EXECUTE'
  ),
  '只有 Edge Function 後端角色可呼叫 LINE 預約 RPC'
);

UPDATE public.stores
SET line_login_channel_id = '2000000001'
WHERE id = '00000000-0000-0000-0000-000000000001';

INSERT INTO public.stores (id, name, line_login_channel_id)
VALUES (
  '00000000-0000-0000-0000-000000000099',
  'LINE 隔離測試店家',
  '2000000099'
);

INSERT INTO public.services (
  id, name, duration_minutes, price, active, store_id
) VALUES (
  '10000000-0000-0000-0000-000000000099',
  'LINE 測試課程', 60, 1200, TRUE,
  '00000000-0000-0000-0000-000000000001'
);

INSERT INTO public.practitioners (
  id, full_name, color, active, store_id
) VALUES (
  '20000000-0000-0000-0000-000000000099',
  'LINE 測試老師', '#00B900', TRUE,
  '00000000-0000-0000-0000-000000000001'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    '50000000-0000-0000-0000-000000000098',
    'line-store-one@example.test',
    '{"full_name":"店家一 LINE 測試成員"}'::JSONB
  ),
  (
    '50000000-0000-0000-0000-000000000099',
    'line-store-two@example.test',
    '{"full_name":"店家二 LINE 測試成員"}'::JSONB
  );

UPDATE public.users
SET
  store_id = '00000000-0000-0000-0000-000000000001',
  role = 'member'::public.user_role
WHERE id = '50000000-0000-0000-0000-000000000098';

UPDATE public.users
SET
  store_id = '00000000-0000-0000-0000-000000000099',
  role = 'member'::public.user_role
WHERE id = '50000000-0000-0000-0000-000000000099';

SELECT SET_CONFIG('request.jwt.claims', '{"role":"service_role"}', TRUE);
SET LOCAL ROLE service_role;

SELECT extensions.ok(
  (
    public.create_line_booking(
      'LINE 客戶',
      '0911000099',
      '10000000-0000-0000-0000-000000000099',
      '20000000-0000-0000-0000-000000000099',
      DATE_TRUNC('month', NOW()) + INTERVAL '20 days 9 hours',
      '00000000-0000-0000-0000-000000000001',
      '2000000001',
      'U11111111111111111111111111111111',
      'LINE 顯示名稱',
      'https://profile.line-scdn.net/test',
      'LINE 預約測試'
    ) ->> 'ok'
  )::BOOLEAN,
  '後端角色可用已驗證 LINE 身分建立預約'
);

RESET ROLE;

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.customer_channel_identities
    WHERE store_id = '00000000-0000-0000-0000-000000000001'
      AND channel = 'line'
      AND provider_user_id = 'U11111111111111111111111111111111'
      AND deleted_at IS NULL
  ),
  1::BIGINT,
  'LINE 預約建立一筆已驗證渠道身分'
);

SELECT extensions.is(
  (
    SELECT b.source
    FROM public.bookings AS b
    WHERE b.client_line_id = 'U11111111111111111111111111111111'
    ORDER BY b.created_at DESC
    LIMIT 1
  ),
  'line',
  '已驗證 LINE 預約保留 line 來源快照'
);

SELECT SET_CONFIG('request.jwt.claims', '{"role":"anon"}', TRUE);
SET LOCAL ROLE anon;

SELECT extensions.ok(
  (
    public.create_booking_public(
      '偽造 LINE 客戶',
      '0911000098',
      '10000000-0000-0000-0000-000000000099',
      '20000000-0000-0000-0000-000000000099',
      DATE_TRUNC('month', NOW()) + INTERVAL '21 days 9 hours',
      NULL,
      '00000000-0000-0000-0000-000000000001',
      'line',
      'U22222222222222222222222222222222',
      'https://profile.line-scdn.net/fake'
    ) ->> 'ok'
  )::BOOLEAN,
  '一般公開預約仍可成功'
);

RESET ROLE;

SELECT extensions.is(
  (
    SELECT b.source
    FROM public.bookings AS b
    JOIN public.clients AS c ON c.id = b.client_id
    WHERE c.phone = '0911000098'
    ORDER BY b.created_at DESC
    LIMIT 1
  ),
  'web',
  '一般公開 RPC 忽略偽造來源並固定為 web'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.bookings AS b
    JOIN public.clients AS c ON c.id = b.client_id
    WHERE c.phone = '0911000098'
      AND (b.client_line_id IS NOT NULL OR b.client_picture_url IS NOT NULL)
  ),
  0::BIGINT,
  '一般公開 RPC 不寫入偽造 LINE 身分快照'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"50000000-0000-0000-0000-000000000098"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.customer_channel_identities),
  1::BIGINT,
  '店家一成員只能看到自己店家的 LINE 身分'
);

RESET ROLE;

INSERT INTO public.clients (id, full_name, phone, store_id)
VALUES (
  '30000000-0000-0000-0000-000000000099',
  '店家二 LINE 客戶',
  '0911000097',
  '00000000-0000-0000-0000-000000000099'
);

INSERT INTO public.customer_channel_identities (
  store_id,
  client_id,
  channel,
  provider_account_id,
  provider_user_id,
  display_name
) VALUES (
  '00000000-0000-0000-0000-000000000099',
  '30000000-0000-0000-0000-000000000099',
  'line',
  '2000000099',
  'U99999999999999999999999999999999',
  '店家二 LINE 客戶'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"50000000-0000-0000-0000-000000000098"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.customer_channel_identities),
  1::BIGINT,
  '店家一成員看不到店家二 LINE 身分'
);

RESET ROLE;

SELECT * FROM extensions.finish();

ROLLBACK;
