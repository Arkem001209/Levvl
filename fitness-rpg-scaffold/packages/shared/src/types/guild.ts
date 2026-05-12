// packages/shared/src/types/guild.ts

export type GuildRole = 'owner' | 'member'

export interface Guild {
  id: string
  name: string
  description: string | null
  createdBy: string
  createdAt: string
  memberCount: number
}

export interface GuildMember {
  guildId: string
  userId: string
  username: string
  role: GuildRole
  joinedAt: string
  characterLevel: number
  weeklyXp: number
}
