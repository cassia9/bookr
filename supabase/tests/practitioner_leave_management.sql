BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(10);

INSERT INTO public.stores (
  id, name, booking_enabled, booking_confirmation_mode, timezone
) VALUES (
  'f0000000-0000-0000-0000-000000000001',
  '老師休假測試店家',
  TRUE,
  'auto',
  'Asia/Taipei'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    'f1000000-0000-0000-0000-000000000001',
    'leave-admin@example.test',
    '{"full_name":"休假管理員"}'::JSONB
  ),
  (
    'f1000000-0000-0000-0000-000000000002',
    'leave-member@example.test',
    '{"full_name":"休假一般成員"}'::JSONB
  );

UPDATE public.users
SET store_id = 'f0000000-0000-0000-0000-000000000001',
    role = CASE
      WHEN id = 'f1000000-0000-0000-0000-000000000001'
        THEN 'admin'::public.user_role
      ELSE 'member'::public.user_role
    END
WHERE id IN (
  'f1000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000002'
);

INSERT INTO public.practitioners (
  id, full_name, color, active, store_id
) VALUES (
  'f2000000-0000-0000-0000-000000000001',
  '休假測試老師',
  '#F97316',
  TRUE,
  'f0000000-0000-0000-0000-000000000001'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"f1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE created_leave AS
SELECT public.save_practitioner_leave(
  'f2000000-0000-0000-0000-000000000001',
  (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 5,
  (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 6,
  '員工旅遊'
) AS result;

SELECT extensions.ok(
  ((SELECT result FROM created_leave) ->> 'ok')::BOOLEAN,
  '管理員可新增連續兩日休假'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.practitioner_blocks
    WHERE practitioner_id = 'f2000000-0000-0000-0000-000000000001'
  ),
  1::BIGINT,
  '休假統一寫入 practitioner_blocks'
);

SELECT extensions.is(
  (
    SELECT EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER / 86400
    FROM public.practitioner_blocks
    WHERE practitioner_id = 'f2000000-0000-0000-0000-000000000001'
  ),
  2,
  '連續兩日休假使用結束日隔日零時作為排他上界'
);

SELECT extensions.is(
  public.save_practitioner_leave(
    'f2000000-0000-0000-0000-000000000001',
    (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 6,
    (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 7,
    '重疊休假'
  ) ->> 'error',
  'OVERLAPPING_LEAVE',
  '重疊休假不會重複建立'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE store_id = 'f0000000-0000-0000-0000-000000000001'
      AND action = 'practitioner_leave_created'
  ),
  1::BIGINT,
  '新增休假留下稽核紀錄'
);

SELECT extensions.ok(
  NOT has_table_privilege('authenticated', 'public.practitioner_blocks', 'INSERT'),
  '登入角色不可繞過 RPC 直接新增休假'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"f1000000-0000-0000-0000-000000000002"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.save_practitioner_leave(
    'f2000000-0000-0000-0000-000000000001',
    (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 8,
    (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 8,
    NULL
  ) ->> 'error',
  'FORBIDDEN',
  '一般成員不可新增休假'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"f1000000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.ok(
  (
    public.delete_practitioner_leave(
      ((SELECT result FROM created_leave) ->> 'id')::UUID
    ) ->> 'ok'
  )::BOOLEAN,
  '管理員可刪除同店休假'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.practitioner_blocks
    WHERE practitioner_id = 'f2000000-0000-0000-0000-000000000001'
  ),
  0::BIGINT,
  '刪除後休假 block 不再存在'
);

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.audit_logs
    WHERE store_id = 'f0000000-0000-0000-0000-000000000001'
      AND action = 'practitioner_leave_deleted'
  ),
  1::BIGINT,
  '刪除休假留下稽核紀錄'
);

SELECT * FROM extensions.finish();
ROLLBACK;
