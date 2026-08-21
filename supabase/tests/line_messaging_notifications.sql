BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(43);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.notification_templates
    WHERE type IN (
      'booking_received'::public.notification_type,
      'booking_confirmed'::public.notification_type,
      'booking_cancelled'::public.notification_type,
      'booking_rescheduled'::public.notification_type,
      'reminder'::public.notification_type
    )
      AND POSITION(CHR(92) || 'n' IN content) > 0
  ),
  0::BIGINT,
  '交易通知範本不保留字面反斜線 n'
);

-- ------------------------------------------------------------
-- 權限與 RLS
-- ------------------------------------------------------------

SELECT extensions.ok(
  (
    SELECT class.relrowsecurity
    FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relname = 'line_notification_outbox'
  ),
  '通知 outbox 已啟用 RLS'
);

SELECT extensions.ok(
  NOT has_table_privilege('anon', 'public.line_notification_outbox', 'SELECT'),
  'anon 無法讀取通知 outbox'
);

SELECT extensions.ok(
  has_table_privilege('authenticated', 'public.line_notification_outbox', 'SELECT'),
  'authenticated 可在 RLS 下讀取通知狀態'
);

SELECT extensions.ok(
  NOT has_table_privilege('authenticated', 'public.line_notification_outbox', 'INSERT'),
  'authenticated 無法直接新增通知工作'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.configure_store_line_messaging(uuid,uuid,uuid,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'anon 無法設定 LINE Messaging 憑證'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'authenticated',
    'public.configure_store_line_messaging(uuid,uuid,uuid,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated 無法繞過 Edge Function 直接設定憑證'
);

SELECT extensions.ok(
  has_function_privilege(
    'service_role',
    'public.configure_store_line_messaging(uuid,uuid,uuid,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  '只有 service_role 可呼叫憑證設定 RPC'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.claim_line_notification_jobs(integer)',
    'EXECUTE'
  ),
  'anon 無法領取通知工作'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'authenticated',
    'public.claim_line_notification_jobs(integer)',
    'EXECUTE'
  ),
  'authenticated 無法領取通知工作或取得 Token'
);

SELECT extensions.ok(
  has_function_privilege(
    'service_role',
    'public.claim_line_notification_jobs(integer)',
    'EXECUTE'
  ),
  'service_role 可領取通知工作'
);

SELECT extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.get_store_line_messaging_status()',
    'EXECUTE'
  ),
  'authenticated 可讀取去敏 Messaging 狀態'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.get_store_line_messaging_status()',
    'EXECUTE'
  ),
  'anon 無法讀取 Messaging 狀態'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.enqueue_line_test_notification(uuid,uuid)',
    'EXECUTE'
  ),
  'anon 無法建立 LINE 測試推播'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'authenticated',
    'public.enqueue_line_test_notification(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated 無法繞過 Edge Function 建立測試推播'
);

SELECT extensions.ok(
  has_function_privilege(
    'service_role',
    'public.enqueue_line_test_notification(uuid,uuid)',
    'EXECUTE'
  ),
  'service_role 可建立已授權的測試推播'
);

-- ------------------------------------------------------------
-- 測試資料
-- ------------------------------------------------------------

INSERT INTO public.stores (id, name)
VALUES (
  '00000000-0000-0000-0000-000000000082',
  'LINE Messaging 隔離店家'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    '50000000-0000-0000-0000-000000000081',
    'line-messaging-admin@example.test',
    '{"full_name":"LINE Messaging 管理員"}'::JSONB
  ),
  (
    '50000000-0000-0000-0000-000000000082',
    'line-messaging-member@example.test',
    '{"full_name":"LINE Messaging 成員"}'::JSONB
  ),
  (
    '50000000-0000-0000-0000-000000000083',
    'line-messaging-other@example.test',
    '{"full_name":"其他店家管理員"}'::JSONB
  );

UPDATE public.users
SET
  store_id = '00000000-0000-0000-0000-000000000001',
  role = 'admin'::public.user_role
WHERE id = '50000000-0000-0000-0000-000000000081';

UPDATE public.users
SET
  store_id = '00000000-0000-0000-0000-000000000001',
  role = 'member'::public.user_role
WHERE id = '50000000-0000-0000-0000-000000000082';

UPDATE public.users
SET
  store_id = '00000000-0000-0000-0000-000000000082',
  role = 'admin'::public.user_role
WHERE id = '50000000-0000-0000-0000-000000000083';

