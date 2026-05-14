// RPG engine — all XP and stat calculations live here.
// Sections 1–3 are pure functions and typed constants (no database calls).
// Section 4 (applyRpgResult) writes the results to Supabase.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityType, ActivityRpgResult, StatName } from '@levvl/shared'

// =============================================================================
// Section 1: Constants
//
// These three objects encode the game design. Changing a number here changes
// how the game feels — no database migrations needed.
// =============================================================================

// -----------------------------------------------------------------------------
// ACTIVITY_TYPE_BONUS
//
// The XP multiplier applied to each activity type.
// `Record<ActivityType, number>` means: an object where every key must be one
// of the ActivityType values, and every value must be a number. TypeScript will
// error if we forget a type or add one that doesn't exist in ActivityType.
// -----------------------------------------------------------------------------
export const ACTIVITY_TYPE_BONUS: Record<ActivityType, number> = {
  running:  1.0,
  cycling:  1.0,
  swimming: 1.15, // slightly rewarded — technique and full-body demand
  strength: 1.0,
  hiit:     1.2,  // highest — maximum intensity by design
  hiking:   0.9,
  yoga:     0.75, // lower XP but still grows focus and vitality meaningfully
  other:    0.8,
  rowing:   1.2,
  climbing: 1.1,
}

// -----------------------------------------------------------------------------
// STAT_RELEVANCE
//
// For each activity type, which stats does it grow and by how much?
//
// `Partial<Record<StatName, number>>` means: an object where keys are StatNames
// but not all six are required. A stat absent from the map has 0 relevance —
// that activity simply doesn't grow it.
//
// Relevance values:
//   1.0  = primary stat (this activity directly trains it)
//   0.35 = secondary stat (indirect benefit)
//
// These mappings are derived from the descriptions in RPG_SYSTEM.md:
//   Endurance  → long runs, long rides, zone 2 work, swim distance
//   Strength   → lifting, HIIT, high-power cycling intervals
//   Agility    → intervals, sprints, tempo runs, high-cadence cycling
//   Vitality   → training frequency, consistency, streaks
//   Focus      → swimming (stroke efficiency), yoga, structured drills
//   Resilience → difficult conditions, plateaus, long streaks
// -----------------------------------------------------------------------------
export const STAT_RELEVANCE: Record<ActivityType, Partial<Record<StatName, number>>> = {
  running: {
    endurance:  1.0,
    agility:    1.0,  // tempo runs and intervals directly train speed
    vitality:   0.35,
    resilience: 0.35,
  },
  cycling: {
    endurance:  1.0,
    agility:    0.35, // high-cadence work has some agility carry-over
    strength:   0.35, // climbing and power intervals
    vitality:   0.35,
  },
  swimming: {
    endurance:  1.0,
    focus:      1.0,  // stroke efficiency is deliberate technical practice
    agility:    0.35,
    vitality:   0.35,
  },
  strength: {
    strength:   1.0,
    resilience: 0.35, // pushing through hard sets builds mental toughness
    vitality:   0.35,
  },
  hiit: {
    strength:   1.0,
    agility:    1.0,  // short explosive efforts directly train speed
    endurance:  0.35, // sustained high intensity has some aerobic carry-over
    resilience: 0.35,
  },
  hiking: {
    endurance:  1.0,
    vitality:   1.0,  // long slow days build recovery capacity
    resilience: 0.35, // difficult terrain, elevation
  },
  yoga: {
    focus:    1.0,
    vitality: 0.35,
  },
  climbing: {
    focus:    1.0,  // route reading and precise movement are deliberate technical practice
    agility:  1.0,  // dynamic movement, balance, body positioning
    strength: 0.35, // pulling, grip — real but secondary to technique
  },
  other: {
    endurance: 0.35,
    vitality:  0.35,
  },
  rowing: {
    strength: 1.0,
    focus: 1.0,
    endurance: 1.0,
    agility: 0.35,
    vitality:  0.35,
  },
}

