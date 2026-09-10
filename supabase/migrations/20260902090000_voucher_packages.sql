-- ============================================================
-- 商品券／多堂課方案核心
--
-- 1. 方案與固定課程組合
-- 2. 客戶購買快照與堂數餘額
-- 3. 不可覆寫的堂數帳本
-- 4. 預約自動保留、完課扣堂、取消釋放
-- 5. 店家隔離、角色權限與管理 RPC
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 1. 商品券方案
-- ============================================================

CREATE TABLE IF NOT EXISTS public.voucher_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  selling_price INTEGER NOT NULL,
  validity_days INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT voucher_products_name_check
    CHECK (CHAR_LENGTH(BTRIM(name)) BETWEEN 1 AND 100),
  CONSTRAINT voucher_products_description_check
    CHECK (description IS NULL OR CHAR_LENGTH(description) <= 1000),
  CONSTRAINT voucher_products_selling_price_check
    CHECK (selling_price >= 0),
  CONSTRAINT voucher_products_validity_days_check
    CHECK (validity_days IS NULL OR validity_days BETWEEN 1 AND 3650)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_products_store_name_unique
  ON public.voucher_products (store_id, LOWER(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_voucher_products_store_active
  ON public.voucher_products (store_id, active, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.voucher_product_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  voucher_product_id UUID NOT NULL
    REFERENCES public.voucher_products(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id),
  quantity INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT voucher_product_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT voucher_product_items_product_service_unique
    UNIQUE (voucher_product_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_voucher_product_items_store_product
  ON public.voucher_product_items (store_id, voucher_product_id);

CREATE INDEX IF NOT EXISTS idx_voucher_product_items_service
  ON public.voucher_product_items (service_id);

-- ============================================================
-- 2. 客戶購買快照與堂數
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  voucher_product_id UUID REFERENCES public.voucher_products(id) ON DELETE SET NULL,
  sale_number TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  product_description_snapshot TEXT,
  paid_amount INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'other',
  purchased_on DATE NOT NULL,
  expires_on DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_vouchers_sale_number_unique UNIQUE (store_id, sale_number),
  CONSTRAINT client_vouchers_product_name_check
    CHECK (CHAR_LENGTH(BTRIM(product_name_snapshot)) BETWEEN 1 AND 100),
  CONSTRAINT client_vouchers_paid_amount_check CHECK (paid_amount >= 0),
  CONSTRAINT client_vouchers_payment_method_check
    CHECK (payment_method IN ('cash', 'transfer', 'card', 'other')),
  CONSTRAINT client_vouchers_expiry_check
    CHECK (expires_on IS NULL OR expires_on >= purchased_on),
  CONSTRAINT client_vouchers_status_check
    CHECK (status IN ('active', 'voided')),
  CONSTRAINT client_vouchers_void_state_check
    CHECK (
      (status = 'active' AND voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
      OR
      (status = 'voided' AND voided_at IS NOT NULL AND void_reason IS NOT NULL)
    ),
  CONSTRAINT client_vouchers_notes_check
    CHECK (notes IS NULL OR CHAR_LENGTH(notes) <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_client_vouchers_client_active
  ON public.client_vouchers (store_id, client_id, expires_on, purchased_on)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_client_vouchers_product
  ON public.client_vouchers (voucher_product_id)
  WHERE voucher_product_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.client_voucher_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_voucher_id UUID NOT NULL
    REFERENCES public.client_vouchers(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES public.services(id),
  service_name_snapshot TEXT NOT NULL,
  total_quantity INTEGER NOT NULL,
  adjustment_quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  used_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_voucher_items_voucher_service_unique
    UNIQUE (client_voucher_id, service_id),
  CONSTRAINT client_voucher_items_total_check CHECK (total_quantity > 0),
  CONSTRAINT client_voucher_items_counts_check CHECK (
    reserved_quantity >= 0
    AND used_quantity >= 0
    AND total_quantity + adjustment_quantity >= 0
    AND reserved_quantity + used_quantity <= total_quantity + adjustment_quantity
  )
);

CREATE INDEX IF NOT EXISTS idx_client_voucher_items_voucher
  ON public.client_voucher_items (store_id, client_voucher_id);

CREATE INDEX IF NOT EXISTS idx_client_voucher_items_service_available
  ON public.client_voucher_items (store_id, service_id, client_voucher_id)
  WHERE reserved_quantity + used_quantity < total_quantity + adjustment_quantity;

-- ============================================================
-- 3. 預約使用與不可覆寫帳本
-- ============================================================

CREATE TABLE IF NOT EXISTS public.voucher_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id),
  client_voucher_item_id UUID NOT NULL
    REFERENCES public.client_voucher_items(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'reserved',
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  redeemed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT voucher_redemptions_status_check
    CHECK (status IN ('reserved', 'redeemed', 'released')),
  CONSTRAINT voucher_redemptions_state_check CHECK (
    (status = 'reserved' AND redeemed_at IS NULL AND released_at IS NULL)
    OR (status = 'redeemed' AND redeemed_at IS NOT NULL AND released_at IS NULL)
    OR (status = 'released' AND redeemed_at IS NULL AND released_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_redemptions_booking_active_unique
  ON public.voucher_redemptions (booking_id)
  WHERE status IN ('reserved', 'redeemed');

CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_item
  ON public.voucher_redemptions (store_id, client_voucher_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.voucher_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  client_voucher_item_id UUID NOT NULL
    REFERENCES public.client_voucher_items(id) ON DELETE RESTRICT,
  redemption_id UUID REFERENCES public.voucher_redemptions(id) ON DELETE RESTRICT,
  booking_id UUID REFERENCES public.bookings(id),
  action TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  available_after INTEGER NOT NULL,
  reserved_after INTEGER NOT NULL,
  used_after INTEGER NOT NULL,
  reason TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT voucher_ledger_action_check CHECK (
    action IN ('issued', 'reserved', 'released', 'redeemed', 'adjusted', 'voided')
  ),
  CONSTRAINT voucher_ledger_quantity_check CHECK (
    (action = 'voided' AND quantity >= 0)
    OR (action <> 'voided' AND quantity > 0)
  ),
  CONSTRAINT voucher_ledger_balances_check CHECK (
    available_after >= 0 AND reserved_after >= 0 AND used_after >= 0
  ),
  CONSTRAINT voucher_ledger_reason_check
    CHECK (reason IS NULL OR CHAR_LENGTH(reason) <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_voucher_ledger_item_created
  ON public.voucher_ledger (store_id, client_voucher_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voucher_ledger_booking
  ON public.voucher_ledger (booking_id)
  WHERE booking_id IS NOT NULL;

-- ============================================================
-- 4. 店家一致性與 updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION private.set_voucher_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.validate_voucher_product_item_store()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_store_id UUID;
  v_service_store_id UUID;
BEGIN
  SELECT product.store_id
  INTO v_product_store_id
  FROM public.voucher_products AS product
  WHERE product.id = NEW.voucher_product_id
    AND product.deleted_at IS NULL;

  SELECT service.store_id
  INTO v_service_store_id
  FROM public.services AS service
  WHERE service.id = NEW.service_id
    AND service.deleted_at IS NULL;

  IF v_product_store_id IS NULL OR v_service_store_id IS NULL
    OR NEW.store_id IS DISTINCT FROM v_product_store_id
    OR NEW.store_id IS DISTINCT FROM v_service_store_id THEN
    RAISE EXCEPTION 'VOUCHER_PRODUCT_ITEM_STORE_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.validate_client_voucher_item_store()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_voucher_store_id UUID;
  v_service_store_id UUID;
BEGIN
  SELECT voucher.store_id
  INTO v_voucher_store_id
  FROM public.client_vouchers AS voucher
  WHERE voucher.id = NEW.client_voucher_id;

  SELECT service.store_id
  INTO v_service_store_id
  FROM public.services AS service
  WHERE service.id = NEW.service_id;

  IF v_voucher_store_id IS NULL OR v_service_store_id IS NULL
    OR NEW.store_id IS DISTINCT FROM v_voucher_store_id
    OR NEW.store_id IS DISTINCT FROM v_service_store_id THEN
    RAISE EXCEPTION 'CLIENT_VOUCHER_ITEM_STORE_MISMATCH'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_voucher_products_updated_at
  ON public.voucher_products;
CREATE TRIGGER set_voucher_products_updated_at
  BEFORE UPDATE ON public.voucher_products
  FOR EACH ROW EXECUTE FUNCTION private.set_voucher_updated_at();

DROP TRIGGER IF EXISTS validate_voucher_product_item_store
  ON public.voucher_product_items;
CREATE TRIGGER validate_voucher_product_item_store
  BEFORE INSERT OR UPDATE ON public.voucher_product_items
  FOR EACH ROW EXECUTE FUNCTION private.validate_voucher_product_item_store();

DROP TRIGGER IF EXISTS set_client_vouchers_updated_at
  ON public.client_vouchers;
CREATE TRIGGER set_client_vouchers_updated_at
  BEFORE UPDATE ON public.client_vouchers
  FOR EACH ROW EXECUTE FUNCTION private.set_voucher_updated_at();

DROP TRIGGER IF EXISTS validate_client_voucher_item_store
  ON public.client_voucher_items;
CREATE TRIGGER validate_client_voucher_item_store
  BEFORE INSERT OR UPDATE ON public.client_voucher_items
  FOR EACH ROW EXECUTE FUNCTION private.validate_client_voucher_item_store();

DROP TRIGGER IF EXISTS set_client_voucher_items_updated_at
  ON public.client_voucher_items;
CREATE TRIGGER set_client_voucher_items_updated_at
  BEFORE UPDATE ON public.client_voucher_items
  FOR EACH ROW EXECUTE FUNCTION private.set_voucher_updated_at();

DROP TRIGGER IF EXISTS set_voucher_redemptions_updated_at
  ON public.voucher_redemptions;
CREATE TRIGGER set_voucher_redemptions_updated_at
  BEFORE UPDATE ON public.voucher_redemptions
  FOR EACH ROW EXECUTE FUNCTION private.set_voucher_updated_at();

-- ============================================================
-- 5. 購買、作廢與人工調整 RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.save_voucher_product(
  p_product_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_selling_price INTEGER,
  p_validity_days INTEGER,
  p_active BOOLEAN,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_product_id UUID := p_product_id;
  v_item JSONB;
  v_service_id UUID;
  v_quantity INTEGER;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR NOT public.is_admin() THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_name, '')), '') IS NULL
    OR CHAR_LENGTH(BTRIM(p_name)) > 100
    OR CHAR_LENGTH(COALESCE(p_description, '')) > 1000
    OR p_selling_price IS NULL
    OR p_selling_price < 0
    OR (p_validity_days IS NOT NULL AND p_validity_days NOT BETWEEN 1 AND 3650)
    OR p_active IS NULL
    OR p_items IS NULL
    OR JSONB_TYPEOF(p_items) <> 'array'
    OR JSONB_ARRAY_LENGTH(p_items) = 0 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_INPUT');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM JSONB_ARRAY_ELEMENTS(p_items) AS item
    WHERE JSONB_TYPEOF(item) <> 'object'
      OR COALESCE(item ->> 'service_id', '')
        !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR COALESCE(item ->> 'quantity', '') !~ '^[1-9][0-9]*$'
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_ITEMS');
  END IF;

  IF (
    SELECT COUNT(*)
    FROM JSONB_ARRAY_ELEMENTS(p_items)
  ) <> (
    SELECT COUNT(DISTINCT item ->> 'service_id')
    FROM JSONB_ARRAY_ELEMENTS(p_items) AS item
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'DUPLICATE_SERVICE');
  END IF;

  FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
  LOOP
    v_service_id := (v_item ->> 'service_id')::UUID;
    v_quantity := (v_item ->> 'quantity')::INTEGER;

    IF v_quantity > 10000 OR NOT EXISTS (
      SELECT 1
      FROM public.services AS service
      WHERE service.id = v_service_id
        AND service.store_id = v_store_id
        AND service.deleted_at IS NULL
    ) THEN
      RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_SERVICE_OR_QUANTITY');
    END IF;
  END LOOP;

  IF v_product_id IS NULL THEN
    INSERT INTO public.voucher_products (
      store_id,
      name,
      description,
      selling_price,
      validity_days,
      active,
      created_by
    ) VALUES (
      v_store_id,
      BTRIM(p_name),
      NULLIF(BTRIM(COALESCE(p_description, '')), ''),
      p_selling_price,
      p_validity_days,
      p_active,
      (SELECT auth.uid())
    )
    RETURNING id INTO v_product_id;
  ELSE
    UPDATE public.voucher_products AS product
    SET
      name = BTRIM(p_name),
      description = NULLIF(BTRIM(COALESCE(p_description, '')), ''),
      selling_price = p_selling_price,
      validity_days = p_validity_days,
      active = p_active
    WHERE product.id = v_product_id
      AND product.store_id = v_store_id
      AND product.deleted_at IS NULL;

    IF NOT FOUND THEN
      RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'PRODUCT_NOT_FOUND');
    END IF;

    DELETE FROM public.voucher_product_items AS item
    WHERE item.voucher_product_id = v_product_id
      AND item.store_id = v_store_id;
  END IF;

  FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
  LOOP
    INSERT INTO public.voucher_product_items (
      store_id,
      voucher_product_id,
      service_id,
      quantity
    ) VALUES (
      v_store_id,
      v_product_id,
      (v_item ->> 'service_id')::UUID,
      (v_item ->> 'quantity')::INTEGER
    );
  END LOOP;

  RETURN JSONB_BUILD_OBJECT('ok', TRUE, 'id', v_product_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'DUPLICATE_NAME_OR_SERVICE');
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_voucher_product(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR NOT public.is_admin() THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  UPDATE public.voucher_products AS product
  SET active = FALSE, deleted_at = NOW()
  WHERE product.id = p_product_id
    AND product.store_id = v_store_id
    AND product.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'PRODUCT_NOT_FOUND');
  END IF;

  RETURN JSONB_BUILD_OBJECT('ok', TRUE, 'id', p_product_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.sell_voucher_product(
  p_product_id UUID,
  p_client_id UUID,
  p_purchased_on DATE DEFAULT CURRENT_DATE,
  p_paid_amount INTEGER DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'other',
  p_notes TEXT DEFAULT NULL
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
  v_paid_amount INTEGER;
  v_expires_on DATE;
  v_item RECORD;
  v_item_id UUID;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR v_store_id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF p_purchased_on IS NULL
    OR p_payment_method NOT IN ('cash', 'transfer', 'card', 'other')
    OR p_paid_amount < 0
    OR CHAR_LENGTH(COALESCE(p_notes, '')) > 1000 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_INPUT');
  END IF;

  SELECT product.*
  INTO v_product
  FROM public.voucher_products AS product
  WHERE product.id = p_product_id
    AND product.store_id = v_store_id
    AND product.active = TRUE
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.voucher_product_items AS item
    WHERE item.voucher_product_id = v_product.id
      AND item.store_id = v_store_id
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'PRODUCT_HAS_NO_ITEMS');
  END IF;

  v_paid_amount := COALESCE(p_paid_amount, v_product.selling_price);

  IF v_paid_amount = 0 AND NULLIF(BTRIM(COALESCE(p_notes, '')), '') IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FREE_VOUCHER_NOTE_REQUIRED');
  END IF;

  v_expires_on := CASE
    WHEN v_product.validity_days IS NULL THEN NULL
    ELSE p_purchased_on + v_product.validity_days
  END;

  v_sale_number := CONCAT(
    'VC-', TO_CHAR(NOW(), 'YYYYMMDD'), '-',
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
    created_by
  ) VALUES (
    v_store_id,
    p_client_id,
    v_product.id,
    v_sale_number,
    v_product.name,
    v_product.description,
    v_paid_amount,
    p_payment_method,
    p_purchased_on,
    v_expires_on,
    NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
    (SELECT auth.uid())
  )
  RETURNING id INTO v_client_voucher_id;

  FOR v_item IN
    SELECT
      product_item.service_id,
      product_item.quantity,
      service.name AS service_name
    FROM public.voucher_product_items AS product_item
    JOIN public.services AS service
      ON service.id = product_item.service_id
     AND service.store_id = product_item.store_id
    WHERE product_item.voucher_product_id = v_product.id
      AND product_item.store_id = v_store_id
    ORDER BY product_item.id
  LOOP
    INSERT INTO public.client_voucher_items (
      store_id,
      client_voucher_id,
      service_id,
      service_name_snapshot,
      total_quantity
    ) VALUES (
      v_store_id,
      v_client_voucher_id,
      v_item.service_id,
      v_item.service_name,
      v_item.quantity
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
      v_item.quantity,
      v_item.quantity,
      0,
      0,
      '登記購買商品券',
      (SELECT auth.uid())
    );
  END LOOP;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, new_values, store_id
  ) VALUES (
    (SELECT auth.uid()),
    'voucher_sold',
    'client_vouchers',
    v_client_voucher_id,
    JSONB_BUILD_OBJECT(
      'sale_number', v_sale_number,
      'client_id', p_client_id,
      'product_id', v_product.id,
      'paid_amount', v_paid_amount,
      'expires_on', v_expires_on
    ),
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'id', v_client_voucher_id,
    'sale_number', v_sale_number,
    'expires_on', v_expires_on
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.void_client_voucher(
  p_client_voucher_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_voucher public.client_vouchers%ROWTYPE;
  v_item RECORD;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR NOT public.is_admin() THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL
    OR CHAR_LENGTH(p_reason) > 1000 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'REASON_REQUIRED');
  END IF;

  SELECT voucher.*
  INTO v_voucher
  FROM public.client_vouchers AS voucher
  WHERE voucher.id = p_client_voucher_id
    AND voucher.store_id = v_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'VOUCHER_NOT_FOUND');
  END IF;

  IF v_voucher.status = 'voided' THEN
    RETURN JSONB_BUILD_OBJECT('ok', TRUE, 'id', v_voucher.id, 'already_voided', TRUE);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.client_voucher_items AS item
    WHERE item.client_voucher_id = v_voucher.id
      AND (item.reserved_quantity > 0 OR item.used_quantity > 0)
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'VOUCHER_HAS_ACTIVITY');
  END IF;

  UPDATE public.client_vouchers
  SET
    status = 'voided',
    voided_by = (SELECT auth.uid()),
    voided_at = NOW(),
    void_reason = BTRIM(p_reason)
  WHERE id = v_voucher.id;

  FOR v_item IN
    SELECT item.*
    FROM public.client_voucher_items AS item
    WHERE item.client_voucher_id = v_voucher.id
    ORDER BY item.id
  LOOP
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
      v_item.id,
      'voided',
      v_item.total_quantity + v_item.adjustment_quantity,
      v_item.total_quantity + v_item.adjustment_quantity,
      v_item.reserved_quantity,
      v_item.used_quantity,
      BTRIM(p_reason),
      (SELECT auth.uid())
    );
  END LOOP;

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, old_values, new_values, store_id
  ) VALUES (
    (SELECT auth.uid()),
    'voucher_voided',
    'client_vouchers',
    v_voucher.id,
    JSONB_BUILD_OBJECT('status', v_voucher.status),
    JSONB_BUILD_OBJECT('status', 'voided', 'reason', BTRIM(p_reason)),
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT('ok', TRUE, 'id', v_voucher.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_client_voucher_item(
  p_client_voucher_item_id UUID,
  p_quantity_delta INTEGER,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_item public.client_voucher_items%ROWTYPE;
  v_available INTEGER;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR v_store_id IS NULL
    OR NOT public.is_admin() THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF p_quantity_delta IS NULL OR p_quantity_delta = 0
    OR NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL
    OR CHAR_LENGTH(p_reason) > 1000 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_ADJUSTMENT');
  END IF;

  UPDATE public.client_voucher_items AS item
  SET adjustment_quantity = item.adjustment_quantity + p_quantity_delta
  FROM public.client_vouchers AS voucher
  WHERE item.id = p_client_voucher_item_id
    AND item.store_id = v_store_id
    AND voucher.id = item.client_voucher_id
    AND voucher.store_id = item.store_id
    AND voucher.status = 'active'
    AND item.total_quantity + item.adjustment_quantity + p_quantity_delta
      >= item.reserved_quantity + item.used_quantity
  RETURNING item.* INTO v_item;

  IF NOT FOUND THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INSUFFICIENT_OR_INVALID_BALANCE');
  END IF;

  v_available := v_item.total_quantity + v_item.adjustment_quantity
    - v_item.reserved_quantity - v_item.used_quantity;

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
    v_item.id,
    'adjusted',
    ABS(p_quantity_delta),
    v_available,
    v_item.reserved_quantity,
    v_item.used_quantity,
    CONCAT(
      CASE WHEN p_quantity_delta > 0 THEN '增加 ' ELSE '扣除 ' END,
      ABS(p_quantity_delta), ' 堂：', BTRIM(p_reason)
    ),
    (SELECT auth.uid())
  );

  INSERT INTO public.audit_logs (
    user_id, action, table_name, record_id, new_values, store_id
  ) VALUES (
    (SELECT auth.uid()),
    'voucher_balance_adjusted',
    'client_voucher_items',
    v_item.id,
    JSONB_BUILD_OBJECT(
      'quantity_delta', p_quantity_delta,
      'available_after', v_available,
      'reason', BTRIM(p_reason)
    ),
    v_store_id
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'id', v_item.id,
    'available_quantity', v_available,
    'reserved_quantity', v_item.reserved_quantity,
    'used_quantity', v_item.used_quantity
  );
END;
$$;

-- ============================================================
-- 6. 預約保留／釋放／兌換
-- ============================================================

CREATE OR REPLACE FUNCTION private.reserve_voucher_for_booking(
  p_booking_id UUID,
  p_preferred_item_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking RECORD;
  v_item RECORD;
  v_redemption_id UUID;
  v_available INTEGER;
  v_reserved INTEGER;
  v_used INTEGER;
BEGIN
  SELECT
    booking.id,
    booking.store_id,
    booking.client_id,
    booking.service_id,
    booking.start_time,
    booking.status,
    booking.source,
    store.timezone
  INTO v_booking
  FROM public.bookings AS booking
  JOIN public.stores AS store ON store.id = booking.store_id
  WHERE booking.id = p_booking_id
    AND booking.deleted_at IS NULL
  FOR UPDATE OF booking;

  IF NOT FOUND OR v_booking.status NOT IN (
    'pending'::public.booking_status,
    'confirmed'::public.booking_status
  ) THEN
    RETURN NULL;
  END IF;

  -- 匿名網頁預約僅憑電話識別，不得自動動用客戶商品券。
  IF COALESCE(v_booking.source, 'web') <> 'line'
    AND (SELECT auth.uid()) IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT redemption.id
  INTO v_redemption_id
  FROM public.voucher_redemptions AS redemption
  WHERE redemption.booking_id = v_booking.id
    AND redemption.status IN ('reserved', 'redeemed')
  LIMIT 1;

  IF v_redemption_id IS NOT NULL THEN
    RETURN v_redemption_id;
  END IF;

  SELECT
    item.id,
    item.total_quantity,
    item.adjustment_quantity,
    item.reserved_quantity,
    item.used_quantity
  INTO v_item
  FROM public.client_voucher_items AS item
  JOIN public.client_vouchers AS voucher
    ON voucher.id = item.client_voucher_id
   AND voucher.store_id = item.store_id
  WHERE item.store_id = v_booking.store_id
    AND voucher.client_id = v_booking.client_id
    AND item.service_id = v_booking.service_id
    AND voucher.status = 'active'
    AND voucher.purchased_on <= (
      v_booking.start_time AT TIME ZONE COALESCE(v_booking.timezone, 'Asia/Taipei')
    )::DATE
    AND (
      voucher.expires_on IS NULL
      OR voucher.expires_on >= (
        v_booking.start_time AT TIME ZONE COALESCE(v_booking.timezone, 'Asia/Taipei')
      )::DATE
    )
    AND item.reserved_quantity + item.used_quantity
      < item.total_quantity + item.adjustment_quantity
    AND (p_preferred_item_id IS NULL OR item.id = p_preferred_item_id)
  ORDER BY
    voucher.expires_on ASC NULLS LAST,
    voucher.purchased_on ASC,
    voucher.created_at ASC,
    item.id ASC
  FOR UPDATE OF item
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.client_voucher_items AS item
  SET reserved_quantity = item.reserved_quantity + 1
  WHERE item.id = v_item.id
    AND item.reserved_quantity + item.used_quantity
      < item.total_quantity + item.adjustment_quantity
  RETURNING
    item.total_quantity + item.adjustment_quantity
      - item.reserved_quantity - item.used_quantity,
    item.reserved_quantity,
    item.used_quantity
  INTO v_available, v_reserved, v_used;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.voucher_redemptions (
    store_id, booking_id, client_voucher_item_id
  ) VALUES (
    v_booking.store_id, v_booking.id, v_item.id
  )
  RETURNING id INTO v_redemption_id;

  INSERT INTO public.voucher_ledger (
    store_id,
    client_voucher_item_id,
    redemption_id,
    booking_id,
    action,
    quantity,
    available_after,
    reserved_after,
    used_after,
    reason,
    actor_user_id
  ) VALUES (
    v_booking.store_id,
    v_item.id,
    v_redemption_id,
    v_booking.id,
    'reserved',
    1,
    v_available,
    v_reserved,
    v_used,
    '預約保留堂數',
    (SELECT auth.uid())
  );

  RETURN v_redemption_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.release_booking_voucher(p_booking_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_redemption public.voucher_redemptions%ROWTYPE;
  v_item public.client_voucher_items%ROWTYPE;
  v_available INTEGER;
BEGIN
  SELECT redemption.*
  INTO v_redemption
  FROM public.voucher_redemptions AS redemption
  WHERE redemption.booking_id = p_booking_id
    AND redemption.status = 'reserved'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.client_voucher_items AS item
  SET reserved_quantity = item.reserved_quantity - 1
  WHERE item.id = v_redemption.client_voucher_item_id
    AND item.reserved_quantity > 0
  RETURNING item.* INTO v_item;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VOUCHER_RESERVED_BALANCE_INCONSISTENT';
  END IF;

  UPDATE public.voucher_redemptions
  SET status = 'released', released_at = NOW()
  WHERE id = v_redemption.id;

  v_available := v_item.total_quantity + v_item.adjustment_quantity
    - v_item.reserved_quantity - v_item.used_quantity;

  INSERT INTO public.voucher_ledger (
    store_id,
    client_voucher_item_id,
    redemption_id,
    booking_id,
    action,
    quantity,
    available_after,
    reserved_after,
    used_after,
    reason,
    actor_user_id
  ) VALUES (
    v_redemption.store_id,
    v_item.id,
    v_redemption.id,
    p_booking_id,
    'released',
    1,
    v_available,
    v_item.reserved_quantity,
    v_item.used_quantity,
    '取消或變更預約，釋放堂數',
    (SELECT auth.uid())
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION private.redeem_booking_voucher(p_booking_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_redemption public.voucher_redemptions%ROWTYPE;
  v_item public.client_voucher_items%ROWTYPE;
  v_available INTEGER;
BEGIN
  SELECT redemption.*
  INTO v_redemption
  FROM public.voucher_redemptions AS redemption
  WHERE redemption.booking_id = p_booking_id
    AND redemption.status = 'reserved'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  UPDATE public.client_voucher_items AS item
  SET
    reserved_quantity = item.reserved_quantity - 1,
    used_quantity = item.used_quantity + 1
  WHERE item.id = v_redemption.client_voucher_item_id
    AND item.reserved_quantity > 0
  RETURNING item.* INTO v_item;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VOUCHER_RESERVED_BALANCE_INCONSISTENT';
  END IF;

  UPDATE public.voucher_redemptions
  SET status = 'redeemed', redeemed_at = NOW()
  WHERE id = v_redemption.id;

  v_available := v_item.total_quantity + v_item.adjustment_quantity
    - v_item.reserved_quantity - v_item.used_quantity;

  INSERT INTO public.voucher_ledger (
    store_id,
    client_voucher_item_id,
    redemption_id,
    booking_id,
    action,
    quantity,
    available_after,
    reserved_after,
    used_after,
    reason,
    actor_user_id
  ) VALUES (
    v_redemption.store_id,
    v_item.id,
    v_redemption.id,
    p_booking_id,
    'redeemed',
    1,
    v_available,
    v_item.reserved_quantity,
    v_item.used_quantity,
    '預約完課或未到場，正式扣堂',
    (SELECT auth.uid())
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_booking_voucher()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NULL
      AND NEW.status IN (
        'pending'::public.booking_status,
        'confirmed'::public.booking_status
      ) THEN
      PERFORM private.reserve_voucher_for_booking(NEW.id);
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL
    OR NEW.status = 'cancelled'::public.booking_status THEN
    PERFORM private.release_booking_voucher(NEW.id);
    RETURN NEW;
  END IF;

  IF NEW.status IN (
    'completed'::public.booking_status,
    'no_show'::public.booking_status
  ) THEN
    PERFORM private.redeem_booking_voucher(NEW.id);
    RETURN NEW;
  END IF;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
    OR NEW.start_time IS DISTINCT FROM OLD.start_time THEN
    PERFORM private.release_booking_voucher(NEW.id);
    PERFORM private.reserve_voucher_for_booking(NEW.id);
  ELSIF OLD.status = 'cancelled'::public.booking_status
    AND NEW.status IN (
      'pending'::public.booking_status,
      'confirmed'::public.booking_status
    ) THEN
    PERFORM private.reserve_voucher_for_booking(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_booking_voucher ON public.bookings;
CREATE TRIGGER sync_booking_voucher
  AFTER INSERT OR UPDATE OF client_id, service_id, start_time, status, deleted_at
  ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION private.sync_booking_voucher();

CREATE OR REPLACE FUNCTION public.set_booking_voucher(
  p_booking_id UUID,
  p_use_voucher BOOLEAN,
  p_client_voucher_item_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id UUID := public.current_store_id();
  v_redemption_id UUID;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR v_store_id IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'FORBIDDEN');
  END IF;

  IF p_use_voucher IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'INVALID_INPUT');
  END IF;

  -- 與自動同步觸發器一致，固定先鎖預約、再鎖兌換與堂數，避免死鎖。
  PERFORM 1
  FROM public.bookings AS booking
  WHERE booking.id = p_booking_id
    AND booking.store_id = v_store_id
    AND booking.deleted_at IS NULL
    AND booking.status IN (
      'pending'::public.booking_status,
      'confirmed'::public.booking_status
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'BOOKING_NOT_EDITABLE');
  END IF;

  PERFORM private.release_booking_voucher(p_booking_id);

  IF NOT p_use_voucher THEN
    RETURN JSONB_BUILD_OBJECT('ok', TRUE, 'redemption_id', NULL);
  END IF;

  v_redemption_id := private.reserve_voucher_for_booking(
    p_booking_id,
    p_client_voucher_item_id
  );

  IF v_redemption_id IS NULL THEN
    RAISE EXCEPTION 'VOUCHER_NOT_ELIGIBLE_OR_NO_BALANCE'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN JSONB_BUILD_OBJECT('ok', TRUE, 'redemption_id', v_redemption_id);
END;
$$;

-- ============================================================
-- 7. 方案異動稽核
-- ============================================================

CREATE OR REPLACE FUNCTION private.audit_voucher_product_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row JSONB;
  v_record_id UUID;
  v_store_id UUID;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN TO_JSONB(OLD) ELSE TO_JSONB(NEW) END;
  v_record_id := (v_row ->> 'id')::UUID;
  v_store_id := (v_row ->> 'store_id')::UUID;

  INSERT INTO public.audit_logs (
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values,
    store_id
  ) VALUES (
    (SELECT auth.uid()),
    LOWER(TG_OP),
    TG_TABLE_NAME,
    v_record_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN TO_JSONB(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN TO_JSONB(NEW) ELSE NULL END,
    v_store_id
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_voucher_products
  ON public.voucher_products;
CREATE TRIGGER audit_voucher_products
  AFTER INSERT OR UPDATE OR DELETE ON public.voucher_products
  FOR EACH ROW EXECUTE FUNCTION private.audit_voucher_product_changes();

DROP TRIGGER IF EXISTS audit_voucher_product_items
  ON public.voucher_product_items;
CREATE TRIGGER audit_voucher_product_items
  AFTER INSERT OR UPDATE OR DELETE ON public.voucher_product_items
  FOR EACH ROW EXECUTE FUNCTION private.audit_voucher_product_changes();

-- ============================================================
-- 8. RLS 與最小權限
-- ============================================================

ALTER TABLE public.voucher_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_product_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_voucher_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_store_voucher_products"
  ON public.voucher_products;
CREATE POLICY "select_store_voucher_products"
  ON public.voucher_products FOR SELECT TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

DROP POLICY IF EXISTS "manage_admin_voucher_products"
  ON public.voucher_products;
CREATE POLICY "manage_admin_voucher_products"
  ON public.voucher_products FOR ALL TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  )
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS "select_store_voucher_product_items"
  ON public.voucher_product_items;
CREATE POLICY "select_store_voucher_product_items"
  ON public.voucher_product_items FOR SELECT TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

DROP POLICY IF EXISTS "manage_admin_voucher_product_items"
  ON public.voucher_product_items;
CREATE POLICY "manage_admin_voucher_product_items"
  ON public.voucher_product_items FOR ALL TO authenticated
  USING (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  )
  WITH CHECK (
    store_id = (SELECT public.current_store_id())
    AND (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS "select_store_client_vouchers"
  ON public.client_vouchers;
CREATE POLICY "select_store_client_vouchers"
  ON public.client_vouchers FOR SELECT TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

DROP POLICY IF EXISTS "select_store_client_voucher_items"
  ON public.client_voucher_items;
CREATE POLICY "select_store_client_voucher_items"
  ON public.client_voucher_items FOR SELECT TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

DROP POLICY IF EXISTS "select_store_voucher_redemptions"
  ON public.voucher_redemptions;
CREATE POLICY "select_store_voucher_redemptions"
  ON public.voucher_redemptions FOR SELECT TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

DROP POLICY IF EXISTS "select_store_voucher_ledger"
  ON public.voucher_ledger;
CREATE POLICY "select_store_voucher_ledger"
  ON public.voucher_ledger FOR SELECT TO authenticated
  USING (store_id = (SELECT public.current_store_id()));

REVOKE ALL PRIVILEGES ON TABLE
  public.voucher_products,
  public.voucher_product_items,
  public.client_vouchers,
  public.client_voucher_items,
  public.voucher_redemptions,
  public.voucher_ledger
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT
  ON TABLE public.voucher_products, public.voucher_product_items
  TO authenticated;

GRANT SELECT
  ON TABLE
    public.client_vouchers,
    public.client_voucher_items,
    public.voucher_redemptions,
    public.voucher_ledger
  TO authenticated;

GRANT SELECT
  ON TABLE
    public.voucher_products,
    public.voucher_product_items,
    public.client_vouchers,
    public.client_voucher_items,
    public.voucher_redemptions,
    public.voucher_ledger
  TO service_role;

REVOKE ALL ON FUNCTION public.save_voucher_product(
  UUID, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN, JSONB
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_voucher_product(
  UUID, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN, JSONB
) TO authenticated;

REVOKE ALL ON FUNCTION public.archive_voucher_product(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_voucher_product(UUID)
  TO authenticated;

REVOKE ALL ON FUNCTION public.sell_voucher_product(
  UUID, UUID, DATE, INTEGER, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sell_voucher_product(
  UUID, UUID, DATE, INTEGER, TEXT, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION public.void_client_voucher(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_client_voucher(UUID, TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.adjust_client_voucher_item(UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_client_voucher_item(UUID, INTEGER, TEXT)
  TO authenticated;

REVOKE ALL ON FUNCTION public.set_booking_voucher(UUID, BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_booking_voucher(UUID, BOOLEAN, UUID)
  TO authenticated;

REVOKE ALL ON FUNCTION private.set_voucher_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.validate_voucher_product_item_store()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.validate_client_voucher_item_store()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.reserve_voucher_for_booking(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.release_booking_voucher(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.redeem_booking_voucher(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.sync_booking_voucher()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.audit_voucher_product_changes()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.voucher_products IS '店家可重複銷售的商品券方案';
COMMENT ON TABLE public.voucher_product_items IS '商品券方案內固定對應的課程與堂數';
COMMENT ON TABLE public.client_vouchers IS '客戶購買商品券的價格、內容與效期快照';
COMMENT ON TABLE public.client_voucher_items IS '客戶商品券各課程的總堂數與即時餘額';
COMMENT ON TABLE public.voucher_redemptions IS '預約與商品券堂數的保留、使用或釋放關聯';
COMMENT ON TABLE public.voucher_ledger IS '商品券堂數不可覆寫的完整異動帳本';

COMMIT;
