BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(28);

-- 隔離既有本機 LINE QA 狀態；測試結尾會 ROLLBACK，不影響使用者資料。
DELETE FROM public.line_notification_outbox
WHERE store_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM public.store_channel_connections
WHERE store_id = '00000000-0000-0000-0000-000000000001'
  AND channel = 'line';

DELETE FROM public.audit_logs
WHERE store_id = '00000000-0000-0000-0000-000000000001'
  AND table_name = 'store_channel_connections';

SELECT extensions.ok(
  (
    SELECT c.relrowsecurity
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'store_channel_connections'
  ),
  '店家渠道串接歷史已啟用 RLS'
);

SELECT extensions.ok(
  NOT has_table_privilege('anon', 'public.store_channel_connections', 'SELECT'),
  'anon 無法讀取店家渠道串接歷史'
);

SELECT extensions.ok(
  has_table_privilege('authenticated', 'public.store_channel_connections', 'SELECT'),
  'authenticated 具備受 RLS 約束的串接歷史 SELECT 權限'
);

SELECT extensions.ok(
  NOT has_table_privilege('authenticated', 'public.store_channel_connections', 'INSERT'),
  'authenticated 無法直接新增串接歷史'
);

SELECT extensions.ok(
  NOT has_table_privilege('authenticated', 'public.store_channel_connections', 'UPDATE'),
  'authenticated 無法直接修改串接歷史'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.manage_store_line_connection(text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'anon 無法呼叫 LINE 串接管理 RPC'
);

SELECT extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.manage_store_line_connection(text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated 只能透過受控 RPC 管理 LINE 串接'
);

INSERT INTO public.stores (id, name, booking_enabled)
VALUES (
  '00000000-0000-0000-0000-000000000088',
  'LINE 串接隔離測試店',
  TRUE
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    '50000000-0000-0000-0000-000000000074',
    'line-connection-other-admin@example.test',
    '{"full_name":"其他店家管理員"}'::JSONB
  ),
  (
    '50000000-0000-0000-0000-000000000075',
    'line-connection-member@example.test',
    '{"full_name":"LINE 串接一般成員"}'::JSONB
  ),
  (
    '50000000-0000-0000-0000-000000000076',
    'line-connection-admin@example.test',
    '{"full_name":"LINE 串接管理員"}'::JSONB
  );

UPDATE public.users
SET
  store_id = '00000000-0000-0000-0000-000000000088',
  role = 'admin'::public.user_role
WHERE id = '50000000-0000-0000-0000-000000000074';

UPDATE public.users
SET
  store_id = '00000000-0000-0000-0000-000000000001',
  role = 'member'::public.user_role
WHERE id = '50000000-0000-0000-0000-000000000075';

UPDATE public.users
SET
  store_id = '00000000-0000-0000-0000-000000000001',
  role = 'admin'::public.user_role
WHERE id = '50000000-0000-0000-0000-000000000076';

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"50000000-0000-0000-0000-000000000075"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.manage_store_line_connection(
    'connect',
    '3000000001',
    'Bookr 測試 Provider',
    'Bookr 測試官方帳號',
    '@bookr-test',
    '2000000001',
    '2000000001-LineQaOne'
  ) ->> 'error',
  'FORBIDDEN',
  '一般成員無法建立 LINE 串接'
);

RESET ROLE;

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"50000000-0000-0000-0000-000000000076"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.manage_store_line_connection(
    'connect',
    '3000000001',
    'Bookr 測試 Provider',
    'Bookr 測試官方帳號',
    '@bookr-test',
    '2000000001',
    '2000000001-LineQaOne'
  ) ->> 'mode',
  'connected',
  '管理員可建立第一版 LINE 串接'
);

SELECT extensions.ok(
  EXISTS (
    SELECT 1
    FROM public.stores
    WHERE id = '00000000-0000-0000-0000-000000000001'
      AND line_login_channel_id = '2000000001'
      AND liff_id = '2000000001-LineQaOne'
  ),
  '建立串接時同步 stores 有效設定快取'
);

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.store_channel_connections WHERE status = 'active'),
  1::BIGINT,
  '同店家同渠道只有一筆有效串接'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE action = 'line_connection_connected'
      AND store_id = '00000000-0000-0000-0000-000000000001'
  ),
  1::BIGINT,
  '首次串接寫入審計紀錄'
);

SELECT extensions.is(
  public.manage_store_line_connection(
    'connect',
    '3000000001',
    'Bookr 測試 Provider',
    '另一個官方帳號',
    '@bookr-other',
    '2000000002',
    '2000000002-LineQaTwo'
  ) ->> 'error',
  'DISCONNECT_REQUIRED',
  '有效串接不得直接被另一組 Channel 覆蓋'
);

RESET ROLE;

