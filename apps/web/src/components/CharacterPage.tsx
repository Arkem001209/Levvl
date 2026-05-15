// The character page — fetches from GET /api/character and renders everything.
// Authentication: reads the JWT from VITE_DEV_JWT for now (replaced by a
// real auth flow once login is built).

import { useEffect, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────
// These mirror the shape returned by GET /api/character. Defined here for now
// since we don't have a generated API client yet.

interface StatEntry {
  value: number
  descriptor: string
}

interface CharacterData {
  character: {
    level: number
    xpTotal: number
    xpCurrent: number
    xpToNextLevel: number
    progressPercent: number
    streakDays: number
    characterClass: string
    lastActivityAt: string | null
  }
  stats: {
    endurance:  StatEntry
    strength:   StatEntry
    agility:    StatEntry
    vitality:   StatEntry
    focus:      StatEntry
    resilience: StatEntry
  }
  recentActivities: Array<{
    id: string
    name: string | null
    activityType: string
    startedAt: string
    durationSeconds: number
    xpAwarded: number
  }>
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Stat display order — highest impact stats shown first
const STAT_ORDER = ['endurance', 'agility', 'vitality', 'resilience', 'strength', 'focus'] as const

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CharacterPage() {
  const [data, setData]       = useState<CharacterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    // import.meta.env is Vite's way of accessing environment variables.
    // Variables must be prefixed with VITE_ to be exposed to the browser.
    const jwt = import.meta.env.VITE_DEV_JWT as string | undefined

    fetch('/api/character', {
      headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.json() as Promise<{ success: boolean; data: CharacterData }>
      })
      .then((body) => setData(body.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="page"><p className="state-message">Loading...</p></div>
  if (error)   return <div className="page"><p className="state-message">Error: {error}</p></div>
  if (!data)   return null

  const { character, stats, recentActivities } = data

  return (
    <div className="page">

      {/* Logo */}
      <span className="logo">L · E · V · V · L</span>

      {/* Character header */}
      <div className="character-class">{character.characterClass}</div>
      <div className="character-level">
        {character.level}<span>/ LVL</span>
      </div>

      {/* XP bar */}
      <div className="xp-bar-wrap">
        <div className="xp-bar-track">
          <div
            className="xp-bar-fill"
            style={{ width: `${character.progressPercent}%` }}
          />
        </div>
        <div className="xp-bar-meta">
          <span><strong>{character.xpCurrent.toLocaleString()}</strong> / {character.xpToNextLevel.toLocaleString()} XP to level {character.level + 1}</span>
          <span>{character.progressPercent}%</span>
        </div>
      </div>

      <hr className="divider" />

      {/* Stats */}
      <div className="section-label">Stats</div>
      <div className="stat-list">
        {STAT_ORDER.map((stat) => {
          const entry = stats[stat]
          return (
            <div key={stat} className="stat-row">
              <span className="stat-name">{stat}</span>
              {/* Math.floor so we show clean integers — fractional gains
                  accumulate behind the scenes but the UI always shows whole numbers */}
              <span className="stat-value">{Math.floor(entry.value)}</span>
              <span className="stat-descriptor">{entry.descriptor}</span>
            </div>
          )
        })}
      </div>

      <hr className="divider" />

      {/* Recent activity */}
      <div className="section-label">Recent Activity</div>
      <div className="activity-list">
        {recentActivities.map((a) => (
          <div key={a.id} className="activity-row">
            <span className="activity-name">{a.name ?? 'Untitled'}</span>
            <span className="activity-type">{a.activityType}</span>
            <span className="activity-duration">{formatDuration(a.durationSeconds)}</span>
            <span className="activity-xp">+{a.xpAwarded} XP</span>
          </div>
        ))}
      </div>

    </div>
  )
}
