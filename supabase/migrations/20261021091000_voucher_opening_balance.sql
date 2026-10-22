-- ============================================================
-- 既有商品券期初餘額匯入
--
-- 1. 一般銷售與上線前期初資料分流
-- 2. 保存原始堂數與歷史已使用堂數，不建立假預約
-- 3. 期初匯入只允許同店管理員，並以單一交易寫入帳本與稽核
-- ============================================================

BEGIN;

ALTER TABLE public.client_vouchers
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'sale',
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS import_notes TEXT;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'client_vouchers_source_check'
      AND conrelid = 'public.client_vouchers'::REGCLASS
  ) THEN
    ALTER TABLE public.client_vouchers
      ADD CONSTRAINT client_vouchers_source_check
      CHECK (source IN ('sale', 'opening_balance'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'client_vouchers_import_state_check'
      AND conrelid = 'public.client_vouchers'::REGCLASS
  ) THEN
    ALTER TABLE public.client_vouchers
      ADD CONSTRAINT client_vouchers_import_state_check
      CHECK (
        (source = 'sale' AND imported_at IS NULL AND import_notes IS NULL)
        OR
        (
          source = 'opening_balance'
          AND imported_at IS NOT NULL
          AND import_notes IS NOT NULL
          AND CHAR_LENGTH(BTRIM(import_notes)) BETWEEN 1 AND 1000
        )
      );
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS idx_client_vouchers_store_source_purchased
  ON public.client_vouchers (store_id, source, purchased_on DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_client_vouchers_imported_by
  ON public.client_vouchers (imported_by)
  WHERE imported_by IS NOT NULL;

ALTER TABLE public.voucher_ledger
  DROP CONSTRAINT IF EXISTS voucher_ledger_action_check;

ALTER TABLE public.voucher_ledger
  ADD CONSTRAINT voucher_ledger_action_check CHECK (
    action IN (
      'issued',
      'opening_usage',
      'reserved',
      'released',
      'redeemed',
      'restored',
      'adjusted',
      'voided'
    )
  );

CREATE OR REPLACE FUNCTION public.import_client_voucher_opening_balance(
  p_product_id UUID,
  p_client_id UUID,
  p_purchased_on DATE,
  p_expires_on DATE,
  p_paid_amount INTEGER,
  p_import_notes TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_product public.voucher_products%ROWTYPE;
  v_client_voucher_id UUID;
  v_sale_number TEXT;
  v_item RECORD;
  v_item_id UUID;
  v_import_notes TEXT := NULLIF(BTRIM(COALESCE(p_import_notes, '')), '');
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR NOT (SELECT public.is_admin()) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF p_product_id IS NULL
    OR p_client_id IS NULL
    OR p_purchased_on IS NULL
    OR (p_expires_on IS NOT NULL AND p_expires_on < p_purchased_on)
    OR COALESCE(p_paid_amount, 0) < 0
    OR v_import_notes IS NULL
    OR CHAR_LENGTH(v_import_notes) > 1000
    OR p_items IS NULL
    OR JSONB_TYPEOF(p_items) <> 'array' THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_INPUT');
  END IF;

  IF JSONB_ARRAY_LENGTH(p_items) = 0 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_INPUT');
  END IF;

  -- 先以文字檢查 JSON，再進行型別轉換，避免不合法輸入中止整個 RPC。
  IF EXISTS (
    SELECT 1
    FROM JSONB_ARRAY_ELEMENTS(p_items) AS element(value)
    WHERE JSONB_TYPEOF(element.value) <> 'object'
      OR COALESCE(element.value ->> 'service_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR COALESCE(element.value ->> 'total_quantity', '') !~ '^[0-9]{1,6}$'
      OR COALESCE(element.value ->> 'used_quantity', '') !~ '^[0-9]{1,6}$'
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_ITEMS');
  END IF;

  -- 通過字串格式檢查後才轉型，避免 PostgreSQL 重排布林條件時提早 cast。
  IF EXISTS (
    SELECT 1
    FROM JSONB_ARRAY_ELEMENTS(p_items) AS element(value)
    WHERE (element.value ->> 'total_quantity')::INTEGER < 1
      OR (element.value ->> 'used_quantity')::INTEGER < 0
      OR (element.value ->> 'used_quantity')::INTEGER
        > (element.value ->> 'total_quantity')::INTEGER
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_ITEMS');
  END IF;

  IF (
    SELECT COUNT(*)
    FROM JSONB_ARRAY_ELEMENTS(p_items)
  ) <> (
    SELECT COUNT(DISTINCT element.value ->> 'service_id')
    FROM JSONB_ARRAY_ELEMENTS(p_items) AS element(value)
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'DUPLICATE_SERVICE');
  END IF;

  SELECT product.*
  INTO v_product
  FROM public.voucher_products AS product
  WHERE product.id = p_product_id
    AND product.store_id = v_store_id
    AND product.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'PRODUCT_NOT_FOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clients AS client
    WHERE client.id = p_client_id
      AND client.store_id = v_store_id
      AND client.deleted_at IS NULL
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'CLIENT_NOT_FOUND');
  END IF;

  -- 匯入項目須完整對應方案內的課程，但原始總堂數可反映舊系統實況。
  IF EXISTS (
    SELECT 1
    FROM JSONB_ARRAY_ELEMENTS(p_items) AS element(value)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.voucher_product_items AS product_item
      JOIN public.services AS service
        ON service.id = product_item.service_id
       AND service.store_id = product_item.store_id
      WHERE product_item.voucher_product_id = v_product.id
        AND product_item.store_id = v_store_id
        AND product_item.service_id = (element.value ->> 'service_id')::UUID
        AND service.deleted_at IS NULL
    )
  ) OR EXISTS (
    SELECT 1
    FROM public.voucher_product_items AS product_item
    WHERE product_item.voucher_product_id = v_product.id
      AND product_item.store_id = v_store_id
      AND NOT EXISTS (
        SELECT 1
        FROM JSONB_ARRAY_ELEMENTS(p_items) AS element(value)
        WHERE (element.value ->> 'service_id')::UUID = product_item.service_id
      )
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'PRODUCT_ITEM_MISMATCH');
  END IF;

  v_sale_number := CONCAT(
    'VI-', TO_CHAR(NOW(), 'YYYYMMDD'), '-',
    UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8))
  );

  INSERT INTO public.client_vouchers (
    store_id,
    client_id,
    voucher_product_id,
    sale_number,
    product_name_snapshot,
    product_description_snapshot,
    paid_amount,
    payment_method,
    purchased_on,
    expires_on,
    notes,
    source,
    imported_at,
    imported_by,
    import_notes,
    created_by
  ) VALUES (
    v_store_id,
    p_client_id,
    v_product.id,
    v_sale_number,
    v_product.name,
    v_product.description,
    COALESCE(p_paid_amount, 0),
    'other',
    p_purchased_on,
    p_expires_on,
    NULL,
    'opening_balance',
    NOW(),
    (SELECT auth.uid()),
    v_import_notes,
    (SELECT auth.uid())
  )
  RETURNING id INTO v_client_voucher_id;

  FOR v_item IN
    SELECT
      (element.value ->> 'service_id')::UUID AS service_id,
      (element.value ->> 'total_quantity')::INTEGER AS total_quantity,
      (element.value ->> 'used_quantity')::INTEGER AS used_quantity,
      service.name AS service_name
    FROM JSONB_ARRAY_ELEMENTS(p_items) AS element(value)
    JOIN public.services AS service
      ON service.id = (element.value ->> 'service_id')::UUID
     AND service.store_id = v_store_id
    ORDER BY service.id
  LOOP
    INSERT INTO public.client_voucher_items (
      store_id,
      client_voucher_id,
      service_id,
      service_name_snapshot,
      total_quantity,
      used_quantity
    ) VALUES (
      v_store_id,
      v_client_voucher_id,
      v_item.service_id,
      v_item.service_name,
      v_item.total_quantity,
      v_item.used_quantity
    )
    RETURNING id INTO v_item_id;

    INSERT INTO public.voucher_ledger (
      store_id,
      client_voucher_item_id,
      action,
      quantity,
      available_after,
      reserved_after,
      used_after,
      reason,
      actor_user_id
    ) VALUES (
      v_store_id,
      v_item_id,
      'issued',
      v_item.total_quantity,
      v_item.total_quantity,
      0,
      0,
      v_import_notes,
      (SELECT auth.uid())
    );

    IF v_item.used_quantity > 0 THEN
      INSERT INTO public.voucher_ledger (
        store_id,
        client_voucher_item_id,
        action,
        quantity,
        available_after,
        reserved_after,
        used_after,
        reason,
        actor_user_id
      ) VALUES (
        v_store_id,
        v_item_id,
        'opening_usage',
        v_item.used_quantity,
        v_item.total_quantity - v_item.used_quantity,
        0,
        v_item.used_quantity,
        v_import_notes,
        (SELECT auth.uid())
      );
    END IF;
  END LOOP;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, new_values, store_id
  ) VALUES (
    (SELECT auth.uid()),
    'voucher_opening_balance_imported',
    'client_vouchers',
    v_client_voucher_id,
    JSONB_BUILD_OBJECT(
      'sale_number', v_sale_number,
      'client_id', p_client_id,
      'product_id', v_product.id,
      'purchased_on', p_purchased_on,
      'expires_on', p_expires_on,
      'paid_amount', COALESCE(p_paid_amount, 0),
      'items', p_items,
      'import_notes', v_import_notes
    ),
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'id', v_client_voucher_id,
    'sale_number', v_sale_number,
    'source', 'opening_balance'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_client_voucher_opening_balance(
  UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.import_client_voucher_opening_balance(
  UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB
) TO authenticated;

COMMENT ON COLUMN public.client_vouchers.source IS
  '商品券來源：一般銷售 sale 或系統上線前期初匯入 opening_balance';
COMMENT ON COLUMN public.client_vouchers.import_notes IS
  '期初匯入的必要移轉依據；不對客戶公開';
COMMENT ON FUNCTION public.import_client_voucher_opening_balance(
  UUID, UUID, DATE, DATE, INTEGER, TEXT, JSONB
) IS '管理員原子匯入既有商品券原始堂數與歷史已用堂數，不建立假預約';

COMMIT;
