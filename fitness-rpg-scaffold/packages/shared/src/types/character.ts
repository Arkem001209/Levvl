// packages/shared/src/types/character.ts

import type { StatName } from './activity'

export type ItemSlot = 'head' | 'chest' | 'legs' | 'feet' | 'weapon' | 'accessory'
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

// The progression stage label — derived from level, used for UI flavour only
export type ProgressionStage =
  | 'The Hollow'       // levels 1–5
  | 'The Waking'       // levels 6–15
  | 'The Shaping'      // levels 16–30
  | 'The Forged'       // levels 31–50
  | 'The Ascendant'    // levels 51–75
  | 'The Godwalker'    // levels 76+

export interface Character {
  id: string
  userId: string
  level: number
  xpTotal: number
  xpCurrent: number
  xpToNextLevel: number         // calculated, not stored
  progressionStage: ProgressionStage
  activeTitle: string | null    // e.g. 'The Enduring' — player's chosen display title
  earnedTitles: string[]        // all titles ever earned
  streakDays: number
  lastActivityAt: string | null
  stats: CharacterStats
  statDescriptors: Record<StatName, string>  // current descriptor text per stat
  equippedItems: Partial<Record<ItemSlot, InventoryItem>>
}

export interface CharacterStats {
  endurance: number
  strength: number
  agility: number
  vitality: number
  focus: number
  resilience: number
}

export interface InventoryItem {
  id: string
  userId: string
  itemKey: string
  name: string
  description: string | null
  slot: ItemSlot
  rarity: ItemRarity
  statAffix: StatName | null
  statBonus: number
  isEquipped: boolean
  obtainedAt: string
}
