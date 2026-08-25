/**
 * Focus-magnification model for the question-nav rail. Pure index/scale math
 * for the hover-selected dot's neighborhood window, its progressive
 * magnification tiers, and the decorative stack fanning out under the
 * selected question card. No React, no DOM — every function here is
 * unit-testable in isolation and safe to inline into the client bundle.
 *
 * @module dsh-question-nav/focus
 */

/** How many dots stay enlarged on each side of the selected dot. */
export const FOCUS_RADIUS = 2

/** Magnification scale per tier, by distance from the selected dot
 * (0 = selected, 1 = immediate neighbor, 2 = outer window edge). */
export const FOCUS_SCALES = [2.0, 1.55, 1.25] as const

/** Number of decorative stack cards peeking under the selected card. */
export const STACK_LAYER_COUNT = 2

/**
 * The focus tier of a dot at `distance` from the selected dot: 0..FOCUS_RADIUS
 * while inside the magnification window, null beyond it (base scale).
 */
export function focusTier(distance: number): number | null {
  const d = Math.abs(distance)
  if (d > FOCUS_RADIUS) return null
  return d
}

/** Magnification scale for a dot at `distance`; 1 (base) outside the window. */
export function focusScale(distance: number): number {
  const tier = focusTier(distance)
  return tier === null ? 1 : FOCUS_SCALES[tier]
}

/**
 * Indices of the focus window: the selected dot plus `radius` on each side,
 * clipped to the dot list. Empty when the list is empty or `selected` is out
 * of range.
 */
export function magnificationWindow(total: number, selected: number, radius: number = FOCUS_RADIUS): number[] {
  if (total <= 0 || selected < 0 || selected >= total || radius < 0) return []
  const out: number[] = []
  const lo = Math.max(0, selected - radius)
  const hi = Math.min(total - 1, selected + radius)
  for (let i = lo; i <= hi; i++) out.push(i)
  return out
}

/** One decorative stack card under the selected question card. */
export interface StackLayer {
  /** Downward offset (px) from the card's bottom edge. */
  dy: number
  /** Alternating rotation (deg) for the fan effect. */
  rotate: number
  /** Slight shrink for depth. */
  scale: number
  /** Frosted blur radius (px); deeper cards blur more. */
  blur: number
  /** Fade; deeper cards dim more. */
  opacity: number
}

/**
 * The decorative stack: `count` cards fanning out below the selected card,
 * each a bit lower, more rotated, smaller, blurrier and dimmer — a shallow
 * deck peeking out from under the focused card.
 */
export function stackLayers(count: number = STACK_LAYER_COUNT): readonly StackLayer[] {
  const layers: StackLayer[] = []
  for (let i = 0; i < count; i++) {
    const k = i + 1
    layers.push({
      dy: k * 8,
      rotate: (i % 2 === 0 ? 1 : -1) * (1.5 + i * 1.5),
      scale: 1 - k * 0.04,
      blur: k * 1.5,
      opacity: Math.max(0.35, 0.85 - k * 0.2),
    })
  }
  return layers
}
