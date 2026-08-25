/**
 * Unit tests for the focus-magnification model: window indices (clipped to
 * the dot list), progressive scale tiers, and the cascade card metrics
 * (widths/fonts descending away from the selected card).
 */
import { describe, expect, it } from 'vitest'
import {
  EDGE_SCROLL_MAX_SPEED, EDGE_SCROLL_MIN_SPEED,
  FOCUS_RADIUS, FOCUS_SCALES,
  edgeScrollSpeed, focusCardMetrics, focusScale, focusTier, magnificationWindow,
} from '../src/core/focus.ts'

describe('focusTier', () => {
  it('maps distance 0..FOCUS_RADIUS to tiers and beyond to null', () => {
    expect(focusTier(0)).toBe(0)
    expect(focusTier(1)).toBe(1)
    expect(focusTier(FOCUS_RADIUS)).toBe(FOCUS_RADIUS)
    expect(focusTier(FOCUS_RADIUS + 1)).toBeNull()
    expect(focusTier(10)).toBeNull()
  })
  it('is symmetric in sign', () => {
    expect(focusTier(-1)).toBe(1)
    expect(focusTier(-(FOCUS_RADIUS + 1))).toBeNull()
  })
})

describe('focusScale', () => {
  it('is largest on the selected dot and smaller on neighbors', () => {
    expect(focusScale(0)).toBe(FOCUS_SCALES[0])
    expect(focusScale(1)).toBe(FOCUS_SCALES[1])
    expect(focusScale(FOCUS_RADIUS)).toBe(FOCUS_SCALES[FOCUS_RADIUS])
    expect(FOCUS_SCALES[0]).toBeGreaterThan(FOCUS_SCALES[1])
    expect(FOCUS_SCALES[1]).toBeGreaterThan(FOCUS_SCALES[FOCUS_RADIUS])
  })
  it('is base (1) outside the window', () => {
    expect(focusScale(FOCUS_RADIUS + 1)).toBe(1)
    expect(focusScale(100)).toBe(1)
  })
})

describe('magnificationWindow', () => {
  it('returns the full list when it fits inside the window', () => {
    expect(magnificationWindow(3, 1)).toEqual([0, 1, 2])
  })
  it('clips at the start', () => {
    expect(magnificationWindow(10, 0)).toEqual([0, 1, 2])
  })
  it('clips at the end', () => {
    expect(magnificationWindow(10, 9)).toEqual([7, 8, 9])
  })
  it('centers the window on a middle dot', () => {
    expect(magnificationWindow(10, 5)).toEqual([3, 4, 5, 6, 7])
  })
  it('handles a single-dot list', () => {
    expect(magnificationWindow(1, 0)).toEqual([0])
  })
  it('returns an empty window for empty or out-of-range lists', () => {
    expect(magnificationWindow(0, 0)).toEqual([])
    expect(magnificationWindow(5, -1)).toEqual([])
    expect(magnificationWindow(5, 5)).toEqual([])
  })
})

describe('focusCardMetrics', () => {
  it('renders the selected card widest and with every text line', () => {
    expect(focusCardMetrics(0)).toEqual({ widthPx: 380, fontSize: 13, maxLines: 6 })
  })
  it('narrows and clamps fewer lines with distance', () => {
    const one = focusCardMetrics(1)!
    const two = focusCardMetrics(2)!
    expect(one.widthPx).toBeGreaterThan(two.widthPx)
    expect(one.fontSize).toBeGreaterThan(two.fontSize)
    expect(one.maxLines).toBeGreaterThan(two.maxLines)
  })
  it('never dims cards: no brightness in the metrics', () => {
    for (const distance of [0, 1, 2]) {
      expect(focusCardMetrics(distance)).not.toHaveProperty('brightness')
    }
  })
  it('is null outside the window', () => {
    expect(focusCardMetrics(FOCUS_RADIUS + 1)).toBeNull()
  })
})

describe('edgeScrollSpeed', () => {
  it('eases from MIN at the zone boundary to MAX at the very edge', () => {
    expect(edgeScrollSpeed(0)).toBe(EDGE_SCROLL_MIN_SPEED)
    expect(edgeScrollSpeed(1)).toBe(EDGE_SCROLL_MAX_SPEED)
    expect(edgeScrollSpeed(0.5)).toBeCloseTo((EDGE_SCROLL_MIN_SPEED + EDGE_SCROLL_MAX_SPEED) / 2)
  })
  it('clamps out-of-range ratios', () => {
    expect(edgeScrollSpeed(-0.5)).toBe(EDGE_SCROLL_MIN_SPEED)
    expect(edgeScrollSpeed(2)).toBe(EDGE_SCROLL_MAX_SPEED)
  })
  it('increases monotonically with depth', () => {
    expect(edgeScrollSpeed(0.8)).toBeGreaterThan(edgeScrollSpeed(0.2))
  })
})
