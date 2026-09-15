BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(25);

INSERT INTO public.stores (
  id, name, booking_enabled, booking_confirmation_mode, timezone
) VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    '站內通知測試店家', TRUE, 'manual', 'Asia/Taipei'
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    '站內通知隔離店家', TRUE, 'manual', 'Asia/Taipei'
  );

INSERT INTO public.practitioners (
  id, full_name, color, active, store_id
) VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    '通知測試老師', '#6366F1', TRUE,
    'a0000000-0000-0000-0000-000000000001'
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    '隔離店家老師', '#84CC16', TRUE,
    'a0000000-0000-0000-0000-000000000002'
  );

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    'a2000000-0000-0000-0000-000000000001',
    'notification-admin@example.test',
    '{"full_name":"通知管理員"}'::JSONB
  ),
  (
    'a2000000-0000-0000-0000-000000000002',
    'notification-practitioner@example.test',
    '{"full_name":"通知老師帳號"}'::JSONB
  ),
  (
    'a2000000-0000-0000-0000-000000000003',
    'notification-unassigned@example.test',
    '{"full_name":"未指派一般成員"}'::JSONB
  ),
  (
    'a2000000-0000-0000-0000-000000000004',
    'notification-other-store@example.test',
    '{"full_name":"其他店家管理員"}'::JSONB
  );

UPDATE public.users
SET store_id = 'a0000000-0000-0000-0000-000000000001',
    role = 'admin'::public.user_role,
    practitioner_id = NULL
WHERE id = 'a2000000-0000-0000-0000-000000000001';

UPDATE public.users
SET store_id = 'a0000000-0000-0000-0000-000000000001',
    role = 'member'::public.user_role,
    practitioner_id = 'a1000000-0000-0000-0000-000000000001'
WHERE id = 'a2000000-0000-0000-0000-000000000002';

UPDATE public.users
SET store_id = 'a0000000-0000-0000-0000-000000000001',
    role = 'member'::public.user_role,
    practitioner_id = NULL
WHERE id = 'a2000000-0000-0000-0000-000000000003';

UPDATE public.users
SET store_id = 'a0000000-0000-0000-0000-000000000002',
    role = 'admin'::public.user_role,
    practitioner_id = NULL
WHERE id = 'a2000000-0000-0000-0000-000000000004';

INSERT INTO public.clients (id, full_name, phone, store_id)
VALUES
  (
    'a3000000-0000-0000-0000-000000000001',
    '通知測試客戶', '0912000001',
    'a0000000-0000-0000-0000-000000000001'
  ),
  (
    'a3000000-0000-0000-0000-000000000002',
    '隔離店家客戶', '0912000002',
    'a0000000-0000-0000-0000-000000000002'
  );

INSERT INTO public.services (
  id, name, duration_minutes, price, active, store_id
) VALUES
  (
    'a4000000-0000-0000-0000-000000000001',
    '即時通知課程', 60, 1800, TRUE,
    'a0000000-0000-0000-0000-000000000001'
  ),
  (
    'a4000000-0000-0000-0000-000000000002',
    '隔離店家課程', 60, 1200, TRUE,
    'a0000000-0000-0000-0000-000000000002'
  );

SELECT extensions.ok(
  (
    SELECT class.relrowsecurity
    FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relname = 'in_app_notifications'
  ),
  '站內通知資料表已啟用 RLS'
);

SELECT extensions.ok(
  NOT has_table_privilege('anon', 'public.in_app_notifications', 'SELECT'),
  '匿名使用者不可讀取站內通知'
);

SELECT extensions.ok(
  NOT has_table_privilege('authenticated', 'public.in_app_notifications', 'UPDATE'),
  '登入使用者不可直接更新通知內容'
);

SELECT extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.mark_in_app_notification_read(uuid)',
    'EXECUTE'
  ),
  '登入使用者可執行自己的已讀函式'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.mark_in_app_notification_read(uuid)',
    'EXECUTE'
  ),
  '匿名使用者不可執行已讀函式'
);

-- 模擬客戶端建立：沒有登入者，created_by_user_id 維持 NULL。
INSERT INTO public.bookings (
  id, client_id, practitioner_id, service_id,
  start_time, end_time, status, store_id, price, source
) VALUES (
  'a5000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  '2026-09-20T02:00:00Z', '2026-09-20T03:00:00Z',
  'pending'::public.booking_status,
  'a0000000-0000-0000-0000-000000000001',
  1800, 'web'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.in_app_notifications
    WHERE booking_id = 'a5000000-0000-0000-0000-000000000001'
  ),
  2::BIGINT,
  '客戶預約通知建立給同店管理員與指派成員'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.in_app_notifications
    WHERE booking_id = 'a5000000-0000-0000-0000-000000000001'
      AND recipient_user_id = 'a2000000-0000-0000-0000-000000000003'
  ),
  0::BIGINT,
  '未指派一般成員不會收到預約明細'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.in_app_notifications
    WHERE booking_id = 'a5000000-0000-0000-0000-000000000001'
      AND recipient_user_id = 'a2000000-0000-0000-0000-000000000004'
  ),
  0::BIGINT,
  '其他店家管理員不會收到通知'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.in_app_notifications
    WHERE booking_id = 'a5000000-0000-0000-0000-000000000001'
      AND action_required
      AND resolved_at IS NULL
  ),
  2::BIGINT,
  '人工確認模式的新預約標示為待處理'
);

