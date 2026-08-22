import { describe, expect, it } from 'vitest'
import {
  buildQuestionIndex, isQuestionEvent, questionFromEvent, questionKey,
  type HistoryIndexPorts, type RawEventLike,
} from '../src/core/history-index.ts'

function event(over: Partial<RawEventLike>): RawEventLike {
  return {
    type: 'user/message',
    seq: 10,
    time: 1_000,
    surfaceOp: 'append',
    ...over,
    data: { id: 'msg-1', source: { kind: 'user' }, content: [{ type: 'text', text: 'hello' }], ...over.data },
  }
}

function ports(over: Partial<HistoryIndexPorts> = {}): HistoryIndexPorts {
  return {
    history: async () => ({ events: [], hasMore: false }),
    now: () => 0,
    ...over,
  }
}

describe('questionKey', () => {
  it('mirrors conversationContextKey("input-message", id)', () => {
    // DSH runtime: conversationContextKey(kind, id) = `${kind.length}:${kind}${id}`
    const kind = 'input-message'
    const reference = (id: string): string => `${kind.length}:${kind}${id}`
    for (const id of ['abc', '42', 'user:123']) {
      expect(questionKey(id)).toBe(reference(id))
    }
    // Sanity: the exact known prefix.
    expect(questionKey('msg-1')).toBe('13:input-messagemsg-1')
  })
})

describe('isQuestionEvent', () => {
  it('accepts an append user message with a user source', () => {
    expect(isQuestionEvent(event({}))).toBe(true)
  })

  it('rejects non-user/message types', () => {
    expect(isQuestionEvent(event({ type: 'assistant/message' }))).toBe(false)
  })

  it('rejects replacement (compaction) copies', () => {
    expect(isQuestionEvent(event({
      surfaceOp: { op: 'replace', start: 1, end: 2 },
      data: { id: 'x', source: { kind: 'plugin', plugin: 'compact' } },
    }))).toBe(false)
  })

  it('rejects injected context (non-user source)', () => {
    expect(isQuestionEvent(event({ data: { id: 'x', source: { kind: 'system' } } }))).toBe(false)
  })
})

describe('questionFromEvent', () => {
  it('maps a question event to a strip node', () => {
    const node = questionFromEvent(event({}))
    expect(node).toEqual({
      key: questionKey('msg-1'),
      anchorSeq: 10,
      seq: 10,
      time: 1_000,
      text: 'hello',
    })
  })

  it('returns null for a non-question event', () => {
    expect(questionFromEvent(event({ type: 'tool/result' }))).toBeNull()
  })
})

describe('buildQuestionIndex', () => {
  it('returns COMPLETE with no questions for an empty page', async () => {
    const result = await buildQuestionIndex(ports())
    expect(result).toMatchObject({ ok: true, code: 'COMPLETE', questions: [], pages: 0 })
  })

  it('pages backward until hasMore is false, collecting questions', async () => {
    let page0 = true
    const calls: (number | undefined)[] = []
    const result = await buildQuestionIndex(ports({
      history: async (beforeSeq) => {
        calls.push(beforeSeq)
        if (page0) {
          page0 = false
          return {
            events: [
              { event: event({ seq: 20, data: { id: 'b', content: [{ type: 'text', text: 'q2' }] } }) },
              { event: event({ seq: 10, data: { id: 'a', content: [{ type: 'text', text: 'q1' }] } }) },
            ],
            hasMore: true,
          }
        }
        return { events: [{ event: event({ seq: 2, data: { id: 'z', content: [{ type: 'text', text: 'q0' }] } }) }], hasMore: false }
      },
    }))
    expect(result.ok).toBe(true)
    expect(result.code).toBe('COMPLETE')
    expect(calls[0]).toBe(undefined)
    expect(calls[1]).toBe(10) // min seq of the previous page
    expect(result.questions.map((q) => q.text)).toEqual(['q0', 'q1', 'q2'])
    expect(result.nextBeforeSeq).toBe(undefined)
  })

  it('returns BUDGET when the page cap is reached', async () => {
    const result = await buildQuestionIndex(ports({
      history: async () => ({ events: [{ event: event({ seq: 1 }) }], hasMore: true }),
    }), { maxPages: 2 })
    expect(result.code).toBe('BUDGET')
    expect(result.ok).toBe(false)
    expect(result.pages).toBe(2)
    expect(result.nextBeforeSeq).toBe(1)
  })

  it('returns TIMEOUT when the wall clock budget is exhausted', async () => {
    let now = 0
    const result = await buildQuestionIndex(ports({
      history: async () => { now += 60_000; return { events: [{ event: event({ seq: 1 }) }], hasMore: true } },
      now: () => now,
    }), { totalTimeoutMs: 1_000, maxPages: 100 })
    expect(result.code).toBe('TIMEOUT')
  })

  it('returns CANCELLED when the abort signal fires', async () => {
    const controller = new AbortController()
    let hasMore = true
    const resultPromise = buildQuestionIndex(ports({
      history: async () => {
        controller.abort()
        return { events: [{ event: event({ seq: 1 }) }], hasMore }
      },
    }), { signal: controller.signal })
    expect((await resultPromise).code).toBe('CANCELLED')
  })
})
