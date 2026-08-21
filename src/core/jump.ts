/**
 * Jump-to-question orchestration. Pure-ish: takes injected ports (snapshot
 * read, loadOlder, DOM row lookup, view liveness, scroll, timers) so the
 * paging/timeout/fallback loop is unit-testable without a real browser or
 * session. The browser half wires these ports to ctx.sessions + the DOM.
 */

import { nearestRenderable } from './nodes.ts'

/** The bits of a session snapshot the jump loop needs. */
export interface JumpSnapshot {
  openState: string
  hasMore: boolean
  loadingOlder: boolean
  /** Renderable chat rows as a key->renderable map (or iterable of rows). */
  rows: Iterable<{ key: string; anchorSeq: number; visibility?: string }>
}

export interface JumpPorts {
  /** Read the current snapshot; undefined when the session/view is unavailable. */
  snapshot: () => JumpSnapshot | undefined
  /** Expand the window backwards; rejects/throws on failure. */
  loadOlder: () => Promise<void>
  /** True while the chat view is active (a `[data-chat-flow]` is mounted). */
  isViewActive: () => boolean
  /** Find the DOM row for a chat anchor key; null when not rendered. */
  findRow: (key: string) => HTMLElement | null
  /** Scroll a row into view at the top. */
  scrollIntoView: (row: HTMLElement) => void
  /** Monotonic ms clock. */
  now: () => number
  /** Async sleep. */
  sleep: (ms: number) => Promise<void>
  /** Report a terminal failure to the caller (for a hint). */
  report?: (code: JumpFailureCode, fallback?: boolean) => void
}

export type JumpFailureCode = 'VIEW_INACTIVE' | 'TARGET_HIDDEN' | 'NOT_FOUND' | 'TIMEOUT'

export interface JumpResult {
  ok: boolean
  code?: JumpFailureCode
  /** True when we landed on a fallback row rather than the exact target. */
  fallback?: boolean
}

export interface JumpOptions {
  /** Total wall-clock budget for loadOlder paging. */
  totalTimeoutMs?: number
  /** Max loadOlder pages before giving up. */
  maxPages?: number
  /** Poll interval for the row to render after it is known to be in the window. */
  rowWaitMs?: number
  /** Poll interval for state transitions (loadingOlder / openState). */
  pollMs?: number
}

const DEFAULTS = {
  totalTimeoutMs: 15_000,
  maxPages: 100,
  rowWaitMs: 8_000,
  pollMs: 60,
}

function minAnchorSeq(rows: Iterable<{ anchorSeq: number }>): number | null {
  let min: number | null = null
  for (const row of rows) {
    if (min === null || row.anchorSeq < min) min = row.anchorSeq
  }
  return min
}

function renderable(rows: Iterable<{ key: string; anchorSeq: number; visibility?: string }>): { key: string; anchorSeq: number }[] {
  const out: { key: string; anchorSeq: number }[] = []
  for (const row of rows) {
    if (row.visibility === 'hidden') continue
    out.push({ key: row.key, anchorSeq: row.anchorSeq })
  }
  return out
}

/**
 * Jump to the row for `key`, paging older content until it is rendered (or the
 * budget is exhausted). Falls back to the nearest renderable row when the
 * exact row is hidden/absent.
 */
export async function jumpToQuestion(ports: JumpPorts, key: string, options: JumpOptions = {}): Promise<JumpResult> {
  const cfg = { ...DEFAULTS, ...options }
  const fail = (code: JumpFailureCode, fallback = false): JumpResult => {
    ports.report?.(code, fallback)
    return fallback ? { ok: false, code, fallback: true } : { ok: false, code }
  }

  if (!ports.isViewActive()) return fail('VIEW_INACTIVE')

  const deadline = ports.now() + cfg.totalTimeoutMs
  let pages = 0

  // Phase 1: page older until the key appears in the loaded window.
  while (true) {
    const snap = ports.snapshot()
    if (snap === undefined) return fail('VIEW_INACTIVE')
    const rows = renderable(snap.rows)
    if (rows.some((r) => r.key === key)) break
    if (snap.openState !== 'open') {
      if (snap.openState === 'error' || ports.now() > deadline) {
        return fail(snap.openState === 'error' ? 'VIEW_INACTIVE' : 'TIMEOUT')
      }
      await ports.sleep(cfg.pollMs)
      continue
    }
    if (snap.hasMore !== true) return fail('NOT_FOUND')
    if (pages >= cfg.maxPages || ports.now() > deadline) return fail('TIMEOUT')
    if (snap.loadingOlder) {
      await ports.sleep(cfg.pollMs)
      continue
    }
    const before = minAnchorSeq(rows)
    await ports.loadOlder()
    pages += 1
    const afterSnap = ports.snapshot()
    const after = minAnchorSeq(afterSnap === undefined ? [] : afterSnap.rows)
    if (after === null || (before !== null && after >= before)) return fail('NOT_FOUND')
  }

  // Phase 2: wait for the row to render, then scroll. Fall back if hidden.
  const waitedFor = async (rowKey: string): Promise<HTMLElement | null> => {
    for (let waited = 0; waited <= cfg.rowWaitMs; waited += cfg.pollMs) {
      if (!ports.isViewActive()) return null
      const row = ports.findRow(rowKey)
      if (row !== null) return row
      await ports.sleep(cfg.pollMs)
    }
    return null
  }

  const row = await waitedFor(key)
  if (row !== null) {
    ports.scrollIntoView(row)
    return { ok: true }
  }

  const snap = ports.snapshot()
  const fallback = nearestRenderable(snap === undefined ? [] : snap.rows, key)
  if (fallback !== null) {
    const fbRow = await waitedFor(fallback.key)
    if (fbRow !== null) {
      ports.scrollIntoView(fbRow)
      return fail('TARGET_HIDDEN', true)
    }
  }
  return fail('TARGET_HIDDEN', false)
}
