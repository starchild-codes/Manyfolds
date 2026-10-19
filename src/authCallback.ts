import type { SupabaseClient } from '@supabase/supabase-js'
import { withAuthTimeout } from './authErrors.ts'

export async function completeAuthCallback(auth: SupabaseClient['auth'], code: string | null) {
 // A recovery link must be exchanged even if another session is already active.
 // Otherwise a signed-in user is silently returned to the dashboard without a
 // chance to set the new password. Only the SDK's PASSWORD_RECOVERY event can
 // select recovery mode; a query parameter alone is not proof of recovery.
 if (code) {
  let recovery = false
  const { data: { subscription } } = auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') recovery = true })
  try {
   const { data, error } = await withAuthTimeout(auth.exchangeCodeForSession(code))
   if (error) throw error
   if (!data.session) throw new Error('The sign-in service did not return a session. Please start again.')
   return { recovery }
  } finally { subscription.unsubscribe() }
 }
 const { data, error } = await withAuthTimeout(auth.getSession())
 if (error) throw error
 if (!data.session) throw new Error('The sign-in link is incomplete or expired. Please start again.')
 return { recovery: false }
}
