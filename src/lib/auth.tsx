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
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const profileRequestId = useRef(0)

  async function fetchProfile(userId: string) {
    const requestId = ++profileRequestId.current
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (requestId !== profileRequestId.current) return
    setProfile(error ? null : data)
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
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setSupabaseUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else {
        profileRequestId.current += 1
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      profileRequestId.current += 1
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      session,
      supabaseUser,
      profile,
      role: profile?.role ?? null,
      isAdmin: profile?.role === 'admin',
      loading,
      signIn,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
