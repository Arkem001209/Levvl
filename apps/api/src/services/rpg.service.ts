// RPG engine — all XP and stat calculations live here.
// This file is pure functions and typed constants: no database calls, no side effects.
// The route handler calls these functions and is responsible for saving the results.

import type { ActivityType, StatName } from '@levvl/shared'

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
