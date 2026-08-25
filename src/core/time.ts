/**
 * Question sent-time formatting for the question-nav surface. Pure: no DSH
 * imports, deterministic for a given (time, now) pair — unit-testable in
 * isolation and safe to inline into the client bundle.
 *
 * @module dsh-question-nav/time
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** Whether `time` falls on the same calendar day as `now`. */
export function isSameDay(time: number, now: number): boolean {
  const a = new Date(time)
  const b = new Date(now)
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

/**
 * Smart question sent-time, relative to `now`:
 * - same calendar day → `HH:MM`
 * - same calendar year → `MM-DD HH:MM`
 * - otherwise → `YYYY-MM-DD HH:MM`
 *
 * Returns `''` for a missing/invalid timestamp (e.g. a live node that never
 * reported one), so callers can hide the time line without branching.
 */
export function formatQuestionTime(time: number, now: number): string {
  if (!Number.isFinite(time) || time <= 0) return ''
  const d = new Date(time)
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  if (isSameDay(time, now)) return hm
  const md = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  if (d.getFullYear() === new Date(now).getFullYear()) return `${md} ${hm}`
  return `${d.getFullYear()}-${md} ${hm}`
}