// -----------------------------------------------------------------------------
// VISUAL_DESCRIPTORS
//
// As stats cross thresholds, the character's physical description updates.
// These are not class labels — they are literal descriptions of what sustained
// training has done to the body.
//
// Each entry is { threshold, text }. The engine finds the highest threshold
// the current stat value has crossed and returns that descriptor.
//
// `as const` tells TypeScript to treat this as deeply immutable — the values
// are literal types, not just `string[]`. This lets TypeScript catch typos in
// stat names at compile time.
// -----------------------------------------------------------------------------
export const VISUAL_DESCRIPTORS = {
  endurance: [
    { threshold: 1,   text: 'lungs like wet paper' },
    { threshold: 5,   text: 'beginning to breathe with purpose' },
    { threshold: 15,  text: 'a steady, patient stride' },
    { threshold: 30,  text: 'lungs that know how to suffer' },
    { threshold: 50,  text: 'the endurance of something that does not stop' },
    { threshold: 75,  text: 'an engine built for distance, tireless and relentless' },
    { threshold: 100, text: 'capable of outlasting almost anything alive' },
  ],
  strength: [
    { threshold: 1,   text: 'arms like dry sticks' },
    { threshold: 5,   text: 'a faint suggestion of muscle' },
    { threshold: 15,  text: 'wiry, functional strength' },
    { threshold: 30,  text: 'iron in the shoulders' },
    { threshold: 50,  text: 'built for force — the kind that shows' },
    { threshold: 75,  text: 'powerful beyond what seems possible for the frame' },
    { threshold: 100, text: 'strength that other people notice and do not comment on' },
  ],
  agility: [
    { threshold: 1,   text: 'slow and uncertain on its feet' },
    { threshold: 5,   text: 'beginning to move with intention' },
    { threshold: 15,  text: 'quick-footed when it matters' },
    { threshold: 30,  text: 'fluid transitions, fast reactions' },
    { threshold: 50,  text: 'moves like something that has been doing this for years' },
    { threshold: 75,  text: 'explosive and precise — difficult to anticipate' },
    { threshold: 100, text: 'a blur when it chooses to be' },
  ],
  vitality: [
    { threshold: 1,   text: 'fragile, easily undone by rest or effort alike' },
    { threshold: 5,   text: 'recovering a little faster than before' },
    { threshold: 15,  text: 'a body learning to repair itself' },
    { threshold: 30,  text: 'resilient in the daily sense — shows up, bounces back' },
    { threshold: 50,  text: 'the kind of health that reads as vitality from across a room' },
    { threshold: 75,  text: 'barely touched by fatigue — recovers overnight' },
    { threshold: 100, text: 'almost disturbingly well' },
  ],
  focus: [
    { threshold: 1,   text: 'clumsy, unfocused, wastes effort on noise' },
    { threshold: 5,   text: 'beginning to move with intention rather than effort' },
    { threshold: 15,  text: 'precise footfall, deliberate breath' },
    { threshold: 30,  text: 'technique that makes the hard look easy' },
    { threshold: 50,  text: 'exceptional economy of motion — nothing wasted' },
    { threshold: 75,  text: 'surgical — every movement has a purpose' },
    { threshold: 100, text: 'a master of the body\'s mechanics' },
  ],
  resilience: [
    { threshold: 1,   text: 'likely to quit when it becomes uncomfortable' },
    { threshold: 5,   text: 'stayed when it wanted to leave' },
    { threshold: 15,  text: 'knows what discomfort feels like and continues anyway' },
    { threshold: 30,  text: 'difficulty does not deter it — perhaps the opposite' },
    { threshold: 50,  text: 'the kind of person who finishes things' },
    { threshold: 75,  text: 'something has been forged here — visible in the bearing' },
    { threshold: 100, text: 'unbreakable is not a metaphor' },
  ],
} as const

// =============================================================================
// Section 2: Pure helper functions
//
// Each function does one thing. None of them read from or write to the database.
// They are exported so the test script can call them individually.
// =============================================================================

