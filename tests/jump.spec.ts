import { describe, expect, it } from 'vitest'
import { jumpToQuestion, type JumpPorts, type JumpSnapshot } from '../src/core/jump.ts'

function snapshot(over: Partial<JumpSnapshot> = {}): JumpSnapshot {
  return {
    openState: 'open',
    hasMore: false,
    loadingOlder: false,
    rows: [],
    ...over,
  }
}

function ports(over: Partial<JumpPorts> = {}): JumpPorts {
  return {
    snapshot: () => snapshot(),
    loadOlder: async () => {},
    isViewActive: () => true,
    findRow: () => null,
    scrollIntoView: () => {},
    now: () => 0,
    sleep: async () => {},
    ...over,
  }
}

describe('jumpToQuestion', () => {
  it('fails when the view is inactive', async () => {
    const result = await jumpToQuestion(ports({ isViewActive: () => false }), 'k')
    expect(result).toEqual({ ok: false, code: 'VIEW_INACTIVE' })
  })

  it('scrolls to the exact row when it is rendered', async () => {
    let scrolled = ''
    const result = await jumpToQuestion(ports({
      snapshot: () => snapshot({ rows: [{ key: 'k', anchorSeq: 1, visibility: 'visible' }] }),
      findRow: (key) => ({ tagName: 'DIV' } as HTMLElement),
      scrollIntoView: (row) => { scrolled = row.tagName },
    }), 'k')
    expect(result.ok).toBe(true)
    expect(scrolled).toBe('DIV')
  })

  it('pages older content until the key is in the window', async () => {
    const seen: string[] = []
    const snap = snapshot({ hasMore: true, rows: [{ key: 'k', anchorSeq: 5, visibility: 'visible' }] })
    await jumpToQuestion(ports({
      snapshot: () => { seen.push('read'); return snap },
      findRow: (key) => ({ tagName: 'DIV' } as HTMLElement),
    }), 'k')
    expect(seen.length).toBeGreaterThan(0)
  })

  it('returns NOT_FOUND when the key never loads and no more history exists', async () => {
    const result = await jumpToQuestion(ports({
      snapshot: () => snapshot({ rows: [{ key: 'other', anchorSeq: 1, visibility: 'visible' }] }),
    }), 'missing')
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' })
  })
})
