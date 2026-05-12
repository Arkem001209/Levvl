# RPG_SYSTEM.md

## Core philosophy

There are no classes. There is no archetype selection. There is no predetermined path.

The character begins as almost nothing — a hollow, spindly creature of negligible
strength and endurance, barely capable of movement. What it becomes is determined
entirely by how the user trains over months and years. A person who runs long and
slow will grow a different character than someone who lifts heavy three times a week.
Someone who does both will grow something in between. The character is a living
record of real effort.

This is a long-term commitment. Do not make early progress feel fast. The starting
creature should feel genuinely weak. The first few months should feel like dragging
something fragile toward the light. The payoff comes later — and it should feel earned.

The endgame is godlike. There is no level cap. Stats have no ceiling. A character
trained for three years should look and feel categorically different from one trained
for three months. The gap should be visible, legible, and awe-inspiring.

---

## The starting character

At level 1, before any activity is logged, the character is described as:

> *A hollow figure. Pale and slight, with the bearing of something that has never
> been tested. Its limbs are thin as winter branches. Its eyes are dim. It has
> potential — though nothing about it yet suggests this is true.*

All stats begin at **1**. Not 10. Not 5. **1.**

This is intentional. The first workout should feel like it matters enormously,
because relative to where you started, it does.

The character has no equipment. No titles. No descriptors beyond the default starting
description. It is a blank slate in the most literal sense.

---

## Stats

Six stats. Each starts at 1 and grows without ceiling. All gains are fractional —
early progress is fast because gains are large relative to the base; later gains
slow as the denominator grows.

| Stat | What it measures | Grows from |
|---|---|---|
| **Endurance** | Aerobic capacity, sustained output, the ability to keep going | Long runs, long rides, zone 2 work, swim distance |
| **Strength** | Raw power, force production, resistance to load | Lifting, HIIT, high-power cycling intervals |
| **Agility** | Speed, quick efforts, responsiveness | Intervals, sprints, tempo runs, high-cadence cycling |
| **Vitality** | Recovery, consistency, the body's resilience over time | Training frequency, rest adherence, sustained streaks |
| **Focus** | Technique, precision, deliberate practice | Swimming (stroke efficiency), yoga, structured drills |
| **Resilience** | The capacity to endure discomfort and return | Training in difficult conditions, breaking plateaus, long streaks |

### Stat gain formula

```ts
statGain = baseGain
  * activityRelevance      // how much does this activity grow this stat?
  * intensityMultiplier    // how hard was the effort?
  * diminishingReturn(currentValue)

baseGain = 0.15            // flat gain per activity — higher because stats start at 1

// activityRelevance:
//   primary:   1.0   (this activity directly trains this stat)
//   secondary: 0.35  (indirect benefit)
//   none:      0.0

// intensityMultiplier:
//   zone 1 (very easy): 0.4
//   zone 2 (easy):      0.7
//   zone 3 (moderate):  1.0
//   zone 4 (hard):      1.35
//   zone 5 (max):       1.6
//   no HR data:         1.0 (default)

// diminishingReturn: slows growth at high values but never stops it
diminishingReturn(v) = 1 / (1 + 0.008 * v)
//   stat   1: ~0.99  (essentially full gain — early progress is fast)
//   stat  10: ~0.93
//   stat  25: ~0.83
//   stat  50: ~0.71
//   stat 100: ~0.56
//   stat 200: ~0.38  (still growing — just slower)
```

Stats are stored as decimals (`numeric(8,4)`) and displayed as floored integers
in the UI. A stat of 24.87 displays as 24. This makes each integer threshold feel
like a genuine milestone.

---

## Visual descriptors

As stats cross thresholds, the character's description updates. These are not
class labels — they are physical descriptions of what training has actually
produced on the body. They are permanent once earned and accumulate over time.

A character trained only in running will look like a runner. A character trained
in everything will accumulate descriptors across all stats and start to look like
something genuinely formidable.

### Descriptor thresholds

Each stat has its own descriptor track. Store these in a `VISUAL_DESCRIPTORS`
constant in `rpg.service.ts` — not in the database, as they are game design data.

**Endurance**
| Threshold | Descriptor |
|---|---|
| 1 (start) | *lungs like wet paper* |
| 5 | *beginning to breathe with purpose* |
| 15 | *a steady, patient stride* |
| 30 | *lungs that know how to suffer* |
| 50 | *the endurance of something that does not stop* |
| 75 | *an engine built for distance, tireless and relentless* |
| 100+ | *capable of outlasting almost anything alive* |

**Strength**
| Threshold | Descriptor |
|---|---|
| 1 (start) | *arms like dry sticks* |
| 5 | *a faint suggestion of muscle* |
| 15 | *wiry, functional strength* |
| 30 | *iron in the shoulders* |
| 50 | *built for force — the kind that shows* |
| 75 | *powerful beyond what seems possible for the frame* |
| 100+ | *strength that other people notice and do not comment on* |

