// Plain-language dates for the launcher: group labels and "2 h ago".

const DAY = 24 * 60 * 60 * 1000

/** The label of the group a date falls in, counted in whole calendar days. */
export function dateGroup(date: Date, now: Date = new Date()): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const time = date.getTime()
  if (time >= startOfToday) return 'Today'
  if (time >= startOfToday - DAY) return 'Yesterday'
  if (time >= startOfToday - 6 * DAY) return 'This week'
  if (time >= startOfToday - 29 * DAY) return 'This month'
  return 'Earlier'
}

/** A save's time: "3 h ago · Nov 14, 2026, 9:05 AM" this week, just the date and time before that. */
export function savedAt(date: Date, now: Date = new Date()): string {
  const full = date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return now.getTime() - date.getTime() < 7 * DAY ? `${relativeTime(date, now)} · ${full}` : full
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - date.getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
