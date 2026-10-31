import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage, getCurrentUser, login, register, signOut } from '../lib/api.ts'

export default function SignInPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState(getCurrentUser)
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
      await signIn({ username, password })
      navigate('/')
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  if (user) {
    return (
      <>
        <h1>Signed in as {user.username}</h1>
        <button
          type="button"
          onClick={() => {
            signOut()
            setUser(null)
          }}
        >
          Sign out
        </button>
      </>
    )
  }

  const label = mode === 'login' ? 'Sign in' : 'Create account'

  return (
    <>
      <h1>{label}</h1>
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
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>
          {label}
        </button>
      </form>
      <p className="muted">
        {mode === 'login' ? 'No account yet? ' : 'Already have an account? '}
        <button
          type="button"
          className="link"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Create one' : 'Sign in'}
        </button>
      </p>
    </>
  )
}