// -----------------------------------------------------------------------------
// getIntensityMultiplier
//
// Converts an average heart rate into a zone multiplier using percentage of
// max HR. This is more accurate than absolute bpm thresholds because zones
// are personal — 160bpm is easy for one person and hard for another.
//
// Zone boundaries follow the standard 5-zone model:
//   Zone 1 (very easy): < 60% max HR
//   Zone 2 (easy):      60–70%
//   Zone 3 (moderate):  70–80%
//   Zone 4 (hard):      80–90%
//   Zone 5 (max):       ≥ 90%
//
// maxHr defaults to 207 (the user's measured max). When we add user profiles
// we can pass each user's actual max HR in here instead.
// -----------------------------------------------------------------------------
export function getIntensityMultiplier(avgHeartRate: number | null, maxHr: number = 207): number {
  if (avgHeartRate === null) return 1.0 // no HR data — use neutral multiplier

  const pct = avgHeartRate / maxHr

  if (pct < 0.60) return 0.4  // zone 1 — very easy, recovery effort
  if (pct < 0.70) return 0.7  // zone 2 — easy, aerobic base building
  if (pct < 0.80) return 1.0  // zone 3 — moderate, tempo effort
  if (pct < 0.90) return 1.35 // zone 4 — hard, threshold work
  return 1.6                  // zone 5 — max, all-out effort
}

// For 207 bpm max HR, the zone breakpoints in absolute bpm are:
//   Zone 1: < 124 bpm
//   Zone 2: 124–145 bpm
//   Zone 3: 145–166 bpm
//   Zone 4: 166–186 bpm
//   Zone 5: ≥ 186 bpm

// -----------------------------------------------------------------------------
// getStreakMultiplier
//
// Rewards consistent training. Caps at 1.6x after 15 days so it's meaningful
// but not so dominant that it overshadows the activity itself.
// -----------------------------------------------------------------------------
export function getStreakMultiplier(streakDays: number): number {
  return 1 + Math.min(streakDays * 0.04, 0.6)
  // 0 days:   1.0x
  // 5 days:   1.2x
  // 10 days:  1.4x
  // 15+ days: 1.6x (capped)
}

// -----------------------------------------------------------------------------
// xpRequiredForLevel
//
// Returns the total XP needed to reach a given level from level 1.
// The exponent (1.9) makes early levels fast and later levels much slower.
//
// Examples:
//   Level 2:   142 XP   (~2 moderate workouts)
//   Level 10:  2,981 XP (~6–8 weeks)
//   Level 25:  16,488 XP (~6 months)
//   Level 50:  59,703 XP (~18 months)
// -----------------------------------------------------------------------------
export function xpRequiredForLevel(level: number): number {
  return Math.round(75 * Math.pow(level, 1.9))
}

// -----------------------------------------------------------------------------
// calculateLevel
//
// Given a total XP amount, returns the current level.
// Increments through levels until the XP required for the next level exceeds
// what the character has. The character is always "in" the highest level
// they have enough XP to reach.
// -----------------------------------------------------------------------------
export function calculateLevel(xpTotal: number): number {
  let level = 1
  // Keep climbing as long as the character has enough XP for the next level
  while (xpTotal >= xpRequiredForLevel(level + 1)) {
    level++
  }
  return level
}

// -----------------------------------------------------------------------------
// diminishingReturn
//
// Slows stat growth as values get higher, but never stops it entirely.
// At stat 1 the multiplier is ~0.99 (almost full gain).
// At stat 100 it's ~0.56 (still meaningful, just slower).
//
// Formula: 1 / (1 + 0.008 * currentValue)
// -----------------------------------------------------------------------------
export function diminishingReturn(currentValue: number): number {
  return 1 / (1 + 0.008 * currentValue)
}

