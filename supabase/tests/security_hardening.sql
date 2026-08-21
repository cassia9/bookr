BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(34);

-- ============================================================
-- 結構檢查：SECURITY DEFINER、RPC 白名單、GRANT、RLS
-- ============================================================

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT (
        COALESCE(p.proconfig, ARRAY[]::TEXT[])
          @> ARRAY['search_path=""']
      )
  ),
  0::BIGINT,
  '所有 SECURITY DEFINER 函式都有空 search_path'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  5::BIGINT,
  'anon 只有五支公開 RPC'
);

SELECT extensions.ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname <> ALL (ARRAY[
        'get_store_by_code',
        'get_store_by_slug',
        'get_available_slots',
        'create_booking_public',
        'validate_invitation_token'
      ])
  ),
  'anon RPC 全部位於公開白名單'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  18::BIGINT,
  'authenticated 只有十八支必要 RPC／輔助函式'
);

SELECT extensions.ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.proname <> ALL (ARRAY[
        'get_store_by_code',
        'get_store_by_slug',
        'get_available_slots',
        'create_booking_public',
        'validate_invitation_token',
        'current_store_id',
        'get_current_store_id',
        'is_admin',
        'current_practitioner_id',
        'upsert_booking',
        'search_clients',
        'get_client_bookings',
        'get_dashboard_kpi',
        'get_practitioner_stats',
        'get_service_stats',
        'get_daily_stats',
        'manage_store_line_connection',
        'get_store_line_messaging_status'
      ])
  ),
  'authenticated RPC 全部位於白名單'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')
  ),
  15::BIGINT,
  'service_role 只有邀請、LINE 預約與 Messaging Worker 必要 RPC'
);

SELECT extensions.ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND p.proname <> ALL (ARRAY[
        'validate_invitation_token',
        'claim_member_invitation',
        'release_member_invitation_claim',
        'complete_member_invitation',
        'claim_invitation_email_send',
        'finish_invitation_email_send',
        'create_line_booking',
        'configure_store_line_messaging',
        'enqueue_line_reminders',
        'claim_line_notification_jobs',
        'complete_line_notification_job',
        'retry_line_notification_job',
        'skip_line_notification_job',
        'get_line_webhook_config',
        'record_line_webhook_event'
      ])
  ),
  'service_role RPC 全部位於後端工作白名單'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'upsert_booking',
        'search_clients',
        'get_client_bookings'
      ])
      AND NOT p.prosecdef
  ),
  3::BIGINT,
  '三支後台資料 RPC 使用 SECURITY INVOKER'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY (ARRAY[
        'stores',
        'users',
        'practitioners',
        'clients',
        'services',
        'bookings',
        'notification_settings',
        'notification_templates',
        'pending_invitations',
        'practitioner_blocks',
        'practitioner_leaves',
        'practitioner_services',
        'audit_logs',
        'store_channel_connections',
        'customer_channel_identities',
        'line_notification_outbox'
      ])
      AND c.relrowsecurity
  ),
  16::BIGINT,
  '十六張核心資料表全部啟用 RLS'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND policyname = ANY (ARRAY[
        'users_store_isolation',
        'practitioners_store_isolation',
        'clients_store_isolation',
        'services_store_isolation',
        'bookings_admin_all',
        'allow_all_authenticated',
        'member_view_bookings',
        'authenticated can manage blocks'
      ])
  ),
  0::BIGINT,
  '可能繞過角色限制的舊 permissive policies 已移除'
);

SELECT extensions.is(
  (
    SELECT COUNT(DISTINCT table_name)
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee = 'anon'
      AND privilege_type = 'SELECT'
  ),
  3::BIGINT,
  'anon 只可 SELECT 三張公開資料表'
);

SELECT extensions.ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee = 'anon'
      AND table_name <> ALL (ARRAY['stores', 'services', 'practitioners'])
  ),
  'anon 沒有其他資料表權限'
);

SELECT extensions.ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee = 'anon'
      AND privilege_type <> 'SELECT'
  ),
  'anon 沒有任何資料寫入權限'
);

SELECT extensions.ok(
  has_column_privilege('authenticated', 'public.users', 'full_name', 'UPDATE'),
  '登入用戶可更新自己的姓名欄位'
);

SELECT extensions.ok(
  NOT has_column_privilege('authenticated', 'public.users', 'role', 'UPDATE'),
  '登入用戶不可更新自己的角色欄位'
);

