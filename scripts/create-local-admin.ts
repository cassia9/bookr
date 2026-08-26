import { createClient } from "npm:@supabase/supabase-js@2.106.1"

const requireEnv = (name: string): string => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`缺少本地環境變數：${name}`)
  return value
}

const supabaseUrl = requireEnv("VITE_SUPABASE_URL")
const publishableKey = requireEnv("VITE_SUPABASE_ANON_KEY")
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
const email = requireEnv("BOOKR_LOCAL_ADMIN_EMAIL")
const password = requireEnv("BOOKR_LOCAL_ADMIN_PASSWORD")
const hostname = new URL(supabaseUrl).hostname

if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
  throw new Error("拒絕在非本機 Supabase 建立測試管理員")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const { data: listedUsers, error: listError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
})

if (listError) throw listError

let user = listedUsers.users.find((candidate) => candidate.email === email)

if (!user) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "本地測試管理員" },
  })

  if (error) throw error
  user = data.user
} else {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: { full_name: "本地測試管理員" },
  })

  if (error) throw error
  user = data.user
}

const { error: profileError } = await supabase.from("users").upsert({
  id: user.id,
  email,
  full_name: "本地測試管理員",
  role: "admin",
  store_id: "00000000-0000-0000-0000-000000000001",
})

if (profileError) throw profileError

const localClient = createClient(supabaseUrl, publishableKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
const { error: signInError } = await localClient.auth.signInWithPassword({ email, password })

if (signInError) throw signInError
await localClient.auth.signOut()

console.log(`本地測試管理員已就緒：${email}`)