INSERT INTO public.store_channel_connections (
  id,
  store_id,
  channel,
  provider_id,
  provider_name,
  official_account_name,
  official_account_basic_id,
  login_channel_id,
  liff_id,
  connection_version,
  status,
  created_by
) VALUES (
  '60000000-0000-0000-0000-000000000081',
  '00000000-0000-0000-0000-000000000001',
  'line',
  '3000000081',
  'LINE Messaging 測試 Provider',
  'LINE Messaging 測試官方帳號',
  '@bookrtest',
  '2000000081',
  '2000000081-BookrMessaging',
  1,
  'active',
  '50000000-0000-0000-0000-000000000081'
);

INSERT INTO public.services (
  id, name, duration_minutes, price, active, store_id
) VALUES (
  '10000000-0000-0000-0000-000000000081',
  'LINE 通知測試課程',
  60,
  1200,
  TRUE,
  '00000000-0000-0000-0000-000000000001'
);

INSERT INTO public.practitioners (
  id, full_name, color, active, store_id
) VALUES (
  '20000000-0000-0000-0000-000000000081',
  'LINE 通知測試老師',
  '#00B900',
  TRUE,
  '00000000-0000-0000-0000-000000000001'
);

INSERT INTO public.clients (id, full_name, phone, store_id)
VALUES (
  '30000000-0000-0000-0000-000000000081',
  'LINE 通知測試客戶',
  '0911888081',
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
  '70000000-0000-0000-0000-000000000081',
  '00000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000081',
  'line',
  '2000000081',
  'U81818181818181818181818181818181',
  'LINE 通知測試顯示名稱'
);

-- service_role 仍須提供有效的店家管理員 actor；不能冒用一般成員。
SELECT SET_CONFIG('request.jwt.claims', '{"role":"service_role"}', TRUE);
SET LOCAL ROLE service_role;

SELECT extensions.throws_ok(
  $$
    SELECT public.configure_store_line_messaging(
      '50000000-0000-0000-0000-000000000082',
      '00000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000081',
      '3000000081',
      '2000000082',
      'U82828282828282828282828282828282',
      '@bookrtest',
      'Bookr 測試機器人',
      'local-test-access-token-value',
      'local-test-channel-secret-value'
    )
  $$,
  '42501',
  'ADMIN_REQUIRED',
  '一般成員不能被當成 Messaging 設定操作者'
);

SELECT extensions.is(
  public.configure_store_line_messaging(
    '50000000-0000-0000-0000-000000000081',
    '00000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000081',
    '3000000081',
    '2000000082',
    'U82828282828282828282828282828282',
    '@bookrtest',
    'Bookr 測試機器人',
    'local-test-access-token-value',
    'local-test-channel-secret-value'
  ) ->> 'status',
  'active',
  '管理員驗證後可建立 Messaging 串接'
);

RESET ROLE;

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM vault.decrypted_secrets
    WHERE name LIKE 'line_%_00000000-0000-0000-0000-000000000001_%'
  ),
  2::BIGINT,
  'Token 與 Channel Secret 分別存入 Vault'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"50000000-0000-0000-0000-000000000081"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT messaging_channel_id FROM public.get_store_line_messaging_status()),
  '2000000082',
  '管理員可讀取去敏 Messaging metadata'
);

RESET ROLE;

-- ------------------------------------------------------------
-- 預約事件、去重與可送達性
-- ------------------------------------------------------------

INSERT INTO public.bookings (
  id,
  client_id,
  practitioner_id,
  service_id,
  start_time,
  end_time,
  status,
  store_id
) VALUES (
  '80000000-0000-0000-0000-000000000081',
  '30000000-0000-0000-0000-000000000081',
  '20000000-0000-0000-0000-000000000081',
  '10000000-0000-0000-0000-000000000081',
  NOW() + INTERVAL '2 days',
  NOW() + INTERVAL '2 days 1 hour',
  'pending',
  '00000000-0000-0000-0000-000000000001'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.line_notification_outbox
    WHERE booking_id = '80000000-0000-0000-0000-000000000081'
      AND event_type = 'booking_received'
  ),
  1::BIGINT,
  '人工確認預約建立一次收到申請通知'
);

UPDATE public.bookings
SET status = 'confirmed'
WHERE id = '80000000-0000-0000-0000-000000000081';

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.line_notification_outbox
    WHERE booking_id = '80000000-0000-0000-0000-000000000081'
      AND event_type = 'booking_confirmed'
  ),
  1::BIGINT,
  '首次確認建立一次確認通知'
);

UPDATE public.bookings
SET status = 'confirmed'
WHERE id = '80000000-0000-0000-0000-000000000081';

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.line_notification_outbox
    WHERE booking_id = '80000000-0000-0000-0000-000000000081'
  ),
  2::BIGINT,
  '重放相同確認狀態不會建立重複通知'
);