// -----------------------------------------------------------------------------
// calculateStatGain
//
// How much a single activity grows one stat. Combines all the modifiers:
//   baseGain (0.15) × relevance × intensityMultiplier × diminishingReturn
//
// Returns a small decimal like 0.1243 — stats are stored with 4 decimal
// places so these fractional gains accumulate accurately over time.
// -----------------------------------------------------------------------------
export function calculateStatGain(
  currentValue: number,
  relevance: number,       // from STAT_RELEVANCE: 1.0 (primary) or 0.35 (secondary)
  intensityMultiplier: number
): number {
  const BASE_GAIN = 0.15
  return BASE_GAIN * relevance * intensityMultiplier * diminishingReturn(currentValue)
}

// -----------------------------------------------------------------------------
// getStatDescriptor
//
// Returns the visual description for a stat at its current value.
// Walks the VISUAL_DESCRIPTORS array and returns the highest threshold crossed.
//
// Example: endurance at 18 → "a steady, patient stride" (threshold 15)
// -----------------------------------------------------------------------------
export function getStatDescriptor(statName: StatName, value: number): string {
  const descriptors = VISUAL_DESCRIPTORS[statName]

  // Walk backwards through the thresholds — return the first one the value meets
  for (let i = descriptors.length - 1; i >= 0; i--) {
    if (value >= descriptors[i].threshold) {
      return descriptors[i].text
    }
  }

  // value is below the first threshold — return the starting descriptor
  return descriptors[0].text
}

// =============================================================================
// Section 3: Main function
//
// processActivity ties all the helpers together. It takes three database rows
// as input and returns an ActivityRpgResult — the full outcome of one activity.
//
// The caller (eventually the webhook handler) is responsible for:
//   - passing in the current character and stats rows
//   - saving the returned result to activity_rpg_results
//   - applying xpAwarded to characters and statDeltas to character_stats
// =============================================================================

// These interfaces describe the shape of the database rows this function needs.
// They only include the columns actually used — not the full row.
// The `number` type for stats works because Postgres numeric comes back as a
// JS number when read via the Supabase client.
export interface ActivityRow {
  id: string
  activity_type: ActivityType
  duration_seconds: number
  avg_heart_rate: number | null
}

export interface CharacterRow {
  id: string
  user_id: string
  xp_total: number
  level: number
  streak_days: number
  last_activity_at: string | null
}

export interface CharacterStatsRow {
  endurance:  number
  strength:   number
  agility:    number
  vitality:   number
  focus:      number
  resilience: number
}

const STAT_NAMES: StatName[] = ['endurance', 'strength', 'agility', 'vitality', 'focus', 'resilience']

export function processActivity(
  activity: ActivityRow,
  character: CharacterRow,
  stats: CharacterStatsRow
): ActivityRpgResult {
  const durationMinutes = activity.duration_seconds / 60

  // Step 1: calculate each multiplier individually so we can store the breakdown
  const intensityMultiplier = getIntensityMultiplier(activity.avg_heart_rate)
  const activityTypeBonus   = ACTIVITY_TYPE_BONUS[activity.activity_type]
  const streakMultiplier    = getStreakMultiplier(character.streak_days)

  // Step 2: XP formula — duration in minutes × 1.5 × all three multipliers
  const base       = durationMinutes * 1.5
  const xpAwarded  = Math.round(base * intensityMultiplier * activityTypeBonus * streakMultiplier)

  // Step 3: stat gains — iterate over all six stats and calculate the gain
  // for each one that this activity type has relevance for.
  // `statDeltas` only includes stats that actually changed (relevance > 0).
  const relevanceMap = STAT_RELEVANCE[activity.activity_type]
  const statDeltas: Partial<Record<StatName, number>> = {}

  for (const stat of STAT_NAMES) {
    const relevance = relevanceMap[stat] ?? 0
    if (relevance === 0) continue // this activity doesn't train this stat

    const gain = calculateStatGain(stats[stat], relevance, intensityMultiplier)
    // Round to 4 decimal places — matches the numeric(8,4) column precision
    statDeltas[stat] = Math.round(gain * 10000) / 10000
  }

  // Step 4: work out the new level from the updated total XP
  const newXpTotal = character.xp_total + xpAwarded
  const levelAfter = calculateLevel(newXpTotal)
  const levelUp    = levelAfter > character.level

  return {
    activityId: activity.id,
    xpAwarded,
    xpBreakdown: {
      base:                Math.round(base),
      intensityMultiplier,
      activityTypeBonus,
      streakMultiplier,
    },
    statDeltas,
    // Loot and titles are handled by separate services (not built yet)
    lootDropped: false,
    lootItemId:  null,
    levelUp,
    levelAfter,
  }
}

