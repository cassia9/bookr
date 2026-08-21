-- LINE Messaging API 新增的交易通知事件。
-- enum value 必須在後續 migration 使用前先完成提交，因此獨立成檔。

ALTER TYPE public.notification_type
  ADD VALUE IF NOT EXISTS 'booking_received';

ALTER TYPE public.notification_type
  ADD VALUE IF NOT EXISTS 'booking_cancelled';

ALTER TYPE public.notification_type
  ADD VALUE IF NOT EXISTS 'booking_rescheduled';

ALTER TYPE public.notification_type
  ADD VALUE IF NOT EXISTS 'test';