**Agility**
| Threshold | Descriptor |
|---|---|
| 1 (start) | *slow and uncertain on its feet* |
| 5 | *beginning to move with intention* |
| 15 | *quick-footed when it matters* |
| 30 | *fluid transitions, fast reactions* |
| 50 | *moves like something that has been doing this for years* |
| 75 | *explosive and precise — difficult to anticipate* |
| 100+ | *a blur when it chooses to be* |

**Vitality**
| Threshold | Descriptor |
|---|---|
| 1 (start) | *fragile, easily undone by rest or effort alike* |
| 5 | *recovering a little faster than before* |
| 15 | *a body learning to repair itself* |
| 30 | *resilient in the daily sense — shows up, bounces back* |
| 50 | *the kind of health that reads as vitality from across a room* |
| 75 | *barely touched by fatigue — recovers overnight* |
| 100+ | *almost disturbingly well* |

**Focus**
| Threshold | Descriptor |
|---|---|
| 1 (start) | *clumsy, unfocused, wastes effort on noise* |
| 5 | *beginning to move with intention rather than effort* |
| 15 | *precise footfall, deliberate breath* |
| 30 | *technique that makes the hard look easy* |
| 50 | *exceptional economy of motion — nothing wasted* |
| 75 | *surgical — every movement has a purpose* |
| 100+ | *a master of the body's mechanics* |

**Resilience**
| Threshold | Descriptor |
|---|---|
| 1 (start) | *likely to quit when it becomes uncomfortable* |
| 5 | *stayed when it wanted to leave* |
| 15 | *knows what discomfort feels like and continues anyway* |
| 30 | *difficulty does not deter it — perhaps the opposite* |
| 50 | *the kind of person who finishes things* |
| 75 | *something has been forged here — visible in the bearing* |
| 100+ | *unbreakable is not a metaphor* |

### Displaying descriptors in the UI

The character sheet shows the current descriptor for each stat — the highest
threshold the character has crossed. Do not show all six at once on the default
view. Show the two or three highest stats prominently; the rest are accessible
on expansion. The full accumulated picture should feel like reading a portrait
of a person built by their training.

---

## Earned titles

