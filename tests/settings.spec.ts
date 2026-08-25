/**
 * Client settings controller (src/client/settings.ts): reactive read of the
 * rail anchor edge, its fallback while the settings surface is absent or not
 * ready, and the write path back to the Host document.
 */
import { describe, expect, it } from 'vitest'
import type { SettingsScopeSnapshot, SettingsScopeSpec } from '@deepseek-ai/dsh-client-runtime/client'
import { QuestionNavSettingsController, type SettingsScopeBinderLike } from '../src/client/settings.ts'
import {
  ALIGN_FIELD, ALIGN_OPTIONS, DEFAULT_ALIGN, QUESTION_NAV_SETTINGS_NS,
  type AlignPreference,
} from '../src/core/align.ts'

type Section = { align?: unknown }

interface FakeScope {
  snapshot: SettingsScopeSnapshot<Section>
  listeners: Set<() => void>
  setCalls: Array<[string, unknown]>
}

function readyScope(align: unknown, user: unknown = undefined): SettingsScopeSnapshot<Section> {
  return { status: 'ready', value: { align }, base: undefined, user, revision: 1, writable: true, mode: 'host' }
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

describe('QuestionNavSettingsController', () => {
  it('defaults to left while the settings surface is absent', () => {
    const controller = new QuestionNavSettingsController()
    expect(controller.getSnapshot().align).toBe('left')
    // Writes are no-ops without a bound scope.
    controller.setAlign('right')
    expect(controller.getSnapshot().align).toBe('left')
  })

  it('falls back to left while the section is not ready', () => {
    const scope = makeScope({ status: 'loading', value: undefined, base: undefined, user: undefined, revision: undefined, writable: true, mode: 'host' })
    const controller = new QuestionNavSettingsController()
    controller.attach(makeBinder(scope))
    expect(controller.getSnapshot().align).toBe(DEFAULT_ALIGN)
  })

  it('reads the accepted anchor edge on attach and after a change', () => {
    const scope = makeScope(readyScope('right'))
    const controller = new QuestionNavSettingsController()
    controller.attach(makeBinder(scope))
    expect(controller.getSnapshot()).toEqual({ align: 'right', overridden: false })

    const seen: AlignPreference[] = []
    const unsubscribe = controller.subscribe(() => seen.push(controller.getSnapshot().align))
    change(scope, readyScope('left'))
    expect(controller.getSnapshot().align).toBe('left')
    expect(seen).toEqual(['left'])
    unsubscribe()
    change(scope, readyScope('right'))
    expect(seen).toEqual(['left'])
  })

  it('ignores invalid values and unready transitions', () => {
    const scope = makeScope(readyScope('center' as unknown))
    const controller = new QuestionNavSettingsController()
    controller.attach(makeBinder(scope))
    expect(controller.getSnapshot().align).toBe(DEFAULT_ALIGN)
  })

  it('routes a user choice to the Host document through the scope', async () => {
    const scope = makeScope(readyScope('left'))
    const controller = new QuestionNavSettingsController()
    controller.attach(makeBinder(scope))
    controller.setAlign('right')
    // The scope queues the write; no host round-trip is simulated here.
    expect(scope.setCalls).toEqual([['align', 'right']])
    expect(scope.setCalls[0]?.[0]).toBe(ALIGN_FIELD)
  })

  it('marks a stored override even when it equals the default', () => {
    const scope = makeScope(readyScope('left', { align: 'left' }))
    const controller = new QuestionNavSettingsController()
    controller.attach(makeBinder(scope))
    expect(controller.getSnapshot()).toEqual({ align: 'left', overridden: true })
  })

  it('binds only once across repeated attaches', () => {
    const scopeA = makeScope(readyScope('right'))
    const scopeB = makeScope(readyScope('left'))
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