UPDATE public.bookings
SET
  start_time = start_time + INTERVAL '1 hour',
  end_time = end_time + INTERVAL '1 hour'
WHERE id = '80000000-0000-0000-0000-000000000081';

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.line_notification_outbox
    WHERE booking_id = '80000000-0000-0000-0000-000000000081'
      AND event_type = 'booking_rescheduled'
  ),
  1::BIGINT,
  '改期建立一次異動通知'
);

UPDATE public.bookings
SET status = 'cancelled'
WHERE id = '80000000-0000-0000-0000-000000000081';

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.line_notification_outbox
    WHERE booking_id = '80000000-0000-0000-0000-000000000081'
      AND event_type = 'booking_cancelled'
  ),
  1::BIGINT,
  '取消建立一次取消通知'
);

SELECT SET_CONFIG('request.jwt.claims', '{"role":"service_role"}', TRUE);
SET LOCAL ROLE service_role;

SELECT extensions.is(
  public.record_line_webhook_event(
    '60000000-0000-0000-0000-000000000081',
    'webhook-unfollow-81',
    'unfollow',
    'U81818181818181818181818181818181'
  ) ->> 'identities_updated',
  '1',
  'unfollow Webhook 將身分標記為不可送達'
);

RESET ROLE;

INSERT INTO public.bookings (
  id,
  client_id,
  practitioner_id,
  service_id,
  start_time,
  end_time,
  status,
  store_id
) VALUES (
  '80000000-0000-0000-0000-000000000082',
  '30000000-0000-0000-0000-000000000081',
  '20000000-0000-0000-0000-000000000081',
  '10000000-0000-0000-0000-000000000081',
  NOW() + INTERVAL '3 days',
  NOW() + INTERVAL '3 days 1 hour',
  'pending',
  '00000000-0000-0000-0000-000000000001'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.line_notification_outbox
    WHERE booking_id = '80000000-0000-0000-0000-000000000082'
  ),
  0::BIGINT,
  '已知非好友不建立新通知工作'
);

SELECT SET_CONFIG('request.jwt.claims', '{"role":"service_role"}', TRUE);
SET LOCAL ROLE service_role;

SELECT extensions.is(
  public.record_line_webhook_event(
    '60000000-0000-0000-0000-000000000081',
    'webhook-follow-81',
    'follow',
    'U81818181818181818181818181818181'
  ) ->> 'identities_updated',
  '1',
  'follow Webhook 恢復身分可送達狀態'
);

SELECT extensions.is(
  public.record_line_webhook_event(
    '60000000-0000-0000-0000-000000000081',
    'webhook-follow-81',
    'follow',
    'U81818181818181818181818181818181'
  ) ->> 'duplicate',
  'true',
  '相同 Webhook event ID 重送會被安全去重'
);

CREATE TEMP TABLE enqueued_line_test_job ON COMMIT DROP AS
SELECT public.enqueue_line_test_notification(
  '50000000-0000-0000-0000-000000000081',
  '70000000-0000-0000-0000-000000000081'
) AS job_id;

RESET ROLE;

SELECT extensions.ok(
  (SELECT job_id IS NOT NULL FROM enqueued_line_test_job),
  '管理員可對同店且可送達的 LINE 身分建立測試推播'
);

SELECT extensions.ok(
  (
    SELECT event_type = 'test'::public.notification_type
      AND booking_id IS NULL
      AND payload_snapshot ? 'message'
      AND NOT payload_snapshot ? 'channel_access_token'
      AND NOT payload_snapshot ? 'channel_secret'
    FROM public.line_notification_outbox
    WHERE id = (SELECT job_id FROM enqueued_line_test_job)
  ),
  '測試推播寫入 outbox 且 payload 不含憑證'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE record_id = (SELECT job_id FROM enqueued_line_test_job)
      AND action = 'SEND_TEST'
      AND store_id = '00000000-0000-0000-0000-000000000001'
  ),
  1::BIGINT,
  '測試推播留下同店審計紀錄'
);

SELECT SET_CONFIG('request.jwt.claims', '{"role":"service_role"}', TRUE);
SET LOCAL ROLE service_role;

SELECT extensions.throws_ok(
  $$
    SELECT public.enqueue_line_test_notification(
      '50000000-0000-0000-0000-000000000083',
      '70000000-0000-0000-0000-000000000081'
    )
  $$,
  'P0002',
  'LINE_IDENTITY_NOT_REACHABLE',
  '其他店家管理員不能對本店 LINE 身分建立測試推播'
);

