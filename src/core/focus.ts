/**
 * Focus-magnification model for the question-nav rail. Pure index/scale math
 * for the hover-selected dot's neighborhood window, its progressive
 * magnification tiers, and the vertical cascade of question cards (one per
 * window dot, non-overlapping, sizes descending away from the selected one).
 * No React, no DOM — every function here is unit-testable in isolation and
 * safe to inline into the client bundle.
 *
 * @module dsh-question-nav/focus
 */

/** How many dots stay enlarged on each side of the selected dot. */
export const FOCUS_RADIUS = 2

/** Magnification scale per tier, by distance from the selected dot
 * (0 = selected, 1 = immediate neighbor, 2 = outer window edge). */
export const FOCUS_SCALES = [2.0, 1.55, 1.25] as const

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

/** Presentation metrics for the question card of a dot at `distance` from the
 *  selected one. The hierarchy is two-tier: the selected card is the focus
 *  (widest, full text, brand accent — styled via the selected CSS class), the
 *  four neighbors are context cards (same clean surface, narrower, clamped to
 *  fewer lines). Cards are never dimmed or blurred: context must stay crisp
 *  and readable so it can be recognized — and clicked. Null outside the
 *  window (no card). */
export interface FocusCardMetrics {
  /** Card width in px (narrows away from the selected card). */
  widthPx: number
  /** Text font size (px); cascade cards are slightly smaller. */
  fontSize: number
  /** Max text lines before clamping (cascade cards). */
  maxLines: number
}

export function focusCardMetrics(distance: number): FocusCardMetrics | null {
  const tier = focusTier(distance)
  if (tier === null) return null
  switch (tier) {
    case 0:
      return { widthPx: 380, fontSize: 13, maxLines: 6 }
    case 1:
      return { widthPx: 300, fontSize: 12.5, maxLines: 2 }
    default:
      return { widthPx: 240, fontSize: 12, maxLines: 1 }
  }
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

/**
 * Paging model for the dot band. Overflowing dots are not auto-scrolled by
 * hovering the edges or hovering a clipped dot: instead the user pages them
 * with two triangle buttons (▲ above the dot queue, ▼ below it), each click
 * revealing `DOT_PAGE_ROWS` hidden dots. Pure arithmetic — no React, no DOM.
 */

/** How many hidden dots one click of a paging triangle reveals. */
export const DOT_PAGE_ROWS = 5

/** Base dot diameter (px) and gap (px), matching the rail CSS — the paging
 *  step is expressed in whole dot rows, so it tracks the visible geometry. */
export const DOT_SIZE = 8
export const DOT_GAP = 6

/** Scroll step (px) for one paging click: `rows` whole dot rows. */
export function pageStep(dotSize: number = DOT_SIZE, gap: number = DOT_GAP, rows: number = DOT_PAGE_ROWS): number {
  return rows * (dotSize + gap)
}

/** Clamp a target scrollTop into the band's valid range (0..maxScroll). */
export function clampScrollTop(target: number, maxScroll: number): number {
  return Math.max(0, Math.min(target, Math.max(0, maxScroll)))
}

/** Whether hidden dots remain above the band (show ▲). */
export function canScrollAbove(scrollTop: number): boolean {
  return scrollTop > 0
}

/** Whether hidden dots remain below the band (show ▼). */
export function canScrollBelow(scrollTop: number, maxScroll: number): boolean {
  return scrollTop < maxScroll
}
