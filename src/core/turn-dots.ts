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

/**
 * Fold the projection's question list into one dot per turn. Entries arrive
 * in event order; consecutive same-turn entries merge into a single dot whose
 * anchor is the turn's first question.
 */
export function groupQuestionsByTurn(entries: readonly QuestionEntry[]): TurnDot[] {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq)
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
 */
export function mergeLiveQuestions(
  dots: readonly TurnDot[],
  live: readonly QuestionNode[],
): TurnDot[] {
  const known = new Set(dots.flatMap(dot => dot.memberKeys))
  const extras: TurnDot[] = live
    .filter(question => !known.has(question.key))
    .map(question => ({
      turn: null,
      key: question.key,
      anchorSeq: question.anchorSeq,
      time: question.time,
      texts: [question.text],
      memberKeys: [question.key],
    }))
  if (extras.length === 0) return [...dots]
  return [...dots, ...extras].sort((a, b) => a.anchorSeq - b.anchorSeq)
}