SELECT extensions.ok(
  NOT has_column_privilege('authenticated', 'public.users', 'store_id', 'UPDATE'),
  '登入用戶不可更新自己的店家欄位'
);

SELECT extensions.ok(
  to_regprocedure('public.get_booking_confirmation(uuid)') IS NULL,
  '未使用且洩露電話的公開確認 RPC 已移除'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'get_dashboard_kpi',
        'get_practitioner_stats',
        'get_service_stats',
        'get_daily_stats'
      ])
      AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%public.is_admin()%'
  ),
  4::BIGINT,
  '四支統計 RPC 全部包含管理員檢查'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'get_store_by_code',
        'get_store_by_slug',
        'get_available_slots',
        'create_booking_public',
        'create_line_booking'
      ])
      AND p.prosecdef
      AND COALESCE(p.proconfig, ARRAY[]::TEXT[])
        @> ARRAY['search_path=""']
  ),
  5::BIGINT,
  '公開查詢與兩支預約 RPC 均為固定安全路徑的 SECURITY DEFINER'
);

SELECT extensions.ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'set_updated_at',
        'handle_new_auth_user',
        'audit_member_events',
        'generate_store_code',
        'update_clients_updated_at',
        'update_users_updated_at'
      ])
      AND (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
  ),
  '觸發器函式不可由 API 角色直接執行'
);

-- ============================================================
-- 行為檢查：建立兩家店、管理員與一般成員測試資料
-- ============================================================

INSERT INTO public.stores (id, name)
VALUES ('00000000-0000-0000-0000-000000000002', '測試店家二');

INSERT INTO public.services (
  id, name, duration_minutes, price, active, store_id
) VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    '店家一課程', 60, 1000, TRUE,
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '店家二課程', 60, 1200, TRUE,
    '00000000-0000-0000-0000-000000000002'
  );

INSERT INTO public.practitioners (
  id, full_name, color, active, store_id
) VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '店家一成員老師', '#111111', TRUE,
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '店家一其他老師', '#222222', TRUE,
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '店家二成員老師', '#333333', TRUE,
    '00000000-0000-0000-0000-000000000002'
  );

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    '50000000-0000-0000-0000-000000000001',
    'member-one@example.test',
    '{"full_name":"店家一成員"}'::JSONB
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    'admin-one@example.test',
    '{"full_name":"店家一管理員"}'::JSONB
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    'member-two@example.test',
    '{"full_name":"店家二成員"}'::JSONB
  );

UPDATE public.users
SET
  store_id = '00000000-0000-0000-0000-000000000001',
  role = 'member'::public.user_role,
  practitioner_id = '20000000-0000-0000-0000-000000000001'
WHERE id = '50000000-0000-0000-0000-000000000001';

UPDATE public.users
SET
  store_id = '00000000-0000-0000-0000-000000000001',
  role = 'admin'::public.user_role,
  practitioner_id = NULL
WHERE id = '50000000-0000-0000-0000-000000000002';

UPDATE public.users
SET
  store_id = '00000000-0000-0000-0000-000000000002',
  role = 'member'::public.user_role,
  practitioner_id = '20000000-0000-0000-0000-000000000003'
WHERE id = '50000000-0000-0000-0000-000000000003';

INSERT INTO public.clients (id, full_name, phone, store_id)
VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    '店家一客戶甲', '0900000001',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '店家一客戶乙', '0900000002',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '店家二客戶', '0900000003',
    '00000000-0000-0000-0000-000000000002'
  );

INSERT INTO public.bookings (
  id,
  client_id,
  practitioner_id,
  service_id,
  start_time,
  end_time,
  status,
  price,
  store_id
) VALUES
  (
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    DATE_TRUNC('month', NOW()) + INTERVAL '5 days 9 hours',
    DATE_TRUNC('month', NOW()) + INTERVAL '5 days 10 hours',
    'confirmed'::public.booking_status,
    1000,
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    DATE_TRUNC('month', NOW()) + INTERVAL '6 days 9 hours',
    DATE_TRUNC('month', NOW()) + INTERVAL '6 days 10 hours',
    'confirmed'::public.booking_status,
    1000,
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000002',
    DATE_TRUNC('month', NOW()) + INTERVAL '5 days 11 hours',
    DATE_TRUNC('month', NOW()) + INTERVAL '5 days 12 hours',
    'confirmed'::public.booking_status,
    1200,
    '00000000-0000-0000-0000-000000000002'
  );

