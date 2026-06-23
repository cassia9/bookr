-- audit_logs 表：記錄成員管理操作
-- pending_invitations trigger (audit_member_events) 依賴此表

CREATE TABLE IF NOT EXISTS audit_logs (
  id         uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  action     text        NOT NULL,
  table_name text        NOT NULL,
  record_id  uuid,
  old_values jsonb,
  new_values jsonb,
  store_id   uuid        REFERENCES stores(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
