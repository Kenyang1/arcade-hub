import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { errorMessage, login, register, signOut } from '../lib/api.ts'
import { nextPath } from '../lib/nextPath.ts'
import { useCurrentUser } from '../lib/useCurrentUser.ts'

export default function SignInPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = nextPath(searchParams.get('next'))
  const user = useCurrentUser()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const signIn = mode === 'login' ? login : register
      await signIn({ username: username.trim(), password })
      setPassword('')
      navigate(next, { replace: true })
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  if (user) {
    return (
      <div className="panel panel-narrow">
        <span className="avatar avatar-large" aria-hidden="true">
          {user.username.slice(0, 1).toUpperCase()}
        </span>
        <h1>Signed in as {user.username}</h1>
        <p className="muted">Your saves follow you to any device you sign in on.</p>
        <Link to="/saves" className="button primary">
          My Saves
        </Link>
        <button
          type="button"
          onClick={signOut}
        >
          Sign out
        </button>
      </div>
    )
  }

  const label = mode === 'login' ? 'Sign in' : 'Create account'

  return (
    <div className="panel panel-narrow">
      <h1>{label}</h1>
      <p className="muted">
        {mode === 'login' ? 'Pick up where you left off.' : 'Save your progress and resume anywhere.'}
      </p>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          Username
          <input
            name="username"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary button-large" disabled={busy}>
          {label}
        </button>
      </form>
      <p className="muted switch-mode">
        {mode === 'login' ? 'No account yet? ' : 'Already have an account? '}
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
        >
          {mode === 'login' ? 'Create one' : 'Sign in'}
        </button>
      </p>
    </div>
  )
}