SELECT extensions.is(
  (
    SELECT MIN(title)
    FROM public.in_app_notifications
    WHERE booking_id = 'a5000000-0000-0000-0000-000000000001'
  ),
  '新預約待確認',
  '待確認通知使用正確標題'
);

SELECT extensions.is(
  (
    SELECT MIN(payload_snapshot ->> 'service_name')
    FROM public.in_app_notifications
    WHERE booking_id = 'a5000000-0000-0000-0000-000000000001'
  ),
  '即時通知課程',
  '通知保存必要的顯示快照'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.in_app_notifications),
  1::BIGINT,
  '管理員透過 RLS 只能讀取自己的通知副本'
);

SELECT extensions.ok(
  public.mark_in_app_notification_read(
    (
      SELECT id
      FROM public.in_app_notifications
      WHERE booking_id = 'a5000000-0000-0000-0000-000000000001'
    )
  ),
  '管理員可標記自己的通知為已讀'
);

SELECT extensions.ok(
  NOT public.mark_in_app_notification_read(
    (
      SELECT id
      FROM public.in_app_notifications
      WHERE recipient_user_id = 'a2000000-0000-0000-0000-000000000002'
    )
  ),
  '管理員不可標記其他收件者的通知'
);

RESET ROLE;

SELECT extensions.ok(
  (
    SELECT read_at IS NOT NULL
    FROM public.in_app_notifications
    WHERE booking_id = 'a5000000-0000-0000-0000-000000000001'
      AND recipient_user_id = 'a2000000-0000-0000-0000-000000000001'
  ),
  '自己的已讀時間已持久保存'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-0000-0000-000000000002"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.in_app_notifications),
  1::BIGINT,
  '指派成員可以讀取自己的預約通知'
);

SELECT extensions.is(
  public.mark_all_in_app_notifications_read(),
  1,
  '指派成員可以一次標記全部通知為已讀'
);

RESET ROLE;

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-0000-0000-000000000003"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.in_app_notifications),
  0::BIGINT,
  '未指派一般成員無法讀取其他人的通知'
);

RESET ROLE;

-- 模擬後台登入人員建立預約，建立者 trigger 應寫入登入使用者並略過通知。
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a2000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

INSERT INTO public.bookings (
  id, client_id, practitioner_id, service_id,
  start_time, end_time, status, store_id, price, source
) VALUES (
  'a5000000-0000-0000-0000-000000000002',
  'a3000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  '2026-09-21T02:00:00Z', '2026-09-21T03:00:00Z',
  'pending'::public.booking_status,
  'a0000000-0000-0000-0000-000000000001',
  1800, 'web'
);

RESET ROLE;

SELECT extensions.is(
  (
    SELECT created_by_user_id
    FROM public.bookings
    WHERE id = 'a5000000-0000-0000-0000-000000000002'
  ),
  'a2000000-0000-0000-0000-000000000001'::UUID,
  '後台預約會保存建立者'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.in_app_notifications
    WHERE booking_id = 'a5000000-0000-0000-0000-000000000002'
  ),
  0::BIGINT,
  '後台人工新增預約不產生站內提醒'
);

-- 自動確認的客戶預約仍建立資訊通知，但不是待處理項目。
SELECT SET_CONFIG('request.jwt.claims', '{"role":"anon"}', TRUE);

INSERT INTO public.bookings (
  id, client_id, practitioner_id, service_id,
  start_time, end_time, status, store_id, price, source
) VALUES (
  'a5000000-0000-0000-0000-000000000003',
  'a3000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  '2026-09-22T02:00:00Z', '2026-09-22T03:00:00Z',
  'confirmed'::public.booking_status,
  'a0000000-0000-0000-0000-000000000001',
  1800, 'line'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.in_app_notifications
    WHERE booking_id = 'a5000000-0000-0000-0000-000000000003'
  ),
  2::BIGINT,
  '自動確認客戶預約仍建立資訊通知'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.in_app_notifications
    WHERE booking_id = 'a5000000-0000-0000-0000-000000000003'
      AND NOT action_required
      AND resolved_at IS NOT NULL
  ),
  2::BIGINT,
  '自動確認通知不列入待處理'
);

UPDATE public.bookings
SET status = 'confirmed'::public.booking_status
WHERE id = 'a5000000-0000-0000-0000-000000000001';

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.in_app_notifications
    WHERE booking_id = 'a5000000-0000-0000-0000-000000000001'
      AND resolved_at IS NOT NULL
  ),
  2::BIGINT,
  '預約確認後所有收件者通知都改為已處理'
);

UPDATE public.bookings
SET status = 'pending'::public.booking_status
WHERE id = 'a5000000-0000-0000-0000-000000000001';

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.in_app_notifications
    WHERE booking_id = 'a5000000-0000-0000-0000-000000000001'
      AND resolved_at IS NULL
  ),
  2::BIGINT,
  '預約改回待確認時重新列入待處理'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'realtime'
      AND tablename = 'messages'
      AND policyname = 'select_own_in_app_notification_broadcasts'
  ),
  1::BIGINT,
  '私人即時通知頻道已設定授權政策'
);

SELECT * FROM extensions.finish();

ROLLBACK;
