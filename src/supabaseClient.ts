import { createClient, type SupabaseClient } from '@supabase/supabase-js'

declare const __MANYFOLDS_SUPABASE_URL__: string
declare const __MANYFOLDS_SUPABASE_ANON_KEY__: string

let client: SupabaseClient | null = null
try {
  if (__MANYFOLDS_SUPABASE_URL__ && __MANYFOLDS_SUPABASE_ANON_KEY__) {
    client = createClient(__MANYFOLDS_SUPABASE_URL__, __MANYFOLDS_SUPABASE_ANON_KEY__, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  }
} catch {
  client = null
}
export const supabase = client
