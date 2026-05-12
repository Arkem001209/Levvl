/**
 * One-time dev script: walks through Strava OAuth and prints the access token.
 * Run from apps/api: npx tsx scripts/get-strava-token.ts
 *
 * Starts a temporary server on port 4000 to catch the OAuth callback so you
 * don't need the full API running. The token it prints is what you pass to
 * seed-strava.ts via the STRAVA_ACCESS_TOKEN env var.
 */
import 'dotenv/config'
import http from 'http'
import { exec } from 'child_process'

const clientId = process.env.API_STRAVA_CLIENT_ID
const clientSecret = process.env.API_STRAVA_CLIENT_SECRET

if (!clientId || !clientSecret) {
  console.error('Missing API_STRAVA_CLIENT_ID or API_STRAVA_CLIENT_SECRET in .env')
  process.exit(1)
}

// Strava validates that the redirect_uri's domain matches the one registered
// in your Strava app settings. "localhost" matches any port on localhost.
const REDIRECT_URI = 'http://localhost:4000/callback'
const PORT = 4000

const authUrl =
  `https://www.strava.com/oauth/authorize` +
  `?client_id=${clientId}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=activity:read_all`

console.log('\nOpening Strava authorization in your browser...')
console.log('If it does not open automatically, visit:\n')
console.log(authUrl)
console.log(`\nWaiting for callback on port ${PORT}...\n`)

// Open the URL automatically on macOS
exec(`open "${authUrl}"`)

// Strava's token response shape (only fields we care about)
interface StravaTokenResponse {
  access_token: string
  refresh_token: string
  expires_at: number  // Unix timestamp
  athlete: { id: number; firstname: string }
  message?: string    // present on error
}

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/callback')) {
    res.end('Not found')
    return
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error || !code) {
    const msg = `Authorization failed: ${error ?? 'no code received'}`
    res.end(msg)
    console.error(msg)
    server.close()
    return
  }

  // Exchange the short-lived auth code for access + refresh tokens
  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  })

  const tokenData = await tokenRes.json() as StravaTokenResponse

  if (!tokenRes.ok) {
    const msg = `Token exchange failed: ${tokenData.message ?? tokenRes.status}`
    res.end(msg)
    console.error(msg)
    server.close()
    return
  }

  res.end('All done — you can close this tab and return to the terminal.')

  const expiresAt = new Date(tokenData.expires_at * 1000).toISOString()
  console.log(`Authorized as: ${tokenData.athlete.firstname} (athlete ID: ${tokenData.athlete.id})`)
  console.log(`Token expires: ${expiresAt}`)
  console.log('\nRun the seed script with:')
  console.log(`\n  STRAVA_ACCESS_TOKEN=${tokenData.access_token} npx tsx scripts/seed-strava.ts\n`)

  server.close()
})

server.listen(PORT)