Titles are rare, permanent, and must be genuinely earned. They appear below the
character's name on the character sheet. A character can display one active title
at a time (player's choice) but collects all earned titles in a "Titles" tab.

Titles fire on specific milestone conditions — not just stat thresholds. Check
for new titles after every activity sync.

| Title | Condition |
|---|---|
| *The Returning* | Logged an activity after a 30+ day gap |
| *Ironfooted* | 500km run lifetime |
| *The Enduring* | Completed a single activity over 3 hours |
| *Unbowed* | 30-day activity streak |
| *The Ascendant* | Reached level 25 |
| *Forged* | All six stats above 25 |
| *The Relentless* | Activities logged in 50 separate calendar weeks |
| *Deep Water* | 100km swim lifetime |
| *The Mountain* | 10,000m elevation gain lifetime |
| *Century* | Reached level 100 |
| *Godwalker* | All six stats above 100 |
| *The Unfinished* | Abandoned an active quest — a mark of failure, worn with honesty |

Store all earned titles in a `character_titles` table. The active displayed title
is stored on the `characters` table as `active_title`.

---

## XP and levelling

### XP formula per activity

```ts
xp = Math.round(
  durationMinutes * 1.5        // 1.5 XP per minute
  * intensityMultiplier         // zone multipliers as above
  * activityTypeBonus           // see below
  * streakMultiplier            // see below
)
```

### Activity type XP bonus

| Activity | Multiplier |
|---|---|
| Running | 1.0 |
| Cycling | 1.0 |
| Swimming | 1.15 |
| Strength training | 1.0 |
| HIIT | 1.2 |
| Hiking | 0.9 |
| Yoga / mobility | 0.75 |
| Other / unknown | 0.8 |

### Streak multiplier

```ts
streakMultiplier = 1 + Math.min(streakDays * 0.04, 0.6)
// 0 days:  1.0x
// 5 days:  1.2x
// 10 days: 1.4x
// 15+ days: 1.6x (capped)
```

### Level thresholds

Early levels come relatively quickly to reward new users. Then the curve steepens
substantially. There is no cap.

```ts
function xpRequiredForLevel(level: number): number {
  // Total XP needed to reach this level from level 1
  return Math.round(75 * Math.pow(level, 1.9))
}

// Level 2:      142 XP   (~2 moderate workouts)
// Level 5:      836 XP   (~2 weeks of regular training)
// Level 10:   2,981 XP   (~6–8 weeks)
// Level 25:  16,488 XP   (~6 months)
// Level 50:  59,703 XP   (~18 months)
// Level 100: 214,109 XP  (~4+ years of consistent training)
// No cap.
```

---

## Gear and equipment

Gear is a trophy case. It is the physical record of what the character has done.
It does not make you stronger in any meaningful way — you make it meaningful by
earning it.

### Philosophy

Every piece of gear has a specific unlock condition tied to a real training
milestone. The item's description references what was done to earn it. There are
no random drops. There is no loot box. You earn a specific thing by doing a
specific thing, and the item remembers it.

Gear is mostly cosmetic. A small number of items at high levels carry a minor
stat bonus (never more than +3 to a single stat) — flavour, not power. The
character's strength comes from training.

### Gear slots

Head / Chest / Legs / Feet / Weapon / Accessory

Weapon is cosmetic. The character does not fight. It is a symbol of what has
been built — a staff carried a thousand kilometres, a blade earned by a year
of effort.

### Unlock conditions (examples)

Store all unlock conditions in a `GEAR_UNLOCKS` constant in `loot.service.ts`.
Use the same `StepCondition` type pattern from `QUEST_AI.md` where possible.

| Item | Slot | Rarity | Unlock condition | Description |
|---|---|---|---|---|
| *Threadbare Wraps* | Chest | Common | First activity ever logged | *The wrappings of a creature just beginning. They have seen one effort.* |
| *Boots of First Steps* | Feet | Common | 10km run lifetime | *Simple boots. They have carried you ten kilometres. That is ten more than nothing.* |
| *The Runner's Cord* | Accessory | Uncommon | 100km run lifetime | *A worn cord, knotted once for every hundred kilometres.* |
| *Ironhand Grips* | Accessory | Uncommon | 50 strength sessions | *Grips worn smooth by fifty sessions. The hands beneath them are harder now.* |
| *Greaves of Suffering* | Legs | Uncommon | Single activity over 3 hours | *Worn through something that lasted three hours. They know what that feels like.* |
| *Mantle of Distance* | Chest | Rare | 500km any activity lifetime | *A heavy mantle. It carries the weight of five hundred kilometres.* |
| *Crown of the Ascendant* | Head | Rare | Reach level 25 | *Not a crown of gold. A crown of accumulated effort.* |
| *Boots of 500 Roads* | Feet | Rare | 500km run lifetime | *These boots have been places. The leather remembers them.* |
| *The Unbroken Band* | Accessory | Rare | 30-day streak | *Worn every day for thirty days without exception.* |
| *Staff of the Long Way* | Weapon | Epic | 1,000km any activity lifetime | *Carried a thousand kilometres. It is not a weapon. It is a record.* |
| *Helm of the Forged* | Head | Epic | All stats above 50 | *A helm that could only be earned, never purchased.* |
| *Godwalker's Mantle* | Chest | Legendary | All stats above 100 | *You have earned this. There is nothing more to say about it.* |

### Rarity communicates difficulty

| Rarity | What it signals |
|---|---|
| Common | First steps — early milestones, first weeks |
| Uncommon | Weeks of consistent effort |
| Rare | Months of training |
| Epic | Multi-month landmark achievements |
| Legendary | Multi-year, extraordinary milestones |

---

## Progression feel by phase

Use this as a tuning guide. If playtesting shows the pacing is off, adjust the
XP base multiplier (currently `1.5` per minute) before touching anything else.

| Stage | Level range | Approx. real time | Character feel |
|---|---|---|---|
| The Hollow | 1–5 | 0–2 weeks | Frail, barely moving, stats in single digits, no gear |
| The Waking | 6–15 | 2 weeks–2 months | Something is changing. First descriptors appear. First gear earned. |
| The Shaping | 16–30 | 2–6 months | Visibly different from the start. A real character emerging. Several gear pieces. |
| The Forged | 31–50 | 6–18 months | Strong. Multiple descriptors across stats. Titles earned. Rare gear. |
| The Ascendant | 51–75 | 18 months–3 years | Formidable. The character sheet tells a real story. Epic gear. |
| The Godwalker | 76–100+ | 3+ years | Something beyond ordinary. Stats above 100. Legendary gear. Godwalker's Mantle. |

---

## Implementation notes

- All RPG calculations live in `apps/api/src/services/rpg.service.ts`
- `getStatDescriptor(statName: StatName, value: number): string` — pure function,
  no DB call, just walks the threshold table and returns the highest matching descriptor
- `VISUAL_DESCRIPTORS` and `GEAR_UNLOCKS` are typed constants in the source, not DB rows
- `checkTitleUnlocks(userId, updatedCharacter, lifetimeStats)` runs after every sync
- `checkGearUnlocks(userId, lifetimeStats)` runs after every sync in `loot.service.ts`
- The activity sync response includes `unlockedGear: InventoryItem | null` and
  `earnedTitle: string | null` so the frontend can trigger unlock notifications
- Store all intermediate RPG values in `activity_rpg_results` for debugging —
  include pre-multiplier XP, each stat delta, and which gear/title checks fired
- The frontend never calculates any of this — it only displays what the backend returns
