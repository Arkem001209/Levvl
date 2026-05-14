// Must be first — loads .env into process.env before any other import reads it
import 'dotenv/config'

import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import { logger } from './lib/logger'
import { authRouter } from './routes/auth.routes'
import { characterRouter } from './routes/character.routes'

const app = express()
const port = process.env.API_PORT ?? '3001'

// Parse incoming JSON request bodies
app.use(express.json())

// Health check — unauthenticated, used by Railway to confirm the service is up
app.get('/health', (_req: Request, res: Response) => {
  res.json({ success: true, data: { status: 'ok' } })
})

// Route handlers — add new routers here as you build each feature
app.use('/api/auth', authRouter)
app.use('/api/character', characterRouter)
// app.use('/api/activities', activitiesRouter)
// app.use('/api/quests', questsRouter)
// app.use('/api/guilds', guildsRouter)
// app.use('/api/webhooks', webhooksRouter)

// 404 — any request that didn't match a route above ends up here
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: { message: 'Route not found', code: 'NOT_FOUND' },
  })
})

// Global error handler — Express identifies this as an error handler because
// it has four arguments. When a route calls next(err), Express skips all
// normal middleware and jumps to this function.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack })
  res.status(500).json({
    success: false,
    error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
  })
})

app.listen(port, () => {
  logger.info('API server running', { port })
})