INSERT INTO public.clients (
  id,
  full_name,
  phone,
  store_id
) VALUES (
  '30000000-0000-0000-0000-000000000076',
  'LINE 串接遷移客戶',
  '0911000076',
  '00000000-0000-0000-0000-000000000001'
);

INSERT INTO public.customer_channel_identities (
  id,
  store_id,
  client_id,
  channel,
  provider_account_id,
  provider_user_id,
  display_name
) VALUES (
  '70000000-0000-0000-0000-000000000076',
  '00000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000076',
  'line',
  '2000000001',
  'U76767676767676767676767676767676',
  'LINE 串接遷移客戶'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"50000000-0000-0000-0000-000000000076"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.manage_store_line_connection('disconnect') ->> 'mode',
  'disconnected',
  '管理員可解除目前 LINE 串接'
);

SELECT extensions.ok(
  EXISTS (
    SELECT 1
    FROM public.stores
    WHERE id = '00000000-0000-0000-0000-000000000001'
      AND line_login_channel_id IS NULL
      AND liff_id IS NULL
  ),
  '解除時清空 LINE 有效設定快取'
);

SELECT extensions.ok(
  (
    SELECT booking_enabled
    FROM public.stores
    WHERE id = '00000000-0000-0000-0000-000000000001'
  ),
  '解除 LINE 不停用一般網頁預約'
);

SELECT extensions.is(
  (
    SELECT status
    FROM public.store_channel_connections
    WHERE connection_version = 1
  ),
  'disconnected',
  '解除會封存第一版串接歷史'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.customer_channel_identities
    WHERE id = '70000000-0000-0000-0000-000000000076'
      AND deleted_at IS NULL
  ),
  1::BIGINT,
  '單純解除不刪除或封存既有客戶 LINE 身分'
);

SELECT extensions.is(
  public.manage_store_line_connection(
    'connect',
    '3000000001',
    'Bookr 測試 Provider',
    'Bookr 同 Provider 新官方帳號',
    '@bookr-same-provider',
    '2000000002',
    '2000000002-LineQaTwo'
  ) ->> 'same_provider',
  'true',
  '相同 Provider 重綁會被正確辨識'
);

SELECT extensions.is(
  (
    SELECT provider_account_id
    FROM public.customer_channel_identities
    WHERE id = '70000000-0000-0000-0000-000000000076'
  ),
  '2000000002',
  '同 Provider 重綁會遷移既有 LINE 身分至新 Channel'
);

SELECT extensions.is(
  (
    SELECT connection_version
    FROM public.store_channel_connections
    WHERE status = 'active'
  ),
  2,
  '同 Provider 重綁建立第二版有效串接'
);

SELECT extensions.is(
  public.manage_store_line_connection('disconnect') ->> 'mode',
  'disconnected',
  '第二版串接可正常解除'
);

SELECT extensions.is(
  public.manage_store_line_connection(
    'connect',
    '3000000002',
    '另一個 Provider',
    '跨 Provider 官方帳號',
    '@bookr-other-provider',
    '2000000003',
    '2000000003-LineQaThree'
  ) ->> 'same_provider',
  'false',
  '不同 Provider 重綁會被正確辨識'
);

RESET ROLE;

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.customer_channel_identities
    WHERE id = '70000000-0000-0000-0000-000000000076'
      AND deleted_at IS NOT NULL
  ),
  1::BIGINT,
  '跨 Provider 重綁會軟封存舊 LINE 身分'
);

SELECT extensions.is(
  (
    SELECT connection_version
    FROM public.store_channel_connections
    WHERE store_id = '00000000-0000-0000-0000-000000000001'
      AND status = 'active'
  ),
  3,
  '跨 Provider 重綁建立第三版有效串接'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE store_id = '00000000-0000-0000-0000-000000000001'
      AND table_name = 'store_channel_connections'
  ),
  5::BIGINT,
  '串接、兩次解除及兩次重綁全部寫入審計紀錄'
);

INSERT INTO public.store_channel_connections (
  store_id,
  channel,
  provider_id,
  provider_name,
  official_account_name,
  login_channel_id,
  liff_id,
  connection_version,
  status,
  created_by
) VALUES (
  '00000000-0000-0000-0000-000000000088',
  'line',
  '3000000088',
  '其他店家 Provider',
  '其他店家官方帳號',
  '2000000088',
  '2000000088-OtherStore',
  1,
  'active',
  '50000000-0000-0000-0000-000000000074'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"50000000-0000-0000-0000-000000000076"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.store_channel_connections),
  3::BIGINT,
  '店家一管理員只能看到自己店家的三版串接歷史'
);

RESET ROLE;

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"50000000-0000-0000-0000-000000000075"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.store_channel_connections),
  0::BIGINT,
  '一般成員不可讀取官方 LINE 串接設定與歷史'
);

RESET ROLE;

SELECT * FROM extensions.finish();

ROLLBACK;
