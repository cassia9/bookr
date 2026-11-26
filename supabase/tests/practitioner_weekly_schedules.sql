BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(13);

INSERT INTO public.stores (
  id, name, booking_enabled, booking_confirmation_mode, timezone, open_time, close_time
) VALUES (
  'd0000000-0000-0000-0000-000000000001',
  '老師班表測試店家',
  TRUE,
  'auto',
  'Asia/Taipei',
  '09:00',
  '21:00'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    'd1000000-0000-0000-0000-000000000001',
    'schedule-admin@example.test',
    '{"full_name":"班表管理員"}'::JSONB
  ),
  (
    'd1000000-0000-0000-0000-000000000002',
    'schedule-member@example.test',
    '{"full_name":"一般成員"}'::JSONB
  );

UPDATE public.users
SET store_id = 'd0000000-0000-0000-0000-000000000001',
    role = CASE
      WHEN id = 'd1000000-0000-0000-0000-000000000001'
        THEN 'admin'::public.user_role
      ELSE 'member'::public.user_role
    END
WHERE id IN (
  'd1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000002'
);

INSERT INTO public.practitioners (
  id, full_name, color, active, store_id
) VALUES (
  'd2000000-0000-0000-0000-000000000001',
  '週三週四老師',
  '#6366F1',
  TRUE,
  'd0000000-0000-0000-0000-000000000001'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.ok(
  (
    public.save_practitioner_weekly_schedule(
      'd2000000-0000-0000-0000-000000000001',
      '[
        {"weekday":1,"is_working":false,"start_time":null,"end_time":null},
        {"weekday":2,"is_working":false,"start_time":null,"end_time":null},
        {"weekday":3,"is_working":true,"start_time":"09:00","end_time":"18:00"},
        {"weekday":4,"is_working":true,"start_time":"12:00","end_time":"20:00"},
        {"weekday":5,"is_working":false,"start_time":null,"end_time":null},
        {"weekday":6,"is_working":false,"start_time":null,"end_time":null},
        {"weekday":7,"is_working":false,"start_time":null,"end_time":null}
      ]'::JSONB
    ) ->> 'ok'
  )::BOOLEAN,
  '管理員可儲存完整七天班表'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.practitioner_weekly_schedules
    WHERE practitioner_id = 'd2000000-0000-0000-0000-000000000001'
  ),
  7::BIGINT,
  '第一次儲存會建立完整七天資料'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.practitioner_weekly_schedules
    WHERE practitioner_id = 'd2000000-0000-0000-0000-000000000001'
      AND is_working
  ),
  2::BIGINT,
  '僅週三與週四為上班日'
);

SELECT extensions.is(
  (
    SELECT start_time::TEXT
    FROM public.practitioner_weekly_schedules
    WHERE practitioner_id = 'd2000000-0000-0000-0000-000000000001'
      AND weekday = 4
  ),
  '12:00:00',
  '每個上班日可有不同開始時間'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE store_id = 'd0000000-0000-0000-0000-000000000001'
      AND action = 'practitioner_weekly_schedule_saved'
  ),
  1::BIGINT,
  '儲存班表會留下單筆稽核紀錄'
);

SELECT extensions.is(
  public.save_practitioner_weekly_schedule(
    'd2000000-0000-0000-0000-000000000001',
    '[{"weekday":3,"is_working":true,"start_time":"09:00","end_time":"18:00"}]'::JSONB
  ) ->> 'error',
  'INVALID_SCHEDULE',
  '不完整七天的資料會被拒絕'
);

SELECT extensions.is(
  public.save_practitioner_weekly_schedule(
    'd2000000-0000-0000-0000-000000000001',
    '[
      {"weekday":1,"is_working":false,"start_time":null,"end_time":null},
      {"weekday":2,"is_working":false,"start_time":null,"end_time":null},
      {"weekday":3,"is_working":true,"start_time":"18:00","end_time":"09:00"},
      {"weekday":4,"is_working":true,"start_time":"12:00","end_time":"20:00"},
      {"weekday":5,"is_working":false,"start_time":null,"end_time":null},
      {"weekday":6,"is_working":false,"start_time":null,"end_time":null},
      {"weekday":7,"is_working":false,"start_time":null,"end_time":null}
    ]'::JSONB
  ) ->> 'error',
  'INVALID_SCHEDULE',
  '結束時間早於開始時間會被拒絕'
);

SELECT extensions.is(
  public.save_practitioner_weekly_schedule(
    'd2000000-0000-0000-0000-000000000001',
    '[
      {"weekday":1,"is_working":false,"start_time":null,"end_time":null},
      {"weekday":2,"is_working":false,"start_time":null,"end_time":null},
      {"weekday":3,"is_working":false,"start_time":null,"end_time":null},
      {"weekday":4,"is_working":false,"start_time":null,"end_time":null},
      {"weekday":5,"is_working":false,"start_time":null,"end_time":null},
      {"weekday":6,"is_working":false,"start_time":null,"end_time":null},
      {"weekday":7,"is_working":false,"start_time":null,"end_time":null}
    ]'::JSONB
  ) ->> 'error',
  'INVALID_SCHEDULE',
  '至少需保留一個上班日'
);

SELECT extensions.ok(
  NOT has_table_privilege(
    'authenticated',
    'public.practitioner_weekly_schedules',
    'INSERT'
  ),
  '登入角色不能繞過 RPC 直接新增班表'
);

SELECT extensions.ok(
  has_table_privilege(
    'authenticated',
    'public.practitioner_weekly_schedules',
    'SELECT'
  ),
  '登入角色可讀取同店班表'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"d1000000-0000-0000-0000-000000000002"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.save_practitioner_weekly_schedule(
    'd2000000-0000-0000-0000-000000000001',
    '[
      {"weekday":1,"is_working":false,"start_time":null,"end_time":null},
      {"weekday":2,"is_working":false,"start_time":null,"end_time":null},
      {"weekday":3,"is_working":true,"start_time":"09:00","end_time":"18:00"},
      {"weekday":4,"is_working":true,"start_time":"12:00","end_time":"20:00"},
      {"weekday":5,"is_working":false,"start_time":null,"end_time":null},
      {"weekday":6,"is_working":false,"start_time":null,"end_time":null},
      {"weekday":7,"is_working":false,"start_time":null,"end_time":null}
    ]'::JSONB
  ) ->> 'error',
  'FORBIDDEN',
  '一般成員不可修改班表'
);

RESET ROLE;

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.save_practitioner_weekly_schedule(uuid,jsonb)',
    'EXECUTE'
  ),
  '匿名角色不可呼叫班表儲存 RPC'
);

SELECT extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.preview_practitioner_schedule_conflicts(uuid,jsonb)',
    'EXECUTE'
  ),
  '登入管理員可呼叫班表衝突預覽 RPC'
);

SELECT * FROM extensions.finish();
ROLLBACK;
