import type { ActivityType } from './activity'
import type { ItemRarity } from './character'

export type QuestStatus = 'active' | 'completed' | 'abandoned' | 'expired'

export interface Quest {
  id: string
  userId: string
  title: string
  description: string
  goalSummary: string
  durationWeeks: number
  status: QuestStatus
  startedAt: string
  expiresAt: string
  completedAt: string | null
  weeks: QuestWeek[]
  rewards: QuestRewards
  createdBy: 'ai' | 'manual'
}

export interface QuestWeek {
  weekNumber: number
  title: string
  description: string
  steps: QuestStep[]
  isComplete: boolean
}

export interface QuestStep {
  id: string
  weekNumber: number
  description: string
  condition: StepCondition
  isComplete: boolean
  completedAt: string | null
  activityIds: string[]
}

// Discriminated union — each variant has a different shape.
// TypeScript uses the `type` field to narrow which other fields are available.
// Example: if (condition.type === 'total_distance') { condition.distanceKm ... }
export type StepCondition =
  | {
      type: 'activity_count'
      activityType: ActivityType
      count: number
      minDurationMinutes?: number
    }
  | {
      type: 'total_distance'
      activityType: ActivityType
      distanceKm: number
    }
  | {
      type: 'total_duration'
      activityType: ActivityType
      durationMinutes: number
    }
  | {
      type: 'single_activity'
      activityType: ActivityType
      minDurationMinutes: number
    }
  | {
      type: 'any_activity'
      count: number
    }

export interface QuestRewards {
  xpOnCompletion: number
  xpPerWeek: number
  guaranteedLootRarity: ItemRarity
}

// What the frontend sends when requesting a new quest
export interface QuestGenerationRequest {
  goal: string
  durationWeeks: 2 | 4 | 6 | 8
  primaryActivity: ActivityType
}