RESET ROLE;

UPDATE public.customer_channel_identities
SET
  friend_status = 'not_friend',
  notifications_reachable = FALSE,
  friend_status_updated_at = NOW()
WHERE id = '70000000-0000-0000-0000-000000000081';

SELECT SET_CONFIG('request.jwt.claims', '{"role":"service_role"}', TRUE);
SET LOCAL ROLE service_role;

SELECT extensions.throws_ok(
  $$
    SELECT public.enqueue_line_test_notification(
      '50000000-0000-0000-0000-000000000081',
      '70000000-0000-0000-0000-000000000081'
    )
  $$,
  'P0002',
  'LINE_IDENTITY_NOT_REACHABLE',
  '未加好友或已封鎖身分不能建立測試推播'
);

RESET ROLE;

UPDATE public.customer_channel_identities
SET
  friend_status = 'friend',
  notifications_reachable = TRUE,
  friend_status_updated_at = NOW()
WHERE id = '70000000-0000-0000-0000-000000000081';

INSERT INTO public.bookings (
  id,
  client_id,
  practitioner_id,
  service_id,
  start_time,
  end_time,
  status,
  store_id
) VALUES (
  '80000000-0000-0000-0000-000000000083',
  '30000000-0000-0000-0000-000000000081',
  '20000000-0000-0000-0000-000000000081',
  '10000000-0000-0000-0000-000000000081',
  NOW() + INTERVAL '24 hours 2 minutes',
  NOW() + INTERVAL '25 hours 2 minutes',
  'confirmed',
  '00000000-0000-0000-0000-000000000001'
);

SELECT SET_CONFIG('request.jwt.claims', '{"role":"service_role"}', TRUE);
SET LOCAL ROLE service_role;

SELECT extensions.is(
  public.enqueue_line_reminders(NOW(), 5),
  1,
  '24 小時提醒視窗建立一筆 reminder 工作'
);

SELECT extensions.is(
  public.enqueue_line_reminders(NOW(), 5),
  0,
  '重複掃描提醒視窗不會重複建立工作'
);

CREATE TEMP TABLE claimed_line_jobs ON COMMIT DROP AS
SELECT * FROM public.claim_line_notification_jobs(1);

SELECT extensions.ok(
  (
    SELECT COUNT(*) = 1
      AND BOOL_AND(CHAR_LENGTH(channel_access_token) > 20)
      AND BOOL_AND(attempt_count = 1)
    FROM claimed_line_jobs
  ),
  'Worker 原子領取一筆工作並取得 Vault Token，不輸出秘密'
);

SELECT extensions.ok(
  public.complete_line_notification_job(
    (SELECT job_id FROM claimed_line_jobs),
    'local-line-request-id'
  ),
  'Worker 可將 processing 工作完成為 sent'
);

RESET ROLE;

-- 店家二管理員看不到店家一通知。
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"50000000-0000-0000-0000-000000000083"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.line_notification_outbox),
  0::BIGINT,
  'outbox RLS 阻擋跨店通知資料'
);

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.get_store_line_messaging_status()),
  0::BIGINT,
  'Messaging 狀態 RPC 阻擋跨店資料'
);

RESET ROLE;

UPDATE public.notification_settings
SET booking_rescheduled_enabled = FALSE
WHERE store_id = '00000000-0000-0000-0000-000000000001';

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.line_notification_outbox
    WHERE store_id = '00000000-0000-0000-0000-000000000001'
      AND event_type = 'booking_rescheduled'
      AND status IN ('pending', 'retry', 'processing')
  ),
  0::BIGINT,
  '關閉通知開關會略過同類型既有待送工作'
);

-- 解除官方 LINE 連線後，秘密停用且未送工作全部略過。
UPDATE public.store_channel_connections
SET
  status = 'disconnected',
  disconnected_at = NOW(),
  disconnected_by = '50000000-0000-0000-0000-000000000081'
WHERE id = '60000000-0000-0000-0000-000000000081';

SELECT extensions.is(
  (
    SELECT status
    FROM private.store_line_messaging_credentials
    WHERE store_id = '00000000-0000-0000-0000-000000000001'
  ),
  'disconnected',
  '解除官方 LINE 連線會停用 Messaging 憑證參照'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.line_notification_outbox
    WHERE connection_id = '60000000-0000-0000-0000-000000000081'
      AND status IN ('pending', 'retry', 'processing')
  ),
  0::BIGINT,
  '解除串接後不留下可繼續發送的工作'
);

SELECT * FROM extensions.finish();

ROLLBACK;
