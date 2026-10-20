import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import {authRedirectError,authErrorMessage,withAuthTimeout} from '../src/authErrors.ts'
import {completeAuthCallback} from '../src/authCallback.ts'

const client = readFileSync('src/supabaseClient.ts', 'utf8')
const auth = readFileSync('src/Auth.tsx', 'utf8') + readFileSync('src/authCallback.ts', 'utf8')

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
assert.match(authErrorMessage({code:'bad_oauth_state',message:'OAuth state has expired'}),/new sign-in/)
assert.ok(readFileSync('src/App.tsx','utf8').includes("route==='/'&&authRedirectError"),'Provider errors returned to the site root must use the visible authentication error screen')
assert.match(authErrorMessage({message:'PKCE code verifier not found'}),/another browser/)
assert.match(authErrorMessage({code:'access_denied'}),/cancelled/)
assert.match(authErrorMessage({message:'invalid_client'}),/not configured correctly/)
assert.match(authErrorMessage(new TypeError('Failed to fetch')),/connection/)
assert.equal(await withAuthTimeout(Promise.resolve('ready'),100),'ready')
await assert.rejects(withAuthTimeout(new Promise(()=>{}),5),error=>error.code==='auth_timeout')
let exchanged=0,sessionChecks=0
let authEvent=()=>{},unsubscribed=0
const callbackAuth={onAuthStateChange:callback=>{authEvent=callback;return {data:{subscription:{unsubscribe:()=>{unsubscribed++}}}}},getSession:async()=>{sessionChecks++;return {data:{session:{user:{id:'test'}}},error:null}},exchangeCodeForSession:async code=>{assert.equal(code,'recovery-code');exchanged++;authEvent('PASSWORD_RECOVERY');return {data:{session:{user:{id:'test'}}},error:null}}}
assert.deepEqual(await completeAuthCallback(callbackAuth,'recovery-code'),{recovery:true})
assert.equal(exchanged,1);assert.equal(sessionChecks,0,'An existing session must not bypass a recovery-code exchange')
assert.equal(unsubscribed,1)
assert.deepEqual(await completeAuthCallback(callbackAuth,null),{recovery:false})
await assert.rejects(completeAuthCallback({...callbackAuth,exchangeCodeForSession:async()=>({data:{session:null},error:new Error('Expired recovery code')})},'expired'),/Expired recovery code/)
await assert.rejects(completeAuthCallback({...callbackAuth,getSession:async()=>({data:{session:null},error:null})},null),/incomplete or expired/)
console.log('Authentication checks passed: PKCE guard, query/fragment errors, expired flows, provider/network messages and bounded waiting')
