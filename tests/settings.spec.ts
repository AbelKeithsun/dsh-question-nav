/**
 * Client settings controller (src/client/settings.ts): reactive read of the
 * rail anchor edge and the ▲/▼ page size, their fallbacks while the settings
 * surface is absent or not ready, and the write path back to the Host
 * document.
 */
import { describe, expect, it } from 'vitest'
import type { SettingsScopeSnapshot, SettingsScopeSpec } from '@deepseek-ai/dsh-client-ui-settings/client'
import { QuestionNavSettingsController, type SettingsScopeBinderLike } from '../src/client/settings.ts'
import {
  ALIGN_FIELD, ALIGN_OPTIONS, DEFAULT_ALIGN, QUESTION_NAV_SETTINGS_NS,
  type AlignPreference,
} from '../src/core/align.ts'
import {
  DEFAULT_PAGE_SIZE, PAGE_SIZE_FIELD, PAGE_SIZE_OPTIONS,
  type PageSize,
} from '../src/core/page-size.ts'

type Section = { align?: unknown; pageSize?: unknown }

interface FakeScope {
  snapshot: SettingsScopeSnapshot<Section>
  listeners: Set<() => void>
  setCalls: Array<[string, unknown]>
}

function readyScope(value: Section, user: Section | undefined = undefined): SettingsScopeSnapshot<Section> {
  return { status: 'ready', value, base: undefined, user, revision: 1, writable: true, mode: 'host' }
}

function makeScope(snapshot: SettingsScopeSnapshot<Section>): FakeScope {
  return { snapshot, listeners: new Set(), setCalls: [] }
}

function makeBinder(scope: FakeScope): SettingsScopeBinderLike {
  return {
    bind: <T>(_spec: SettingsScopeSpec<T>) => ({
      getSnapshot: () => scope.snapshot as unknown as SettingsScopeSnapshot<T>,
      subscribe: (listener: () => void) => {
        scope.listeners.add(listener)
        return () => { scope.listeners.delete(listener) }
      },
      set: (field, value) => {
        scope.setCalls.push([field, value])
        return Promise.resolve()
      },
      unset: () => Promise.resolve(),
      mutate: () => Promise.resolve(),
    }),
  }
}

/** Simulate a Host-side change: replace the snapshot and notify subscribers. */
function change(scope: FakeScope, snapshot: SettingsScopeSnapshot<Section>): void {
  scope.snapshot = snapshot
  for (const listener of scope.listeners) listener()
}

describe('core/align', () => {
  it('exposes the left/right options and defaults to left', () => {
    expect(ALIGN_OPTIONS).toEqual(['left', 'right'])
    expect(DEFAULT_ALIGN).toBe('left')
    expect(QUESTION_NAV_SETTINGS_NS).toBe('question-nav')
    expect(ALIGN_FIELD).toBe('align')
  })
})

describe('core/page-size', () => {
  it('exposes the page-size options and defaults to 5', () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([3, 5, 8, 10])
    expect(DEFAULT_PAGE_SIZE).toBe(5)
    expect(PAGE_SIZE_FIELD).toBe('pageSize')
  })
})

describe('QuestionNavSettingsController', () => {
  it('defaults to left/5 while the settings surface is absent', () => {
    const controller = new QuestionNavSettingsController()
    expect(controller.getSnapshot().align).toBe('left')
    expect(controller.getSnapshot().pageSize).toBe(DEFAULT_PAGE_SIZE)
    // Writes are no-ops without a bound scope.
    controller.setAlign('right')
    controller.setPageSize(10)
    expect(controller.getSnapshot().align).toBe('left')
    expect(controller.getSnapshot().pageSize).toBe(DEFAULT_PAGE_SIZE)
  })

  it('falls back to the defaults while the section is not ready', () => {
    const scope = makeScope({ status: 'loading', value: undefined, base: undefined, user: undefined, revision: undefined, writable: true, mode: 'host' })
    const controller = new QuestionNavSettingsController()
    controller.attach(makeBinder(scope))
    expect(controller.getSnapshot().align).toBe(DEFAULT_ALIGN)
    expect(controller.getSnapshot().pageSize).toBe(DEFAULT_PAGE_SIZE)
  })

  it('reads the accepted anchor edge on attach and after a change', () => {
    const scope = makeScope(readyScope({ align: 'right' }))
    const controller = new QuestionNavSettingsController()
    controller.attach(makeBinder(scope))
    expect(controller.getSnapshot()).toEqual({ align: 'right', pageSize: DEFAULT_PAGE_SIZE, overridden: false })

    const seen: AlignPreference[] = []
    const unsubscribe = controller.subscribe(() => seen.push(controller.getSnapshot().align))
    change(scope, readyScope({ align: 'left' }))
    expect(controller.getSnapshot().align).toBe('left')
    expect(seen).toEqual(['left'])
    unsubscribe()
    change(scope, readyScope({ align: 'right' }))
    expect(seen).toEqual(['left'])
  })

  it('reads the accepted page size on attach and notifies on change', () => {
    const scope = makeScope(readyScope({ align: 'left', pageSize: 8 }))
    const controller = new QuestionNavSettingsController()
    controller.attach(makeBinder(scope))
    expect(controller.getSnapshot().pageSize).toBe(8)

    const seen: PageSize[] = []
    controller.subscribe(() => seen.push(controller.getSnapshot().pageSize))
    change(scope, readyScope({ align: 'left', pageSize: 3 }))
    expect(seen).toEqual([3])
  })

  it('ignores invalid values and unready transitions', () => {
    const scope = makeScope(readyScope({ align: 'center' as unknown, pageSize: 7 as unknown }))
    const controller = new QuestionNavSettingsController()
    controller.attach(makeBinder(scope))
    expect(controller.getSnapshot().align).toBe(DEFAULT_ALIGN)
    expect(controller.getSnapshot().pageSize).toBe(DEFAULT_PAGE_SIZE)
  })

  it('routes a user choice to the Host document through the scope', async () => {
    const scope = makeScope(readyScope({ align: 'left', pageSize: 5 }))
    const controller = new QuestionNavSettingsController()
    controller.attach(makeBinder(scope))
    controller.setAlign('right')
    controller.setPageSize(10)
    // The scope queues the write; no host round-trip is simulated here.
    expect(scope.setCalls).toEqual([[ALIGN_FIELD, 'right'], [PAGE_SIZE_FIELD, 10]])
  })

  it('marks a stored override even when it equals the default', () => {
    const scope = makeScope(readyScope({ align: 'left' }, { align: 'left' }))
    const controller = new QuestionNavSettingsController()
    controller.attach(makeBinder(scope))
    expect(controller.getSnapshot()).toEqual({ align: 'left', pageSize: DEFAULT_PAGE_SIZE, overridden: true })

    const scopeB = makeScope(readyScope({ pageSize: 5 }, { pageSize: 5 }))
    const controllerB = new QuestionNavSettingsController()
    controllerB.attach(makeBinder(scopeB))
    expect(controllerB.getSnapshot().overridden).toBe(true)
  })

  it('binds only once across repeated attaches', () => {
    const scopeA = makeScope(readyScope({ align: 'right' }))
    const scopeB = makeScope(readyScope({ align: 'left' }))
    const controller = new QuestionNavSettingsController()
    const binder = makeBinder(scopeA)
    controller.attach(binder)
    controller.attach(makeBinder(scopeB))
    // The second attach is a no-op: writes still land on the first scope.
    controller.setAlign('left')
    expect(scopeA.setCalls).toEqual([['align', 'left']])
    expect(scopeB.setCalls).toEqual([])
  })
})
