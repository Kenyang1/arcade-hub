/**
 * Where to go after signing in: ?next= when it's a path in this app, else the
 * library. Anything else (another site, `//host`) is ignored, so a link can't
 * send a player off the app after they type their password.
 */
export function nextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/'
  return next
}

/** A link to the sign-in page that comes back to `path` afterwards. */
export function signInLink(path: string): string {
  return `/sign-in?${new URLSearchParams({ next: path }).toString()}`
}
