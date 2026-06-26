-- =============================================
-- Migration 024: stores 新增 store_code（系統自動產生短 ID）+ org_id 預留
-- =============================================

-- ── 1. 新增 store_code 欄位 ───────────────────────────────────────────────────

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS store_code TEXT;

-- 補填現有店家：取 md5(id) 前 8 碼作為短 ID
UPDATE stores
SET store_code = substr(md5(id::text), 1, 8)
WHERE store_code IS NULL;

-- 設為 NOT NULL + UNIQUE
ALTER TABLE stores
  ALTER COLUMN store_code SET NOT NULL,
  ADD CONSTRAINT stores_store_code_unique UNIQUE (store_code);

-- index（WHERE store_code = ? 走 index scan）
CREATE INDEX IF NOT EXISTS idx_stores_store_code ON stores (store_code);

-- ── 2. 新店家自動產生 store_code 的 trigger ───────────────────────────────────

CREATE OR REPLACE FUNCTION generate_store_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_attempt INT := 0;
BEGIN
  LOOP
    v_code := substr(md5(NEW.id::text || v_attempt::text), 1, 8);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM stores WHERE store_code = v_code);
    v_attempt := v_attempt + 1;
  END LOOP;
  NEW.store_code := v_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_store_code ON stores;
CREATE TRIGGER trg_generate_store_code
  BEFORE INSERT ON stores
  FOR EACH ROW
  WHEN (NEW.store_code IS NULL)
  EXECUTE FUNCTION generate_store_code();

-- ── 3. 預留 org_id（未來多組織用）────────────────────────────────────────────

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS org_id UUID;

-- ── 4. get_store_by_code RPC（anon 可呼叫）───────────────────────────────────

CREATE OR REPLACE FUNCTION get_store_by_code(p_code TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM stores
  WHERE store_code = lower(trim(p_code))
    AND booking_enabled = TRUE
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_store_by_code TO anon, authenticated;
