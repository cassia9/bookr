-- ============================================================
-- Migration: 補齊客戶性別欄位
-- 功能：同步客戶表單、clients 資料表與 client_stats View
-- 依賴：001（clients 表）、021（client_stats View）
-- ============================================================

BEGIN;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS gender TEXT;

UPDATE public.clients
SET gender = 'unknown'
WHERE gender IS NULL;

ALTER TABLE public.clients
  ALTER COLUMN gender SET DEFAULT 'unknown',
  ALTER COLUMN gender SET NOT NULL;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_gender_allowed,
  ADD CONSTRAINT clients_gender_allowed
    CHECK (gender IN ('male', 'female', 'unknown'));

-- 新欄位放在 View 欄位清單末端，讓 CREATE OR REPLACE 可安全套用至既有 View。
CREATE OR REPLACE VIEW public.client_stats
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.store_id,
  c.full_name,
  c.phone,
  c.email,
  c.notes,
  c.created_at,
  c.updated_at,
  COUNT(b.id)                                                     AS booking_count,
  COUNT(b.id) FILTER (WHERE b.status = 'completed')               AS completed_count,
  COUNT(b.id) FILTER (WHERE b.status = 'cancelled')               AS cancelled_count,
  COALESCE(
    SUM(b.price) FILTER (WHERE b.status = 'completed'), 0
  )                                                               AS total_spent,
  CASE
    WHEN COUNT(b.id) FILTER (WHERE b.status = 'completed') > 0
    THEN ROUND(
      COALESCE(SUM(b.price) FILTER (WHERE b.status = 'completed'), 0)::NUMERIC
      / COUNT(b.id) FILTER (WHERE b.status = 'completed')
    )
    ELSE 0
  END                                                             AS avg_spent,
  MIN(b.start_time)                                               AS first_booking_at,
  MAX(b.start_time)                                               AS last_booking_at,
  COUNT(b.id) FILTER (
    WHERE b.status IN ('pending', 'confirmed')
      AND b.start_time > NOW()
  )                                                               AS upcoming_count,
  c.gender
FROM public.clients c
LEFT JOIN public.bookings b
  ON b.client_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id;

COMMENT ON COLUMN public.clients.gender
  IS '客戶性別：male、female 或 unknown；預設 unknown';

COMMIT;
