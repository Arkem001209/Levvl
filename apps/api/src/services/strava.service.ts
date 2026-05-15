// Strava API interactions — token exchange and state signing.
// No route handling here; that lives in strava.routes.ts.

import crypto from 'crypto'

// ── State signing ──────────────────────────────────────────────────────────
//
// The OAuth `state` param is how we tie Strava's callback back to the user
// who started the flow. We can't use the JWT here because Strava's redirect
// doesn't carry it — only the state we passed originally comes back.
//
// We use HMAC-SHA256 to sign the state so a forged or tampered state is
// rejected. The structure is base64url({ userId }:{ nonce }:{ signature }).
//
// HMAC (Hash-based Message Authentication Code): a way to sign a string
// using a secret key. Anyone without the key can't produce a valid signature,
// so we can trust the userId in the state came from us originally.

const STATE_SECRET = process.env.API_STRAVA_STATE_SECRET!

export function createState(userId: string): string {
  // Nonce (number used once) — a random string that makes each state unique
  // so even two requests from the same user produce different states
  const nonce   = crypto.randomBytes(8).toString('hex')
  const payload = `${userId}:${nonce}`
  const sig     = crypto.createHmac('sha256', STATE_SECRET).update(payload).digest('hex')

  // base64url is URL-safe base64 (replaces + with - and / with _)
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

// Returns the userId if the state is valid, or null if it was tampered with.
export function verifyState(state: string): string | null {
  try {
    const decoded         = Buffer.from(state, 'base64url').toString()
    const [userId, nonce, sig] = decoded.split(':')
    if (!userId || !nonce || !sig) return null

    const expected = crypto.createHmac('sha256', STATE_SECRET).update(`${userId}:${nonce}`).digest('hex')

    // timingSafeEqual prevents timing attacks — comparing signatures with ===
    // leaks information about how many characters match. This doesn't matter
    // much here but it's the correct habit.
    const sigBuf      = Buffer.from(sig)
    const expectedBuf = Buffer.from(expected)
    if (sigBuf.length !== expectedBuf.length) return null
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null

    return userId
  } catch {
    return null
  }
}

// ── Token exchange ─────────────────────────────────────────────────────────

interface StravaTokenResponse {
  access_token:  string
  refresh_token: string
  expires_at:    number   // Unix timestamp — when the access token expires
  athlete:       { id: number }
  message?:      string   // only present on error responses
}

export interface StravaTokens {
  accessToken:     string
  refreshToken:    string
  expiresAt:       string   // ISO 8601 — stored in tracker_connections
  stravaAthleteId: string
}

// Exchanges the short-lived auth code Strava sends to our callback for a
// real access token + refresh token pair. Called once per OAuth connection.
export async function exchangeCodeForTokens(code: string): Promise<StravaTokens> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.API_STRAVA_CLIENT_ID,
      client_secret: process.env.API_STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  })

  const data = await res.json() as StravaTokenResponse

  if (!res.ok) {
    throw new Error(`Strava token exchange failed: ${data.message ?? res.status}`)
  }

  return {
    accessToken:     data.access_token,
    refreshToken:    data.refresh_token,
    // expires_at is a Unix timestamp (seconds) — convert to ISO for Postgres timestamptz
    expiresAt:       new Date(data.expires_at * 1000).toISOString(),
    stravaAthleteId: String(data.athlete.id),
  }
}
