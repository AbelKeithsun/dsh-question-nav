/**
 * Scroll-spy rule for the question-nav strip: which dot marks the reader's
 * current position in the chat. Pure over pre-measured row tops (scrollport
 * coordinates), so the decision is unit-testable without a DOM — the browser
 * half only measures and feeds rows in dot order.
 */

/** One rendered dot row's position relative to the scrollport's top edge. */
export interface ActiveDotRow {
  /** Dot key (the turn's jump anchor). */
  key: string
  /** Row top minus scrollport top, in px. */
  top: number
}

/**
 * Pick the dot that marks the reader's position: the LAST row (in dot order)
 * whose top sits at or above the reading line — the turn the reader has
 * reached. When the line sits above every rendered row (reading the intro
 * before the first question), the FIRST row marks the upcoming turn instead,
 * so the marker is always present while questions are on screen. Returns null
 * when no dot row is rendered (trajectory view, or a window that has not
 * mounted any question yet).
 *
 * Rows are expected in dot order; tops are not re-sorted — the scan keeps the
 * last qualifying entry, so one stale out-of-order measurement never moves
 * the marker backwards past a later row.
 */
export function pickActiveDot(rows: readonly ActiveDotRow[], readingLine: number): string | null {
  if (rows.length === 0) return null
  let active: string | null = null
  for (const row of rows) {
    if (row.top <= readingLine) active = row.key
  }
  return active ?? rows[0].key
}

/**
 * Reading-line offset from the scrollport top: 35% of the visible height,
 * clamped to at least 48px so short viewports keep a usable top margin. The
 * marker tracks the turn at this line rather than the exact top edge, which
 * reads as "the question I am looking at" instead of "the question that just
 * left the screen".
 */
export function readingLineOffset(scrollportHeight: number): number {
  return Math.max(48, scrollportHeight * 0.35)
}
