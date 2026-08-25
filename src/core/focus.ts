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

/** Height (px) of the dot band's top/bottom fade zones, which double as hover
 *  auto-scroll areas (slightly larger than the 22px CSS mask fade). */
export const EDGE_SCROLL_ZONE = 26

/** Clearance (px) kept around the focused dot when scrolling it into view, so
 *  its two magnified neighbors on each side stay inside the band's clear area
 *  (2 dot rows ≈ 28px + the 22px fade zone). */
export const FOCUS_NEIGHBOR_CLEARANCE = 50

/**
 * Minimal "scroll into view" for the focused dot, in the spirit of
 * scrollIntoView({ block: 'nearest' }): returns the scrollTop that brings the
 * dot — plus `clearance` room for its magnified neighbors — inside the
 * visible band with the smallest possible movement, or null when the dot is
 * already fully visible. Unlike unconditional centering this never shifts the
 * band while the user browses dot-by-dot: only a clipped dot is scrolled.
 */
export function minimalScrollIntoView(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  dotTop: number,
  dotHeight: number,
  clearance: number = FOCUS_NEIGHBOR_CLEARANCE,
): number | null {
  const margin = Math.min(clearance, clientHeight / 4)
  const viewTop = scrollTop + margin
  const viewBottom = scrollTop + clientHeight - margin
  if (dotTop >= viewTop && dotTop + dotHeight <= viewBottom) return null
  const next = dotTop < viewTop
    ? dotTop - margin
    : dotTop + dotHeight + margin - clientHeight
  return Math.max(0, Math.min(next, Math.max(0, scrollHeight - clientHeight)))
}

/** Hover-intent dwell (ms): the pointer must rest inside a fade zone this
 *  long before auto-scroll starts, so sweeping up/down the dots one by one
 *  (or just passing through the zone) never triggers an unwanted scroll. */
export const EDGE_SCROLL_DWELL_MS = 200

/** Edge auto-scroll speed range (px/s): MIN at the zone boundary, MAX at the
 *  very edge of the band. */
export const EDGE_SCROLL_MIN_SPEED = 90
export const EDGE_SCROLL_MAX_SPEED = 420

/**
 * Auto-scroll speed (px/s) for a pointer at `ratio` depth into an edge fade
 * zone (0 = at the zone boundary, 1 = at the band's very edge): eases
 * linearly from MIN to MAX so a shallow probe scrolls gently and pushing
 * into the edge moves fast. The sign (direction) is applied by the caller.
 */
export function edgeScrollSpeed(ratio: number): number {
  const r = Math.max(0, Math.min(1, ratio))
  return EDGE_SCROLL_MIN_SPEED + (EDGE_SCROLL_MAX_SPEED - EDGE_SCROLL_MIN_SPEED) * r
}
