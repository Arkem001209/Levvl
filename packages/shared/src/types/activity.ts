export type ActivityType =
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'strength'
  | 'hiking'
  | 'yoga'
  | 'hiit'
  | 'rowing'
  | 'other'

export type TrackerSource = 'strava' | 'coros' | 'manual'

export interface Activity {
  id: string
  userId: string
  trackerSource: TrackerSource
  trackerId: string
  activityType: ActivityType
  name: string | null
  startedAt: string             // ISO 8601
  durationSeconds: number
  distanceMeters: number | null
  elevationGainMeters: number | null
  avgHeartRate: number | null
  maxHeartRate: number | null
  avgPowerWatts: number | null
  sufferScore: number | null    // Strava only
  createdAt: string
}

// What the RPG engine returns after processing an activity
export interface ActivityRpgResult {
  activityId: string
  xpAwarded: number
  xpBreakdown: {
    base: number
    intensityMultiplier: number
    activityTypeBonus: number
    streakMultiplier: number
  }
  statDeltas: Partial<Record<StatName, number>>
  lootDropped: boolean
  lootItemId: string | null
  levelUp: boolean
  levelAfter: number
}

export type StatName = 'endurance' | 'strength' | 'agility' | 'vitality' | 'focus' | 'resilience'
