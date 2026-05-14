/**
 * Dev script: runs processActivity against your real seeded data and logs
 * the results. No database writes — purely for checking the numbers feel right.
 *
 * Run from apps/api:
 *   npx tsx scripts/test-rpg.ts
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import {
  processActivity,
  getStatDescriptor,
  xpRequiredForLevel,
  calculateLevel,
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

function header(title: string): void {
  console.log(`\n${'─'.repeat(64)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(64))
}

async function main(): Promise<void> {

  // Fetch activities, character, and stats in parallel
  const [activitiesRes, characterRes] = await Promise.all([
    supabase
      .from('activities')
      .select('id, name, activity_type, duration_seconds, avg_heart_rate, started_at')
      .eq('user_id', USER_ID)
      .order('started_at', { ascending: true }),
    supabase
      .from('characters')
      .select('id, xp_total, level, streak_days')
      .eq('user_id', USER_ID)
      .single(),
  ])

  if (activitiesRes.error) throw new Error(`Activities fetch failed: ${activitiesRes.error.message}`)
  if (characterRes.error) throw new Error(`Character fetch failed: ${characterRes.error.message}`)

  const character = characterRes.data as CharacterRow & { id: string }

  const statsRes = await supabase
    .from('character_stats')
    .select('endurance, strength, agility, vitality, focus, resilience')
    .eq('character_id', character.id)
    .single()

  if (statsRes.error) throw new Error(`Stats fetch failed: ${statsRes.error.message}`)

  const activities = activitiesRes.data as (ActivityRow & { name: string; started_at: string })[]
  const stats = statsRes.data as CharacterStatsRow

  // ── Starting state ────────────────────────────────────────────────────────

  header('Starting character state')
  console.log(`  Level ${character.level}  |  ${character.xp_total} XP total  |  ${character.streak_days} day streak`)
  console.log()
  for (const stat of STAT_NAMES) {
    const value = stats[stat]
    console.log(`  ${stat.padEnd(12)} ${String(value).padStart(5)}  →  "${getStatDescriptor(stat, value)}"`)
  }

  // ── Process each activity ─────────────────────────────────────────────────

  header(`Processing ${activities.length} activities`)

  // Simulate running processActivity on each activity in sequence.
  // We track a running total so the cumulative XP and level are accurate.
  let runningXpTotal  = character.xp_total
  let runningStats    = { ...stats }
  let totalXpAwarded  = 0

  for (const activity of activities) {
    const date = activity.started_at.slice(0, 10)
    const mins = Math.round(activity.duration_seconds / 60)

    const result = processActivity(
      activity,
      { ...character, xp_total: runningXpTotal },
      runningStats
    )

    totalXpAwarded += result.xpAwarded

    // Show a compact summary for each activity
    const hrStr = activity.avg_heart_rate
      ? `${activity.avg_heart_rate} bpm → ${result.xpBreakdown.intensityMultiplier}x`
      : 'no HR data → 1.0x'

    console.log(`\n  [${activity.activity_type.padEnd(10)}]  ${date}  ${activity.name}`)
    console.log(`    ${mins} min  |  HR: ${hrStr}  |  +${result.xpAwarded} XP${result.levelUp ? '  ⬆ LEVEL UP' : ''}`)

    // Show which stats grew and by how much
    const deltaEntries = Object.entries(result.statDeltas) as [StatName, number][]
    if (deltaEntries.length > 0) {
      const deltaStr = deltaEntries
        .map(([stat, gain]) => `${stat} +${gain.toFixed(4)}`)
        .join('  |  ')
      console.log(`    Stats: ${deltaStr}`)
    }

    // Accumulate XP and stats for the next iteration so diminishing returns
    // compound realistically across the run
    runningXpTotal += result.xpAwarded
    for (const [stat, gain] of deltaEntries) {
      runningStats[stat] = Math.round((runningStats[stat] + gain) * 10000) / 10000
    }
  }

  // ── Final state ───────────────────────────────────────────────────────────

  header('Character state after all activities')

  const finalLevel    = calculateLevel(runningXpTotal)
  const nextLevelXp   = xpRequiredForLevel(finalLevel + 1)
  const prevLevelXp   = xpRequiredForLevel(finalLevel)
  const progressXp    = runningXpTotal - prevLevelXp
  const neededXp      = nextLevelXp - prevLevelXp
  const progressPct   = Math.round((progressXp / neededXp) * 100)

  console.log(`  Level ${finalLevel}  |  ${runningXpTotal} XP total  (+${totalXpAwarded} from these activities)`)
  console.log(`  Progress to level ${finalLevel + 1}: ${progressXp}/${neededXp} XP  (${progressPct}%)`)
  console.log()

  for (const stat of STAT_NAMES) {
    const value = runningStats[stat]
    const gained = Math.round((value - stats[stat]) * 10000) / 10000
    const gainedStr = gained > 0 ? `  (+${gained.toFixed(4)})` : ''
    console.log(`  ${stat.padEnd(12)} ${String(value.toFixed(4)).padStart(8)}${gainedStr}  →  "${getStatDescriptor(stat, value)}"`)
  }

  console.log()
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
