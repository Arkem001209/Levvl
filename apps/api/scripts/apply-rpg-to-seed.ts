/**
 * Dev script: runs all seeded activities through the RPG engine and writes
 * the results to the database. Safe to re-run — already-processed activities
 * are skipped via the idempotency check in applyRpgResult.
 *
 * Run from apps/api:
 *   npx tsx scripts/apply-rpg-to-seed.ts
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import {
  processActivity,
  applyRpgResult,
  type ActivityRow,
  type CharacterRow,
  type CharacterStatsRow,
} from '../src/services/rpg.service'
import type { StatName } from '@levvl/shared'

const USER_ID = 'd853bc6b-559b-476b-b4ab-c9031ec0b79f'
const supabase = createClient(
  process.env.API_SUPABASE_URL!,
  process.env.API_SUPABASE_SERVICE_ROLE_KEY!
)

const STAT_NAMES: StatName[] = ['endurance', 'strength', 'agility', 'vitality', 'focus', 'resilience']

async function main(): Promise<void> {

  // Fetch all seeded activities in chronological order
  const { data: activities, error: activitiesError } = await supabase
    .from('activities')
    .select('id, activity_type, duration_seconds, avg_heart_rate, started_at, name')
    .eq('user_id', USER_ID)
    .order('started_at', { ascending: true })

  if (activitiesError) throw new Error(activitiesError.message)
  console.log(`Found ${activities!.length} activities to process\n`)

  // Fetch the current character and stats — we'll update these in memory
  // as we go so each activity uses the accumulated state from the previous one
  const { data: character, error: charError } = await supabase
    .from('characters')
    .select('id, user_id, xp_total, xp_current, level, streak_days, last_activity_at')
    .eq('user_id', USER_ID)
    .single()

  if (charError) throw new Error(charError.message)

  const { data: statsRow, error: statsError } = await supabase
    .from('character_stats')
    .select('endurance, strength, agility, vitality, focus, resilience')
    .eq('character_id', character!.id)
    .single()

  if (statsError) throw new Error(statsError.message)

  // Track running state in memory so each call to processActivity sees the
  // character as it would actually be after the previous activity was applied
  let currentCharacter = character as CharacterRow
  let currentStats     = statsRow as CharacterStatsRow

  for (const activity of activities!) {
    const date = (activity.started_at as string).slice(0, 10)
    const label = `[${activity.activity_type.padEnd(10)}] ${date}  ${activity.name}`

    const result = processActivity(
      activity as ActivityRow,
      currentCharacter,
      currentStats
    )

    await applyRpgResult(result, currentCharacter, currentStats, activity.started_at, supabase)

    console.log(`  ✓ ${label}  →  +${result.xpAwarded} XP${result.levelUp ? '  ⬆ LEVEL UP' : ''}`)

    // Update in-memory state so the next iteration reflects the changes
    // (the DB has been updated, but re-fetching each time would be slow)
    currentCharacter = {
      ...currentCharacter,
      xp_total:         currentCharacter.xp_total + result.xpAwarded,
      level:            result.levelAfter,
      last_activity_at: activity.started_at,
    }
    for (const [stat, delta] of Object.entries(result.statDeltas) as [StatName, number][]) {
      currentStats = {
        ...currentStats,
        [stat]: Math.round((currentStats[stat] + delta) * 10000) / 10000,
      }
    }
  }

  console.log(`\nDone. Final state:`)
  console.log(`  Level ${currentCharacter.level}  |  ${currentCharacter.xp_total} XP`)
  for (const stat of STAT_NAMES) {
    console.log(`  ${stat.padEnd(12)} ${currentStats[stat].toFixed(4)}`)
  }
  console.log()
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
