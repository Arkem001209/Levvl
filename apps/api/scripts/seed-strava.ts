/**
 * One-time dev script: fetches the last 7 days of Strava activities and
 * inserts them into the activities table in Supabase.
 *
 * Run from apps/api after getting a token:
 *   STRAVA_ACCESS_TOKEN=xxx npx tsx scripts/seed-strava.ts
 *
 * Uses the service role key to bypass RLS — this is intentional for a seed
 * script that runs outside of any user session.
 *
 * Re-running is safe: the upsert on (user_id, tracker_source, tracker_id)
 * means duplicate activities are updated rather than inserted twice.
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

// --- Config ---------------------------------------------------------------

// Hardcoded for this seed run. Change if seeding for a different user.
const USER_ID = 'd853bc6b-559b-476b-b4ab-c9031ec0b79f'

const ACCESS_TOKEN = process.env.STRAVA_ACCESS_TOKEN
const SUPABASE_URL = process.env.API_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.API_SUPABASE_SERVICE_ROLE_KEY

if (!ACCESS_TOKEN) {
  console.error('Missing STRAVA_ACCESS_TOKEN — run get-strava-token.ts first')
  process.exit(1)
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing API_SUPABASE_URL or API_SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

// The service role client bypasses Row Level Security entirely.
// Never use this key outside of backend / script code.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// --- Type definitions ------------------------------------------------------

// Our internal ActivityType values (mirrors packages/shared/src/types/activity.ts)
type ActivityType =
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'strength'
  | 'hiking'
  | 'yoga'
  | 'hiit'
  | 'other'

// Strava activity fields we care about. `sport_type` is the newer field;
// `type` is the legacy fallback for older activities.
interface StravaActivity {
  id: number
  name: string
  type: string
  sport_type: string
  start_date: string       // ISO 8601
  elapsed_time: number     // seconds
  distance: number         // meters (0 for strength/yoga activities)
  total_elevation_gain: number
  average_heartrate?: number
  max_heartrate?: number
  average_watts?: number   // cycling only
  suffer_score?: number    // Strava's intensity metric, 0–100
}

// --- Strava type mapping ---------------------------------------------------

// Maps Strava's type/sport_type strings to our internal ActivityType enum.
// Unknown types fall back to 'other'.
const stravaTypeMap: Record<string, ActivityType> = {
  Run:            'running',
  TrailRun:       'running',
  Ride:           'cycling',
  VirtualRide:    'cycling',
  EBikeRide:      'cycling',
  GravelRide:     'cycling',
  Swim:           'swimming',
  WeightTraining: 'strength',
  Workout:        'strength',
  CrossFit:       'hiit',
  Hike:           'hiking',
  Walk:           'hiking',
  Yoga:           'yoga',
}

// --- Strava API call -------------------------------------------------------

async function fetchStravaActivities(): Promise<StravaActivity[]> {
  // Unix timestamp for 30 days ago — Strava's `after` param filters by start date
  const sevenDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)

  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${sevenDaysAgo}&per_page=50`,
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  )

  if (!res.ok) {
    throw new Error(`Strava API error ${res.status}: ${await res.text()}`)
  }

  return res.json() as Promise<StravaActivity[]>
}

// --- Main ------------------------------------------------------------------

async function seed(): Promise<void> {
  console.log('Fetching last 7 days of Strava activities...')

  const activities = await fetchStravaActivities()
  console.log(`Found ${activities.length} ${activities.length === 1 ? 'activity' : 'activities'}`)

  if (activities.length === 0) {
    console.log('Nothing to insert. Try a longer time window if this seems wrong.')
    return
  }

  // Map Strava fields to our activities table columns
  const rows = activities.map((a) => ({
    user_id:               USER_ID,
    tracker_source:        'strava' as const,
    tracker_id:            String(a.id),
    // sport_type is the preferred field; fall back to legacy type
    activity_type:         stravaTypeMap[a.sport_type] ?? stravaTypeMap[a.type] ?? 'other',
    name:                  a.name,
    started_at:            a.start_date,
    duration_seconds:      a.elapsed_time,
    // Strava returns 0 for distance on non-distance activities — store as null
    distance_meters:       a.distance > 0 ? a.distance : null,
    elevation_gain_meters: a.total_elevation_gain > 0 ? a.total_elevation_gain : null,
    avg_heart_rate:        a.average_heartrate != null ? Math.round(a.average_heartrate) : null,
    max_heart_rate:        a.max_heartrate != null ? Math.round(a.max_heartrate) : null,
    avg_power_watts:       a.average_watts != null ? Math.round(a.average_watts) : null,
    suffer_score:          a.suffer_score ?? null,
    // Store the full Strava payload for debugging and future field extraction
    raw_data:              a,
  }))

  // upsert rather than insert — safe to re-run without creating duplicates
  const { data, error } = await supabase
    .from('activities')
    .upsert(rows, { onConflict: 'user_id,tracker_source,tracker_id' })
    .select('id, name, activity_type, started_at')

  if (error) {
    console.error('Supabase error:', error.message)
    process.exit(1)
  }

  console.log(`\nInserted / updated ${data?.length ?? 0} activities:\n`)
  data?.forEach((row) => {
    const date = (row.started_at as string).slice(0, 10)
    console.log(`  [${row.activity_type.padEnd(10)}] ${date}  ${row.name}`)
  })
  console.log()
}

seed()
