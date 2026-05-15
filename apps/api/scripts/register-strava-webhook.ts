// One-time script to register our webhook URL with Strava.
// Run this once whenever your callback URL changes (new ngrok URL, new domain).
//
// Usage:
//   npx tsx scripts/register-strava-webhook.ts
//
// What it does:
//   1. Calls Strava's API to register /api/webhooks/strava as a webhook endpoint
//   2. Strava immediately sends a GET to that URL to validate it
//   3. If the validation succeeds, Strava returns a subscription_id — save it
//
// Before running:
//   - Make sure your API server is running and publicly reachable (ngrok in dev)
//   - Set API_STRAVA_REDIRECT_URI's base domain matches the callback URL below

import 'dotenv/config'

const CLIENT_ID    = process.env.API_STRAVA_CLIENT_ID!
const CLIENT_SECRET = process.env.API_STRAVA_CLIENT_SECRET!
const VERIFY_TOKEN  = process.env.API_STRAVA_WEBHOOK_VERIFY_TOKEN!

// Derive the webhook callback URL from the redirect URI's base.
// In dev: https://<ngrok-url>/api/webhooks/strava
// In prod: https://<your-domain>/api/webhooks/strava
const redirectUri   = process.env.API_STRAVA_REDIRECT_URI!
const baseUrl       = redirectUri.replace('/api/auth/strava/callback', '')
const callbackUrl   = `${baseUrl}/api/webhooks/strava`

async function main() {
  console.log(`Registering webhook with callback: ${callbackUrl}`)
  console.log('Make sure your API server is running and reachable at that URL.\n')

  const res = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      callback_url:  callbackUrl,
      verify_token:  VERIFY_TOKEN,
    }),
  })

  const data = await res.json() as { id?: number; errors?: unknown; message?: string }

  if (!res.ok) {
    console.error('Registration failed:', JSON.stringify(data, null, 2))
    process.exit(1)
  }

  console.log(`Webhook registered! subscription_id: ${data.id}`)
  console.log('Strava will now POST to your callback URL for every new activity.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
