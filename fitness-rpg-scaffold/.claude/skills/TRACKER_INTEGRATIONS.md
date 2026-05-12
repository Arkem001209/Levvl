# TRACKER_INTEGRATIONS.md

## Overview

Two tracker integrations: Strava (Phase 1) and Coros (Phase 2).
Both use OAuth 2.0 for authorization. Neither API token should ever touch
the frontend — all OAuth flows are handled server-side.

---

## Strava integration

### Developer setup (one-time)
1. Create an app at https://www.strava.com/settings/api
2. Set "Authorization Callback Domain" to `localhost` for dev,
   your production domain later
3. Note your `Client ID` and `Client Secret` → add to `.env`

### OAuth flow

```
User clicks "Connect Strava"
        ↓
Frontend redirects to:
https://www.strava.com/oauth/authorize
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=http://localhost:3001/api/auth/strava/callback
  &response_type=code
  &scope=activity:read_all
        ↓
User approves on Strava
        ↓
Strava redirects to our callback URL with ?code=AUTH_CODE
        ↓
Backend exchanges code for tokens:
POST https://www.strava.com/oauth/token
  { client_id, client_secret, code, grant_type: "authorization_code" }
        ↓
Store access_token + refresh_token + expires_at in tracker_connections table
        ↓
Redirect user to /dashboard
```

### Token refresh

Strava access tokens expire every 6 hours. Refresh before each API call:

```ts
// In strava.service.ts — always call this before any Strava API request
async function getValidStravaToken(userId: string): Promise<string> {
  const conn = await db.getTrackerConnection(userId, 'strava')

  // Check if token expires within 5 minutes
  if (conn.expiresAt < Date.now() + 5 * 60 * 1000) {
    const refreshed = await stravaRefresh(conn.refreshToken)
    await db.updateTrackerConnection(userId, 'strava', refreshed)
    return refreshed.accessToken
  }

  return conn.accessToken
}
```

### Webhook setup

Strava pushes activity events to your server in real time. This is better than
polling. Set up once per application (not per user).

```bash
# Register your webhook endpoint with Strava (run once in dev with ngrok URL,
# once in prod with real URL)
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_CLIENT_ID \
  -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://YOUR_DOMAIN/api/webhooks/strava \
  -F verify_token=YOUR_WEBHOOK_VERIFY_TOKEN
```

Strava will first send a GET request to verify the endpoint. Then it sends POST
requests for new activities:

```ts
// Strava webhook payload shape (key fields only)
interface StravaWebhookEvent {
  object_type: 'activity' | 'athlete'
  object_id: number          // activity ID
  aspect_type: 'create' | 'update' | 'delete'
  owner_id: number           // Strava athlete ID (map to our user)
  event_time: number         // Unix timestamp
}
```

Respond to webhooks with HTTP 200 immediately, then process asynchronously.
If you take > 2 seconds, Strava retries.

### Activity fetch

After receiving a webhook, fetch the full activity:

```
GET https://www.strava.com/api/v3/activities/{activity_id}
Authorization: Bearer {access_token}
```

Key fields to extract and store in our `activities` table:

| Strava field | Our field | Notes |
|---|---|---|
| `id` | `tracker_id` | Strava's internal ID |
| `type` | `activity_type` | Map to our ActivityType enum |
| `start_date` | `started_at` | ISO 8601 |
| `elapsed_time` | `duration_seconds` | |
| `distance` | `distance_meters` | |
| `average_heartrate` | `avg_heart_rate` | May be null |
| `max_heartrate` | `max_heart_rate` | May be null |
| `total_elevation_gain` | `elevation_gain_meters` | |
| `average_watts` | `avg_power_watts` | Cycling only |
| `suffer_score` | `suffer_score` | Strava's intensity metric, 0-100 |

### Activity type mapping

```ts
// Map Strava's type strings to our internal enum
const stravaTypeMap: Record<string, ActivityType> = {
  Run:      'running',
  Ride:     'cycling',
  VirtualRide: 'cycling',
  Swim:     'swimming',
  WeightTraining: 'strength',
  Workout:  'strength',
  Hike:     'hiking',
  Walk:     'hiking',
  Yoga:     'yoga',
  // everything else → 'other'
}
```

