// Fake data in the shape of types.ts. api.ts serves it until each endpoint
// lands. Fake usernames only (see CLAUDE.md, "What never goes in git").

import type { Game, Save, Session, User } from './types.ts'

export const mockUser: User = {
  id: 'u1',
  username: 'player1',
  createdAt: '2026-10-25T12:00:00Z',
}

export const mockToken = 'mock-jwt-token'

export const mockGames: Game[] = [
  {
    id: 'g1',
    title: 'Star Courier',
    description: 'Deliver cargo across a hostile asteroid belt. Eight stages, one life.',
    genre: 'Shooter',
    core: 'nes',
    createdAt: '2026-10-25T12:00:00Z',
  },
  {
    id: 'g2',
    title: 'Dungeon Delve',
    description: 'Explore a forty-room dungeon and find the three keys before the torch burns out.',
    genre: 'Adventure',
    core: 'nes',
    createdAt: '2026-10-25T12:05:00Z',
  },
  {
    id: 'g3',
    title: 'Pixel Racer',
    description: 'Top-down racing against three rivals on twelve tracks.',
    genre: 'Racing',
    core: 'gb',
    createdAt: '2026-10-26T09:00:00Z',
  },
  {
    id: 'g4',
    title: 'Block Stacker',
    description: 'Falling blocks. Clear lines. Beat your high score.',
    genre: 'Puzzle',
    core: 'nes',
    createdAt: '2026-10-26T09:30:00Z',
  },
]

export const mockSaves: Save[] = [
  { id: 's1', userId: 'u1', gameId: 'g1', kind: 'manual', createdAt: '2026-10-26T18:30:00Z' },
  { id: 's2', userId: 'u1', gameId: 'g1', kind: 'autosave', createdAt: '2026-10-26T18:41:00Z' },
  { id: 's3', userId: 'u1', gameId: 'g2', kind: 'autosave', createdAt: '2026-10-27T09:05:00Z' },
]

export const mockSession: Session = {
  id: 'sess1',
  userId: 'u1',
  gameId: 'g1',
  status: 'running',
  lastHeartbeatAt: '2026-10-27T09:05:00Z',
  lastAutosaveId: 's2',
}
