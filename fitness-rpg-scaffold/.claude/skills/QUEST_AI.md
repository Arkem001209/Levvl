# QUEST_AI.md

## Concept

Quests are AI-generated training plans. They are the primary "game content" — the
thing that gives a player a goal beyond passive XP accumulation. A quest might be
"Build your base fitness over 4 weeks" or "Peak for a 10km race in 6 weeks."

The key design principle: **the AI generates real, useful training advice** in the
form of game quests. A completed quest should mean the user genuinely did structured
training, not just clicked a button.

---

## Quest structure

```ts
// packages/shared/src/types/quest.ts

interface Quest {
  id: string
  userId: string
  title: string                    // e.g. "Operation: Ironweek"
  description: string              // flavour text + plan summary
  goalSummary: string              // plain-language goal, e.g. "Build a 4-week running base"
  durationWeeks: number
  status: 'active' | 'completed' | 'abandoned' | 'expired'
  startedAt: string                // ISO date
  expiresAt: string                // ISO date (startedAt + durationWeeks)
  completedAt: string | null
  weeks: QuestWeek[]
  rewards: QuestRewards
  createdBy: 'ai' | 'manual'
}

interface QuestWeek {
  weekNumber: number               // 1-indexed
  title: string                    // e.g. "Week 1: Foundation"
  description: string
  steps: QuestStep[]
  isComplete: boolean
}

interface QuestStep {
  id: string
  weekNumber: number
  description: string              // e.g. "Complete 3 runs of at least 20 minutes each"
  condition: StepCondition         // machine-readable completion check
  isComplete: boolean
  completedAt: string | null
  activityIds: string[]            // activities that counted towards this step
}

// Describes how to check if a step is complete from activity data
type StepCondition =
  | { type: 'activity_count'; activityType: ActivityType; count: number; minDurationMinutes?: number }
  | { type: 'total_distance'; activityType: ActivityType; distanceKm: number }
  | { type: 'total_duration'; activityType: ActivityType; durationMinutes: number }
  | { type: 'single_activity'; activityType: ActivityType; minDurationMinutes: number }
  | { type: 'any_activity'; count: number }

interface QuestRewards {
  xpOnCompletion: number
  xpPerWeek: number                // awarded when each week is completed
  guaranteedLootRarity: 'uncommon' | 'rare' | 'epic'
}
```

---

## AI prompt design

The quest generator calls the Anthropic API with a structured prompt. The model
must return **valid JSON only** — no prose, no markdown fences.

### System prompt

```
You are a fitness quest generator for a gamified training app.
Your job is to create structured training plans in the form of RPG quests.

Each quest is a multi-week training plan with specific, measurable weekly objectives.
Objectives must be achievable by a real person based on their recent training history.
Be encouraging but realistic — don't prescribe more than a 10% weekly volume increase.

You must return ONLY valid JSON matching the schema provided. No explanation, no
markdown, no commentary outside the JSON object.
```

### User prompt template

```ts
function buildQuestPrompt(context: QuestGenerationContext): string {
  return `
Generate a training quest for the following athlete.

## Athlete profile
- Current character level: ${context.characterLevel}
- Dominant activity: ${context.dominantActivity}
- Recent weekly volume (last 4 weeks average):
  ${context.recentVolume.map(v => `  - ${v.activityType}: ${v.weeklyMinutes} minutes/week, ${v.weeklyDistanceKm} km/week`).join('\n')}
- Current stats: ${JSON.stringify(context.stats)}
- Goal (from user): "${context.userGoal}"
- Preferred duration: ${context.durationWeeks} weeks

## Instructions
Create a ${context.durationWeeks}-week training quest that:
1. Aligns with the stated goal: "${context.userGoal}"
2. Builds progressively — each week slightly harder than the last
3. Does not exceed a 10% increase in weekly volume from current levels
4. Has 2-4 specific, measurable steps per week
5. Each step must use one of these condition types:
   activity_count | total_distance | total_duration | single_activity | any_activity

