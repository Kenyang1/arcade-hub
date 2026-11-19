import { useEffect, useState } from 'react'
import { getCurrentUser, onAuthChange } from './api.ts'
import type { User } from './types.ts'

/** The signed-in player, or null. Re-renders when anyone signs in or out, in this tab or another. */
export function useCurrentUser(): User | null {
  const [user, setUser] = useState(getCurrentUser)
  useEffect(() => onAuthChange(() => setUser(getCurrentUser())), [])
  return user
}
