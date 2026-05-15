// Strava OAuth routes.
// Mounted at /api/auth/strava in index.ts.

import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.middleware'
import { catchAsync } from '../lib/catchAsync'
import { supabase } from '../lib/supabase'
import { createState, verifyState, exchangeCodeForTokens } from '../services/strava.service'

export const stravaRouter = Router()

const CLIENT_ID    = process.env.API_STRAVA_CLIENT_ID!
const REDIRECT_URI = process.env.API_STRAVA_REDIRECT_URI!
const FRONTEND_URL = process.env.API_FRONTEND_URL!

// GET /api/auth/strava
// Starts the OAuth flow. The user must be logged in — we read their ID from
// the JWT and embed it (signed) in the `state` param so the callback knows
// which user to connect.
stravaRouter.get(
  '/',
  requireAuth,
  catchAsync(async (req: Request, res: Response) => {
    const state = createState(req.user!.id)

    const authUrl = new URL('https://www.strava.com/oauth/authorize')
    authUrl.searchParams.set('client_id',     CLIENT_ID)
    authUrl.searchParams.set('redirect_uri',  REDIRECT_URI)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope',         'activity:read_all')
    authUrl.searchParams.set('state',         state)

    // 302 redirect — the browser follows this to Strava's authorization page
    res.redirect(authUrl.toString())
  })
)

// GET /api/auth/strava/callback
// Strava redirects here after the user approves. No auth middleware — the
// user ID is recovered from the signed `state` param instead.
stravaRouter.get(
  '/callback',
  catchAsync(async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string>

    // User denied access on Strava's page
    if (error) {
      return res.redirect(`${FRONTEND_URL}?strava=denied`)
    }

    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL}?strava=error`)
    }

    // Verify the signed state and recover the user ID
    const userId = verifyState(state)
    if (!userId) {
      return res.redirect(`${FRONTEND_URL}?strava=error`)
    }

    // Exchange the auth code for real tokens
    const tokens = await exchangeCodeForTokens(code)

    // Upsert into tracker_connections — if the user reconnects Strava later
    // this updates their tokens rather than creating a duplicate row.
    // onConflict targets the unique(user_id, tracker) constraint.
    const { error: dbError } = await supabase.from('tracker_connections').upsert(
      {
        user_id:         userId,
        tracker:         'strava',
        tracker_user_id: tokens.stravaAthleteId,
        access_token:    tokens.accessToken,
        refresh_token:   tokens.refreshToken,
        expires_at:      tokens.expiresAt,
      },
      { onConflict: 'user_id,tracker' }
    )

    if (dbError) {
      console.error('Failed to save Strava connection:', dbError.message)
      return res.redirect(`${FRONTEND_URL}?strava=error`)
    }

    // All done — send the user back to the frontend
    res.redirect(`${FRONTEND_URL}?strava=connected`)
  })
)
