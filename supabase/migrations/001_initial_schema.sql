-- =============================================
-- 預約系統初始資料模型
-- =============================================

-- 啟用 UUID 擴充
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 建立自訂 enum 類型
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
CREATE TYPE user_role AS ENUM ('admin', 'member');
CREATE TYPE notification_type AS ENUM ('booking_confirmed', 'reminder', 'post_session_review', 'post_session_tips');

-- =============================================
-- 店家資料（預留多店擴充）
-- =============================================
CREATE TABLE stores (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 員工帳號（關聯 Supabase Auth）
-- =============================================
CREATE TABLE users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  role            user_role NOT NULL DEFAULT 'member',
  practitioner_id UUID,                   -- 若該員工同時是從業人員
  store_id        UUID NOT NULL REFERENCES stores(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 從業人員（按摩師、伸展師、美容師）
-- =============================================
CREATE TABLE practitioners (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name   TEXT NOT NULL,
  title       TEXT,                        -- 職稱
  phone       TEXT,
  color       TEXT NOT NULL DEFAULT '#6366f1',  -- 甘特圖顯示顏色
  store_id    UUID NOT NULL REFERENCES stores(id),
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 補上 users 對 practitioners 的 FK
ALTER TABLE users ADD CONSTRAINT fk_users_practitioner
  FOREIGN KEY (practitioner_id) REFERENCES practitioners(id) ON DELETE SET NULL;

-- =============================================
-- 客戶資料
-- =============================================
CREATE TABLE clients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name     TEXT NOT NULL,
  phone         TEXT NOT NULL,
  email         TEXT,
  line_user_id  TEXT,                      -- LINE 推播用
  notes         TEXT,
  store_id      UUID NOT NULL REFERENCES stores(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_phone ON clients(phone);

-- =============================================
-- 可預約課程
-- =============================================
CREATE TABLE services (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  description      TEXT,
  duration_minutes INT NOT NULL DEFAULT 60,
  price            NUMERIC(10, 0) NOT NULL DEFAULT 0,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  store_id         UUID NOT NULL REFERENCES stores(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 預約單（核心表）
-- =============================================
CREATE TABLE bookings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id        UUID NOT NULL REFERENCES clients(id),
  practitioner_id  UUID NOT NULL REFERENCES practitioners(id),
  service_id       UUID NOT NULL REFERENCES services(id),
  start_time       TIMESTAMPTZ NOT NULL,
  end_time         TIMESTAMPTZ NOT NULL,
  status           booking_status NOT NULL DEFAULT 'pending',
  notes            TEXT,
  store_id         UUID NOT NULL REFERENCES stores(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_start_time ON bookings(start_time);
CREATE INDEX idx_bookings_practitioner ON bookings(practitioner_id, start_time);
CREATE INDEX idx_bookings_client ON bookings(client_id);
CREATE INDEX idx_bookings_status ON bookings(status);

-- 自動更新 updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================
-- 通知設定
-- =============================================
CREATE TABLE notification_settings (
  id                           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id                     UUID NOT NULL UNIQUE REFERENCES stores(id),
  booking_confirmed_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  post_session_review_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  post_session_tips_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                   TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 通知卡片內容（可後台編輯）
-- =============================================
CREATE TABLE notification_templates (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id   UUID NOT NULL REFERENCES stores(id),
  type       notification_type NOT NULL,
  content    TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, type)
);

-- =============================================
-- Row Level Security（分權核心）
-- =============================================

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE practitioners ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- 輔助函數：取得目前用戶的 store_id 和 role
CREATE OR REPLACE FUNCTION current_store_id()
RETURNS UUID AS $$
  SELECT store_id FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT role = 'admin' FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION current_practitioner_id()
RETURNS UUID AS $$
  SELECT practitioner_id FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- users：只能看自己店的員工
CREATE POLICY "users_store_isolation" ON users
  FOR ALL USING (store_id = current_store_id());

-- practitioners：只能看自己店的從業人員
CREATE POLICY "practitioners_store_isolation" ON practitioners
  FOR ALL USING (store_id = current_store_id());

-- clients：只能看自己店的客戶
CREATE POLICY "clients_store_isolation" ON clients
  FOR ALL USING (store_id = current_store_id());

-- services：只能看自己店的課程
CREATE POLICY "services_store_isolation" ON services
  FOR ALL USING (store_id = current_store_id());

-- bookings：管理員看全部，一般成員只看自己的
CREATE POLICY "bookings_admin_all" ON bookings
  FOR ALL USING (
    store_id = current_store_id()
    AND (is_admin() OR practitioner_id = current_practitioner_id())
  );

-- notification_settings：只有管理員可編輯
CREATE POLICY "notification_settings_admin_write" ON notification_settings
  FOR ALL USING (store_id = current_store_id() AND is_admin());

CREATE POLICY "notification_templates_admin_write" ON notification_templates
  FOR ALL USING (store_id = current_store_id() AND is_admin());

-- =============================================
-- 預設資料（單一店家初始化）
-- =============================================
INSERT INTO stores (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', '我的店');

INSERT INTO notification_settings (store_id) VALUES
  ('00000000-0000-0000-0000-000000000001');

INSERT INTO notification_templates (store_id, type, content) VALUES
  ('00000000-0000-0000-0000-000000000001', 'booking_confirmed',
   '您好！您的預約已確認。\n課程：{{service_name}}\n時間：{{start_time}}\n期待您的到來！'),
  ('00000000-0000-0000-0000-000000000001', 'reminder',
   '提醒您明天的預約！\n課程：{{service_name}}\n時間：{{start_time}}\n請準時到來 😊'),
  ('00000000-0000-0000-0000-000000000001', 'post_session_review',
   '感謝您今天的到來！希望您滿意今天的課程。如果方便，歡迎留下您的評價 🙏'),
  ('00000000-0000-0000-0000-000000000001', 'post_session_tips',
   '課程結束後記得多補充水分，讓身體好好恢復 💧 期待下次再見！');
