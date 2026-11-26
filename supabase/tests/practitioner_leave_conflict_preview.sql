BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(5);

INSERT INTO public.stores (
  id, name, booking_enabled, booking_confirmation_mode, timezone
) VALUES (
  'fa000000-0000-0000-0000-000000000001',
  '休假衝突預覽測試店家',
  TRUE,
  'auto',
  'Asia/Taipei'
);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    'fa100000-0000-0000-0000-000000000001',
    'leave-preview-admin@example.test',
    '{"full_name":"休假預覽管理員"}'::JSONB
  ),
  (
    'fa100000-0000-0000-0000-000000000002',
    'leave-preview-member@example.test',
    '{"full_name":"休假預覽一般成員"}'::JSONB
  );

UPDATE public.users
SET store_id = 'fa000000-0000-0000-0000-000000000001',
    role = CASE
      WHEN id = 'fa100000-0000-0000-0000-000000000001'
        THEN 'admin'::public.user_role
      ELSE 'member'::public.user_role
    END
WHERE id IN (
  'fa100000-0000-0000-0000-000000000001',
  'fa100000-0000-0000-0000-000000000002'
);

INSERT INTO public.clients (id, full_name, phone, store_id)
VALUES (
  'fa200000-0000-0000-0000-000000000001',
  '休假衝突客戶',
  '0912333444',
  'fa000000-0000-0000-0000-000000000001'
);

INSERT INTO public.services (id, name, duration_minutes, price, active, store_id)
VALUES (
  'fa300000-0000-0000-0000-000000000001',
  '休假衝突課程',
  60,
  1800,
  TRUE,
  'fa000000-0000-0000-0000-000000000001'
);

INSERT INTO public.practitioners (id, full_name, color, active, store_id)
VALUES (
  'fa400000-0000-0000-0000-000000000001',
  '休假衝突老師',
  '#8B5CF6',
  TRUE,
  'fa000000-0000-0000-0000-000000000001'
);

SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa100000-0000-0000-0000-000000000001"}',
  TRUE
);
SET LOCAL ROLE authenticated;

INSERT INTO public.bookings (
  client_id, practitioner_id, service_id, start_time, end_time,
  status, store_id
) VALUES (
  'fa200000-0000-0000-0000-000000000001',
  'fa400000-0000-0000-0000-000000000001',
  'fa300000-0000-0000-0000-000000000001',
  (
    (((NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 5)::TEXT || ' 14:00')::TIMESTAMP
      AT TIME ZONE 'Asia/Taipei'
  ),
  (
    (((NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 5)::TEXT || ' 15:00')::TIMESTAMP
      AT TIME ZONE 'Asia/Taipei'
  ),
  'confirmed'::public.booking_status,
  'fa000000-0000-0000-0000-000000000001'
);

SELECT extensions.is(
  public.preview_practitioner_leave_conflicts(
    'fa400000-0000-0000-0000-000000000001',
    (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 5,
    (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 5
  ) ->> 'conflict_count',
  '1',
  '休假日期會找出受影響預約'
);

SELECT extensions.is(
  public.preview_practitioner_leave_conflicts(
    'fa400000-0000-0000-0000-000000000001',
    (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 6,
    (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 6
  ) ->> 'conflict_count',
  '0',
  '沒有預約的休假日期回傳零筆衝突'
);

SELECT extensions.is(
  public.preview_practitioner_leave_conflicts(
    'fa400000-0000-0000-0000-000000000001',
    (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 7,
    (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 6
  ) ->> 'error',
  'INVALID_INPUT',
  '結束日早於開始日會被拒絕'
);

RESET ROLE;
SELECT SET_CONFIG(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"fa100000-0000-0000-0000-000000000002"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT extensions.is(
  public.preview_practitioner_leave_conflicts(
    'fa400000-0000-0000-0000-000000000001',
    (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 5,
    (NOW() AT TIME ZONE 'Asia/Taipei')::DATE + 5
  ) ->> 'error',
  'FORBIDDEN',
  '一般成員不可預覽老師休假衝突'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.preview_practitioner_leave_conflicts(uuid,date,date)',
    'EXECUTE'
  ),
  '匿名角色不可呼叫休假衝突預覽'
);

SELECT * FROM extensions.finish();
ROLLBACK;
