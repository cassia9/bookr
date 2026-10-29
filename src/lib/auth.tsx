import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { createSessionSupabaseClient, supabase } from './supabase'
import type { User, UserRole } from '../types/database'

interface AuthContextValue {
  session: Session | null
  supabaseUser: SupabaseUser | null
  profile: User | null
  role: UserRole | null
  isAdmin: boolean
  loading: boolean
  profileError: Error | null
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  retryProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const FUTURE_JWT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000]

function isFutureJwtError(error: { code?: string; message?: string } | null) {
  return error?.code === 'PGRST303'
    && error.message?.toLowerCase().includes('jwt issued at future') === true
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<User | null>(null)
  const [profileError, setProfileError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const profileRequestId = useRef(0)

  async function fetchProfile(activeSession: Session, refreshOnError = true) {
    const requestId = ++profileRequestId.current
    const userId = activeSession.user.id
    setProfileError(null)

    const queryProfile = (accessToken: string) => createSessionSupabaseClient(accessToken)
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    let result = await queryProfile(activeSession.access_token)

    // 正式環境的 Auth 與 PostgREST 可能短暫存在時鐘差。沿用同一張 Token
    // 等待生效，避免不斷刷新出新 Token 而形成 401 無限循環。
    for (const delay of FUTURE_JWT_RETRY_DELAYS_MS) {
      if (!isFutureJwtError(result.error)) break

      await wait(delay)
      if (requestId !== profileRequestId.current) return

      result = await queryProfile(activeSession.access_token)
    }

    if (requestId !== profileRequestId.current) return

    if (result.error && refreshOnError && !isFutureJwtError(result.error)) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()

      if (requestId !== profileRequestId.current) return

      if (!refreshError && refreshed.session?.user.id === userId) {
        result = await queryProfile(refreshed.session.access_token)
      }
    }

    if (requestId !== profileRequestId.current) return

    if (result.error) {
      setProfile((current) => current?.id === userId ? current : null)
      setProfileError(new Error('帳號資料暫時無法載入，請重新檢查。'))
    } else {
      setProfile(result.data)
      setProfileError(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setSupabaseUser(session?.user ?? null)
      if (session) fetchProfile(session)
      else {
        profileRequestId.current += 1
        setProfile(null)
        setProfileError(null)
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setSupabaseUser(session?.user ?? null)
      if (session) fetchProfile(session, event !== 'TOKEN_REFRESHED')
      else {
        profileRequestId.current += 1
        setProfile(null)
        setProfileError(null)
        setLoading(false)
      }
    })

    return () => {
      profileRequestId.current += 1
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    setLoading(true)
    setProfileError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setLoading(false)
    return { error: error as Error | null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function retryProfile() {
    setLoading(true)
    setProfileError(null)

    const { data, error } = await supabase.auth.getSession()
    const activeSession = data.session ?? session

    if (error || !activeSession) {
      setProfile(null)
      setProfileError(new Error('登入狀態已失效，請登出後重新登入。'))
      setLoading(false)
      return
    }

    await fetchProfile(activeSession)
  }

  return (
    <AuthContext.Provider value={{
      session,
      supabaseUser,
      profile,
      role: profile?.role ?? null,
      isAdmin: profile?.role === 'admin',
      loading,
      profileError,
      signIn,
      signOut,
      retryProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
