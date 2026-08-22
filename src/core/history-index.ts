/**
 * Question-index builder over the raw session history RPC.
 *
 * DSH pages the rendered conversation window on purpose (memory economy):
 * `chat.nodes` only ever holds the loaded window, and force-expanding it
 * (repeated `loadOlder()`) materializes + renders the whole log — the exact
 * cost DSH's paging exists to avoid. This module instead builds a lightweight
 * index of every user question by paging the RAW history RPC (`session.history`
 * with `beforeSeq`), which reads the host log without touching the render
 * window at all. Only `{key, seq, time, text}` per question is retained.
 *
 * The chat anchor key is derived deterministically from the event — it equals
 * `conversationContextKey('input-message', String(event.data.id))` — so the
 * dots can target rows that are not loaded yet, and a click then pages the
 * window on demand (see `jump.ts`).
 *
 * Pure-ish: takes injected ports (one raw history page read, clocks) so it is
 * unit-testable without a browser or a live session.
 */

import type { QuestionNode } from './nodes.ts'
import { messageText } from './nodes.ts'

/** Minimal shape of a raw history event (structural, not SDK-bound). */
export interface RawEventLike {
  type: string
  seq: number
  time: number
  surfaceOp?: unknown
  data?: {
    id?: unknown
    source?: { kind?: string; plugin?: string }
    content?: readonly { type?: string; text?: string }[]
  }
}

/** The conversation Definition kind whose key a user question node uses. */
export const MESSAGE_DEFINITION_KIND = 'input-message'

/**
 * The engine-owned stable chat key for a user question event — mirrors
 * `conversationContextKey('input-message', String(id))` from the DSH runtime
 * (verified against it in the unit test).
 */
export function questionKey(id: unknown): string {
  const kind = MESSAGE_DEFINITION_KIND
  return `${kind.length}:${kind}${String(id)}`
}

/**
 * Whether a raw event is one user question the strip should index.
 * Mirrors the DSH `messageDefinition` match + `start` classification:
 * an append-origin `user/message` with a human (`user`) source. Replacement
 * copies (compaction checkpoints, `source.kind === 'plugin'`) and injected
 * context (`source.kind !== 'user'`) are excluded.
 */
export function isQuestionEvent(event: RawEventLike): boolean {
  if (event.type !== 'user/message') return false
  if (event.surfaceOp !== 'append') return false
  return event.data?.source?.kind === 'user'
}

/** Map one raw question event to a strip question node, or null when not one. */
export function questionFromEvent(event: RawEventLike): QuestionNode | null {
  if (!isQuestionEvent(event)) return null
  return {
    key: questionKey(event.data?.id),
    anchorSeq: event.seq,
    seq: event.seq,
    time: event.time,
    text: messageText(event.data?.content),
  }
}

export interface HistoryIndexPorts {
  /**
   * Read one raw history page. `beforeSeq` is exclusive (events with seq <
   * beforeSeq); `undefined` reads the newest page. Resolves undefined when
   * the page is unavailable (session gone / transport error).
   */
  history: (
    beforeSeq: number | undefined,
    maxMessages: number,
  ) => Promise<{ events: readonly { event: RawEventLike }[]; hasMore: boolean } | undefined>
  /** Monotonic ms clock. */
  now: () => number
}

export interface HistoryIndexOptions {
  /** Raw messages per page (default 100). */
  maxMessages?: number
  /** Max pages before giving up (default 200 => 20k messages). */
  maxPages?: number
  /** Total wall-clock budget (default 30s). */
  totalTimeoutMs?: number
  /** Abort the build; checked every iteration. */
  signal?: AbortSignal
  /** Resume from a previous `nextBeforeSeq` instead of the newest page. */
  startBeforeSeq?: number
}

export type HistoryIndexCode = 'COMPLETE' | 'BUDGET' | 'TIMEOUT' | 'UNAVAILABLE' | 'CANCELLED'

export interface HistoryIndexResult {
  ok: boolean
  code: HistoryIndexCode
  /** Questions collected so far, ascending by anchorSeq. */
  questions: QuestionNode[]
  /** Page count actually read. */
  pages: number
  /** Where to continue (exclusive) when stopped early; undefined when COMPLETE. */
  nextBeforeSeq: number | undefined
}

const DEFAULTS = {
  maxMessages: 100,
  maxPages: 200,
  totalTimeoutMs: 30_000,
}

function minSeq(events: readonly { event: RawEventLike }[]): number | undefined {
  let min: number | undefined
  for (const { event } of events) {
    if (min === undefined || event.seq < min) min = event.seq
  }
  return min
}

/**
 * Page the raw session history backward, collecting every user question into a
 * lightweight index. Never touches the render window.
 */
export async function buildQuestionIndex(
  ports: HistoryIndexPorts,
  options: HistoryIndexOptions = {},
): Promise<HistoryIndexResult> {
  const cfg = { ...DEFAULTS, ...options }
  const deadline = ports.now() + cfg.totalTimeoutMs
  const questions: QuestionNode[] = []
  let beforeSeq: number | undefined = cfg.startBeforeSeq
  let pages = 0

  const cancelled = (): boolean => cfg.signal?.aborted === true

  while (true) {
    if (cancelled()) return { ok: false, code: 'CANCELLED', questions, pages, nextBeforeSeq: beforeSeq }
    if (ports.now() > deadline) return { ok: false, code: 'TIMEOUT', questions, pages, nextBeforeSeq: beforeSeq }
    if (pages >= cfg.maxPages) return { ok: false, code: 'BUDGET', questions, pages, nextBeforeSeq: beforeSeq }

    const page = await ports.history(beforeSeq, cfg.maxMessages)
    if (page === undefined) {
      // Transient: retry a little, then give up with what we have.
      if (pages === 0) return { ok: false, code: 'UNAVAILABLE', questions, pages, nextBeforeSeq: beforeSeq }
      return { ok: true, code: 'COMPLETE', questions, pages, nextBeforeSeq: undefined }
    }

    for (const { event } of page.events) {
      const question = questionFromEvent(event)
      if (question !== null) questions.push(question)
    }

    if (!page.hasMore) {
      questions.sort((a, b) => a.anchorSeq - b.anchorSeq)
      return { ok: true, code: 'COMPLETE', questions, pages, nextBeforeSeq: undefined }
    }

    const next = minSeq(page.events)
    if (next === undefined) {
      // Empty page with hasMore true is anomalous; stop cleanly.
      questions.sort((a, b) => a.anchorSeq - b.anchorSeq)
      return { ok: true, code: 'COMPLETE', questions, pages, nextBeforeSeq: undefined }
    }
    beforeSeq = next
    pages += 1
  }
}
