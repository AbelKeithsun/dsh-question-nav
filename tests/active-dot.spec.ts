/**
 * Unit tests for the scroll-spy rule (core/active-dot.ts): which dot marks
 * the reader's current position, and the reading-line clamp.
 */
import { describe, expect, it } from 'vitest'
import { pickActiveDot, readingLineOffset, type ActiveDotRow } from '../src/core/active-dot.ts'

function row(key: string, top: number): ActiveDotRow {
  return { key, top }
}

describe('pickActiveDot', () => {
  it('returns null when no dot row is rendered', () => {
    expect(pickActiveDot([], 100)).toBeNull()
  })

  it('marks the last row at or above the reading line', () => {
    const rows = [row('a', -300), row('b', -40), row('c', 120), row('d', 400)]
    expect(pickActiveDot(rows, 100)).toBe('b')
  })

  it('includes a row exactly on the line', () => {
    const rows = [row('a', 50), row('b', 250)]
    expect(pickActiveDot(rows, 50)).toBe('a')
  })

  it('marks the last row when the reader is past every question', () => {
    const rows = [row('a', -800), row('b', -200)]
    expect(pickActiveDot(rows, 100)).toBe('b')
  })

  it('falls back to the first row when the line sits above them all', () => {
    const rows = [row('a', 200), row('b', 600)]
    expect(pickActiveDot(rows, 100)).toBe('a')
  })

  it('keeps the last qualifying row even if one top is stale/out of order', () => {
    // The second row's top regressed (mid-reflow measurement); the scan must
    // not move the marker backwards past a later qualifying row.
    const rows = [row('a', -300), row('b', 10), row('c', -50), row('d', 500)]
    expect(pickActiveDot(rows, 100)).toBe('c')
  })
})

describe('readingLineOffset', () => {
  it('uses 35% of the scrollport height', () => {
    expect(readingLineOffset(1000)).toBe(350)
  })

  it('clamps to a 48px minimum on short viewports', () => {
    expect(readingLineOffset(100)).toBe(48)
    expect(readingLineOffset(0)).toBe(48)
  })
})
