// Strava API interactions — token exchange, token refresh, activity fetch, and state signing.
// No route handling here; that lives in strava.routes.ts and webhook.routes.ts.

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityType } from '@levvl/shared'

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

// ── Token refresh ──────────────────────────────────────────────────────────
//
// Strava access tokens expire after ~6 hours. Before making any API call on
// behalf of a user, we check whether their token has expired and swap it for
// a fresh one using their stored refresh token.
//
// This function is safe to call every time — it's a no-op if the token is
// still valid (more than 5 minutes of life left).

interface RefreshResponse {
  access_token:  string
  refresh_token: string
  expires_at:    number
  message?:      string
}

// Returns a valid access token, refreshing and persisting to DB if needed.
export async function getValidAccessToken(
  userId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { data: conn, error } = await supabase
    .from('tracker_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('tracker', 'strava')
    .single()

  if (error || !conn) throw new Error(`No Strava connection found for user ${userId}`)

  // Give ourselves a 5-minute buffer so we don't use a token that expires mid-request
  const expiresAt  = new Date(conn.expires_at).getTime()
  const fiveMinutes = 5 * 60 * 1000
  if (Date.now() + fiveMinutes < expiresAt) {
    return conn.access_token
  }

  // Token is expired (or about to be) — swap it
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.API_STRAVA_CLIENT_ID,
      client_secret: process.env.API_STRAVA_CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: conn.refresh_token,
    }),
  })

  const data = await res.json() as RefreshResponse
  if (!res.ok) throw new Error(`Strava token refresh failed: ${data.message ?? res.status}`)

  // Persist the new tokens so we don't refresh again until they expire
  await supabase
    .from('tracker_connections')
    .update({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    new Date(data.expires_at * 1000).toISOString(),
    })
    .eq('user_id', userId)
    .eq('tracker', 'strava')

  return data.access_token
}

// ── Activity fetch ─────────────────────────────────────────────────────────
//
// The webhook only tells us that an activity was created/updated — it gives us
// an activity ID but not the full data. We call Strava's API to get the details.

interface StravaActivity {
  id:                  number
  name:                string
  type:                string   // Strava's type string — we map it to our ActivityType
  start_date:          string   // ISO 8601
  elapsed_time:        number   // seconds
  distance:            number   // metres
  total_elevation_gain: number  // metres
  average_heartrate?:  number
  max_heartrate?:      number
  average_watts?:      number
  suffer_score?:       number
}

// Maps Strava's activity type strings to our ActivityType enum.
// Strava has many types — unmapped ones fall back to 'other'.
const STRAVA_TYPE_MAP: Record<string, ActivityType> = {
  Run:             'running',
  VirtualRun:      'running',
  Ride:            'cycling',
  VirtualRide:     'cycling',
  EBikeRide:       'cycling',
  Swim:            'swimming',
  WeightTraining:  'strength',
  Workout:         'strength',
  Crossfit:        'hiit',
  Hike:            'hiking',
  Walk:            'hiking',
  Yoga:            'yoga',
  Rowing:          'rowing',
  RockClimbing:    'climbing',
}

export interface FetchedActivity {
  stravaId:            string
  activityType:        ActivityType
  name:                string
  startedAt:           string
  durationSeconds:     number
  distanceMeters:      number | null
  elevationGainMeters: number | null
  avgHeartRate:        number | null
  maxHeartRate:        number | null
  avgPowerWatts:       number | null
  sufferScore:         number | null
}

// Fetches a single activity from Strava's API using the activity ID from the webhook.
export async function fetchStravaActivity(
  stravaActivityId: number,
  accessToken: string,
): Promise<FetchedActivity> {
  const res = await fetch(`https://www.strava.com/api/v3/activities/${stravaActivityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) throw new Error(`Strava activity fetch failed: ${res.status}`)

  const data = await res.json() as StravaActivity

  return {
    stravaId:            String(data.id),
    activityType:        STRAVA_TYPE_MAP[data.type] ?? 'other',
    name:                data.name,
    startedAt:           data.start_date,
    durationSeconds:     data.elapsed_time,
    distanceMeters:      data.distance > 0 ? data.distance : null,
    elevationGainMeters: data.total_elevation_gain > 0 ? data.total_elevation_gain : null,
    avgHeartRate:        data.average_heartrate != null ? Math.round(data.average_heartrate) : null,
    maxHeartRate:        data.max_heartrate     != null ? Math.round(data.max_heartrate)     : null,
    avgPowerWatts:       data.average_watts     != null ? Math.round(data.average_watts)     : null,
    sufferScore:         data.suffer_score ?? null,
  }
}
