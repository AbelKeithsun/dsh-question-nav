/**
 * The `questionIndex` session projection unit: a pure fold of the session
 * event log into the ordered list of user questions, each tagged with the
 * turn that claimed it. Registered on `ctx.sessionProjections` by the host
 * half (src/index.ts); persistence, replay, and client delivery are the
 * projection seam's (session-projection-cache checkpoints the state, the
 * api-proxy carriers seed + push the wire view).
 *
 * Fold rules mirror the chat messageDefinition classification: an
 * append-origin `user/message` with a human (`user`) source is a question;
 * replacement copies (compaction checkpoints) and injected context are not.
 * Turns come from `turn/start` boundaries, so retry/goal-continuation turns
 * without a question simply produce no entry — dots may skip turn numbers,
 * staying exactly aligned with the Trajectory view's turn labels.
 *
 * @module dsh-question-nav/projection
 */

import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { QuestionEntry } from './core/question-entry.ts'

/** Fold state: the last opened turn plus every question recorded so far. */
export interface QuestionIndexState {
  /** Turn of the last `turn/start` (0 before any; turns are 1-based). */
  turn: number
  /** Every recorded question, in event order. */
  questions: QuestionEntry[]
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    questionIndex: QuestionEntry[]
  }
  interface SessionProjectionStateMap {
    questionIndex: QuestionIndexState
  }
}

const questionEntrySchema = z.object({
  turn: z.number().int().nonnegative(),
  id: z.string(),
  seq: z.number().int().nonnegative(),
  time: z.number().nonnegative(),
  text: z.string(),
}).strict()

/** Validates persisted rows after their `ver` gate (the unit's input boundary). */
const questionIndexStateSchema = z.object({
  turn: z.number().int().nonnegative(),
  questions: z.array(questionEntrySchema),
}).strict()

/** Validates the wire payload before it leaves the host. */
const questionIndexViewSchema = z.array(questionEntrySchema)

/** First text block of a user message; empty string when absent. */
function messageText(content: readonly { type?: string; text?: string }[] | undefined): string {
  if (content === undefined || content.length === 0) return ''
  const first = content[0]
  return typeof first?.text === 'string' ? first.text : ''
}

/** The `questionIndex` unit registered on `ctx.sessionProjections`. */
export const questionIndexProjectionDefinition: Omit<ProjectionDefinition<'questionIndex', QuestionIndexState>, 'wire'> & {
  wire: NonNullable<ProjectionDefinition<'questionIndex', QuestionIndexState>['wire']>
} = {
  key: 'questionIndex',
  stateVersion: 1,
  stateSchema: questionIndexStateSchema,
  init: () => ({ turn: 0, questions: [] }),
  apply: (state, event) => {
    // Every uninteresting event returns the same reference (Object.is gates
    // the change feed and the persisted-cache dirty check).
    switch (event.type) {
      case 'turn/start':
        return event.data.turn === state.turn ? state : { ...state, turn: event.data.turn }
      case 'user/message': {
        if (event.surfaceOp !== 'append') return state
        if (event.data.source?.kind !== 'user') return state
        const entry: QuestionEntry = {
          turn: state.turn,
          id: String(event.data.id),
          seq: event.seq,
          time: event.time,
          text: messageText(event.data.content),
        }
        return { ...state, questions: [...state.questions, entry] }
      }
      default:
        return state
    }
  },
  wire: {
    viewSchema: questionIndexViewSchema,
    view: state => state.questions,
  },
}
