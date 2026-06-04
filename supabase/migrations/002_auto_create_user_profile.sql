-- 當新的 Auth 使用者建立時，自動在 users 表建立對應 profile
-- 適用於 Google OAuth 第一次登入的情況

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  -- 只有在 users 表還沒有這筆記錄時才新增（避免重複）
  INSERT INTO public.users (id, email, full_name, role, store_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'member',
    '00000000-0000-0000-0000-000000000001'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 綁定到 auth.users 的 INSERT 事件
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
