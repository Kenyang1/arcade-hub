import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { app } from '../src/app.ts'

// MongoDB unreachable. The driver's connect() does not settle while it looks for
// a server, which is what used to make the probe slow enough to restart a pod.
vi.mock('../src/core/mongo.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/mongo.ts')>()
  return {
    ...actual,
    isConnected: () => false,
    connectMongo: () => new Promise<never>(() => {}),
  }
})

describe('GET /api/health with MongoDB down', () => {
  it('answers at once with mongo down instead of waiting for the driver', async () => {
    const started = Date.now()
    const response = await request(app).get('/api/health').expect(200)
    const elapsed = Date.now() - started

    expect(response.body).toEqual({ status: 'ok', mongo: 'down' })
    // Kubernetes probes time out at about a second; the route must not spend
    // the driver's whole server-selection timeout getting there.
    expect(elapsed).toBeLessThan(500)
  })
})
