/**
 * Unit tests for the turn-aligned dot model: questionKey derivation, one dot
 * per turn (multi-question turns fold), chronological ordering, and the
 * live-window merge for questions the projection has not recorded yet.
 */
import { describe, expect, it } from 'vitest'
import type { QuestionEntry } from '../src/core/question-entry.ts'
import type { QuestionNode } from '../src/core/nodes.ts'
import {
  groupQuestionsByTurn,
  mergeLiveQuestions,
  questionKey,
} from '../src/core/turn-dots.ts'

function entry(turn: number, id: string, seq: number, text = `q-${id}`): QuestionEntry {
  return { turn, id, seq, time: seq * 10, text }
}

function live(key: string, anchorSeq: number, text = 'live'): QuestionNode {
  return { key, anchorSeq, seq: anchorSeq, time: anchorSeq * 10, text }
}

describe('questionKey', () => {
  it('mirrors conversationContextKey("input-message", id)', () => {
    // conversationContextKey(kind, id) = `${kind.length}:${kind}${id}`
    expect(questionKey('msg-1')).toBe('13:input-messagemsg-1')
  })
})

describe('groupQuestionsByTurn', () => {
  it('maps each turn to one dot anchored at its first question', () => {
    const dots = groupQuestionsByTurn([entry(1, 'a', 7), entry(2, 'b', 25)])
    expect(dots).toHaveLength(2)
    expect(dots[0]).toMatchObject({
      turn: 1, key: '13:input-messagea', anchorSeq: 7, texts: ['q-a'],
    })
    expect(dots[1]).toMatchObject({ turn: 2, key: '13:input-messageb', anchorSeq: 25 })
  })

  it('folds multiple questions of one turn into a single dot', () => {
    const dots = groupQuestionsByTurn([entry(3, 'a', 11), entry(3, 'b', 12)])
    expect(dots).toHaveLength(1)
    expect(dots[0]?.texts).toEqual(['q-a', 'q-b'])
    expect(dots[0]?.memberKeys).toEqual(['13:input-messagea', '13:input-messageb'])
    expect(dots[0]?.key).toBe('13:input-messagea')
  })

  it('keeps skipped turn numbers (retry/goal turns produce no dot)', () => {
    const dots = groupQuestionsByTurn([entry(1, 'a', 7), entry(3, 'c', 40)])
    expect(dots.map(d => d.turn)).toEqual([1, 3])
  })

  it('sorts defensively by seq even when entries arrive unordered', () => {
    const dots = groupQuestionsByTurn([entry(2, 'b', 25), entry(1, 'a', 7)])
    expect(dots.map(d => d.turn)).toEqual([1, 2])
  })

  it('returns an empty list for an empty projection', () => {
    expect(groupQuestionsByTurn([])).toEqual([])
  })
})

describe('mergeLiveQuestions', () => {
  it('appends unknown live questions as turn-less dots in seq order', () => {
    const dots = groupQuestionsByTurn([entry(1, 'a', 7)])
    const merged = mergeLiveQuestions(dots, [live('13:input-messagenew', 50, 'fresh')])
    expect(merged).toHaveLength(2)
    expect(merged[1]).toMatchObject({ turn: null, key: '13:input-messagenew', texts: ['fresh'] })
  })

  it('drops live questions already folded into a dot', () => {
    const dots = groupQuestionsByTurn([entry(1, 'a', 7)])
    const merged = mergeLiveQuestions(dots, [live('13:input-messagea', 7)])
    expect(merged).toHaveLength(1)
  })

  it('inserts extras chronologically, not just at the tail', () => {
    const dots = groupQuestionsByTurn([entry(1, 'a', 7), entry(2, 'b', 30)])
    const merged = mergeLiveQuestions(dots, [live('13:input-messagemid', 20)])
    expect(merged.map(d => d.anchorSeq)).toEqual([7, 20, 30])
  })

  it('returns just the dots when nothing is new', () => {
    const dots = groupQuestionsByTurn([entry(1, 'a', 7)])
    expect(mergeLiveQuestions(dots, [])).toEqual(dots)
  })

  it('fast path returns the very same array when live is empty (bail-out ref)', () => {
    const dots = groupQuestionsByTurn([entry(1, 'a', 7)])
    expect(mergeLiveQuestions(dots, [])).toBe(dots)
  })

  it('fast path returns the very same array when every live question is known', () => {
    const dots = groupQuestionsByTurn([entry(1, 'a', 7)])
    expect(mergeLiveQuestions(dots, [live('13:input-messagea', 7)])).toBe(dots)
  })

  it('merges ties with the projected dot first (stable sort semantics)', () => {
    const dots = groupQuestionsByTurn([entry(1, 'a', 7), entry(2, 'b', 30)])
    const merged = mergeLiveQuestions(dots, [live('13:input-messagemid', 30)])
    expect(merged.map(d => d.key)).toEqual(['13:input-messagea', '13:input-messageb', '13:input-messagemid'])
  })

  it('does not mutate the input dots when merging', () => {
    const dots = groupQuestionsByTurn([entry(1, 'a', 7)])
    const snapshot = JSON.stringify(dots)
    mergeLiveQuestions(dots, [live('13:input-messagenew', 50)])
    expect(JSON.stringify(dots)).toBe(snapshot)
  })
})
