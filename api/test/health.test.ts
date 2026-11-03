import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../src/app.ts'

describe('the app shell', () => {
  it('answers GET /api/health with the database status', async () => {
    const response = await request(app).get('/api/health').expect(200)
    expect(response.body).toMatchObject({ status: 'ok' })
    expect(['up', 'down']).toContain(response.body.mongo)
  })

  it('serves the OpenAPI document at /swagger.json', async () => {
    const response = await request(app).get('/swagger.json').expect(200)
    expect(response.body.openapi).toBe('3.1.0')
    expect(response.body.paths).toHaveProperty('/api/games')
    expect(response.body.components.schemas).toHaveProperty('Game')
  })

  it('answers an unknown route with ProblemDetails', async () => {
    const response = await request(app).get('/api/does-not-exist').expect(404)
    expect(response.headers['content-type']).toContain('application/problem+json')
    expect(response.body).toMatchObject({ status: 404, instance: '/api/does-not-exist' })
  })
})