INSERT INTO public.pending_invitations (
  id,
  email,
  role,
  token,
  store_id,
  created_by,
  expires_at
) VALUES
  (
    '60000000-0000-0000-0000-000000000001',
    'delete-invitation@example.test',
    'member'::public.user_role,
    '70000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    NOW() + INTERVAL '1 day'
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    'send-invitation@example.test',
    'member'::public.user_role,
    '70000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    NOW() + INTERVAL '1 day'
  );

-- 店家一一般成員：只能看到自己的預約及其客戶。
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.bookings),
  1::BIGINT,
  '一般成員只能看到自己的預約'
);

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.clients),
  1::BIGINT,
  '一般成員只能看到自己預約關聯的客戶'
);

SELECT extensions.is(
  (SELECT month_bookings FROM public.get_dashboard_kpi()),
  0::BIGINT,
  '一般成員無法取得店家營運統計'
);

SELECT extensions.throws_ok(
  $$
    SELECT public.upsert_booking(
      NULL,
      '30000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      DATE_TRUNC('month', NOW()) + INTERVAL '7 days 9 hours',
      DATE_TRUNC('month', NOW()) + INTERVAL '7 days 10 hours',
      0,
      'member should not write',
      '00000000-0000-0000-0000-000000000001',
      1000
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "bookings"',
  '一般成員不可透過 upsert_booking 寫入預約'
);

RESET ROLE;

-- 店家一管理員：能看到同店全部預約及統計，但看不到店家二。
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000002","role":"authenticated"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.bookings),
  2::BIGINT,
  '管理員能看到自己店家的全部預約'
);

SELECT extensions.is(
  (SELECT month_bookings FROM public.get_dashboard_kpi()),
  2::BIGINT,
  '管理員能取得自己店家的營運統計'
);

SELECT extensions.lives_ok(
  $$
    UPDATE public.bookings
    SET notes = 'admin update test'
    WHERE id = '40000000-0000-0000-0000-000000000001'
  $$,
  '管理員可更新自己店家的預約'
);

SELECT extensions.lives_ok(
  $$
    DELETE FROM public.pending_invitations
    WHERE id = '60000000-0000-0000-0000-000000000001'
  $$,
  '管理員仍可刪除自己店家的邀請'
);

RESET ROLE;

-- 店家二成員：店家隔離後只看得到店家二自己的預約。
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000003","role":"authenticated"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  (SELECT COUNT(*) FROM public.bookings),
  1::BIGINT,
  '不同店家的一般成員無法跨店讀取預約'
);

RESET ROLE;

-- Edge Function 使用的 service_role 仍能執行邀請寄送 claim。
SET LOCAL ROLE service_role;

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.claim_invitation_email_send(
      '60000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000001'
    )
  ),
  1::BIGINT,
  'service_role 仍可鎖定待寄送邀請'
);

RESET ROLE;

-- 匿名使用者：可查找預約店家，但完全不能直接讀取 bookings。
SELECT SET_CONFIG('request.jwt.claims', '{"role":"anon"}', TRUE);
SET LOCAL ROLE anon;

SELECT extensions.throws_ok(
  $$ SELECT COUNT(*) FROM public.bookings $$,
  '42501',
  'permission denied for table bookings',
  '匿名使用者不可直接讀取 bookings'
);

SELECT extensions.is(
  public.get_store_by_code((
    SELECT s.store_code
    FROM public.stores AS s
    WHERE s.id = '00000000-0000-0000-0000-000000000002'
  )),
  '00000000-0000-0000-0000-000000000002'::UUID,
  '匿名預約流程仍可用店家代碼解析店家'
);

SELECT extensions.ok(
  (
    public.create_booking_public(
      '匿名測試客戶',
      '0900000010',
      '10000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000003',
      DATE_TRUNC('month', NOW()) + INTERVAL '10 days 13 hours',
      NULL,
      '00000000-0000-0000-0000-000000000002',
      'web',
      NULL,
      NULL
    ) ->> 'ok'
  )::BOOLEAN,
  '合法的匿名公開預約仍可成功建立'
);

SELECT extensions.is(
  public.create_booking_public(
    '跨店測試客戶',
    '0900000011',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000003',
    DATE_TRUNC('month', NOW()) + INTERVAL '11 days 13 hours',
    NULL,
    '00000000-0000-0000-0000-000000000002',
    'web',
    NULL,
    NULL
  ) ->> 'error',
  'SERVICE_NOT_FOUND',
  '匿名預約不能混用不同店家的服務與老師'
);

RESET ROLE;

SELECT * FROM extensions.finish();

ROLLBACK;
