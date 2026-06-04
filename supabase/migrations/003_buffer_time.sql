-- =============================================
-- 緩衝時間 & 店家營業時段
-- =============================================

-- 1. stores: 新增預設緩衝時間 & 營業時段
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS open_time              TIME NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS close_time             TIME NOT NULL DEFAULT '21:00',
  ADD COLUMN IF NOT EXISTS default_buffer_minutes INT  NOT NULL DEFAULT 30;

-- 2. bookings: 新增每筆預約的緩衝時間（繼承自店家設定，可單筆覆蓋）
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS buffer_minutes INT NOT NULL DEFAULT 0;