## Required JSON schema
${JSON.stringify(QUEST_JSON_SCHEMA, null, 2)}

Return only the JSON object. No other text.
`
}
```

### JSON schema passed to the model

```ts
const QUEST_JSON_SCHEMA = {
  title: "string — quest name with RPG flavour",
  description: "string — 2-3 sentences of flavour text and plan overview",
  goalSummary: "string — plain language goal",
  durationWeeks: "number",
  weeks: [
    {
      weekNumber: "number",
      title: "string",
      description: "string — what this week focuses on",
      steps: [
        {
          description: "string — human-readable instruction",
          condition: {
            type: "activity_count | total_distance | total_duration | single_activity | any_activity",
            activityType: "running | cycling | swimming | strength | hiking | yoga | hiit | other (omit for any_activity)",
            count: "number (for activity_count, any_activity)",
            minDurationMinutes: "number (optional)",
            distanceKm: "number (for total_distance)",
            durationMinutes: "number (for total_duration)"
          }
        }
      ]
    }
  ],
  rewards: {
    xpOnCompletion: "number — suggest 500-2000 based on difficulty",
    xpPerWeek: "number — suggest 100-400",
    guaranteedLootRarity: "uncommon | rare | epic"
  }
}
```

---

## Quest generation flow

```
User opens Quest Board and requests a new quest
        ↓
Frontend sends POST /api/quests/generate
  { goal: string, durationWeeks: number }
        ↓
quest.service.ts: build context from user's recent activity history
  - fetch last 30 days of activities from DB
  - calculate weekly averages per activity type
  - get current character stats + level
        ↓
Call Anthropic API with system prompt + user prompt
        ↓
Parse + validate JSON response with zod
  - if validation fails: retry once with error feedback appended to prompt
  - if second attempt fails: return a fallback template quest
        ↓
Store quest in DB with status 'active'
        ↓
Return quest to frontend
```

---

## Quest progress checking

Run this on every activity sync. Lives in `quest.service.ts`:

```ts
async function checkQuestProgress(userId: string, newActivity: Activity): Promise<void> {
  // 1. Get the user's active quest (if any)
  // 2. Find incomplete steps in the current week
  // 3. For each incomplete step, check if newActivity satisfies the condition
  // 4. If step is now complete: mark it, record activityId
  // 5. If all steps in a week are complete: mark week complete, award weekXP
  // 6. If all weeks complete: mark quest complete, award completion XP + loot
}
```

### Condition checking examples

```ts
function checkCondition(condition: StepCondition, weekActivities: Activity[]): boolean {
  switch (condition.type) {
    case 'activity_count':
      const matching = weekActivities.filter(a =>
        a.activityType === condition.activityType &&
        (condition.minDurationMinutes === undefined ||
         a.durationSeconds / 60 >= condition.minDurationMinutes)
      )
      return matching.length >= condition.count

    case 'total_distance':
      const totalKm = weekActivities
        .filter(a => a.activityType === condition.activityType)
        .reduce((sum, a) => sum + a.distanceMeters / 1000, 0)
      return totalKm >= condition.distanceKm

    // ... etc
  }
}
```

---

## Fallback quest templates

If the AI call fails twice, use a pre-written template appropriate to the user's
dominant activity. Store 2-3 templates per activity type in the codebase as JSON
constants. Templates are less personalised but ensure the feature never fully breaks.

---

## User goal input

When the user requests a quest, show a simple form:
- "What do you want to achieve?" (free text, required)
- "How many weeks?" (2 / 4 / 6 / 8 — picker, default 4)
- "What's your main focus this period?" (runs / rides / mixed — pill picker)

This becomes the `userGoal` context passed to the AI. Keep the form simple —
the AI does the heavy lifting of interpreting the goal.

---

## Cost management

Each quest generation is one Anthropic API call. With < 20 users each generating
maybe 2 quests per month, this is negligible cost. If the app ever scales, add:
- Rate limit: 1 quest generation per user per 7 days
- Cache: if the same goal + context is requested within 24h, return cached result
