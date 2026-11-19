import { usePageMotion } from '../lib/usePageMotion.ts'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useCurrentUser } from '../lib/useCurrentUser.ts'
import HintBar, { type Hint } from './HintBar.tsx'

const MOVE: Hint = { keys: ['Tab'], label: 'Move' }
const SELECT: Hint = { keys: ['Enter'], label: 'Select' }

// The shortcuts each page handles (see useShortcuts.ts). The Play page has none:
// the keys there belong to the game.
function hintsFor(pathname: string): Hint[] {
  if (pathname === '/') {
    return [
      { keys: ['←', '→', '↑', '↓'], label: 'Move' },
      { keys: ['Enter'], label: 'Open' },
      { keys: ['P'], label: 'Play' },
      { keys: ['/'], label: 'Search' },
      { keys: ['S'], label: 'Sort' },
      { keys: ['V'], label: 'View' },
    ]
  }
  if (pathname === '/games/new') {
    return [MOVE, SELECT, { keys: ['Esc'], label: 'Library' }]
  }
  if (pathname.startsWith('/games/') && pathname.endsWith('/edit')) {
    return [MOVE, SELECT, { keys: ['Esc'], label: 'Back' }]
  }
  if (pathname.startsWith('/games/')) {
    return [MOVE, SELECT, { keys: ['P'], label: 'Play' }, { keys: ['E'], label: 'Edit' }, { keys: ['Esc'], label: 'Library' }]
  }
  if (pathname.startsWith('/play/')) {
    return [
      { keys: ['Tab'], label: 'Leave game screen' },
      { keys: ['Enter'], label: 'Press button' },
    ]
  }
  return [MOVE, SELECT]
}

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <rect x="8" y="12" width="4" height="12" rx="1" fill="var(--on-accent)" />
      <rect x="4" y="16" width="12" height="4" rx="1" fill="var(--on-accent)" />
      <circle cx="22" cy="15" r="2.6" fill="var(--on-accent)" />
      <circle cx="26" cy="21" r="2.6" fill="var(--on-accent)" />
      <rect x="8" y="5" width="16" height="3" rx="1.5" fill="var(--on-accent)" opacity="0.55" />
    </svg>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  const mainRef = usePageMotion(pathname)
  const user = useCurrentUser()
  const isPlay = pathname.startsWith('/play/')
  return (
    <div className="app">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="brand">
          <BrandMark />
          <span>Arcade Hub</span>
        </Link>
        <nav aria-label="Main" className="topnav">
          <NavLink to="/" end>
            Library
          </NavLink>
          <NavLink to="/saves">My Saves</NavLink>
        </nav>
        <div className="topbar-actions">
          <NavLink to="/sign-in" className="account" aria-label={user ? `Account: ${user.username}` : 'Sign in'}>
            <span className="avatar" aria-hidden="true">
              {user ? user.username.slice(0, 1).toUpperCase() : '?'}
            </span>
            <span className="account-name">{user ? user.username : 'Sign in'}</span>
          </NavLink>
        </div>
      </header>
      <main ref={mainRef} id="content" className={isPlay ? 'main main-play' : 'main'}>
        <Outlet />
      </main>
      <HintBar hints={hintsFor(pathname)} />
    </div>
  )
}
