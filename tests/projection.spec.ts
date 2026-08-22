/**
 * Unit tests for the `questionIndex` projection fold: turn attribution,
 * question filtering (append-origin user-source only), the same-reference
 * gate, and the wire view. Events are plain fixtures cast to SessionEvent —
 * the fold never sees transport or storage.
 */
import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  questionIndexProjectionDefinition as unit,
  type QuestionIndexState,
} from '../src/projection.ts'

function turnStart(turn: number, seq: number): SessionEvent {
  return { type: 'turn/start', seq, time: seq * 10, data: { turn } } as SessionEvent
}

function question(seq: number, id: string, text: string, over: {
  surfaceOp?: string
  sourceKind?: string
} = {}): SessionEvent {
  return {
    type: 'user/message',
    seq,
    time: seq * 10,
    surfaceOp: over.surfaceOp ?? 'append',
    data: {
      id,
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: over.sourceKind ?? 'user' },
    },
  } as unknown as SessionEvent
}

function fold(events: readonly SessionEvent[]): QuestionIndexState {
  let state: QuestionIndexState = unit.init()
  for (const event of events) state = unit.apply(state, event)
  return state
}

describe('questionIndex projection fold', () => {
  it('init produces an empty index at turn 0', () => {
    expect(unit.init()).toEqual({ turn: 0, questions: [] })
  })

  it('records an append-origin user question with its turn', () => {
    const state = fold([turnStart(1, 4), question(7, 'msg-1', 'hello')])
    expect(state.questions).toEqual([
      { turn: 1, id: 'msg-1', seq: 7, time: 70, text: 'hello' },
    ])
  })

  it('attributes each question to the turn that claimed it', () => {
    const state = fold([
      turnStart(1, 4), question(7, 'a', 'first'),
      turnStart(2, 20), question(25, 'b', 'second'),
    ])
    expect(state.questions.map(q => [q.turn, q.id])).toEqual([[1, 'a'], [2, 'b']])
  })

  it('keeps multiple questions of one turn in event order', () => {
    const state = fold([
      turnStart(3, 10), question(11, 'a', 'one'), question(12, 'b', 'two'),
    ])
    expect(state.questions.map(q => q.id)).toEqual(['a', 'b'])
    expect(state.questions.every(q => q.turn === 3)).toBe(true)
  })

  it('skips replacement copies (compaction checkpoints)', () => {
    const state = fold([
      turnStart(1, 4),
      question(7, 'a', 'real'),
      question(30, 'b', 'checkpoint', { surfaceOp: 'replace' }),
    ])
    expect(state.questions.map(q => q.id)).toEqual(['a'])
  })

  it('skips non-user sources (injected context, plugin copies)', () => {
    const state = fold([
      turnStart(1, 4),
      question(7, 'a', 'real'),
      question(8, 'b', 'injected', { sourceKind: 'agent' }),
      question(9, 'c', 'checkpoint', { sourceKind: 'plugin' }),
    ])
    expect(state.questions.map(q => q.id)).toEqual(['a'])
  })

  it('ignores non-question event types', () => {
    const state = fold([
      turnStart(1, 4),
      question(7, 'a', 'real'),
      { type: 'assistant/message', seq: 8, time: 80, data: {} } as unknown as SessionEvent,
      { type: 'step/start', seq: 9, time: 90, data: { turn: 1, step: 1 } } as SessionEvent,
    ])
    expect(state.questions).toHaveLength(1)
  })

  it('returns the same reference for irrelevant events (Object.is gate)', () => {
    const state = fold([turnStart(1, 4), question(7, 'a', 'real')])
    const next = unit.apply(state, { type: 'step/end', seq: 8, time: 80, data: { turn: 1, step: 1 } } as SessionEvent)
    expect(next).toBe(state)
  })

  it('returns the same reference for a repeated turn number', () => {
    const state = fold([turnStart(1, 4)])
    expect(unit.apply(state, turnStart(1, 9))).toBe(state)
  })

  it('returns the same reference for filtered-out messages', () => {
    const state = fold([turnStart(1, 4)])
    expect(unit.apply(state, question(7, 'x', 'cp', { surfaceOp: 'replace' }))).toBe(state)
    expect(unit.apply(state, question(8, 'y', 'ctx', { sourceKind: 'agent' }))).toBe(state)
  })

  it('records a question before any turn/start under turn 0', () => {
    const state = fold([question(1, 'early', 'pre-turn')])
    expect(state.questions[0]?.turn).toBe(0)
  })

  it('falls back to empty text when the message has no text block', () => {
    const event = {
      type: 'user/message', seq: 7, time: 70, surfaceOp: 'append',
      data: { id: 'img', role: 'user', content: [{ type: 'image' }], source: { kind: 'user' } },
    } as unknown as SessionEvent
    const state = fold([turnStart(1, 4), event])
    expect(state.questions[0]?.text).toBe('')
  })

  it('wire view exposes exactly the question list', () => {
    const state = fold([turnStart(1, 4), question(7, 'a', 'real')])
    expect(unit.wire.view(state)).toEqual(state.questions)
  })

  it('state round-trips through its schema (persisted-cache boundary)', () => {
    const state = fold([turnStart(1, 4), question(7, 'a', 'real')])
    expect(unit.stateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it('stateVersion is a non-negative integer', () => {
    expect(Number.isInteger(unit.stateVersion)).toBe(true)
    expect(unit.stateVersion).toBeGreaterThanOrEqual(0)
  })
})
