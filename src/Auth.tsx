import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from './supabaseClient'
import './Auth.css'
import { authRedirectError,authErrorMessage,withAuthTimeout } from './authErrors'
import { completeAuthCallback } from './authCallback'

const go = (path: string) => {
  if(path.startsWith('/invite/'))sessionStorage.removeItem('manyfolds-auth-return')
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

const signInDestination=()=>{const path=window.location.pathname;if(/^\/invite\/[a-f0-9]{64}$/.test(path))return path;const saved=sessionStorage.getItem('manyfolds-auth-return');return saved&&/^\/invite\/[a-f0-9]{64}$/.test(saved)?saved:'/dashboard'}

type Mode = 'signin' | 'signup' | 'reset'

function AuthBrand() {
  return (
    <a className="auth-brand" href="/" aria-label="Manyfolds home">
      many<span>folds</span>
    </a>
  )
}

export function SignIn() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const googleInFlight=useRef(false)

  const reset = () => {
    setError('')
    setMessage('')
  }

  const google = async () => {
    if(googleInFlight.current)return
    if (!supabase) {
      setError('Public authentication configuration is unavailable.')
      return
    }

    googleInFlight.current=true
    setBusy(true)
    reset()
    try{
    sessionStorage.setItem('manyfolds-auth-return',signInDestination())
    const { error: authError } = await withAuthTimeout(supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        skipBrowserRedirect: false,
      },
    }))
    if(authError)throw authError
    }catch(reason){setError(authErrorMessage(reason))}
    finally{googleInFlight.current=false;setBusy(false)}
  }

  const emailAction = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) {
      setError('Public authentication configuration is unavailable.')
      return
    }

    setBusy(true)
    reset()
    try {
      sessionStorage.setItem('manyfolds-auth-return',signInDestination())
      if (mode === 'reset') {
        const { error: authError } = await withAuthTimeout(supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback`,
        }))
        if (authError) throw authError
        setMessage('If an account exists, a secure password-reset email is on its way.')
        return
      }

      if (mode === 'signup') {
        const { error: authError } = await withAuthTimeout(supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        }))
        if (authError) throw authError
        setMessage('Check your email to confirm your account, then return here to sign in.')
        return
      }

      const { error: authError } = await withAuthTimeout(supabase.auth.signInWithPassword({ email, password }))
      if (authError) throw authError
      go(signInDestination())
    } catch (reason) {
      setError(authErrorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  const copy =
    mode === 'signin'
      ? ['Welcome back', 'Sign in to continue supporting the students entrusted to you.', 'Sign in']
      : mode === 'signup'
        ? [
            'Create your counsellor account',
            'Use your school-approved email. You will confirm it before accessing the workspace.',
            'Create account',
          ]
        : [
            'Reset your password',
            'We will send a secure reset link to your approved email address.',
            'Send reset link',
          ]

  return (
    <main className="auth-page">
      <div className="auth-orbit auth-orbit-a" />
      <div className="auth-orbit auth-orbit-b" />
      <section className="auth-showcase">
        <AuthBrand />
        <p className="auth-kicker">Guidance, carried forward</p>
        <h1>Every student deserves a path that stays visible.</h1>
        <p>
          One private workspace for thoughtful counsellors, real options, and the next
          meaningful action.
        </p>
        <div className="auth-trust">
          <span>Private by design</span>
          <span>Source-aware</span>
          <span>Counsellor-led</span>
        </div>
      </section>

      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-card-top">
          <p className="eyebrow">Manyfolds counsellor workspace</p>
          <span>Secure access</span>
        </div>
        <h2 id="auth-title">{copy[0]}</h2>
        <p>{copy[1]}</p>
        <button className="google-button" onClick={() => void google()} disabled={busy}>
          <span aria-hidden="true">G</span>
          {busy ? 'Opening Google…' : 'Continue with Google'}
        </button>
        <div className="auth-divider">
          <i />
          or continue with email
          <i />
        </div>
        <form onSubmit={(event) => void emailAction(event)}>
          <label>
            Email address
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@school.edu"
            />
          </label>
          {mode !== 'reset' && (
            <label>
              Password
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </label>
          )}
          <button className="email-button" disabled={busy}>
            {busy ? 'Please wait…' : copy[2]}
          </button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="auth-links">
          {mode === 'signin' ? (
            <>
              <button onClick={() => { setMode('reset'); reset() }}>Forgot password?</button>
              <button onClick={() => { setMode('signup'); reset() }}>Create an account</button>
            </>
          ) : (
            <button onClick={() => { setMode('signin'); reset() }}>Back to sign in</button>
          )}
        </div>
        <a className="auth-back" href="/">← Return to Manyfolds</a>
      </section>
    </main>
  )
}

export function AuthCallback() {
  const [state, setState] = useState<'working' | 'error' | 'recovery' | 'complete'>('working')
  const [message, setMessage] = useState('Completing your secure sign-in…')
  const exchangeStarted = useRef(false)
  const [newPassword, setNewPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [saving, setSaving] = useState(false), [passwordError, setPasswordError] = useState('')

  useEffect(() => {
    if (exchangeStarted.current) return
    exchangeStarted.current = true

    const complete = async () => {
      if (!supabase) {
        setState('error')
        setMessage('Supabase configuration is unavailable.')
        return
      }

      const params = new URLSearchParams(window.location.search)
      const providerError = authRedirectError(window.location.search,window.location.hash)
      if (providerError) {
        setState('error')
        setMessage(authErrorMessage(providerError))
        return
      }

      const code = params.get('code')
      const result = await completeAuthCallback(supabase.auth, code)
      window.history.replaceState({}, '', '/auth/callback')
      if (result.recovery) { setState('recovery'); setMessage('Choose a new password for your Manyfolds account.'); return }
      go(signInDestination())
    }

    void complete().catch(reason=>{setState('error');setMessage(authErrorMessage(reason))})
  }, [])

  const changePassword = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || !supabase) return
    setPasswordError('')
    if (newPassword.length < 8 || newPassword !== confirmation) { setPasswordError('Use at least 8 characters and enter the same password twice.'); return }
    setSaving(true)
    try {
      const { error } = await withAuthTimeout(supabase.auth.updateUser({ password: newPassword }))
      if (error) throw error
      setNewPassword(''); setConfirmation(''); setState('complete'); setMessage('Your password has been updated. You can continue to Manyfolds.')
    } catch (error) { setPasswordError(authErrorMessage(error)) }
    finally { setSaving(false) }
  }

  return (
    <main className="auth-page auth-callback">
      <section className="auth-card">
        <p className="eyebrow">Manyfolds</p>
        <h2>{state === 'working' ? 'Signing you in' : state === 'recovery' ? 'Choose a new password' : state === 'complete' ? 'Password updated' : 'Sign-in could not be completed'}</h2>
        <p>{message}</p>
        {state === 'working' && <div className="auth-loader" />}
        {state === 'recovery' && <form onSubmit={event => void changePassword(event)}>
          <label>New password<input type="password" minLength={8} maxLength={128} required autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} disabled={saving} /></label>
          <label>Confirm new password<input type="password" minLength={8} maxLength={128} required autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={saving} /></label>
          <button className="email-button" disabled={saving}>{saving ? 'Updating password…' : 'Update password'}</button>
          {passwordError && <p className="auth-error" role="alert">{passwordError}</p>}
        </form>}
        {state === 'complete' && <button className="email-button" onClick={() => go(signInDestination())}>Continue to Manyfolds</button>}
        {state === 'error' && <a className="email-button" href="/auth">Try again</a>}
      </section>
    </main>
  )
}

export function ProtectedWorkspace({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [sessionCheckError, setSessionCheckError] = useState('')

  useEffect(() => {
    if (!supabase) {
      setReady(true)
      return
    }

    let active = true, authResolved = false
    void withAuthTimeout(supabase.auth.getSession()).then(({ data, error }) => {
      if (!active || authResolved) return
      if (error) throw error
      setSignedIn(Boolean(data.session))
      setReady(true)
    }).catch(error => {
      if (!active || authResolved) return
      setSessionCheckError(authErrorMessage(error))
      setReady(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      authResolved = true
      setSessionCheckError('')
      setSignedIn(Boolean(session))
      setReady(true)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  if (!ready) {
    return (
      <main className="auth-page auth-callback">
        <section className="auth-card">
          <p className="eyebrow">Manyfolds</p>
          <h2>Checking your session…</h2>
          <div className="auth-loader" />
        </section>
      </main>
    )
  }

  if (sessionCheckError) return <main className="auth-page auth-callback"><section className="auth-card"><p className="eyebrow">Manyfolds</p><h2>Could not check your session</h2><p role="alert">{sessionCheckError}</p><button className="email-button" onClick={() => window.location.reload()}>Retry session check</button></section></main>
  return signedIn ? children : <SignIn />
}
