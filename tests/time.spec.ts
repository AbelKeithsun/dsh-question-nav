/**
 * Unit tests for the question sent-time formatter: smart same-day / same-year
 * / cross-year formats, midnight padding, and invalid-timestamp fallback.
 */
import { describe, expect, it } from 'vitest'
import { formatQuestionTime, isSameDay } from '../src/core/time.ts'

/** Fixed "now" for deterministic output: 2026-08-25 12:00 local. */
const NOW = new Date(2026, 7, 25, 12, 0).getTime()

function at(y: number, mo: number, d: number, h: number, mi: number): number {
  return new Date(y, mo - 1, d, h, mi).getTime()
}

describe('isSameDay', () => {
  it('is true within the same calendar day', () => {
    expect(isSameDay(at(2026, 8, 25, 0, 1), NOW)).toBe(true)
    expect(isSameDay(at(2026, 8, 25, 23, 59), NOW)).toBe(true)
  })
  it('is false across midnight', () => {
    expect(isSameDay(at(2026, 8, 24, 23, 59), NOW)).toBe(false)
    expect(isSameDay(at(2026, 8, 26, 0, 1), NOW)).toBe(false)
  })
  it('is false across month/year boundaries', () => {
    expect(isSameDay(at(2026, 7, 31, 23, 59), at(2026, 8, 1, 0, 1))).toBe(false)
    expect(isSameDay(at(2025, 12, 31, 23, 59), at(2026, 1, 1, 0, 1))).toBe(false)
  })
})

describe('formatQuestionTime', () => {
  it('formats same-day as HH:MM with zero padding', () => {
    expect(formatQuestionTime(at(2026, 8, 25, 9, 5), NOW)).toBe('09:05')
    expect(formatQuestionTime(at(2026, 8, 25, 0, 0), NOW)).toBe('00:00')
    expect(formatQuestionTime(at(2026, 8, 25, 23, 59), NOW)).toBe('23:59')
  })

  it('formats earlier days of the same year as MM-DD HH:MM', () => {
    expect(formatQuestionTime(at(2026, 8, 21, 9, 5), NOW)).toBe('08-21 09:05')
    expect(formatQuestionTime(at(2026, 1, 2, 3, 4), NOW)).toBe('01-02 03:04')
  })

  it('formats a later day of the same year as MM-DD HH:MM', () => {
    expect(formatQuestionTime(at(2026, 12, 31, 14, 30), NOW)).toBe('12-31 14:30')
  })

  it('formats a different year as YYYY-MM-DD HH:MM', () => {
    expect(formatQuestionTime(at(2025, 12, 31, 23, 59), NOW)).toBe('2025-12-31 23:59')
    expect(formatQuestionTime(at(2024, 6, 15, 8, 45), NOW)).toBe('2024-06-15 08:45')
  })

  it('returns an empty string for missing/invalid timestamps', () => {
    expect(formatQuestionTime(0, NOW)).toBe('')
    expect(formatQuestionTime(-5, NOW)).toBe('')
    expect(formatQuestionTime(Number.NaN, NOW)).toBe('')
    expect(formatQuestionTime(Number.POSITIVE_INFINITY, NOW)).toBe('')
  })
})
