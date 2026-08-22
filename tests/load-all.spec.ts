import { describe, expect, it } from 'vitest'
import { loadAllOlder, type LoadAllPorts, type LoadAllSnapshot } from '../src/core/load-all.ts'

function snapshot(over: Partial<LoadAllSnapshot> = {}): LoadAllSnapshot {
  return {
    openState: 'open',
    hasMore: false,
    loadingOlder: false,
    ...over,
  }
}

function ports(over: Partial<LoadAllPorts> = {}): LoadAllPorts {
  return {
    snapshot: () => snapshot(),
    loadOlder: async () => {},
    isViewActive: () => true,
    now: () => 0,
    sleep: async () => {},
    ...over,
  }
}

describe('loadAllOlder', () => {
  it('returns COMPLETE immediately when no older history exists', async () => {
    const result = await loadAllOlder(ports())
    expect(result).toEqual({ ok: true, code: 'COMPLETE', pages: 0 })
  })

  it('pages until hasMore is false', async () => {
    let hasMore = true
    let pages = 0
    const result = await loadAllOlder(ports({
      snapshot: () => snapshot({ hasMore }),
      loadOlder: async () => {
        pages += 1
        if (pages >= 3) hasMore = false
      },
    }))
    expect(result).toEqual({ ok: true, code: 'COMPLETE', pages: 3 })
  })

  it('returns VIEW_INACTIVE when the view is inactive', async () => {
    const result = await loadAllOlder(ports({ isViewActive: () => false }))
    expect(result.code).toBe('VIEW_INACTIVE')
    expect(result.ok).toBe(false)
  })

  it('returns BUDGET when the page cap is reached', async () => {
    let pages = 0
    const result = await loadAllOlder(ports({
      snapshot: () => snapshot({ hasMore: true }),
      loadOlder: async () => { pages += 1 },
    }), { maxPages: 2 })
    expect(result).toEqual({ ok: false, code: 'BUDGET', pages: 2 })
  })

  it('returns TIMEOUT when the wall clock budget is exhausted', async () => {
    let now = 0
    const result = await loadAllOlder(ports({
      snapshot: () => snapshot({ hasMore: true }),
      now: () => now,
      loadOlder: async () => { now += 10_000 },
    }), { totalTimeoutMs: 15_000, maxPages: 100 })
    expect(result.code).toBe('TIMEOUT')
  })

  it('waits while a page is already loading', async () => {
    let hasMore = true
    let loadingOlder = true
    const sleeps: number[] = []
    let pages = 0
    const result = await loadAllOlder(ports({
      snapshot: () => snapshot({ hasMore, loadingOlder }),
      loadOlder: async () => {
        loadingOlder = false
        pages += 1
        hasMore = false
      },
      sleep: async (ms) => { sleeps.push(ms); loadingOlder = false },
    }))
    expect(result.ok).toBe(true)
    expect(sleeps.length).toBeGreaterThan(0)
    expect(pages).toBe(1)
  })

  it('returns CANCELLED when the abort signal fires', async () => {
    const controller = new AbortController()
    const result = await loadAllOlder(ports({
      snapshot: () => snapshot({ hasMore: true, loadingOlder: true }),
      sleep: async () => { controller.abort() },
    }), { signal: controller.signal })
    expect(result).toEqual({ ok: false, code: 'CANCELLED', pages: 0 })
  })
})
