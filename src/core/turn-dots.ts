/**
 * Turn-aligned dot model for the question-nav strip. Pure transforms over the
 * `questionIndex` projection value plus the live chat window — no React, no
 * DOM — so the grouping and merging rules are unit-testable in isolation.
 *
 * One dot per turn that claimed at least one user question; turns without a
 * question (retry, goal continuation, cancelled empty turns) produce no dot,
 * so dot turn labels may skip numbers but always match the Trajectory view.
 */

import type { QuestionEntry } from './question-entry.ts'
import type { QuestionNode } from './nodes.ts'

/** The conversation Definition kind whose key a user question node uses. */
export const MESSAGE_DEFINITION_KIND = 'input-message'

/**
 * The engine-owned stable chat key for a user question — mirrors
 * `conversationContextKey('input-message', String(id))` from the DSH runtime
 * (verified against that formula in the unit test).
 */
export function questionKey(id: unknown): string {
  const kind = MESSAGE_DEFINITION_KIND
  return `${kind.length}:${kind}${String(id)}`
}

/** One strip dot: a turn's questions (grouped) or one ungrouped live question. */
export interface TurnDot {
  /** Owning turn number; null for live questions the projection has not seen. */
  readonly turn: number | null
  /** Jump anchor: the chat key of the turn's FIRST question. */
  readonly key: string
  /** Anchor seq of the first question (ordering + jump target). */
  readonly anchorSeq: number
  /** Unix ms of the first question. */
  readonly time: number
  /** Every question text of this dot, in order (tooltip lists them all). */
  readonly texts: readonly string[]
  /** Chat keys of every question folded into this dot (live-merge dedupe). */
  readonly memberKeys: readonly string[]
}

/** True when entries are already in non-decreasing seq order (the projection
 * appends in event order, so this is the common case and skips the sort). */
function isSortedBySeq(entries: readonly QuestionEntry[]): boolean {
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].seq < entries[i - 1].seq) return false
  }
  return true
}

/**
 * Fold the projection's question list into one dot per turn. Entries arrive
 * in event order; consecutive same-turn entries merge into a single dot whose
 * anchor is the turn's first question. The input is expected to be sorted by
 * seq; the defensive sort is skipped when it already is, so a long session
 * never pays an O(n log n) sort on every content update.
 */
export function groupQuestionsByTurn(entries: readonly QuestionEntry[]): TurnDot[] {
  const sorted = isSortedBySeq(entries) ? entries : [...entries].sort((a, b) => a.seq - b.seq)
  const dots: TurnDot[] = []
  for (const entry of sorted) {
    const key = questionKey(entry.id)
    const last = dots.at(-1)
    if (last !== undefined && last.turn === entry.turn) {
      dots[dots.length - 1] = {
        ...last,
        texts: [...last.texts, entry.text],
        memberKeys: [...last.memberKeys, key],
      }
      continue
    }
    dots.push({
      turn: entry.turn,
      key,
      anchorSeq: entry.seq,
      time: entry.time,
      texts: [entry.text],
      memberKeys: [key],
    })
  }
  return dots
}

/**
 * Merge live-window questions the projection has not recorded yet (the brief
 * window before the session/projection push frame lands). A live question
 * whose key is already folded into a dot is dropped (the projected copy
 * wins); the rest become single-question dots with `turn: null`, inserted in
 * anchor-seq order so the strip stays strictly chronological.
 *
 * Fast path: when nothing new arrives the SAME array is returned (no copy),
 * so the caller can bail out of a re-render on identical reference.
 */
export function mergeLiveQuestions(
  dots: readonly TurnDot[],
  live: readonly QuestionNode[],
): TurnDot[] {
  if (live.length === 0) return dots as TurnDot[]
  const known = new Set<string>()
  for (const dot of dots) {
    for (const key of dot.memberKeys) known.add(key)
  }
  const extras: TurnDot[] = []
  for (const question of live) {
    if (known.has(question.key)) continue
    extras.push({
      turn: null,
      key: question.key,
      anchorSeq: question.anchorSeq,
      time: question.time,
      texts: [question.text],
      memberKeys: [question.key],
    })
  }
  // Nothing new from the live window — reuse the input array unchanged.
  if (extras.length === 0) return dots as TurnDot[]
  // Both `dots` and `extras` are sorted by anchorSeq (dots from the projection
  // order, extras from the live window order): merge linearly instead of
  // re-sorting the whole list. Ties keep the projected dot first (stable
  // sort semantics), matching the previous [...dots, ...extras].sort().
  const out: TurnDot[] = []
  let i = 0
  for (const extra of extras) {
    while (i < dots.length && dots[i].anchorSeq <= extra.anchorSeq) {
      out.push(dots[i])
      i += 1
    }
    out.push(extra)
  }
  while (i < dots.length) {
    out.push(dots[i])
    i += 1
  }
  return out
}
