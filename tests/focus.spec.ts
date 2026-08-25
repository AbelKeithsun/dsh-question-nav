/**
 * Unit tests for the focus-magnification model: window indices (clipped to
 * the dot list), progressive scale tiers, and the decorative stack layers.
 */
import { describe, expect, it } from 'vitest'
import {
  FOCUS_RADIUS, FOCUS_SCALES, STACK_LAYER_COUNT,
  focusScale, focusTier, magnificationWindow, stackLayers,
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

describe('stackLayers', () => {
  it('emits the default count of deepening cards', () => {
    const layers = stackLayers()
    expect(layers).toHaveLength(STACK_LAYER_COUNT)
  })
  it('spreads cards lower, thinner, more rotated, blurrier and dimmer', () => {
    const layers = stackLayers(3)
    expect(layers[1].dy).toBeGreaterThan(layers[0].dy)
    expect(layers[1].scale).toBeLessThan(layers[0].scale)
    expect(layers[1].blur).toBeGreaterThan(layers[0].blur)
    expect(layers[1].opacity).toBeLessThan(layers[0].opacity)
    // Alternating fan rotation.
    expect(Math.sign(layers[0].rotate)).toBe(1)
    expect(Math.sign(layers[1].rotate)).toBe(-1)
  })
  it('emits nothing for count 0', () => {
    expect(stackLayers(0)).toEqual([])
  })
})
