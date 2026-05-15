// Strava webhook routes.
// Mounted at /api/webhooks/strava in index.ts.
//
// Strava requires two endpoints on the same path:
//   GET  — subscription validation (called once when you register the webhook)
//   POST — event delivery (called every time a user creates/updates an activity)

import { Router } from 'express'
import type { Request, Response } from 'express'
import { catchAsync } from '../lib/catchAsync'
import { logger } from '../lib/logger'
import { supabase } from '../lib/supabase'
import { getValidAccessToken, fetchStravaActivity } from '../services/strava.service'
import { processActivity, applyRpgResult } from '../services/rpg.service'

export const webhookRouter = Router()

const VERIFY_TOKEN = process.env.API_STRAVA_WEBHOOK_VERIFY_TOKEN!

// ── GET /api/webhooks/strava ───────────────────────────────────────────────
//
// Strava sends this request when you register a webhook subscription to confirm
// that the URL is live and owned by you. You prove it by echoing back the
// hub.challenge value — but only if their verify token matches yours.
//
// This is called once at registration time, not on every workout.
webhookRouter.get('/', (req: Request, res: Response) => {
  const mode      = req.query['hub.mode']
  const token     = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    logger.info('Strava webhook subscription validated')
    // Strava requires this exact response shape
    res.json({ 'hub.challenge': challenge })
  } else {
    res.status(403).json({ error: 'Forbidden' })
  }
})

// ── POST /api/webhooks/strava ──────────────────────────────────────────────
//
// Strava sends this for every create/update/delete event on any user who has
// connected Strava. The payload is minimal — just enough to know what changed.
//
// We respond 200 immediately (Strava expects a fast response) and do the heavy
// work asynchronously. If processing fails, we log it — Strava won't retry.
webhookRouter.post(
  '/',
  catchAsync(async (req: Request, res: Response) => {
    const event = req.body as StravaWebhookEvent

    // Acknowledge receipt before doing any work — Strava times out at 2 seconds
    res.status(200).json({ received: true })

    // We only care about activity creation events
    if (event.object_type !== 'activity' || event.aspect_type !== 'create') return

    const stravaAthleteId = String(event.owner_id)
    const stravaActivityId = event.object_id

    // Find which of our users this Strava athlete belongs to
    const { data: conn, error: connError } = await supabase
      .from('tracker_connections')
      .select('user_id')
      .eq('tracker', 'strava')
      .eq('tracker_user_id', stravaAthleteId)
      .single()

    if (connError || !conn) {
      logger.warn('Webhook: no user found for Strava athlete', { stravaAthleteId })
      return
    }

    const userId = conn.user_id

    try {
      // Get a valid token (refreshes automatically if expired)
      const accessToken = await getValidAccessToken(userId, supabase)

      // Fetch the full activity details from Strava
      const activity = await fetchStravaActivity(stravaActivityId, accessToken)

      // Check if we've already processed this activity (idempotency)
      const { data: existing } = await supabase
        .from('activities')
        .select('id')
        .eq('user_id', userId)
        .eq('tracker_source', 'strava')
        .eq('tracker_id', activity.stravaId)
        .single()

      if (existing) {
        logger.info('Webhook: activity already processed, skipping', { stravaActivityId })
        return
      }

      // Insert the activity into our DB
      const { data: inserted, error: insertError } = await supabase
        .from('activities')
        .insert({
          user_id:              userId,
          tracker_source:       'strava',
          tracker_id:           activity.stravaId,
          activity_type:        activity.activityType,
          name:                 activity.name,
          started_at:           activity.startedAt,
          duration_seconds:     activity.durationSeconds,
          distance_meters:      activity.distanceMeters,
          elevation_gain_meters: activity.elevationGainMeters,
          avg_heart_rate:       activity.avgHeartRate,
          max_heart_rate:       activity.maxHeartRate,
          avg_power_watts:      activity.avgPowerWatts,
          suffer_score:         activity.sufferScore,
        })
        .select('id')
        .single()

      if (insertError || !inserted) {
        logger.error('Webhook: failed to insert activity', { error: insertError?.message })
        return
      }

      // Load the user's character and stats for the RPG engine
      const { data: character, error: charError } = await supabase
        .from('characters')
        .select('id, user_id, xp_total, level, streak_days, last_activity_at')
        .eq('user_id', userId)
        .single()

      if (charError || !character) {
        logger.error('Webhook: character not found', { userId })
        return
      }

      const { data: stats, error: statsError } = await supabase
        .from('character_stats')
        .select('endurance, strength, agility, vitality, focus, resilience')
        .eq('character_id', character.id)
        .single()

      if (statsError || !stats) {
        logger.error('Webhook: character stats not found', { userId })
        return
      }

      // Run through the RPG engine
      const activityRow = {
        id:             inserted.id,
        activity_type:  activity.activityType,
        duration_seconds: activity.durationSeconds,
        avg_heart_rate: activity.avgHeartRate,
      }

      const result = processActivity(activityRow, character, stats)
      await applyRpgResult(result, character, stats, activity.startedAt, supabase)

      logger.info('Webhook: activity processed', {
        userId,
        activityId: inserted.id,
        xpAwarded:  result.xpAwarded,
        levelUp:    result.levelUp,
      })
    } catch (err) {
      logger.error('Webhook: processing failed', {
        userId,
        stravaActivityId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })
)

// ── Types ──────────────────────────────────────────────────────────────────

interface StravaWebhookEvent {
  object_type: 'activity' | 'athlete'
  object_id:   number     // activity ID
  aspect_type: 'create' | 'update' | 'delete'
  owner_id:    number     // Strava athlete ID
  subscription_id: number
  event_time:  number
  updates:     Record<string, string>
}
