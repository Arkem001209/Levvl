// Verifies the Supabase JWT sent by the frontend on every protected request.
// Attach this middleware to any router or route that requires a logged-in user.
//
// Usage:
//   router.get('/me', requireAuth, catchAsync(async (req, res) => {
//     const userId = req.user!.id
//   }))

import type { Request, Response, NextFunction } from 'express'
import { supabase } from '../lib/supabase'

// RequestHandler is the standard Express middleware function signature:
// (req, res, next) => void
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization

  // The Authorization header must be exactly: "Bearer <token>"
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { message: 'Missing or invalid Authorization header', code: 'UNAUTHORIZED' },
    })
    return
  }

  const token = authHeader.slice(7) // strip "Bearer "

  // getUser() validates the JWT signature against Supabase's public key
  // and returns the user record if the token is valid and not expired.
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    res.status(401).json({
      success: false,
      error: { message: 'Invalid or expired token', code: 'UNAUTHORIZED' },
    })
    return
  }

  // Attach the verified user ID to the request so route handlers can use it
  req.user = { id: user.id }
  next()
}
