import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.middleware'
import { catchAsync } from '../lib/catchAsync'
import { supabase } from '../lib/supabase'
import {
  getStatDescriptor,
  xpRequiredForLevel,
} from '../services/rpg.service'
import type { StatName } from '@levvl/shared'

export const characterRouter = Router()

const STAT_NAMES: StatName[] = ['endurance', 'strength', 'agility', 'vitality', 'focus', 'resilience']

// GET /api/character
// Returns the authenticated user's full character state — everything the
// character page needs in a single request.
characterRouter.get(
  '/',
  requireAuth,
  catchAsync(async (req: Request, res: Response) => {
    const userId = req.user!.id

    // Fetch character, stats, and recent activities in parallel.
    // Promise.all runs all three queries at the same time rather than waiting
    // for each one to finish before starting the next.
    const [characterRes, activitiesRes] = await Promise.all([
      supabase
        .from('characters')
        .select('id, level, xp_total, xp_current, streak_days, character_class, last_activity_at')
        .eq('user_id', userId)
        .single(),

      // The `activity_rpg_results(xp_awarded)` syntax tells Supabase to follow
      // the foreign key from activities → activity_rpg_results and include
      // xp_awarded in the same query. Comes back as a nested object.
      supabase
        .from('activities')
        .select('id, name, activity_type, started_at, duration_seconds, activity_rpg_results(xp_awarded)')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(5),
    ])

    if (characterRes.error) {
      res.status(404).json({
        success: false,
        error: { message: 'Character not found', code: 'NOT_FOUND' },
      })
      return
    }

    const character = characterRes.data

    // Fetch stats separately — needs character.id which we didn't have above
    const { data: statsRow, error: statsError } = await supabase
      .from('character_stats')
      .select('endurance, strength, agility, vitality, focus, resilience')
      .eq('character_id', character.id)
      .single()

    if (statsError || !statsRow) {
      res.status(500).json({
        success: false,
        error: { message: 'Failed to load character stats', code: 'INTERNAL_ERROR' },
      })
      return
    }

    // XP progress within the current level:
    //   xpToNextLevel = total XP gap between current level and the next
    //   progressPercent = how far through that gap the character is
    const currentLevelFloor = xpRequiredForLevel(character.level)
    const nextLevelFloor    = xpRequiredForLevel(character.level + 1)
    const xpToNextLevel     = nextLevelFloor - currentLevelFloor
    const progressPercent   = Math.round((character.xp_current / xpToNextLevel) * 100)

    // Build the stats object — each stat gets its raw value and its descriptor
    const stats = Object.fromEntries(
      STAT_NAMES.map((stat) => [
        stat,
        {
          value:      Number(statsRow[stat]),
          descriptor: getStatDescriptor(stat, Number(statsRow[stat])),
        },
      ])
    ) as Record<StatName, { value: number; descriptor: string }>

    // Flatten the nested activity_rpg_results join into a plain xpAwarded field
    const recentActivities = (activitiesRes.data ?? []).map((a) => {
      // Supabase returns the joined row as an object or array — handle both
      const rpgResult = Array.isArray(a.activity_rpg_results)
        ? a.activity_rpg_results[0]
        : a.activity_rpg_results

      return {
        id:              a.id,
        name:            a.name,
        activityType:    a.activity_type,
        startedAt:       a.started_at,
        durationSeconds: a.duration_seconds,
        xpAwarded:       rpgResult?.xp_awarded ?? 0,
      }
    })

    res.json({
      success: true,
      data: {
        character: {
          level:           character.level,
          xpTotal:         character.xp_total,
          xpCurrent:       character.xp_current,
          xpToNextLevel,
          progressPercent,
          streakDays:      character.streak_days,
          characterClass:  character.character_class,
          lastActivityAt:  character.last_activity_at,
        },
        stats,
        recentActivities,
      },
    })
  })
)
