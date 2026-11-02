import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

export function createSessionSupabaseClient(accessToken: string) {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => accessToken,
  })
}
