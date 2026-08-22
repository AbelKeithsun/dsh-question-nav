import { describe, expect, it } from 'vitest'
import { extractQuestions, mergeQuestions, messageText, nearestRenderable } from '../src/core/nodes.ts'

describe('messageText', () => {
  it('returns the first text block', () => {
    expect(messageText([{ type: 'text', text: 'hello' }])).toBe('hello')
  })
  it('handles empty and missing content', () => {
    expect(messageText([])).toBe('')
    expect(messageText(undefined)).toBe('')
  })
})

describe('extractQuestions', () => {
  const base = (over: Record<string, unknown>) => ({ key: 'k', anchorSeq: 0, visibility: 'visible', kind: 'user', content: [{ type: 'text', text: 'q' }], ...over })

  it('collects user and steering nodes in anchorSeq order', () => {
    const out = extractQuestions([
      base({ key: 'b', anchorSeq: 2, kind: 'steering' }),
      base({ key: 'a', anchorSeq: 1 }),
      base({ key: 'c', anchorSeq: 3, kind: 'assistant' }),
      base({ key: 'd', anchorSeq: 4, kind: 'tool' }),
    ])
    expect(out.map((n) => n.key)).toEqual(['a', 'b'])
    expect(out[0]?.seq).toBe(-1)
  })

  it('reads seq/time from the user payload', () => {
    const out = extractQuestions([base({ key: 'a', data: { seq: 42, time: 1000, content: [{ type: 'text', text: 'q' }] } })])
    expect(out[0]?.seq).toBe(42)
    expect(out[0]?.time).toBe(1000)
  })

  it('keeps the full question text (not truncated)', () => {
    const long = 'x'.repeat(80)
    const out = extractQuestions([base({ key: 'a', data: { content: [{ type: 'text', text: long }] } })])
    expect(out[0]?.text).toBe(long)
  })
})

describe('nearestRenderable', () => {
  it('skips hidden and excluded rows, returns the smallest anchorSeq', () => {
    const rows = [
      { key: 'a', anchorSeq: 1, visibility: 'visible' },
      { key: 'b', anchorSeq: 2, visibility: 'hidden' },
      { key: 'c', anchorSeq: 3, visibility: 'visible' },
    ]
    expect(nearestRenderable(rows, 'a')?.key).toBe('c')
  })
})

describe('mergeQuestions', () => {
  it('dedupes by key and sorts ascending by anchorSeq', () => {
    const index = [
      { key: 'a', anchorSeq: 1, seq: 1, time: 0, text: 'old' },
      { key: 'b', anchorSeq: 5, seq: 5, time: 0, text: 'mid' },
    ]
    const window = [
      { key: 'a', anchorSeq: 1, seq: 1, time: 0, text: 'updated' },
      { key: 'c', anchorSeq: 9, seq: 9, time: 0, text: 'new' },
    ]
    const merged = mergeQuestions(index, window)
    expect(merged.map((q) => q.key)).toEqual(['a', 'b', 'c'])
    // Window copy wins for the duplicate key.
    expect(merged[0]?.text).toBe('updated')
  })
})
