/**
 * Load-all orchestration for the question-nav strip.
 *
 * DSH sessions page history in fixed-size chunks: `chat.nodes` only ever holds
 * the currently loaded window, and questions that still sit behind the "load
 * older" button are invisible to the strip until the window is expanded
 * backwards. This loop pages `loadOlder()` until `hasMore` is false (the whole
 * history is materialized), so every user question becomes a dot.
 *
 * Pure-ish: takes injected ports (snapshot read, one paged loadOlder, view
 * liveness, clocks) so it is unit-testable without a browser or session.
 */

export interface LoadAllSnapshot {
  openState: string
  hasMore: boolean
  loadingOlder: boolean
}

export interface LoadAllPorts {
  /** Read the current session snapshot; undefined when unavailable. */
  snapshot: () => LoadAllSnapshot | undefined
  /** Expand the window backwards by one page (may preserve scroll). */
  loadOlder: () => Promise<void>
  /** True while the chat view is active (a `[data-chat-flow]` is mounted). */
  isViewActive: () => boolean
  /** Monotonic ms clock. */
  now: () => number
  /** Async sleep. */
  sleep: (ms: number) => Promise<void>
}

export interface LoadAllOptions {
  /** Max older pages to fetch before giving up (default 400). */
  maxPages?: number
  /** Total wall-clock budget for the whole expansion (default 60s). */
  totalTimeoutMs?: number
  /** Poll interval for open/loading transitions (default 60ms). */
  pollMs?: number
  /** Abort the expansion; checked every iteration. */
  signal?: AbortSignal
}

export type LoadAllCode =
  | 'COMPLETE'
  | 'VIEW_INACTIVE'
  | 'NOT_OPEN'
  | 'BUDGET'
  | 'TIMEOUT'
  | 'CANCELLED'

export interface LoadAllResult {
  ok: boolean
  code: LoadAllCode
  /** Number of `loadOlder` pages actually fetched. */
  pages: number
}

const DEFAULTS = {
  maxPages: 400,
  totalTimeoutMs: 60_000,
  pollMs: 60,
}

/**
 * Expand the session window backwards until the earliest history is loaded.
 * Waits while the session is still opening; aborts on cancellation, budget or
 * timeout. Safe to re-enter: once `hasMore` is false the loop returns
 * immediately with `COMPLETE`.
 */
export async function loadAllOlder(ports: LoadAllPorts, options: LoadAllOptions = {}): Promise<LoadAllResult> {
  const cfg = { ...DEFAULTS, ...options }
  const deadline = ports.now() + cfg.totalTimeoutMs
  let pages = 0

  const cancelled = (): boolean => cfg.signal?.aborted === true

  while (true) {
    if (cancelled()) return { ok: false, code: 'CANCELLED', pages }
    if (!ports.isViewActive()) return { ok: false, code: 'VIEW_INACTIVE', pages }
    const snap = ports.snapshot()
    if (snap === undefined) return { ok: false, code: 'VIEW_INACTIVE', pages }
    if (snap.openState === 'error') return { ok: false, code: 'NOT_OPEN', pages }
    // Nothing older left: the whole history is in the window.
    if (snap.hasMore !== true) return { ok: true, code: 'COMPLETE', pages }
    if (pages >= cfg.maxPages) return { ok: false, code: 'BUDGET', pages }
    if (ports.now() > deadline) return { ok: false, code: 'TIMEOUT', pages }
    // Wait while the session is still opening or a page is already in flight
    // (a user-initiated "load older" click shares this same gate).
    if (snap.openState !== 'open' || snap.loadingOlder) {
      await ports.sleep(cfg.pollMs)
      continue
    }
    await ports.loadOlder()
    pages += 1
  }
}
