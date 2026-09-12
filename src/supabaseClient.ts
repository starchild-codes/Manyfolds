import { createClient } from '@supabase/supabase-js'

declare const __MANYFOLDS_SUPABASE_URL__: string
declare const __MANYFOLDS_SUPABASE_ANON_KEY__: string

export const supabase =
  __MANYFOLDS_SUPABASE_URL__ && __MANYFOLDS_SUPABASE_ANON_KEY__
    ? createClient(__MANYFOLDS_SUPABASE_URL__, __MANYFOLDS_SUPABASE_ANON_KEY__, {
        auth: {
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null
