import { Link, NavLink, Outlet } from 'react-router'
import { getCurrentUser } from '../lib/api.ts'

export default function Layout() {
  const user = getCurrentUser()
  return (
    <>
      <header className="site-header">
        <Link to="/" className="brand">
          Arcade Hub
        </Link>
        <nav aria-label="Main">
          <NavLink to="/" end>
            Catalog
          </NavLink>
          <NavLink to="/saves">My Saves</NavLink>
          <NavLink to="/sign-in">{user ? user.username : 'Sign in'}</NavLink>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  )
}
