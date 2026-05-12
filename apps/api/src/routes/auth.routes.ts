// Auth routes — currently just a /me endpoint to confirm the token is valid
// and return the authenticated user's ID. Expand as auth features grow.

import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.middleware'
import { catchAsync } from '../lib/catchAsync'

export const authRouter = Router()

// GET /api/auth/me
// Returns the authenticated user's ID. Protected — requires a valid Supabase JWT.
authRouter.get(
  '/me',
  requireAuth,
  catchAsync(async (req: Request, res: Response) => {
    // req.user is guaranteed non-null here because requireAuth ran first
    res.json({ success: true, data: { userId: req.user!.id } })
  })
)
