-- 審計日誌敏感資料防護：
-- 所有來源（Edge Function、資料庫 Trigger、未來批次工作）寫入前，
-- 統一移除不應長期保存的秘密欄位。

BEGIN;

CREATE OR REPLACE FUNCTION public.redact_audit_log_secrets()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  sensitive_keys CONSTANT TEXT[] := ARRAY[
    'token',
    'password',
    'authorization',
    'access_token',
    'refresh_token',
    'api_key',
    'secret'
  ];
BEGIN
  IF NEW.old_values IS NOT NULL THEN
    NEW.old_values := NEW.old_values - sensitive_keys;
  END IF;

  IF NEW.new_values IS NOT NULL THEN
    NEW.new_values := NEW.new_values - sensitive_keys;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.redact_audit_log_secrets()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_redact_audit_log_secrets
  ON public.audit_logs;

CREATE TRIGGER trg_redact_audit_log_secrets
BEFORE INSERT OR UPDATE
ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.redact_audit_log_secrets();

-- 再次清理歷史資料，涵蓋第一份緊急 Migration 以外的敏感鍵。
UPDATE public.audit_logs
SET
  old_values = CASE
    WHEN old_values IS NULL THEN NULL
    ELSE old_values - ARRAY[
      'token',
      'password',
      'authorization',
      'access_token',
      'refresh_token',
      'api_key',
      'secret'
    ]::TEXT[]
  END,
  new_values = CASE
    WHEN new_values IS NULL THEN NULL
    ELSE new_values - ARRAY[
      'token',
      'password',
      'authorization',
      'access_token',
      'refresh_token',
      'api_key',
      'secret'
    ]::TEXT[]
  END
WHERE
  COALESCE(old_values, '{}'::JSONB) ?| ARRAY[
    'token',
    'password',
    'authorization',
    'access_token',
    'refresh_token',
    'api_key',
    'secret'
  ]
  OR COALESCE(new_values, '{}'::JSONB) ?| ARRAY[
    'token',
    'password',
    'authorization',
    'access_token',
    'refresh_token',
    'api_key',
    'secret'
  ];

COMMIT;
