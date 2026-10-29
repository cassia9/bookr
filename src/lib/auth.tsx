import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<User | null>(null)
  const [profileError, setProfileError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const profileRequestId = useRef(0)

  async function fetchProfile(userId: string, refreshOnError = true) {
    const requestId = ++profileRequestId.current
    setProfileError(null)

    let result = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (requestId !== profileRequestId.current) return

    if (result.error && refreshOnError) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()

      if (requestId !== profileRequestId.current) return

      if (!refreshError && refreshed.user?.id === userId) {
        result = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .maybeSingle()
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
      if (session?.user) fetchProfile(session.user.id)
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
      if (session?.user) fetchProfile(session.user.id, event !== 'TOKEN_REFRESHED')
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

    const { data, error } = await supabase.auth.refreshSession()
    const user = data.user ?? session?.user ?? null

    if (error || !user) {
      setProfile(null)
      setProfileError(new Error('登入狀態已失效，請登出後重新登入。'))
      setLoading(false)
      return
    }

    await fetchProfile(user.id, false)
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
