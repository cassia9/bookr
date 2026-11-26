BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(8);

INSERT INTO public.stores (id, name)
VALUES
  ('e1000000-0000-0000-0000-000000000001', '重新邀請測試店家'),
  ('e1000000-0000-0000-0000-000000000002', '其他店家');

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  (
    'e2000000-0000-0000-0000-000000000001',
    'reactivation-admin@example.test',
    '{"full_name":"測試管理員"}'::JSONB
  ),
  (
    'e2000000-0000-0000-0000-000000000002',
    'reactivation-member@example.test',
    '{"full_name":"待恢復成員"}'::JSONB
  ),
  (
    'e2000000-0000-0000-0000-000000000003',
    'cross-store-member@example.test',
    '{"full_name":"跨店成員"}'::JSONB
  );

UPDATE public.users
SET store_id = 'e1000000-0000-0000-0000-000000000001',
    role = 'admin'::public.user_role
WHERE id = 'e2000000-0000-0000-0000-000000000001';

UPDATE public.users
SET store_id = 'e1000000-0000-0000-0000-000000000001',
    role = 'member'::public.user_role,
    deleted_at = NOW() - INTERVAL '1 day'
WHERE id IN (
  'e2000000-0000-0000-0000-000000000002',
  'e2000000-0000-0000-0000-000000000003'
);

INSERT INTO public.pending_invitations (
  id, email, role, token, store_id, created_by, expires_at, processing_at
)
VALUES
  (
    'e3000000-0000-0000-0000-000000000001',
    'reactivation-member@example.test',
    'admin'::public.user_role,
    'e4000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000001',
    NOW() + INTERVAL '1 day',
    NOW()
  ),
  (
    'e3000000-0000-0000-0000-000000000002',
    'cross-store-member@example.test',
    'member'::public.user_role,
    'e4000000-0000-0000-0000-000000000002',
    'e1000000-0000-0000-0000-000000000002',
    'e2000000-0000-0000-0000-000000000001',
    NOW() + INTERVAL '1 day',
    NOW()
  );

SELECT extensions.ok(
  NOT has_function_privilege(
    'anon',
    'public.reactivate_member_invitation(uuid,uuid,text)',
    'EXECUTE'
  ),
  '匿名使用者不能重新啟用成員'
);

SELECT extensions.ok(
  NOT has_function_privilege(
    'authenticated',
    'public.reactivate_member_invitation(uuid,uuid,text)',
    'EXECUTE'
  ),
  '一般登入者不能重新啟用成員'
);

SET LOCAL ROLE service_role;

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.reactivate_member_invitation(
      'e3000000-0000-0000-0000-000000000001',
      'e2000000-0000-0000-0000-000000000002',
      '重新啟用管理員'
    )
  ),
  1::BIGINT,
  'service_role 可重新啟用同店家的已刪除成員'
);

RESET ROLE;

SELECT extensions.ok(
  (
    SELECT deleted_at IS NULL
      AND full_name = '重新啟用管理員'
      AND role = 'admin'::public.user_role
    FROM public.users
    WHERE id = 'e2000000-0000-0000-0000-000000000002'
  ),
  '重新啟用會清除刪除狀態並套用邀請姓名與角色'
);

SELECT extensions.ok(
  (
    SELECT accepted_at IS NOT NULL
      AND accepted_user_id = 'e2000000-0000-0000-0000-000000000002'
      AND processing_at IS NULL
    FROM public.pending_invitations
    WHERE id = 'e3000000-0000-0000-0000-000000000001'
  ),
  '重新啟用後邀請會原子標記為已接受'
);

SET LOCAL ROLE service_role;

SELECT extensions.is(
  (
    SELECT COUNT(*)
    FROM public.reactivate_member_invitation(
      'e3000000-0000-0000-0000-000000000002',
      'e2000000-0000-0000-0000-000000000003',
      '不應跨店啟用'
    )
  ),
  0::BIGINT,
  '不同店家的邀請不能重新啟用既有成員'
);

RESET ROLE;

SELECT extensions.ok(
  (
    SELECT deleted_at IS NOT NULL
    FROM public.users
    WHERE id = 'e2000000-0000-0000-0000-000000000003'
  ),
  '跨店拒絕後仍維持刪除狀態'
);

SELECT extensions.ok(
  (
    SELECT accepted_at IS NULL
    FROM public.pending_invitations
    WHERE id = 'e3000000-0000-0000-0000-000000000002'
  ),
  '跨店拒絕後不會誤標記邀請已接受'
);

SELECT * FROM extensions.finish();

ROLLBACK;