// =============================================================================
// Section 4: applyRpgResult
//
// Writes the output of processActivity to three tables in sequence.
// This is the only function in this file that talks to the database.
// =============================================================================

// Returns the streak count after accounting for the new activity's date.
function calculateNewStreak(
  currentStreak: number,
  lastActivityAt: string | null,
  activityStartedAt: string
): number {
  if (lastActivityAt === null) return 1 // first activity ever

  // Slice to "YYYY-MM-DD" so we compare calendar days, not timestamps.
  // Avoids bugs where two activities on the same UTC day are 23h apart.
  const lastDate     = new Date(lastActivityAt.slice(0, 10))
  const activityDate = new Date(activityStartedAt.slice(0, 10))
  const diffDays     = Math.round(
    (activityDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (diffDays === 0) return currentStreak     // same day — don't double-count
  if (diffDays === 1) return currentStreak + 1 // consecutive day — extend streak
  return 1                                     // gap — streak broken
}

export async function applyRpgResult(
  result: ActivityRpgResult,
  character: CharacterRow,
  currentStats: CharacterStatsRow,
  activityStartedAt: string,
  supabase: SupabaseClient
): Promise<void> {

  // Step 1: idempotency check — skip if this activity has already been processed.
  // The unique constraint on activity_rpg_results.activity_id would also catch
  // this, but checking first gives us a clean early exit with no error noise.
  const { data: existing } = await supabase
    .from('activity_rpg_results')
    .select('id')
    .eq('activity_id', result.activityId)
    .single()

  if (existing) {
    console.log(`  Skipping ${result.activityId} — already processed`)
    return
  }

  // Step 2: calculate the new streak before any writes
  const newStreak  = calculateNewStreak(character.streak_days, character.last_activity_at, activityStartedAt)
  const newXpTotal = character.xp_total + result.xpAwarded
  // xp_current is the progress within the current level (resets to 0 on level-up)
  const newXpCurrent = newXpTotal - xpRequiredForLevel(result.levelAfter)

  // Step 3: insert the audit record
  const { error: rpgError } = await supabase.from('activity_rpg_results').insert({
    activity_id:  result.activityId,
    user_id:      character.user_id,
    xp_awarded:   result.xpAwarded,
    xp_breakdown: result.xpBreakdown,
    stat_deltas:  result.statDeltas,
    loot_dropped: result.lootDropped,
    loot_item_id: result.lootItemId,
    level_up:     result.levelUp,
    level_after:  result.levelAfter,
  })
  if (rpgError) throw new Error(`activity_rpg_results insert failed: ${rpgError.message}`)

  // Step 4: apply stat deltas — add each gain to the current stat value
  const statUpdate: Partial<CharacterStatsRow> = {}
  for (const [stat, delta] of Object.entries(result.statDeltas) as [StatName, number][]) {
    statUpdate[stat] = Math.round((currentStats[stat] + delta) * 10000) / 10000
  }

  if (Object.keys(statUpdate).length > 0) {
    const { error: statsError } = await supabase
      .from('character_stats')
      .update({ ...statUpdate, updated_at: new Date().toISOString() })
      .eq('character_id', character.id)
    if (statsError) throw new Error(`character_stats update failed: ${statsError.message}`)
  }

  // Step 5: update the character row
  const { error: characterError } = await supabase
    .from('characters')
    .update({
      xp_total:         newXpTotal,
      xp_current:       newXpCurrent,
      level:            result.levelAfter,
      streak_days:      newStreak,
      last_activity_at: activityStartedAt,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', character.id)
  if (characterError) throw new Error(`characters update failed: ${characterError.message}`)
}
