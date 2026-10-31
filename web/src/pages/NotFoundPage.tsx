import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <>
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to the catalog</Link>
      </p>
    </>
  )
}