### Rate limits

Strava allows 200 requests per 15 minutes and 2,000 per day per application.
For a small user group this is not a concern. If it ever becomes one, add
request queuing in `sync.service.ts`.

---

## Coros integration

### Developer setup (one-time)
1. Apply for developer access at https://developer.coros.com
2. This may take a few days — apply early
3. Note your `Client ID` and `Client Secret` → add to `.env`

### Important: Coros API status
The Coros Open API was launched in 2022 and is still maturing. If a specific
endpoint behaves unexpectedly, check https://developer.coros.com/docs for updates.
The API structure is similar to Strava but less battle-tested.

### OAuth flow

```
User clicks "Connect Coros"
        ↓
Frontend redirects to:
https://open.coros.com/oauth2/authorize
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=http://localhost:3001/api/auth/coros/callback
  &response_type=code
        ↓
User approves on Coros app
        ↓
Coros redirects to callback with ?code=AUTH_CODE
        ↓
Backend exchanges code:
POST https://open.coros.com/oauth2/accesstoken
  { client_id, client_secret, code, grant_type: "authorization_code",
    redirect_uri: "..." }
        ↓
Store tokens in tracker_connections table
        ↓
Redirect user to /dashboard
```

### Activity fetch

Coros does not have real-time webhooks (as of 2024). Use scheduled polling:

```
GET https://open.coros.com/v2/coros/sport/list
  ?access_token={token}
  &pageNumber=1
  &pageSize=50
  &startDate={last_sync_timestamp}
```

Poll interval: every 30 minutes via a cron job in `sync.service.ts`.
Store `lastSyncedAt` per user in `tracker_connections` to avoid re-processing.

### Key Coros fields

| Coros field | Our field | Notes |
|---|---|---|
| `sportId` | `tracker_id` | Coros internal ID |
| `mode` | `activity_type` | See mode mapping below |
| `startTime` | `started_at` | Unix timestamp — convert to ISO |
| `totalTime` | `duration_seconds` | In seconds |
| `totalDistance` | `distance_meters` | In meters |
| `avgHr` | `avg_heart_rate` | |
| `maxHr` | `max_heart_rate` | |
| `totalAscent` | `elevation_gain_meters` | |
| `avgPower` | `avg_power_watts` | Cycling only |

### Coros activity mode mapping

```ts
// Coros uses numeric mode IDs
const corosTypeMap: Record<number, ActivityType> = {
  100: 'running',    // Outdoor Run
  101: 'running',    // Indoor Run
  200: 'cycling',    // Outdoor Cycling
  201: 'cycling',    // Indoor Cycling
  300: 'swimming',   // Open Water Swim
  301: 'swimming',   // Pool Swim
  400: 'hiking',     // Hiking
  // Check Coros docs for full list — these are approximate
}
```

---

## Normalised internal activity type

Both tracker integrations map to this shared enum (defined in `packages/shared`):

```ts
type ActivityType =
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'strength'
  | 'hiking'
  | 'yoga'
  | 'hiit'
  | 'other'
```

---

## Preventing duplicate activities

A user may connect both Strava and Coros. If Coros syncs to Strava, the same
workout could arrive via both webhooks. Deduplicate using:

1. `(user_id, tracker_source, tracker_id)` unique constraint in the database
2. Check `started_at + duration_seconds` similarity before inserting —
   if an activity with the same start time (±5 min) and similar duration (±10%)
   already exists for this user, skip it and log a warning

---

## ngrok for local webhook testing

Strava (and eventually Coros) webhooks need a public URL. In development:

```bash
# Install ngrok, then:
ngrok http 3001
# Copy the https://xxxxx.ngrok.io URL
# Use as your callback URL when registering the Strava webhook
```

The ngrok URL changes each restart. Re-register the webhook each dev session,
or use a paid ngrok plan for a stable URL.
