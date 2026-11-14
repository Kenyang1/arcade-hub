import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <div className="panel">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p className="muted">That page isn't in the arcade.</p>
      <Link to="/" className="button primary">
        Back to the library
      </Link>
    </div>
  )
}
