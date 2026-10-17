import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import {authRedirectError,authErrorMessage,withAuthTimeout} from '../src/authErrors.ts'

const client = readFileSync('src/supabaseClient.ts', 'utf8')
const auth = readFileSync('src/Auth.tsx', 'utf8')

const checks = [
  [client.includes("flowType: 'pkce'"), 'Supabase auth must use PKCE'],
  [client.includes('detectSessionInUrl: false'), 'Callback exchange must not race automatic URL detection'],
  [auth.includes("params.get('code')"), 'Callback must read the authorization code parameter'],
  [
    auth.includes('exchangeCodeForSession(code)'),
    'Callback must exchange only the authorization code, not the complete URL',
  ],
  [auth.includes('exchangeStarted.current'), 'Callback exchange must be guarded against duplicate effects'],
]

const failed = checks.filter(([passed]) => !passed)
if (failed.length) {
  for (const [, message] of failed) console.error(`Auth flow check failed: ${message}`)
  process.exit(1)
}

assert.equal(authRedirectError('?code=synthetic',''),null)
assert.equal(authRedirectError('','#error=access_denied&error_description=Cancelled').code,'access_denied')
assert.equal(authRedirectError('?error_code=flow_state_expired','#error_description=Expired').message,'Expired')
assert.match(authErrorMessage({code:'flow_state_expired'}),/new sign-in/)
assert.match(authErrorMessage({message:'PKCE code verifier not found'}),/another browser/)
assert.match(authErrorMessage({code:'access_denied'}),/cancelled/)
assert.match(authErrorMessage({message:'invalid_client'}),/not configured correctly/)
assert.match(authErrorMessage(new TypeError('Failed to fetch')),/connection/)
assert.equal(await withAuthTimeout(Promise.resolve('ready'),100),'ready')
await assert.rejects(withAuthTimeout(new Promise(()=>{}),5),error=>error.code==='auth_timeout')
console.log('Authentication checks passed: PKCE guard, query/fragment errors, expired flows, provider/network messages and bounded waiting')
